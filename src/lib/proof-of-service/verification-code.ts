/**
 * Proof-of-service verification codes are stored and shown as POS-XXXXXXXX
 * (8 alphanumeric chars after the prefix), matching SJ-XXXXXXXX testimonials.
 */

const BODY_LEN = 8;

/** Strip prefix/punctuation and return the uppercase code body. */
export function extractPosCodeBody(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.startsWith('POS') ? cleaned.slice(3) : cleaned;
}

/** Canonical form used in the DB and on PDFs: POS-XXXXXXXX */
export function formatPosVerificationCode(
  raw: string | null | undefined,
): string | null {
  const body = extractPosCodeBody(raw).slice(0, BODY_LEN);
  if (body.length < BODY_LEN) return null;
  return `POS-${body}`;
}

/** Generate a new POS-XXXXXXXX code (hex from crypto random). */
export function generatePosVerificationCode(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as typeof import('crypto');
    nodeCrypto.randomFillSync(bytes);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `POS-${hex.slice(0, BODY_LEN)}`;
}

/** Candidate strings historically stored for the same code (for resilient lookup). */
export function posVerificationLookupCandidates(raw: string): string[] {
  const body = extractPosCodeBody(raw);
  if (body.length < BODY_LEN) return [];

  const eight = body.slice(0, 8);
  const ten = body.slice(0, 10);
  const candidates = new Set<string>([
    `POS-${eight}`,
    eight,
    `POS-${ten}`,
    ten,
    body,
    `POS-${body}`,
  ]);
  return [...candidates];
}
