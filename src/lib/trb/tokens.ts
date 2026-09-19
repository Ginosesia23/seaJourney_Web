/**
 * Re-export shared hashed token helpers for TRB (compatibility).
 */

import {
  generateHashedSignoffToken,
  hashSignoffToken,
  SIGNOFF_TOKEN_TTL_DAYS_DEFAULT,
} from '@/lib/signoff-tokens';
import { createHash } from 'crypto';
import { TRB_SIGNOFF_TOKEN_TTL_DAYS } from '@/lib/trb/constants';

export function generateTrbSignoffToken(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  return generateHashedSignoffToken({
    ttlDays: TRB_SIGNOFF_TOKEN_TTL_DAYS || SIGNOFF_TOKEN_TTL_DAYS_DEFAULT,
  });
}

export function hashTrbSignoffToken(rawToken: string): string {
  return hashSignoffToken(rawToken);
}

/** Deterministic integrity hash for an immutable sign-off row. */
export function computeTrbSignoffRecordHash(fields: {
  signoffRequestId: string;
  taskProgressId: string;
  decision: string;
  signerName: string;
  signerEmail: string;
  signerRank: string | null;
  signerCocNumber: string | null;
  signerIssuingAuthority: string | null;
  signerDeclaration: string;
  decisionNotes: string | null;
  signedAt: string;
}): string {
  const payload = [
    fields.signoffRequestId,
    fields.taskProgressId,
    fields.decision,
    fields.signerName.trim().toLowerCase(),
    fields.signerEmail.trim().toLowerCase(),
    fields.signerRank ?? '',
    fields.signerCocNumber ?? '',
    fields.signerIssuingAuthority ?? '',
    fields.signerDeclaration.trim(),
    fields.decisionNotes ?? '',
    fields.signedAt,
  ].join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function hashIpForAudit(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.TRB_AUDIT_IP_SALT || process.env.CRON_SECRET || 'seajourney-trb';
  return createHash('sha256').update(`${salt}|${ip}`, 'utf8').digest('hex');
}
