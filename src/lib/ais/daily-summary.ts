/**
 * Vessel daily AIS duration summary.
 *
 * Layers:
 *   vessel_ais_status     → what the vessel appears to be doing NOW
 *   ais_observations      → immutable raw evidence
 *   vessel_daily_ais_summary → duration-based TODAY qualification
 *   daily_state_logs      → final user-facing sea-service record
 *
 * Interval attribution (documented):
 *   Elapsed time between observation A and B is attributed to A's
 *   seajourney_state (previous state). We do not invent a transition
 *   midpoint — matches the conservative stance of analyzeAisDailyState.
 *
 * Large gaps:
 *   Gaps longer than MAX_AIS_INTERVAL_SECONDS do not credit the previous
 *   state. The capped max is recorded as unknown_seconds (auditable silence).
 *
 * Qualification:
 *   underway_seconds >= UNDERWAY_DAILY_QUALIFICATION_SECONDS (4h)
 *   → underway_qualified + qualifying_daily_state = underway
 *   This can flip mid-day and is never revoked by later anchoring.
 *
 * Dates:
 *   Uses the same UTC calendar date convention as logDateForLiveAisSync /
 *   daily_state_logs (yyyy-MM-dd from ISO UTC).
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import {
  AIS_DAILY_CALCULATION_VERSION,
  MAX_AIS_DISTANCE_SPEED_KN,
  MAX_AIS_INTERVAL_SECONDS,
  UNDERWAY_DAILY_QUALIFICATION_SECONDS,
} from '@/lib/ais/constants';
import { logDateForLiveAisSync } from '@/lib/ais/map-ais-to-state';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type AisObservationRow = {
  id: string;
  vessel_id: string;
  latitude: number | null;
  longitude: number | null;
  speed_kn: number | null;
  seajourney_state: DailyStatus;
  provider_timestamp: string | null;
  fetched_at: string;
};

export type VesselDailyAisSummaryRow = {
  id: string;
  vessel_id: string;
  date: string;
  underway_seconds: number;
  anchor_seconds: number;
  moored_seconds: number;
  port_seconds: number;
  unknown_seconds: number;
  distance_nm: number;
  first_observation_at: string | null;
  last_observation_at: string | null;
  observation_count: number;
  current_state: DailyStatus | null;
  qualifying_daily_state: DailyStatus | null;
  underway_qualified: boolean;
  is_final: boolean;
  last_processed_observation_id: string | null;
  calculation_version: number;
  created_at: string;
  updated_at: string;
};

export type DailyAisSummaryDto = {
  date: string;
  currentState: DailyStatus | null;
  qualifyingDailyState: DailyStatus | null;
  underwaySeconds: number;
  anchorSeconds: number;
  mooredSeconds: number;
  portSeconds: number;
  unknownSeconds: number;
  distanceNm: number;
  underwayQualified: boolean;
  isFinal: boolean;
  observationCount: number;
  firstObservationAt: string | null;
  lastObservationAt: string | null;
  calculationVersion: number;
};

type DurationBuckets = {
  underway_seconds: number;
  anchor_seconds: number;
  moored_seconds: number;
  port_seconds: number;
  unknown_seconds: number;
};

function emptyBuckets(): DurationBuckets {
  return {
    underway_seconds: 0,
    anchor_seconds: 0,
    moored_seconds: 0,
    port_seconds: 0,
    unknown_seconds: 0,
  };
}

function observationAtMs(obs: AisObservationRow): number {
  const raw = obs.provider_timestamp || obs.fetched_at;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.parse(obs.fetched_at);
}

function dateKeyFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcMidnightMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`);
}

/**
 * Attribute seconds to a SeaJourney state bucket.
 * in-port → moored_seconds (SeaJourney "Moored").
 * in-yard / on-leave / unknown → unknown_seconds.
 */
