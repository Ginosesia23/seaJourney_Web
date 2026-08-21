/** Storage helpers for frozen Proof of Service PDFs. */

export const PROOF_OF_SERVICE_BUCKET = 'proof-of-service';

/** Path: <crewUserId>/<proofOfServiceId>.pdf */
export function buildProofOfServicePdfPath(crewUserId: string, proofId: string): string {
  return `${crewUserId}/${proofId}.pdf`;
}

export function isProofOfServiceStoragePath(value: string): boolean {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return false;
  return value.includes('/') && value.endsWith('.pdf');
}
