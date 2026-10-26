import { NextResponse } from 'next/server';

import { managerForVessel } from '@/lib/crew-vessel-feature-boost.server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isAutoGrantedVesselAccessNote,
  VESSEL_PLAN_ACCESS_MARKER,
} from '@/lib/vessel-crew-access';
import { hasApprovedVesselPlanCoverage } from '@/lib/vessel-plan-coverage';

export { isAutoGrantedVesselAccessNote, VESSEL_PLAN_ACCESS_MARKER };

/** Crew sits under this vessel's subscription (coverage, paused plan, or linked account). */
export async function isCrewUnderVesselSubscription(
  crewUserId: string,
  vesselId: string,
): Promise<boolean> {
  if (!crewUserId || !vesselId) return false;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('managed_by_vessel_id, personal_plan_paused_for_vessel_id')
    .eq('id', crewUserId)
    .maybeSingle();

  if (user?.managed_by_vessel_id === vesselId) return true;
  if (user?.personal_plan_paused_for_vessel_id === vesselId) return true;
  return hasApprovedVesselPlanCoverage(crewUserId, vesselId);
}

/**
 * While a crew member is covered by this vessel plan, grant approved
 * sea-time / state-edit access for that vessel only.
 */
export async function ensureVesselCoveredCrewAccess(
  crewUserId: string,
  vesselId: string,
): Promise<{ granted: boolean; reason?: string }> {
  if (!crewUserId || !vesselId) return { granted: false, reason: 'missing_ids' };

  const manager = await managerForVessel(vesselId);
  if (!manager?.id) return { granted: false, reason: 'no_manager' };

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('name')
    .eq('id', vesselId)
    .maybeSingle();
  const vesselName = (vessel?.name as string | undefined)?.trim() || 'Vessel';
  const notes = `${VESSEL_PLAN_ACCESS_MARKER} Auto-approved while covered by this vessel subscription`;

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .select('id, status, notes, vessel_id')
    .eq('vessel_user_id', manager.id)
    .eq('crew_user_id', crewUserId)
    .maybeSingle();

  if (lookupError) {
    console.error('[vessel-crew-access] lookup failed', lookupError);
    return { granted: false, reason: 'lookup_failed' };
  }

  if (!existing) {
    const { error } = await supabaseAdmin.from('vessel_sea_time_access_requests').insert({
      vessel_user_id: manager.id,
      crew_user_id: crewUserId,
      vessel_id: vesselId,
      vessel_name: vesselName,
      status: 'approved',
      notes,
    });
    if (error) {
      console.error('[vessel-crew-access] insert failed', error);
      return { granted: false, reason: 'insert_failed' };
    }
    return { granted: true };
  }

  const keepManualNotes =
    existing.status === 'approved' &&
    !isAutoGrantedVesselAccessNote(existing.notes) &&
    existing.vessel_id === vesselId;

  if (keepManualNotes) return { granted: true };

  const { error } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .update({
      status: 'approved',
      vessel_id: vesselId,
      vessel_name: vesselName,
      notes: isAutoGrantedVesselAccessNote(existing.notes) || existing.status !== 'approved'
        ? notes
        : existing.notes,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (error) {
    console.error('[vessel-crew-access] update failed', error);
    return { granted: false, reason: 'update_failed' };
  }
  return { granted: true };
}

export async function revokeAutoVesselCoveredCrewAccess(
  crewUserId: string,
  vesselId: string,
): Promise<void> {
  const { data: rows, error } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .select('id, notes, vessel_id')
    .eq('crew_user_id', crewUserId)
    .eq('vessel_id', vesselId)
    .eq('status', 'approved');

  if (error) {
    console.error('[vessel-crew-access] revoke lookup failed', error);
    return;
  }

  const ids = (rows || [])
    .filter((row) => isAutoGrantedVesselAccessNote(row.notes))
    .map((row) => row.id as string);
  if (ids.length === 0) return;

  const { error: updateError } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .update({
      status: 'rejected',
      rejection_reason: 'Vessel plan coverage ended',
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (updateError) {
    console.error('[vessel-crew-access] revoke failed', updateError);
  }
}

/** Grant or revoke auto-access so it matches current coverage. */
export async function syncVesselCoveredCrewAccess(
  crewUserId: string,
  coveredVesselIds: string[],
): Promise<void> {
  const covered = new Set(coveredVesselIds.filter(Boolean));
  for (const vesselId of covered) {
    await ensureVesselCoveredCrewAccess(crewUserId, vesselId);
  }

  const { data: rows, error } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .select('id, vessel_id, notes')
    .eq('crew_user_id', crewUserId)
    .eq('status', 'approved');

  if (error) {
    console.error('[vessel-crew-access] sync lookup failed', error);
    return;
  }

  const staleIds = (rows || [])
    .filter(
      (row) =>
        isAutoGrantedVesselAccessNote(row.notes) &&
        !covered.has(String(row.vessel_id || '')),
    )
    .map((row) => row.id as string);

  if (staleIds.length === 0) return;

  const { error: updateError } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .update({
      status: 'rejected',
      rejection_reason: 'Vessel plan coverage ended',
      updated_at: new Date().toISOString(),
    })
    .in('id', staleIds);

  if (updateError) {
    console.error('[vessel-crew-access] sync revoke failed', updateError);
  }
}

/**
 * True when the vessel account has an approved data-sharing request for this crew member.
 * This is the same consent gate used for personal sea-time logs and testimonials.
 */
export async function hasApprovedVesselCrewAccess(
  vesselUserId: string,
  crewUserId: string,
): Promise<boolean> {
  if (!vesselUserId || !crewUserId) return false;
  if (vesselUserId === crewUserId) return true;

  const { data } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .select('id')
    .eq('vessel_user_id', vesselUserId)
    .eq('crew_user_id', crewUserId)
    .eq('status', 'approved')
    .maybeSingle();

  return !!data;
}

export async function assertApprovedVesselCrewAccess(
  vesselUserId: string,
  crewUserId: string,
): Promise<{ ok: true } | { error: NextResponse }> {
  const allowed = await hasApprovedVesselCrewAccess(vesselUserId, crewUserId);
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: 'Crew has not approved data sharing with this vessel.' },
        { status: 403 },
      ),
    };
  }
  return { ok: true };
}

