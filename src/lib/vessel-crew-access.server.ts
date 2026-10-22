import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
