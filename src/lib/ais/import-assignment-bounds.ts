import type { SupabaseClient } from '@supabase/supabase-js';

import type { AisHistoryAuth } from '@/lib/vessel-ais-access';
import {
  getAssignmentSegmentsInRange,
  getEarliestAssignmentStart,
  getLatestAssignmentEnd,
  todayDateKey,
  type AssignmentPeriod,
  type DateRangeInclusive,
} from '@/lib/vessel-assignment-dates';

export type AisImportAssignmentBounds = {
  assignments: AssignmentPeriod[];
  /** Segments of the requested range that may be imported. */
  allowedSegments: DateRangeInclusive[];
  earliestDate: string;
  latestDate: string;
};

export type AisImportBoundsResult =
  | { ok: true; bounds: AisImportAssignmentBounds }
  | { ok: false; error: string; status?: number };

async function loadAssignmentsForVessel(
  supabaseAdmin: SupabaseClient,
  userId: string,
  vesselId: string,
): Promise<AssignmentPeriod[]> {
  const { data, error } = await supabaseAdmin
    .from('vessel_assignments')
    .select('start_date, end_date')
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .order('start_date', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    startDate: row.start_date as string,
    endDate: (row.end_date as string | null) ?? null,
  }));
}

async function getVesselManagerEarliestDate(
  auth: AisHistoryAuth,
  vesselId: string,
  supabaseAdmin: SupabaseClient,
): Promise<string> {
  const profileStart =
    typeof auth.profile.start_date === 'string'
      ? auth.profile.start_date
      : typeof auth.profile.startDate === 'string'
        ? auth.profile.startDate
        : null;

  if (profileStart) return profileStart.slice(0, 10);

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('created_at')
    .eq('id', vesselId)
    .maybeSingle();

  if (vessel?.created_at) {
    return String(vessel.created_at).slice(0, 10);
  }

  return '1970-01-01';
}

/**
 * Resolve which dates in [from, to] the user may import for this vessel.
 */
export async function resolveAisImportAssignmentBounds(
  auth: AisHistoryAuth,
  vesselId: string,
  from: string,
  to: string,
  supabaseAdmin: SupabaseClient,
): Promise<AisImportBoundsResult> {
  const role = (auth.profile.role || '').toString().toLowerCase();
  const today = todayDateKey();

  if (role === 'admin') {
    return {
      ok: true,
      bounds: {
        assignments: [],
        allowedSegments: [{ from, to }],
        earliestDate: from,
        latestDate: to > today ? today : to,
      },
    };
  }

  if (role === 'vessel') {
    const earliestDate = await getVesselManagerEarliestDate(auth, vesselId, supabaseAdmin);
    const latestDate = today;
    const segFrom = from > earliestDate ? from : earliestDate;
    const segTo = to < latestDate ? to : latestDate;

    if (segFrom > segTo) {
      return {
        ok: false,
        status: 400,
        error: `AIS import is only available from ${earliestDate} through today for your vessel account.`,
      };
    }

    return {
      ok: true,
      bounds: {
        assignments: [],
        allowedSegments: [{ from: segFrom, to: segTo }],
        earliestDate,
        latestDate,
      },
    };
  }

  if (role === 'crew' || role === 'captain') {
    const assignments = await loadAssignmentsForVessel(
      supabaseAdmin,
      auth.userId,
      vesselId,
    );

    if (assignments.length === 0) {
      return {
        ok: false,
        status: 403,
        error:
          'You must have a vessel assignment before importing AIS history. Add the vessel on Current Service or Vessel History.',
      };
    }

    const allowedSegments = getAssignmentSegmentsInRange(from, to, assignments);
    if (allowedSegments.length === 0) {
      const earliest = getEarliestAssignmentStart(assignments);
      const latest = getLatestAssignmentEnd(assignments);
      return {
        ok: false,
        status: 400,
        error: `The selected dates are outside your assignment on this vessel (${earliest} – ${latest ?? 'ongoing'}).`,
      };
    }

    const earliestDate = getEarliestAssignmentStart(assignments) ?? from;
    const latestAssignmentEnd = getLatestAssignmentEnd(assignments);
    const latestDate =
      latestAssignmentEnd && latestAssignmentEnd < today ? latestAssignmentEnd : today;

    return {
      ok: true,
      bounds: {
        assignments,
        allowedSegments,
        earliestDate,
        latestDate,
      },
    };
  }

  return { ok: false, status: 403, error: 'Forbidden' };
}

export async function loadAisImportEligibleVesselIds(
  auth: AisHistoryAuth,
  supabaseAdmin: SupabaseClient,
): Promise<string[]> {
  const role = (auth.profile.role || '').toString().toLowerCase();

  if (role === 'admin') return [];

  if (role === 'vessel') {
    const activeVesselId = auth.profile.active_vessel_id as string | null;
    return activeVesselId ? [activeVesselId] : [];
  }

  if (role === 'crew' || role === 'captain') {
    const { data, error } = await supabaseAdmin
      .from('vessel_assignments')
      .select('vessel_id')
      .eq('user_id', auth.userId);

    if (error) throw error;

    return [...new Set((data ?? []).map((row) => row.vessel_id as string))];
  }

  return [];
}
