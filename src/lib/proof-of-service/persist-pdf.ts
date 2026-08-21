/**
 * Generate and store a Proof of Service PDF when the vessel saves it to
 * the crew profile, so crew can download the frozen file later.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateProofOfServicePDF } from '@/lib/pdf-generator';
import {
  PROOF_OF_SERVICE_BUCKET,
  buildProofOfServicePdfPath,
} from '@/lib/proof-of-service/storage';

async function toUploadBuffer(value: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return Buffer.from(await value.arrayBuffer());
  }
  // jsPDF sometimes returns an object with arrayBuffer()
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

export async function persistProofOfServicePdf(
  proofId: string,
): Promise<{ path: string } | { skipped: string } | { error: string }> {
  const { data: row, error } = await supabaseAdmin
    .from('proof_of_service')
    .select('*')
    .eq('id', proofId)
    .maybeSingle();

  if (error || !row) {
    return { error: error?.message || 'Proof of service not found' };
  }

  // Always rebuild so navy-header logo stays current when branding changes.
  // (Callers that want a no-op can ignore upserts.)

  let generated: unknown;
  try {
    generated = await generateProofOfServicePDF(
      {
        vesselName: row.vessel_name,
        vesselType: row.vessel_type ?? null,
        vesselImo: row.vessel_imo ?? null,
        crewName: row.crew_name,
        crewPosition: row.crew_position ?? null,
        startDate: row.start_date,
        endDate: row.end_date,
        totalDays: row.total_days,
        atSeaDays: row.at_sea_days,
        standbyDays: row.standby_days,
        yardDays: row.yard_days,
        leaveDays: row.leave_days,
        generatedByName: row.generated_by_name,
        generatedByEmail: row.generated_by_email ?? null,
        notes: row.notes ?? null,
        verificationCode: row.verification_code ?? null,
      },
      'blob',
    );
  } catch (genErr) {
    const message = genErr instanceof Error ? genErr.message : 'PDF generation failed';
    console.error('[persistProofOfServicePdf] generate failed:', genErr);
    return { error: message };
  }

  let buffer: Buffer;
  try {
    buffer = await toUploadBuffer(generated);
  } catch (convErr) {
    const message = convErr instanceof Error ? convErr.message : 'PDF conversion failed';
    console.error('[persistProofOfServicePdf] convert failed:', {
      type: typeof generated,
      ctor: generated?.constructor?.name,
      error: convErr,
    });
    return { error: message };
  }

  if (!buffer.length) {
    return { error: 'Generated PDF was empty' };
  }

  const path = buildProofOfServicePdfPath(row.crew_user_id, row.id);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PROOF_OF_SERVICE_BUCKET)
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('[persistProofOfServicePdf] upload failed:', uploadError);
    return {
      error: `Storage upload failed (${PROOF_OF_SERVICE_BUCKET}): ${uploadError.message}. Run sql/create-proof-of-service-storage.sql if the bucket is missing.`,
    };
  }

  const { error: pathUpdateError } = await supabaseAdmin
    .from('proof_of_service')
    .update({ pdf_path: path, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  if (pathUpdateError) {
    console.warn('[persistProofOfServicePdf] pdf_path update skipped:', pathUpdateError.message);
  }

  console.log('[persistProofOfServicePdf] stored', {
    proofId,
    path,
    bucket: PROOF_OF_SERVICE_BUCKET,
    bytes: buffer.length,
  });
  return { path };
}