function addSecondsForState(
  buckets: DurationBuckets,
  state: DailyStatus | string | null | undefined,
  seconds: number,
): void {
  if (seconds <= 0) return;
  switch (state) {
    case 'underway':
      buckets.underway_seconds += seconds;
      break;
    case 'at-anchor':
      buckets.anchor_seconds += seconds;
      break;
    case 'in-port':
      buckets.moored_seconds += seconds;
      break;
    default:
      buckets.unknown_seconds += seconds;
      break;
  }
}

/**
 * Qualify the day from duration buckets (not sample counts).
 * Once underway_qualified, it stays underway for the day.
 */
export function qualifyDailyState(
  buckets: DurationBuckets,
  currentState: DailyStatus | null,
  alreadyUnderwayQualified = false,
): { qualifying: DailyStatus; underwayQualified: boolean } {
  const underwayQualified =
    alreadyUnderwayQualified ||
    buckets.underway_seconds >= UNDERWAY_DAILY_QUALIFICATION_SECONDS;

  if (underwayQualified) {
    return { qualifying: 'underway', underwayQualified: true };
  }

  // Dominant non-underway duration among known stationary buckets.
  const candidates: Array<{ state: DailyStatus; seconds: number }> = [
    { state: 'at-anchor', seconds: buckets.anchor_seconds },
    { state: 'in-port', seconds: buckets.moored_seconds + buckets.port_seconds },
  ];
  candidates.sort((a, b) => b.seconds - a.seconds);
  if (candidates[0] && candidates[0].seconds > 0) {
    return { qualifying: candidates[0].state, underwayQualified: false };
  }

  if (currentState && currentState !== 'underway') {
    return { qualifying: currentState, underwayQualified: false };
  }

  return {
    qualifying: currentState ?? 'at-anchor',
    underwayQualified: false,
  };
}

function computeIntervalCredit(opts: {
  prevMs: number;
  currMs: number;
  prevState: DailyStatus;
  dateKey: string;
}): { stateSeconds: number; unknownSeconds: number; creditedState: DailyStatus } {
  const { prevMs, currMs, prevState, dateKey } = opts;
  if (!(currMs > prevMs)) {
    return { stateSeconds: 0, unknownSeconds: 0, creditedState: prevState };
  }

  const dayStart = utcMidnightMs(dateKey);
  // Only credit time that falls on this calendar date (UTC).
  const effectiveStart = Math.max(prevMs, dayStart);
  let gapSec = Math.floor((currMs - effectiveStart) / 1000);
  if (gapSec <= 0) {
    return { stateSeconds: 0, unknownSeconds: 0, creditedState: prevState };
  }

  if (gapSec > MAX_AIS_INTERVAL_SECONDS) {
    // Large silence — do not credit previous state; record capped unknown.
    return {
      stateSeconds: 0,
      unknownSeconds: MAX_AIS_INTERVAL_SECONDS,
      creditedState: prevState,
    };
  }

  return {
    stateSeconds: gapSec,
    unknownSeconds: 0,
    creditedState: prevState,
  };
}

function computeDistanceNm(
  prev: AisObservationRow,
  curr: AisObservationRow,
  intervalSeconds: number,
): number {
  const lat1 = prev.latitude != null ? Number(prev.latitude) : null;
  const lon1 = prev.longitude != null ? Number(prev.longitude) : null;
  const lat2 = curr.latitude != null ? Number(curr.latitude) : null;
  const lon2 = curr.longitude != null ? Number(curr.longitude) : null;
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null ||
    intervalSeconds <= 0
  ) {
    return 0;
  }

  const nm = haversineNm(lat1, lon1, lat2, lon2);
  if (!Number.isFinite(nm) || nm <= 0) return 0;

  const hours = intervalSeconds / 3600;
  const impliedKn = nm / hours;
  if (impliedKn > MAX_AIS_DISTANCE_SPEED_KN) {
    return 0; // GPS jump
  }
  return nm;
}

