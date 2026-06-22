import { fetchVesselPosition } from '@/lib/datalastic/client';
import {
  buildAisStateNote,
  getNormalizedAisNavStatus,
  isAisPositionStale,
  logDateForLiveAisSync,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { VesselAisRow } from '@/lib/vessel-ais-access';

export type AisSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  vesselId: string;
  logDate?: string;
  state?: DailyStatus;
  navigationalStatus?: string | null;
  speed?: number | null;
  positionAt?: string | null;
};

type VesselRow = VesselAisRow;

/**
 * Poll Datalastic and upsert today's (position-date) daily_state_log for the
 * vessel manager when AIS tracking is enabled.
 */
export async function syncVesselStateFromAis(
  vessel: VesselRow,
  options?: { force?: boolean; managerUserId?: string; logDate?: string | null },
): Promise<AisSyncResult> {
  const vesselId = vessel.id;

  if (!options?.force && !vessel.ais_tracking_enabled) {
    return {
      ok: false,
      skipped: true,
      reason: 'AIS tracking is disabled for this vessel',
      vesselId,
    };
  }

  if (!vessel.mmsi && !vessel.imo) {
    return {
      ok: false,
      skipped: true,
      reason: 'Add an MMSI (or IMO) on the vessel profile before enabling AIS tracking',
      vesselId,
    };
  }

  const managerUserId = options?.managerUserId || vessel.vessel_manager_id;
  if (!managerUserId) {
    return {
      ok: false,
      skipped: true,
      reason: 'No vessel manager is assigned to this vessel',
      vesselId,
    };
  }

  try {
    const position = await fetchVesselPosition({
      mmsi: vessel.mmsi,
      imo: vessel.imo,
    });

    if (isAisPositionStale(position)) {
      const normalisedStatus = getNormalizedAisNavStatus(position) || null;
      await supabaseAdmin
        .from('vessels')
        .update({
          ais_last_sync_at: new Date().toISOString(),
          ais_last_sync_error: 'AIS position is stale (>6h); state not updated',
          ais_last_nav_status: normalisedStatus,
          ais_last_speed: position.speed ?? null,
          ais_last_position_at: position.last_position_UTC ?? null,
        })
        .eq('id', vesselId);

      return {
        ok: false,
        skipped: true,
        reason: 'Latest AIS position is older than 6 hours',
        vesselId,
        navigationalStatus: normalisedStatus,
        speed: position.speed ?? null,
        positionAt: position.last_position_UTC ?? null,
      };
    }

    const logDate = logDateForLiveAisSync(options?.logDate);
    const state = mapAisToDailyStatus(position);
    const notes = buildAisStateNote(position);
    const isUnderway = state === 'underway';

    const { error: upsertError } = await supabaseAdmin.from('daily_state_logs').upsert(
      {
        user_id: managerUserId,
        vessel_id: vesselId,
        date: logDate,
        state,
        ...(isUnderway ? { is_part_of_active_passage: false } : {}),
        notes,
      },
      { onConflict: 'user_id,vessel_id,date' },
    );

    if (upsertError) {
      throw upsertError;
    }

    const normalisedStatus = getNormalizedAisNavStatus(position) || null;
    await supabaseAdmin
      .from('vessels')
      .update({
        ais_last_sync_at: new Date().toISOString(),
        ais_last_sync_error: null,
        ais_last_nav_status: normalisedStatus,
        ais_last_speed: position.speed ?? null,
        ais_last_position_at: position.last_position_UTC ?? null,
      })
      .eq('id', vesselId);

    return {
      ok: true,
      vesselId,
      logDate,
      state,
      navigationalStatus: normalisedStatus,
      speed: position.speed ?? null,
      positionAt: position.last_position_UTC ?? null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AIS sync failed';

    await supabaseAdmin
      .from('vessels')
      .update({
        ais_last_sync_at: new Date().toISOString(),
        ais_last_sync_error: message,
      })
      .eq('id', vesselId);

    return {
      ok: false,
      reason: message,
      vesselId,
    };
  }
}

/** Sync all vessels with AIS tracking enabled (for cron). */
export async function syncAllEnabledAisVessels(): Promise<AisSyncResult[]> {
  const { data: vessels, error } = await supabaseAdmin
    .from('vessels')
    .select('id, mmsi, imo, vessel_manager_id, ais_tracking_enabled')
    .eq('ais_tracking_enabled', true);

  if (error) {
    throw error;
  }

  const results: AisSyncResult[] = [];
  for (const vessel of vessels ?? []) {
    results.push(await syncVesselStateFromAis(vessel));
  }
  return results;
}

export function formatAisSyncSummary(result: AisSyncResult): string {
  if (result.ok && result.state && result.logDate) {
    return `Set ${result.logDate} to ${result.state} from AIS`;
  }
  if (result.skipped && result.reason) {
    return result.reason;
  }
  return result.reason || 'AIS sync failed';
}