/** Resolve whether the caller may view another user's shared career/cert data. */
export async function assertCanViewCrewSharedData(
  actorUserId: string,
  crewUserId: string,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (actorUserId === crewUserId) return { ok: true };

  const { data: actor } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', actorUserId)
    .maybeSingle();

  const role = String(actor?.role || '').toLowerCase();
  if (role === 'admin') return { ok: true };

  if (role === 'vessel') {
    return assertApprovedVesselCrewAccess(actorUserId, crewUserId);
  }

  return {
    error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  };
}

/**
 * Vessel may attach a file to a crew record when they manage the vessel
 * and the crew has (or had) an assignment on it — including past members.
 */
export async function assertVesselCanAttachCrewRecord(
  actorUserId: string,
  crewUserId: string,
  vesselId: string,
): Promise<{ ok: true } | { error: NextResponse }> {
  if (!actorUserId || !crewUserId || !vesselId) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const { data: actor } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', actorUserId)
    .maybeSingle();

  const role = String(actor?.role || '').toLowerCase();
  if (role === 'admin') return { ok: true };

  if (role !== 'vessel') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('id')
    .eq('id', vesselId)
    .eq('vessel_manager_id', actorUserId)
    .maybeSingle();

  if (!vessel) {
    return {
      error: NextResponse.json(
        { error: 'You can only attach documents for crew on a vessel you manage.' },
        { status: 403 },
      ),
    };
  }

  const { data: assignment } = await supabaseAdmin
    .from('vessel_assignments')
    .select('id')
    .eq('user_id', crewUserId)
    .eq('vessel_id', vesselId)
    .limit(1)
    .maybeSingle();

  if (!assignment) {
    return {
      error: NextResponse.json(
        { error: 'This person is not on this vessel\'s crew list.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}

/** Read a stored crew-record document: crew owner, uploading vessel, or admin. */
export async function assertCanViewCrewRecordDocument(args: {
  actorUserId: string;
  crewUserId: string;
  vesselId: string;
  uploadedByUserId: string;
}): Promise<{ ok: true } | { error: NextResponse }> {
  const { actorUserId, crewUserId, vesselId, uploadedByUserId } = args;
  if (actorUserId === crewUserId || actorUserId === uploadedByUserId) {
    return { ok: true };
  }

  const { data: actor } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', actorUserId)
    .maybeSingle();

  const role = String(actor?.role || '').toLowerCase();
  if (role === 'admin') return { ok: true };

  if (role === 'vessel') {
    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('id')
      .eq('id', vesselId)
      .eq('vessel_manager_id', actorUserId)
      .maybeSingle();
    if (vessel) return { ok: true };
  }

  return {
    error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  };
}
