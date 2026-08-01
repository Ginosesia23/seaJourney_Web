/** Client + server safe constants for certificate document storage. */

export const CERTIFICATES_BUCKET = 'certificates';

export function buildCertificateFilePath(
  userId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;
  return `${userId}/${id}-${safe}`;
}

/** True when document_url is a storage object path (not an absolute URL). */
export function isCertificateStoragePath(documentUrl: string): boolean {
  if (!documentUrl) return false;
  if (/^https?:\/\//i.test(documentUrl)) return false;
  return true;
}
