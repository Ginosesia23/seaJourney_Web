/**
 * Digital TRB Companion — shared constants & types.
 * Digital companion only — not an official MCA/PYA Training Record Book.
 */

export const TRB_DISCLAIMER =
  'SeaJourney provides a digital companion to the identified Training Record Book. Continue maintaining any record required by the MCA or your recognised verification body until digital acceptance is confirmed.';

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
  not_started: ['in_progress', 'ready_for_assessment'],
  in_progress: ['ready_for_assessment'],
  ready_for_assessment: ['awaiting_signoff', 'in_progress'],
  awaiting_signoff: ['ready_for_assessment'], // cancel pending request
  changes_requested: ['in_progress', 'ready_for_assessment'],
  rejected: ['in_progress', 'ready_for_assessment'],
  approved: [],
  superseded: [],
};

export function canCandidateTransition(
  from: TrbTaskStatus,
  to: TrbTaskStatus,
): boolean {
  return (TRB_CANDIDATE_TRANSITIONS[from] || []).includes(to);
}
