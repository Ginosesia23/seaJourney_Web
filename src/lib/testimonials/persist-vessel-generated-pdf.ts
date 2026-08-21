/**
 * Generate and store a vessel-generated testimonial PDF (drafts created by
 * vessel managers on the Crew page) into the testimonials bucket.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { downloadVesselGeneratedTestimonialForCrew } from '@/lib/download-vessel-generated-testimonial-for-crew';
import type { UserProfile, VesselGeneratedTestimonial } from '@/lib/types';
import {
  TESTIMONIALS_BUCKET,
  buildVesselGeneratedPdfPath,
} from '@/lib/testimonials/storage';
import type { TestimonialPDFFormat } from '@/lib/pdf-generator';

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

export async function persistVesselGeneratedTestimonialPdf(
  vesselGeneratedId: string,
): Promise<{ path: string } | { skipped: string } | { error: string }> {
  const { data: row, error } = await supabaseAdmin
    .from('vessel_generated_testimonials')
    .select('*')
    .eq('id', vesselGeneratedId)
    .maybeSingle();

  if (error || !row) {
    return { error: error?.message || 'Vessel-generated testimonial not found' };
  }

  // Rebuild each time so header logo / branding updates apply to archived files.

  const { data: crewRow, error: crewErr } = await supabaseAdmin
    .from('users')
    .select(
      'id, email, username, first_name, last_name, role, position, date_of_birth, discharge_book_number, mobile, telephone',
    )
    .eq('id', row.crew_user_id)
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

  const rawFormat = String(row.pdf_format || 'mca').toLowerCase();
  const format = (
    rawFormat === 'seajourney' || rawFormat === 'amsa' ? rawFormat : 'mca'
  ) as TestimonialPDFFormat;

  let generated: unknown;
  try {
    generated = await downloadVesselGeneratedTestimonialForCrew(
      supabaseAdmin as never,
      row as VesselGeneratedTestimonial,
      crewProfile,
      format,
      'blob',
    );
  } catch (genErr) {
    const message = genErr instanceof Error ? genErr.message : 'PDF generation failed';
    console.error('[persistVesselGeneratedTestimonialPdf] generate failed:', genErr);
    return { error: message };
  }

  let buffer: Buffer;
  try {
    buffer = await toUploadBuffer(generated);
  } catch (convErr) {
    const message = convErr instanceof Error ? convErr.message : 'PDF conversion failed';
    console.error('[persistVesselGeneratedTestimonialPdf] convert failed:', convErr);
    return { error: message };
  }

  if (!buffer.length) {
    return { error: 'Generated PDF was empty' };
  }

  const path = buildVesselGeneratedPdfPath(row.crew_user_id, row.id);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(TESTIMONIALS_BUCKET)
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[persistVesselGeneratedTestimonialPdf] upload failed:', uploadError);
    return {
      error: `Storage upload failed (${TESTIMONIALS_BUCKET}): ${uploadError.message}. Run sql/create-testimonials-storage.sql if the bucket is missing.`,
    };
  }

  const { error: pathUpdateError } = await supabaseAdmin
    .from('vessel_generated_testimonials')
    .update({ pdf_path: path, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  if (pathUpdateError) {
    console.warn(
      '[persistVesselGeneratedTestimonialPdf] pdf_path update skipped:',
      pathUpdateError.message,
    );
  }

  console.log('[persistVesselGeneratedTestimonialPdf] stored', {
    vesselGeneratedId,
    path,
    bucket: TESTIMONIALS_BUCKET,
    bytes: buffer.length,
  });
  return { path };
}
