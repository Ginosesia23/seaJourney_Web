/**
 * Digital TRB Companion — shared constants & types.
 * Pilot / demonstration only — not an official MCA/PYA TRB.
 */

export const TRB_DISCLAIMER =
  'Demonstration content only. This is not the official MCA/PYA OOW 3000 Training Record Book.';

export const TRB_SIGNOFF_TOKEN_TTL_DAYS = 7;

export const TRB_EVIDENCE_BUCKET = 'trb-evidence';

export const TRB_EVIDENCE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export const TRB_EVIDENCE_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export type TrbTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'ready_for_assessment'
  | 'awaiting_signoff'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'superseded';

export type TrbSignoffDecision = 'approved' | 'changes_requested' | 'rejected';

export type TrbSignoffRequestStatus =
  | 'pending'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type TrbRequiredSignerRole =
  | 'captain'
  | 'captain_or_chief_officer'
  | 'deck_officer'
  | 'training_officer';

/** Valid candidate-driven transitions (server enforces; approvals via sign-off flow). */
export const TRB_CANDIDATE_TRANSITIONS: Record<TrbTaskStatus, TrbTaskStatus[]> = {
  not_started: ['in_progress'],
  in_progress: ['ready_for_assessment'],
  ready_for_assessment: ['awaiting_signoff', 'in_progress'],
  awaiting_signoff: ['ready_for_assessment'], // cancel pending request
  changes_requested: ['in_progress'],
  rejected: ['in_progress'],
  approved: [],
  superseded: [],
};

export function canCandidateTransition(
  from: TrbTaskStatus,
  to: TrbTaskStatus,
): boolean {
  return (TRB_CANDIDATE_TRANSITIONS[from] || []).includes(to);
}
