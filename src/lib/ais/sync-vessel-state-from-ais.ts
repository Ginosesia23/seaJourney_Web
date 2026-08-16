/**
 * Live AIS state tracking for vessel managers.
 *
 * When `vessels.ais_tracking_enabled` is true, Vercel cron (`/api/ais/cron`)
 * runs hourly with no login required and:
 *   1. Fetches the latest AIS position from Datalastic
 *   2. Stores an hourly sample in `vessel_ais_state_samples`
 *   3. Aggregates today's samples with `aggregateCrewDailyState` /
 *      `analyzeAisDailyState` (≥ 4h underway → underway sea day)
 *   4. Upserts `daily_state_logs` for the vessel manager (`[AIS auto]` notes)
 *      without overwriting manual entries
 *   5. Around midnight UTC, also finalizes yesterday from stored samples
 */

import { fetchVesselPosition, type DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  buildAisStateNote,
  getNormalizedAisNavStatus,
  isAisPositionStale,
  logDateForLiveAisSync,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';
import {
  aggregateCrewDailyState,
  type CrewAisSample,
} from '@/lib/ais/aggregate-crew-daily-state';
import {
  resolveLiveSampleState,
  type PreviousSample,
} from '@/lib/ais/resolve-live-sample-state';
import {
  findPlaceMemoryHint,
  recordPlaceMemoryVisit,
} from '@/lib/ais/place-memory';
import { reverseGeocodeStructured } from '@/lib/geocoding/reverse-geocode';
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
  sampleState?: DailyStatus;
  sampleCount?: number;
  navigationalStatus?: string | null;
  speed?: number | null;
  positionAt?: string | null;
  finalizedYesterday?: boolean;
};

type VesselRow = VesselAisRow;

const SAMPLE_RETENTION_DAYS = 8;

function utcDateOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadPreviousDayContext(
  vesselId: string,
  managerUserId: string,
  logDate: string,
) {
  const prevDate = (() => {
    const d = new Date(`${logDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const [{ data: prevLog }, { data: prevSample }] = await Promise.all([
    supabaseAdmin
      .from('daily_state_logs')
      .select('state')
      .eq('user_id', managerUserId)
      .eq('vessel_id', vesselId)
      .eq('date', prevDate)
      .maybeSingle(),
    supabaseAdmin
      .from('vessel_ais_state_samples')
      .select('lat, lon, state')
      .eq('vessel_id', vesselId)
      .eq('sample_date', prevDate)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!prevLog?.state) return undefined;
  return {
    state: prevLog.state as DailyStatus,
    lastLatitude: (prevSample?.lat as number) ?? null,
    lastLongitude: (prevSample?.lon as number) ?? null,
  };
}

async function aggregateAndUpsertDay(opts: {
  vesselId: string;
  managerUserId: string;
  logDate: string;
  positionForNote?: DatalasticVesselPosition | null;
}): Promise<{
  state: DailyStatus;
  reason: string;
  sampleCount: number;
  skippedManual: boolean;
  note: string;
}> {
  const { vesselId, managerUserId, logDate, positionForNote } = opts;

  const { data: samples, error } = await supabaseAdmin
    .from('vessel_ais_state_samples')
    .select('state, sampled_at, nav_status, speed_kn, lat, lon, raw_position')
    .eq('vessel_id', vesselId)
    .eq('sample_date', logDate)
    .order('sampled_at', { ascending: true });

  if (error) throw error;

  const asInput: CrewAisSample[] = (samples ?? []).map((s) => ({
    state: s.state as DailyStatus,
    sampledAt: s.sampled_at as string,
    navStatus: (s.nav_status as string) ?? null,
    speedKn: (s.speed_kn as number) ?? null,
    lat: (s.lat as number) ?? null,
    lon: (s.lon as number) ?? null,
    rawPosition: (s.raw_position as DatalasticVesselPosition) ?? null,
  }));

  if (asInput.length === 0) {
    throw new Error(`No AIS samples for ${logDate}`);
  }

  const last = asInput[asInput.length - 1];
  let locationContext:
    | { endOfDayPlaceName: string | null; endOfDayInPopulatedArea?: boolean }
    | undefined;
  if (last.lat != null && last.lon != null) {
    try {
      const geo = await reverseGeocodeStructured(last.lat, last.lon);
      if (geo) {
        locationContext = {
          endOfDayPlaceName: geo.label ?? null,
          endOfDayInPopulatedArea: geo.inPopulatedArea === true,
        };
      }
    } catch {
      locationContext = undefined;
    }
  }

  const previousDay = await loadPreviousDayContext(
    vesselId,
    managerUserId,
    logDate,
  );

  const aggregate = aggregateCrewDailyState(asInput, {
    previousDay,
    locationContext,
  });

  const noteBase = positionForNote
    ? buildAisStateNote(positionForNote)
    : '[AIS auto]';
  const underwayHours = aggregate.metrics?.underwayDurationMs
    ? (aggregate.metrics.underwayDurationMs / (60 * 60 * 1000)).toFixed(1)
    : null;
  const extras = [
    `daily: ${aggregate.state}`,
    `${aggregate.sampleCount} samples`,
  ];
  if (underwayHours) extras.push(`${underwayHours}h underway`);
  if (aggregate.seaDayRuleFired) extras.push('sea day ≥ 4h');
  if (locationContext?.endOfDayPlaceName) {
    extras.push(`@${locationContext.endOfDayPlaceName}`);
  }
  const notes = `${noteBase} · ${extras.join(' · ')}`;

  const { data: existingLog } = await supabaseAdmin
    .from('daily_state_logs')
    .select('id, state, notes')
    .eq('user_id', managerUserId)
    .eq('vessel_id', vesselId)
    .eq('date', logDate)
    .maybeSingle();

  const isManuallyOverridden =
    !!existingLog &&
    typeof existingLog.notes === 'string' &&
    !existingLog.notes.startsWith('[AIS');

  if (!isManuallyOverridden) {
    const isUnderway = aggregate.state === 'underway';
    const { error: upsertError } = await supabaseAdmin
      .from('daily_state_logs')
      .upsert(
        {
          user_id: managerUserId,
          vessel_id: vesselId,
          date: logDate,
          state: aggregate.state,
          ...(isUnderway ? { is_part_of_active_passage: false } : {}),
          notes,
        },
        { onConflict: 'user_id,vessel_id,date' },
      );
    if (upsertError) throw upsertError;
  }

  return {
    state: aggregate.state,
    reason: aggregate.reason,
    sampleCount: aggregate.sampleCount,
    skippedManual: isManuallyOverridden,
    note: notes,
  };
}

/**
 * Poll Datalastic, store an hourly sample, and upsert today's daily_state_log
 * for the vessel manager when AIS tracking is enabled.
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
    const lat = position.lat ?? null;
    const lon = position.lon ?? null;
    const speedKn = position.speed ?? null;
    const navStatus = getNormalizedAisNavStatus(position) || null;

    const { data: prevSampleRow } = await supabaseAdmin
      .from('vessel_ais_state_samples')
      .select('state, lat, lon, sampled_at')
      .eq('vessel_id', vesselId)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousSample: PreviousSample | null = prevSampleRow
      ? {
          state: prevSampleRow.state as DailyStatus,
          lat: (prevSampleRow.lat as number) ?? null,
          lon: (prevSampleRow.lon as number) ?? null,
          sampledAt: prevSampleRow.sampled_at as string,
        }
      : null;

    const previousDay = await loadPreviousDayContext(
      vesselId,
      managerUserId,
      logDate,
    );

    let locationContext:
      | {
          endOfDayPlaceName?: string | null;
          endOfDayInPopulatedArea?: boolean;
        }
      | undefined;
    if (lat != null && lon != null) {
      try {
        const geo = await reverseGeocodeStructured(lat, lon);
        if (geo) {
          locationContext = {
            endOfDayPlaceName: geo.label ?? null,
            endOfDayInPopulatedArea: geo.inPopulatedArea === true,
          };
        }
      } catch {
        locationContext = undefined;
      }
    }

    const placeMemory = await findPlaceMemoryHint({
      vesselId,
      lat,
      lon,
    });

    const resolution = resolveLiveSampleState({
      position,
      previousSample,
      yesterdayAnchor: previousDay
        ? {
            state: previousDay.state,
            lat: previousDay.lastLatitude,
            lon: previousDay.lastLongitude,
          }
        : null,
      placeMemory,
      locationContext,
    });

    if (
      resolution.state === 'at-anchor' ||
      resolution.state === 'in-port' ||
      resolution.state === 'in-yard'
    ) {
      void recordPlaceMemoryVisit({
        vesselId,
        lat,
        lon,
        state: resolution.state,
        placeName: locationContext?.endOfDayPlaceName ?? null,
      });
    }

    const sampleState = resolution.state || mapAisToDailyStatus(position);

    const { error: sampleError } = await supabaseAdmin
      .from('vessel_ais_state_samples')
      .insert({
        vessel_id: vesselId,
        sample_date: logDate,
        sampled_at: new Date().toISOString(),
        ais_position_at: position.last_position_UTC ?? null,
        state: sampleState,
        nav_status: navStatus,
        speed_kn: speedKn,
        lat,
        lon,
        raw_position: position as unknown as Record<string, unknown>,
      });

    if (sampleError && (sampleError as { code?: string }).code !== '23505') {
      throw sampleError;
    }

    const day = await aggregateAndUpsertDay({
      vesselId,
      managerUserId,
      logDate,
      positionForNote: position,
    });

    // Finalize yesterday once early UTC so the previous calendar day settles
    // without needing anyone to open the app.
    let finalizedYesterday = false;
    const utcHour = new Date().getUTCHours();
    if (utcHour <= 2) {
      const yesterday = utcDateOffset(-1);
      try {
        const { count } = await supabaseAdmin
          .from('vessel_ais_state_samples')
          .select('id', { count: 'exact', head: true })
          .eq('vessel_id', vesselId)
          .eq('sample_date', yesterday);
        if ((count ?? 0) > 0) {
          await aggregateAndUpsertDay({
            vesselId,
            managerUserId,
            logDate: yesterday,
            positionForNote: null,
          });
          finalizedYesterday = true;
        }
      } catch (e) {
        console.warn('[vessel-ais-sync] yesterday finalize failed', vesselId, e);
      }
    }

    // Trim old samples
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - SAMPLE_RETENTION_DAYS);
    void supabaseAdmin
      .from('vessel_ais_state_samples')
      .delete()
      .eq('vessel_id', vesselId)
      .lt('sampled_at', cutoff.toISOString());

    await supabaseAdmin
      .from('vessels')
      .update({
        ais_last_sync_at: new Date().toISOString(),
        ais_last_sync_error: day.skippedManual
          ? 'Manual state present — sample stored, daily log not overwritten'
          : null,
        ais_last_nav_status: navStatus,
        ais_last_speed: speedKn,
        ais_last_position_at: position.last_position_UTC ?? null,
      })
      .eq('id', vesselId);

    return {
      ok: true,
      vesselId,
      logDate,
      state: day.state,
      sampleState,
      sampleCount: day.sampleCount,
      navigationalStatus: navStatus,
      speed: speedKn,
      positionAt: position.last_position_UTC ?? null,
      finalizedYesterday,
      reason: day.skippedManual
        ? 'Sample stored; manual daily state left unchanged'
        : day.reason,
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
    const samples =
      typeof result.sampleCount === 'number'
        ? ` (${result.sampleCount} samples)`
        : '';
    return `Set ${result.logDate} to ${result.state} from AIS${samples}`;
  }
  if (result.skipped && result.reason) {
    return result.reason;
  }
  return result.reason || 'AIS sync failed';
}
