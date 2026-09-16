import type { Certificate } from '@/lib/types';

/** Map a certificates table row (snake_case) to the app Certificate type. */
export function mapCertificateRow(cert: Record<string, unknown>): Certificate {
  return {
    id: cert.id as string,
    userId: cert.user_id as string,
    certificateName: cert.certificate_name as string,
    certificateType: cert.certificate_type as string,
    presetId: (cert.preset_id as string | null) || null,
    certificateNumber: (cert.certificate_number as string | null) || null,
    issuingAuthority: (cert.issuing_authority as string | null) || null,
    issueDate: cert.issue_date as string,
    expiryDate: (cert.expiry_date as string | null) || null,
    renewalRequired: (cert.renewal_required as boolean | null) ?? true,
    renewalNoticeDays: (cert.renewal_notice_days as number | null) ?? 90,
    notes: (cert.notes as string | null) || null,
    documentUrl: (cert.document_url as string | null) || null,
    createdAt: cert.created_at as string | undefined,
    updatedAt: cert.updated_at as string | undefined,
  };
}
