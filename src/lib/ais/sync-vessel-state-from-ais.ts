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

import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import { getVesselAIS } from '@/lib/ais/ais-service';
import type { AisTriggerSource } from '@/lib/ais/fetch-audit-shared';
import { finalizeYesterdayIfNeeded } from '@/lib/ais/daily-summary';
import {
  buildAisStateNote,
  getNormalizedAisNavStatus,
  isAisPositionStale,
  logDateForLiveAisSync,
} from '@/lib/ais/map-ais-to-state';
import {
  aggregateCrewDailyState,
  type CrewAisSample,
} from '@/lib/ais/aggregate-crew-daily-state';
import {
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

  // Prefer duration-based vessel_daily_ais_summary when present.
  try {
    const { getDailyAisSummary, applyDailySummaryToStateLogs } = await import(
      '@/lib/ais/daily-summary'
    );
    const summary = await getDailyAisSummary(vesselId, logDate);
    if (summary?.qualifying_daily_state) {
      const applied = await applyDailySummaryToStateLogs(vesselId, summary);
      const underwayHours = (summary.underway_seconds / 3600).toFixed(1);
      return {
        state: summary.qualifying_daily_state,
        reason: summary.underway_qualified
          ? `Duration summary: ≥4h underway (${underwayHours}h)`
          : `Duration summary: ${summary.qualifying_daily_state}`,
        sampleCount: summary.observation_count,
        skippedManual: !applied.updated && applied.reason === 'Manual override present',
        note: `[AIS auto] · daily: ${summary.qualifying_daily_state} · ${underwayHours}h underway`,
      };
    }
  } catch (e) {
    console.warn('[vessel-ais-sync] duration summary unavailable, falling back', e);
  }

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
  options?: {
    force?: boolean;
    managerUserId?: string;
    logDate?: string | null;
    /** Audit trigger for a forced fetch (cron without force is always adaptive_scheduler). */
    triggerSource?: AisTriggerSource;
  },
): Promise<AisSyncResult> {
  const vesselId = vessel.id;

  if (!options?.force) {
    const { shouldTrackVesselAIS } = await import(
      '@/lib/ais/vessel-ais-entitlement'
    );
    const track =
      vessel.ais_provider_poll_enabled === true ||
      (await shouldTrackVesselAIS(vesselId));
    if (!track) {
      return {
        ok: false,
        skipped: true,
        reason: 'No active AIS entitlement source for this vessel',
        vesselId,
      };
    }
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
  // Manager is optional for crew-funded vessels — still refresh central AIS;
  // skip writing vessel-manager daily_state_logs when no manager exists.

  try {
    const logDate = logDateForLiveAisSync(options?.logDate);

    const { data: prevSampleRow } = await supabaseAdmin
      .from('vessel_ais_state_samples')
      .select('state, lat, lon, sampled_at')
      .eq('vessel_id', vesselId)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousSample = prevSampleRow
      ? {
          state: prevSampleRow.state as DailyStatus,
          lat: (prevSampleRow.lat as number) ?? null,
          lon: (prevSampleRow.lon as number) ?? null,
          sampledAt: prevSampleRow.sampled_at as string,
        }
      : null;

    const previousDay = managerUserId
      ? await loadPreviousDayContext(vesselId, managerUserId, logDate)
      : null;

    // Cron: refresh when due. Manual sync: force provider fetch.
    const aisSnapshot = await getVesselAIS(vesselId, {
      force: options?.force === true,
      refreshIfStale: options?.force !== true,
      triggerSource: options?.force
        ? (options.triggerSource ?? 'unknown')
        : 'adaptive_scheduler',
      triggerDetail: options?.force ? 'vessel-sync:manual' : 'vessel-sync:cron',
      classificationContext: {
        previousSample,
        yesterdayAnchor: previousDay
          ? {
              state: previousDay.state,
              lat: previousDay.lastLatitude,
              lon: previousDay.lastLongitude,
            }
          : null,
      },
    });

    const position = aisSnapshot.rawPosition;
    if (
      !position ||
      aisSnapshot.latitude == null ||
      aisSnapshot.longitude == null
    ) {
      const message =
        aisSnapshot.refreshError ??
        'AIS provider returned no position for this vessel.';
      await supabaseAdmin
        .from('vessels')
        .update({
          ais_last_sync_at: new Date().toISOString(),
          ais_last_sync_error: message,
        })
        .eq('id', vesselId);

      return {
        ok: false,
        skipped: true,
        reason: message,
        vesselId,
      };
    }

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

    const lat = aisSnapshot.latitude;
    const lon = aisSnapshot.longitude;
    const speedKn = aisSnapshot.speedKn;
    const navStatus = aisSnapshot.rawNavigationStatus;
    const sampleState = aisSnapshot.state;

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

    if (
      sampleState === 'at-anchor' ||
      sampleState === 'in-port' ||
      sampleState === 'in-yard'
    ) {
      void recordPlaceMemoryVisit({
        vesselId,
        lat,
        lon,
        state: sampleState,
        placeName: locationContext?.endOfDayPlaceName ?? null,
      });
    }

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

    const day = managerUserId
      ? await aggregateAndUpsertDay({
          vesselId,
          managerUserId,
          logDate,
          positionForNote: position,
        })
      : {
          state: sampleState,
          sampleCount: 0,
          reason: 'Central AIS refreshed (no vessel manager — crew-funded)',
          skippedManual: false,
          note: null as string | null,
        };

    // Finalize yesterday's duration summary near UTC midnight.
    let finalizedYesterday = false;
    const utcHour = new Date().getUTCHours();
    if (utcHour <= 2) {
      try {
        await finalizeYesterdayIfNeeded(vesselId);
        if (managerUserId) {
          const yesterday = utcDateOffset(-1);
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

/** Sync all vessels with AIS tracking enabled that are due (for cron). */
export async function syncAllEnabledAisVessels(): Promise<AisSyncResult[]> {
  const { listDueAisVesselIds } = await import('@/lib/ais/ais-service');
  const { AIS_CRON_BATCH_SIZE, AIS_CRON_CONCURRENCY } = await import(
    '@/lib/ais/constants'
  );

  const dueIds = await listDueAisVesselIds(AIS_CRON_BATCH_SIZE);
  if (dueIds.length === 0) return [];

  const { data: vessels, error } = await supabaseAdmin
    .from('vessels')
    .select(
      'id, mmsi, imo, vessel_manager_id, ais_tracking_enabled, ais_provider_poll_enabled',
    )
    .in('id', dueIds)
    .eq('ais_provider_poll_enabled', true);

  if (error) throw error;

  const results: AisSyncResult[] = [];
  const list = vessels ?? [];

  // Bounded concurrency — avoid uncontrolled Promise.all on large fleets.
  for (let i = 0; i < list.length; i += AIS_CRON_CONCURRENCY) {
    const chunk = list.slice(i, i + AIS_CRON_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((vessel) => syncVesselStateFromAis(vessel)),
    );
    results.push(...chunkResults);
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
