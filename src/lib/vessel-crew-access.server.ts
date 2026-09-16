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
