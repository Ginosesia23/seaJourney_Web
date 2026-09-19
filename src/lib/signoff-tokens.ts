/**
 * Shared high-entropy approval token helpers.
 * Used by Digital TRB Companion (hashed storage) and available for other workflows.
 * Testimonials currently still store plaintext UUID tokens for compatibility —
 * do not change that storage model without a dedicated migration.
 */

import { createHash, randomBytes } from 'crypto';

export const SIGNOFF_TOKEN_TTL_DAYS_DEFAULT = 7;

export function generateHighEntropyToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashSignoffToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateHashedSignoffToken(opts?: {
  ttlDays?: number;
}): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const ttlDays = opts?.ttlDays ?? SIGNOFF_TOKEN_TTL_DAYS_DEFAULT;
  const rawToken = generateHighEntropyToken();
  const tokenHash = hashSignoffToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);
  return { rawToken, tokenHash, expiresAt };
}

export function isTokenExpired(expiresAt: string | Date | null | undefined): boolean {
  if (!expiresAt) return true;
  const d = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return Number.isNaN(d.getTime()) || d.getTime() <= Date.now();
}
