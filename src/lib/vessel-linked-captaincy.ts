/**
 * When a vessel manager invites a vessel-linked Captain account, grant
 * captaincy immediately — no separate vessel/admin claim approval.
 *
 * Mirrors the side-effects of a fully approved vessel_claim_requests row:
 * approved claim, signing authority, and onboard assignment when appropriate.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const MAX_CAPTAINS_PER_VESSEL = 2;

export async function countApprovedCaptainsForVessel(vesselId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('vessel_claim_requests')
    .select('id')
    .eq('vessel_id', vesselId)
    .eq('status', 'approved');

  if (error) {
    console.error('[VESSEL LINKED CAPTAINCY] Failed to count approved captains:', error);
    throw error;
  }
  return data?.length ?? 0;
}

/**
 * @returns true if the vessel can accept another approved captain
 */
export async function canAddCaptainToVessel(vesselId: string): Promise<boolean> {
  const count = await countApprovedCaptainsForVessel(vesselId);
  return count < MAX_CAPTAINS_PER_VESSEL;
}

/**
 * Create approved claim + signing authority for a vessel-linked captain invite.
 * Idempotent enough for a brand-new user id (no prior claim/authority expected).
 */
export async function grantVesselLinkedCaptaincy(opts: {
  captainUserId: string;
  vesselId: string;
  /** Vessel manager user id — records as the authorizing party. */
  vesselUserId: string;
  position?: string;
}): Promise<void> {
  const { captainUserId, vesselId, vesselUserId } = opts;
  const position = opts.position || 'Captain';
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const approvedCount = await countApprovedCaptainsForVessel(vesselId);
  if (approvedCount >= MAX_CAPTAINS_PER_VESSEL) {
    throw new Error(
      `This vessel already has ${MAX_CAPTAINS_PER_VESSEL} approved captains. Maximum of ${MAX_CAPTAINS_PER_VESSEL} captains allowed per vessel.`,
    );
  }

  // Approved claim — vessel manager invited this account, so dual approval
  // is satisfied by the invite itself (no inbox / admin review).
  const { error: claimError } = await supabaseAdmin.from('vessel_claim_requests').insert({
    vessel_id: vesselId,
    requested_by: captainUserId,
    requested_role: 'captain',
    status: 'approved',
    supporting_documents: [
      'Vessel-linked captain account — invited and assigned by the vessel manager (no separate claim approval required).',
    ],
    vessel_approved_by: vesselUserId,
    vessel_approved_at: now,
    admin_approved_by: vesselUserId,
    admin_approved_at: now,
  });

  if (claimError) {
    console.error('[VESSEL LINKED CAPTAINCY] Failed to insert approved claim:', claimError);
    throw claimError;
  }

  // Prefer this captain as onboard when no other assignment is currently onboard.
  const { data: otherOnboard } = await supabaseAdmin
    .from('vessel_assignments')
    .select('user_id')
    .eq('vessel_id', vesselId)
    .eq('onboard', true)
    .is('end_date', null)
    .neq('user_id', captainUserId);

  const shouldSetOnboard = !otherOnboard || otherOnboard.length === 0;

  const { data: existingAssignment } = await supabaseAdmin
    .from('vessel_assignments')
    .select('id')
    .eq('user_id', captainUserId)
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .maybeSingle();

  if (existingAssignment?.id) {
    await supabaseAdmin
      .from('vessel_assignments')
      .update({
        position,
        assignment_role: 'captain',
        ...(shouldSetOnboard ? { onboard: true } : {}),
        updated_at: now,
      })
      .eq('id', existingAssignment.id);
  }

  // Signing authority — used by documents / crew "send to captain" flows.
  const { data: existingAuthority } = await supabaseAdmin
    .from('vessel_signing_authorities')
    .select('id, end_date, is_primary')
    .eq('vessel_id', vesselId)
    .eq('captain_user_id', captainUserId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingAuthority) {
    if (existingAuthority.end_date) {
      await supabaseAdmin
        .from('vessel_signing_authorities')
        .update({ end_date: null, start_date: today })
        .eq('id', existingAuthority.id);
    }
  } else {
    const { data: existingPrimary } = await supabaseAdmin
      .from('vessel_signing_authorities')
      .select('id')
      .eq('vessel_id', vesselId)
      .eq('is_primary', true)
      .is('end_date', null)
      .limit(1)
      .maybeSingle();

    const { error: authorityError } = await supabaseAdmin
      .from('vessel_signing_authorities')
      .insert({
        vessel_id: vesselId,
        captain_user_id: captainUserId,
        start_date: today,
        end_date: null,
        is_primary: !existingPrimary,
      });

    if (authorityError) {
      console.error('[VESSEL LINKED CAPTAINCY] Failed to create signing authority:', authorityError);
      throw authorityError;
    }
  }

  await supabaseAdmin
    .from('users')
    .update({ active_vessel_id: vesselId, position })
    .eq('id', captainUserId);
}
