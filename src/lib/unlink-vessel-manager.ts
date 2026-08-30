import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type UnlinkVesselManagerResult = {
  vessel: { id: string; name: string; vessel_manager_id: null };
  clearedManagers: Array<{ id: string; email: string | null }>;
  cleared: {
    stateLogs: number;
    assignments: number;
    passages: number;
    watchLogs: number;
    aisSamples: number;
    aisPlaceMemory: number;
    passageMonthCache: number;
    passageTracks: number;
    bridgeWatchLogs: number;
  };
};

async function countDelete(
  label: string,
  run: () => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>,
): Promise<number> {
  try {
    const { data, error } = await run();
    if (error) {
      console.warn(`[unlink-vessel-manager] ${label}:`, error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (e) {
    console.warn(`[unlink-vessel-manager] ${label} exception`, e);
    return 0;
  }
}

/**
 * Fully unlink a vessel manager from a vessel and wipe that manager's
 * session data for the vessel (logs, passages, map caches, AIS samples).
 * Does not delete other crew members' data or vessel identity fields.
 */
export async function unlinkVesselManagerSession(opts: {
  vesselId: string;
  /** Prefer explicit manager id when known. */
  managerUserId?: string | null;
}): Promise<UnlinkVesselManagerResult> {
  const vesselId = opts.vesselId;

  const { data: vessel, error: vesselError } = await supabaseAdmin
    .from('vessels')
    .select('id, name, vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  if (vesselError || !vessel) {
    throw Object.assign(new Error('Vessel not found'), { status: 404 });
  }

  const managerIds = new Set<string>();
  if (opts.managerUserId) managerIds.add(opts.managerUserId);
  if (vessel.vessel_manager_id) managerIds.add(vessel.vessel_manager_id as string);

  const { data: pointedUsers, error: pointedError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('active_vessel_id', vesselId)
    .eq('role', 'vessel');

  if (pointedError) {
    throw Object.assign(
      new Error(pointedError.message || 'Failed to look up managers'),
      { status: 500 },
    );
  }
  for (const u of pointedUsers || []) managerIds.add(u.id as string);

  if (managerIds.size === 0 && !vessel.vessel_manager_id) {
    throw Object.assign(new Error('This vessel has no managing account to remove'), {
      status: 400,
    });
  }

  const { error: clearVesselError } = await supabaseAdmin
    .from('vessels')
    .update({
      vessel_manager_id: null,
      ais_tracking_enabled: false,
      ais_last_sync_at: null,
      ais_last_nav_status: null,
      ais_last_speed: null,
      ais_last_position_at: null,
      ais_last_sync_error: null,
    })
    .eq('id', vesselId);

  if (clearVesselError) {
    const { error: retryError } = await supabaseAdmin
      .from('vessels')
      .update({ vessel_manager_id: null })
      .eq('id', vesselId);
    if (retryError) {
      throw Object.assign(
        new Error(retryError.message || 'Failed to clear vessel manager'),
        { status: 500 },
      );
    }
  }

  const aisSamples = await countDelete('vessel_ais_state_samples', () =>
    supabaseAdmin
      .from('vessel_ais_state_samples')
      .delete()
      .eq('vessel_id', vesselId)
      .select('id'),
  );
  const aisPlaceMemory = await countDelete('vessel_ais_place_memory', () =>
    supabaseAdmin
      .from('vessel_ais_place_memory')
      .delete()
      .eq('vessel_id', vesselId)
      .select('id'),
  );

  const clearedManagers: Array<{ id: string; email: string | null }> = [];
  const totals = {
    stateLogs: 0,
    assignments: 0,
    passages: 0,
    watchLogs: 0,
    aisSamples,
    aisPlaceMemory,
    passageMonthCache: 0,
    passageTracks: 0,
    bridgeWatchLogs: 0,
  };

  for (const managerId of managerIds) {
    const { data: manager, error: managerLoadError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', managerId)
      .maybeSingle();

    if (managerLoadError || !manager) continue;

    const { error: clearUserError } = await supabaseAdmin
      .from('users')
      .update({
        active_vessel_id: null,
        start_date: null,
      })
      .eq('id', managerId);

    if (clearUserError) {
      throw Object.assign(
        new Error(
          clearUserError.message ||
            'Cleared vessel manager link but failed to reset the account session',
        ),
        { status: 500 },
      );
    }

    totals.stateLogs += await countDelete('daily_state_logs', () =>
      supabaseAdmin
        .from('daily_state_logs')
        .delete()
        .eq('user_id', managerId)
        .eq('vessel_id', vesselId)
        .select('id'),
    );
    totals.assignments += await countDelete('vessel_assignments', () =>
      supabaseAdmin
        .from('vessel_assignments')
        .delete()
        .eq('user_id', managerId)
        .eq('vessel_id', vesselId)
        .select('id'),
    );
    totals.passages += await countDelete('passage_logs', () =>
      supabaseAdmin
        .from('passage_logs')
        .delete()
        .eq('crew_id', managerId)
        .eq('vessel_id', vesselId)
        .select('id'),
    );
    totals.watchLogs += await countDelete('nav_watch_logs', () =>
      supabaseAdmin
        .from('nav_watch_logs')
        .delete()
        .eq('user_id', managerId)
        .eq('vessel_id', vesselId)
        .select('id'),
    );
    totals.bridgeWatchLogs += await countDelete('bridge_watch_logs', () =>
      supabaseAdmin
        .from('bridge_watch_logs')
        .delete()
        .eq('crew_id', managerId)
        .eq('vessel_id', vesselId)
        .select('id'),
    );
    totals.passageMonthCache += await countDelete('crew_passage_month_cache', () =>
      supabaseAdmin
        .from('crew_passage_month_cache')
        .delete()
        .eq('user_id', managerId)
        .eq('vessel_id', vesselId)
        .select('id'),
    );
    totals.passageTracks += await countDelete('crew_passage_tracks', () =>
      supabaseAdmin
        .from('crew_passage_tracks')
        .delete()
        .eq('user_id', managerId)
        .eq('vessel_id', vesselId)
        .select('id'),
    );

    clearedManagers.push({
      id: manager.id as string,
      email: (manager.email as string) || null,
    });
  }

  return {
    vessel: {
      id: vessel.id as string,
      name: vessel.name as string,
      vessel_manager_id: null,
    },
    clearedManagers,
    cleared: totals,
  };
}
