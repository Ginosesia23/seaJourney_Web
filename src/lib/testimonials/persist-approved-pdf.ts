/**
 * Generate and store the approved testimonial PDF once, so crew can download
 * the frozen document later without regenerating.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { downloadTestimonialPdfForCrewMember } from '@/lib/download-testimonial-pdf-for-crew';
import type { Testimonial, UserProfile } from '@/lib/types';
import {
  TESTIMONIALS_BUCKET,
  buildTestimonialPdfPath,
} from '@/lib/testimonials/storage';

async function toUploadBuffer(value: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return Buffer.from(await value.arrayBuffer());
  }
  if (
    value &&
    typeof value === 'object' &&
    'arrayBuffer' in value &&
    typeof (value as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer === 'function'
  ) {
    return Buffer.from(await (value as Blob).arrayBuffer());
  }
  throw new Error('PDF generator returned an unsupported type');
}

/**
 * Build MCA PDF for an approved testimonial and upload to Storage.
 * Writes `testimonials.pdf_url` (storage path) and `approved_testimonials.pdf_path`.
 */
export async function persistApprovedTestimonialPdf(
  testimonialId: string,
): Promise<{ path: string } | { skipped: string } | { error: string }> {
  const { data: testimonial, error: tErr } = await supabaseAdmin
    .from('testimonials')
    .select('*')
    .eq('id', testimonialId)
    .maybeSingle();

  if (tErr || !testimonial) {
    return { error: tErr?.message || 'Testimonial not found' };
  }

  if (testimonial.status !== 'approved') {
    return { skipped: `status is ${testimonial.status}` };
  }

  // Rebuild each time so header logo / branding updates apply to archived files.

  const { data: crewRow, error: crewErr } = await supabaseAdmin
    .from('users')
    .select(
      'id, email, username, first_name, last_name, role, position, date_of_birth, discharge_book_number, mobile, telephone',
    )
    .eq('id', testimonial.user_id)
    .maybeSingle();

  if (crewErr || !crewRow) {
    return { error: crewErr?.message || 'Crew profile not found' };
  }

  const crewProfile = {
    id: crewRow.id,
    email: crewRow.email || '',
    username: crewRow.username || '',
    firstName: crewRow.first_name || '',
    lastName: crewRow.last_name || '',
    role: (crewRow.role as UserProfile['role']) || 'crew',
    position: crewRow.position || null,
    dateOfBirth: crewRow.date_of_birth || null,
    dischargeBookNumber: crewRow.discharge_book_number || null,
    mobile: crewRow.mobile || null,
    telephone: crewRow.telephone || null,
    registrationDate: new Date().toISOString(),
    subscriptionTier: 'free',
    subscriptionStatus: 'inactive' as const,
  } as UserProfile;

  let generated: unknown;
  try {
    generated = await downloadTestimonialPdfForCrewMember(
      supabaseAdmin as never,
      testimonial as Testimonial,
      crewProfile,
      testimonial.generated_by_user_id || testimonial.user_id,
      'mca',
      'blob',
    );
  } catch (genErr) {
    const message = genErr instanceof Error ? genErr.message : 'PDF generation failed';
    console.error('[persistApprovedTestimonialPdf] generate failed:', genErr);
    return { error: message };
  }

  let buffer: Buffer;
  try {
    buffer = await toUploadBuffer(generated);
  } catch (convErr) {
    const message = convErr instanceof Error ? convErr.message : 'PDF conversion failed';
    console.error('[persistApprovedTestimonialPdf] convert failed:', {
      type: typeof generated,
      ctor: (generated as { constructor?: { name?: string } })?.constructor?.name,
      error: convErr,
    });
    return { error: message };
  }

  if (!buffer.length) {
    return { error: 'Generated PDF was empty' };
  }

  const path = buildTestimonialPdfPath(testimonial.user_id, testimonial.id);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(TESTIMONIALS_BUCKET)
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[persistApprovedTestimonialPdf] upload failed:', uploadError);
    return {
      error: `Storage upload failed (${TESTIMONIALS_BUCKET}): ${uploadError.message}. Run sql/create-testimonials-storage.sql if the bucket is missing.`,
    };
  }

  await supabaseAdmin
    .from('testimonials')
    .update({ pdf_url: path, updated_at: new Date().toISOString() })
    .eq('id', testimonial.id);

  const { error: pathUpdateError } = await supabaseAdmin
    .from('approved_testimonials')
    .update({ pdf_path: path })
    .eq('testimonial_id', testimonial.id);

  if (pathUpdateError) {
    console.warn('[persistApprovedTestimonialPdf] pdf_path update skipped:', pathUpdateError.message);
  }

  console.log('[persistApprovedTestimonialPdf] stored', {
    testimonialId,
    path,
    bucket: TESTIMONIALS_BUCKET,
    bytes: buffer.length,
  });
  return { path };
}