function rowToDto(row: VesselDailyAisSummaryRow): DailyAisSummaryDto {
  return {
    date: row.date,
    currentState: row.current_state,
    qualifyingDailyState: row.qualifying_daily_state,
    underwaySeconds: row.underway_seconds,
    anchorSeconds: row.anchor_seconds,
    mooredSeconds: row.moored_seconds,
    portSeconds: row.port_seconds,
    unknownSeconds: row.unknown_seconds,
    distanceNm: Number(row.distance_nm) || 0,
    underwayQualified: row.underway_qualified,
    isFinal: row.is_final,
    observationCount: row.observation_count,
    firstObservationAt: row.first_observation_at,
    lastObservationAt: row.last_observation_at,
    calculationVersion: row.calculation_version,
  };
}

export async function getDailyAisSummary(
  vesselId: string,
  date?: string | null,
): Promise<VesselDailyAisSummaryRow | null> {
  const dateKey = logDateForLiveAisSync(date);
  const { data, error } = await supabaseAdmin
    .from('vessel_daily_ais_summary')
    .select('*')
    .eq('vessel_id', vesselId)
    .eq('date', dateKey)
    .maybeSingle();
  if (error) {
    console.error('[daily-ais-summary] get failed', vesselId, dateKey, error);
    return null;
  }
  return (data as VesselDailyAisSummaryRow | null) ?? null;
}

export async function getDailyAisSummaryDto(
  vesselId: string,
  date?: string | null,
): Promise<DailyAisSummaryDto | null> {
  const row = await getDailyAisSummary(vesselId, date);
  return row ? rowToDto(row) : null;
}

async function loadPreviousObservation(
  vesselId: string,
  beforeFetchedAt: string,
  excludeId: string,
): Promise<AisObservationRow | null> {
  const { data, error } = await supabaseAdmin
    .from('ais_observations')
    .select(
      'id, vessel_id, latitude, longitude, speed_kn, seajourney_state, provider_timestamp, fetched_at',
    )
    .eq('vessel_id', vesselId)
    .neq('id', excludeId)
    .lte('fetched_at', beforeFetchedAt)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[daily-ais-summary] prev obs lookup failed', error);
    return null;
  }
  return (data as AisObservationRow | null) ?? null;
}

async function ensureSummaryRow(
  vesselId: string,
  dateKey: string,
): Promise<VesselDailyAisSummaryRow> {
  const existing = await getDailyAisSummary(vesselId, dateKey);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('vessel_daily_ais_summary')
    .upsert(
      {
        vessel_id: vesselId,
        date: dateKey,
        calculation_version: AIS_DAILY_CALCULATION_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'vessel_id,date' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as VesselDailyAisSummaryRow;
}

/**
 * Apply AIS-derived qualifying state to the vessel manager's daily_state_logs.
 * Never overwrites manual entries (notes not prefixed with [AIS).
 */
export async function applyDailySummaryToStateLogs(
  vesselId: string,
  summary: VesselDailyAisSummaryRow,
): Promise<{ updated: boolean; reason?: string }> {
  if (!summary.qualifying_daily_state) {
    return { updated: false, reason: 'No qualifying state yet' };
  }

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('id, vessel_manager_id, ais_tracking_enabled, ais_provider_poll_enabled')
    .eq('id', vesselId)
    .maybeSingle();

  const managerId = vessel?.vessel_manager_id as string | null | undefined;
  if (!managerId) {
    return { updated: false, reason: 'No vessel manager' };
  }
  if (!vessel?.ais_tracking_enabled && !vessel?.ais_provider_poll_enabled) {
    return { updated: false, reason: 'AIS tracking disabled' };
  }

  const { data: existingLog } = await supabaseAdmin
    .from('daily_state_logs')
    .select('id, state, notes')
    .eq('user_id', managerId)
    .eq('vessel_id', vesselId)
    .eq('date', summary.date)
    .maybeSingle();

  const isManual =
    !!existingLog &&
    typeof existingLog.notes === 'string' &&
    !existingLog.notes.startsWith('[AIS');

  if (isManual) {
    return { updated: false, reason: 'Manual override present' };
  }

  const underwayHours = (summary.underway_seconds / 3600).toFixed(1);
  const notes = [
    '[AIS auto]',
    `daily: ${summary.qualifying_daily_state}`,
    `${underwayHours}h underway`,
    summary.underway_qualified ? 'sea day ≥ 4h' : null,
    `dist ${Number(summary.distance_nm).toFixed(1)} NM`,
    `v${summary.calculation_version}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const state = summary.qualifying_daily_state;
  const { error } = await supabaseAdmin.from('daily_state_logs').upsert(
    {
      user_id: managerId,
      vessel_id: vesselId,
      date: summary.date,
      state,
      ...(state === 'underway' ? { is_part_of_active_passage: false } : {}),
      notes,
    },
    { onConflict: 'user_id,vessel_id,date' },
  );

  if (error) throw error;
  return { updated: true };
}

/**
 * Incrementally process one observation into today's duration summary.
 * Idempotent: skips if observation id == last_processed_observation_id.
 */
export async function processAisObservationForDailySummary(
  observation: AisObservationRow,
  options?: { applyStateLogs?: boolean },
): Promise<VesselDailyAisSummaryRow | null> {
  const applyStateLogs = options?.applyStateLogs !== false;
  const currMs = observationAtMs(observation);
  const dateKey = dateKeyFromMs(currMs);

  const summary = await ensureSummaryRow(observation.vessel_id, dateKey);

  if (summary.is_final) {
    return summary;
  }

  // Idempotency — never double-count the same observation.
  if (summary.last_processed_observation_id === observation.id) {
    return summary;
  }

  const prev = await loadPreviousObservation(
    observation.vessel_id,
    observation.fetched_at,
    observation.id,
  );

  const buckets: DurationBuckets = {
    underway_seconds: summary.underway_seconds,
    anchor_seconds: summary.anchor_seconds,
    moored_seconds: summary.moored_seconds,
    port_seconds: summary.port_seconds,
    unknown_seconds: summary.unknown_seconds,
  };

  let distanceAdd = 0;
  let observationCount = summary.observation_count;

  if (prev) {
    const prevMs = observationAtMs(prev);
    const credit = computeIntervalCredit({
      prevMs,
      currMs,
      prevState: prev.seajourney_state,
      dateKey,
    });
    addSecondsForState(buckets, credit.creditedState, credit.stateSeconds);
    if (credit.unknownSeconds > 0) {
      buckets.unknown_seconds += credit.unknownSeconds;
    }
    const creditedSec = credit.stateSeconds + credit.unknownSeconds;
    if (credit.stateSeconds > 0) {
      distanceAdd = computeDistanceNm(prev, observation, credit.stateSeconds);
    } else if (creditedSec > 0 && credit.unknownSeconds === 0) {
      distanceAdd = 0;
    }
  }

  observationCount += 1;
  const currentState = observation.seajourney_state;
  const { qualifying, underwayQualified } = qualifyDailyState(
    buckets,
    currentState,
    summary.underway_qualified,
  );

  const firstAt =
    summary.first_observation_at ??
    observation.provider_timestamp ??
    observation.fetched_at;
  const lastAt = observation.provider_timestamp ?? observation.fetched_at;
  const now = new Date().toISOString();

  const { data: updated, error } = await supabaseAdmin
    .from('vessel_daily_ais_summary')
    .update({
      underway_seconds: buckets.underway_seconds,
      anchor_seconds: buckets.anchor_seconds,
      moored_seconds: buckets.moored_seconds,
      port_seconds: buckets.port_seconds,
      unknown_seconds: buckets.unknown_seconds,
      distance_nm: Number(summary.distance_nm || 0) + distanceAdd,
      first_observation_at: firstAt,
      last_observation_at: lastAt,
      observation_count: observationCount,
      current_state: currentState,
      qualifying_daily_state: qualifying,
      underway_qualified: underwayQualified,
      last_processed_observation_id: observation.id,
      calculation_version: AIS_DAILY_CALCULATION_VERSION,
      updated_at: now,
    })
    .eq('id', summary.id)
    // Optimistic concurrency: only update if still pointing at previous obs
    .eq(
      'last_processed_observation_id',
      summary.last_processed_observation_id as string | null,
    )
    .select('*')
    .maybeSingle();

  // First observation: last_processed is null — .eq(null) may not match in PostgREST.
  let saved = updated as VesselDailyAisSummaryRow | null;
  if (!saved && summary.last_processed_observation_id == null) {
    const { data: updatedNull, error: err2 } = await supabaseAdmin
      .from('vessel_daily_ais_summary')
      .update({
        underway_seconds: buckets.underway_seconds,
        anchor_seconds: buckets.anchor_seconds,
        moored_seconds: buckets.moored_seconds,
        port_seconds: buckets.port_seconds,
        unknown_seconds: buckets.unknown_seconds,
        distance_nm: Number(summary.distance_nm || 0) + distanceAdd,
        first_observation_at: firstAt,
        last_observation_at: lastAt,
        observation_count: observationCount,
        current_state: currentState,
        qualifying_daily_state: qualifying,
        underway_qualified: underwayQualified,
        last_processed_observation_id: observation.id,
        calculation_version: AIS_DAILY_CALCULATION_VERSION,
        updated_at: now,
      })
      .eq('id', summary.id)
      .is('last_processed_observation_id', null)
      .select('*')
      .maybeSingle();
    if (err2) throw err2;
    saved = updatedNull as VesselDailyAisSummaryRow | null;
  } else if (error) {
    throw error;
  }

  if (!saved) {
    // Lost race — re-read (peer already processed).
    return getDailyAisSummary(observation.vessel_id, dateKey);
  }

  if (applyStateLogs) {
    try {
      await applyDailySummaryToStateLogs(observation.vessel_id, saved);
    } catch (e) {
      console.warn('[daily-ais-summary] state log update failed', e);
    }
  }

  return saved;
}

/**
 * Rebuild a day's summary from raw ais_observations (does not delete observations).
 */
export async function rebuildDailyAisSummary(
  vesselId: string,
  date: string,
): Promise<VesselDailyAisSummaryRow | null> {
  const dateKey = logDateForLiveAisSync(date);
  const dayStart = `${dateKey}T00:00:00.000Z`;
  const dayEndMs = utcMidnightMs(dateKey) + 24 * 60 * 60 * 1000;
  const dayEnd = new Date(dayEndMs).toISOString();

  const { data: observations, error } = await supabaseAdmin
    .from('ais_observations')
    .select(
      'id, vessel_id, latitude, longitude, speed_kn, seajourney_state, provider_timestamp, fetched_at',
    )
    .eq('vessel_id', vesselId)
    .gte('fetched_at', dayStart)
    .lt('fetched_at', dayEnd)
    .order('fetched_at', { ascending: true });

  if (error) throw error;

  // Also include observations whose provider_timestamp falls on this date.
  const { data: byProvider } = await supabaseAdmin
    .from('ais_observations')
    .select(
      'id, vessel_id, latitude, longitude, speed_kn, seajourney_state, provider_timestamp, fetched_at',
    )
    .eq('vessel_id', vesselId)
    .gte('provider_timestamp', dayStart)
    .lt('provider_timestamp', dayEnd)
    .order('fetched_at', { ascending: true });

  const byId = new Map<string, AisObservationRow>();
  for (const row of [...(observations ?? []), ...((byProvider ?? []) as AisObservationRow[])]) {
    byId.set(row.id, row as AisObservationRow);
  }
  const sorted = Array.from(byId.values()).sort(
    (a, b) => observationAtMs(a) - observationAtMs(b),
  );

  // Reset derived row (keep id if present).
  await supabaseAdmin.from('vessel_daily_ais_summary').delete().eq('vessel_id', vesselId).eq('date', dateKey);

  if (sorted.length === 0) {
    return null;
  }

  // Seed empty row then process each observation in order.
  await ensureSummaryRow(vesselId, dateKey);

  // Load observation just before the day for first-interval credit.
  const first = sorted[0]!;
  const prevBeforeDay = await loadPreviousObservation(
    vesselId,
    first.fetched_at,
    first.id,
  );

  // Manual rebuild from sorted observations.
  const buckets = emptyBuckets();
  let distanceNm = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  let currentState: DailyStatus | null = null;
  let lastObsId: string | null = null;
  let underwayQualified = false;

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i]!;
    const currMs = observationAtMs(curr);
    const prevObs = i === 0 ? prevBeforeDay : sorted[i - 1]!;

    if (prevObs) {
      const credit = computeIntervalCredit({
        prevMs: observationAtMs(prevObs),
        currMs,
        prevState: prevObs.seajourney_state,
        dateKey,
      });
      addSecondsForState(buckets, credit.creditedState, credit.stateSeconds);
      buckets.unknown_seconds += credit.unknownSeconds;
      if (credit.stateSeconds > 0) {
        distanceNm += computeDistanceNm(prevObs, curr, credit.stateSeconds);
      }
    }

    currentState = curr.seajourney_state;
    firstAt = firstAt ?? curr.provider_timestamp ?? curr.fetched_at;
    lastAt = curr.provider_timestamp ?? curr.fetched_at;
    lastObsId = curr.id;
    const q = qualifyDailyState(buckets, currentState, underwayQualified);
    underwayQualified = q.underwayQualified;
  }

  const { qualifying, underwayQualified: uq } = qualifyDailyState(
    buckets,
    currentState,
    underwayQualified,
  );

  const now = new Date().toISOString();
  const { data: saved, error: saveErr } = await supabaseAdmin
    .from('vessel_daily_ais_summary')
    .upsert(
      {
        vessel_id: vesselId,
        date: dateKey,
        ...buckets,
        distance_nm: distanceNm,
        first_observation_at: firstAt,
        last_observation_at: lastAt,
        observation_count: sorted.length,
        current_state: currentState,
        qualifying_daily_state: qualifying,
        underway_qualified: uq,
        is_final: false,
        last_processed_observation_id: lastObsId,
        calculation_version: AIS_DAILY_CALCULATION_VERSION,
        updated_at: now,
      },
      { onConflict: 'vessel_id,date' },
    )
    .select('*')
    .single();

  if (saveErr) throw saveErr;
  const last = saved as VesselDailyAisSummaryRow;

  await applyDailySummaryToStateLogs(vesselId, last);
  return last;
}

/**
 * Mark a completed day final after re-qualifying from the summary row.
 */
export async function finalizeDailyAisSummary(
  vesselId: string,
  date: string,
): Promise<VesselDailyAisSummaryRow | null> {
  const summary = await getDailyAisSummary(vesselId, date);
  if (!summary) return null;
  if (summary.is_final) return summary;

  const { data, error } = await supabaseAdmin
    .from('vessel_daily_ais_summary')
    .update({
      is_final: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', summary.id)
    .select('*')
    .single();

  if (error) throw error;
  const saved = data as VesselDailyAisSummaryRow;
  await applyDailySummaryToStateLogs(vesselId, saved);
  return saved;
}

/** Finalize yesterday (UTC) for a vessel — used by cron near day boundary. */
export async function finalizeYesterdayIfNeeded(
  vesselId: string,
): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateKey = yesterday.toISOString().slice(0, 10);
  const summary = await getDailyAisSummary(vesselId, dateKey);
  if (summary && !summary.is_final) {
    await finalizeDailyAisSummary(vesselId, dateKey);
  }
}

export function formatUnderwayDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
