/**
 * When a live AIS check first sees underway after a slow stationary poll
 * (anchor 30m / moored 60m), reconstruct the missing departure at 5-minute
 * resolution from Datalastic `/vessel_history` so the full passage is logged.
 *
 * Does NOT call the live `/vessel` endpoint. One history request covers the
 * gap since the last successful check (capped at MAX_AIS_INTERVAL).
 */

import { MAX_AIS_INTERVAL_SECONDS } from '@/lib/ais/constants';
import { rebuildDailyAisSummary } from '@/lib/ais/daily-summary';
import {
  fetchVesselHistory,
  type DatalasticVesselPosition,
} from '@/lib/datalastic/client';
import {
  getAisPositionTimestampMs,
  getNormalizedAisNavStatus,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** Match the underway live poll interval. */
export const PASSAGE_BACKFILL_STEP_MS = 5 * 60 * 1000;

/** Skip when the previous live check was already ~5-minute cadence. */
export const PASSAGE_BACKFILL_MIN_GAP_MS = 8 * 60 * 1000;

/** Do not walk farther than the duration-credit cap (4h). */
export const PASSAGE_BACKFILL_MAX_LOOKBACK_MS = MAX_AIS_INTERVAL_SECONDS * 1000;

const MOTION_SPEED_KN = 1;

export type PassageHistoryFix = {
  atMs: number;
  position: DatalasticVesselPosition;
};

export type PassageBackfillPoint = {
  atMs: number;
  state: DailyStatus;
  position: DatalasticVesselPosition;
};

function isStationaryState(state: string | null | undefined): boolean {
  return (
    state === 'at-anchor' ||
    state === 'in-port' ||
    state === 'in-yard' ||
    state === 'moored'
  );
}

export function isPassageMotion(position: DatalasticVesselPosition): boolean {
  if (mapAisToDailyStatus(position) === 'underway') return true;
  return typeof position.speed === 'number' && position.speed >= MOTION_SPEED_KN;
}

export function shouldBackfillPassageStart(opts: {
  previousState: string | null | undefined;
  currentState: string | null | undefined;
  previousFetchedAtMs: number | null | undefined;
  nowMs: number;
}): boolean {
  if (!isStationaryState(opts.previousState)) return false;
  if (opts.currentState !== 'underway') return false;
  if (opts.previousFetchedAtMs == null || !Number.isFinite(opts.previousFetchedAtMs)) {
    return false;
  }
  const gap = opts.nowMs - opts.previousFetchedAtMs;
  return gap >= PASSAGE_BACKFILL_MIN_GAP_MS;
}

export function lookbackStartMs(opts: {
  previousFetchedAtMs: number;
  nowMs: number;
  maxLookbackMs?: number;
}): number {
  const cap = opts.maxLookbackMs ?? PASSAGE_BACKFILL_MAX_LOOKBACK_MS;
  return Math.max(opts.previousFetchedAtMs, opts.nowMs - cap);
}

function floorToStep(ms: number, stepMs: number): number {
  return Math.floor(ms / stepMs) * stepMs;
}

function nearestFix(
  fixes: readonly PassageHistoryFix[],
  targetMs: number,
  maxDeltaMs: number,
): PassageHistoryFix | null {
  let best: PassageHistoryFix | null = null;
  let bestDelta = Infinity;
  for (const fix of fixes) {
    const delta = Math.abs(fix.atMs - targetMs);
    // Equal distance: keep the later ping so a moored→underway pair in the
    // same slot does not snap backward onto the last stationary fix.
    if (delta < bestDelta || (delta === bestDelta && best != null && fix.atMs > best.atMs)) {
      bestDelta = delta;
      best = fix;
    }
  }
  if (!best || bestDelta > maxDeltaMs) return null;
  return best;
}

/**
 * Walk backward from the live underway fix in `stepMs` slots until a
 * non-moving AIS sample (or the last stationary poll). Returns chronological
 * underway points from passage start up to — but not including — the live fix.
 */
export function selectPassageStartBackfill(opts: {
  history: readonly PassageHistoryFix[];
  lookbackStartMs: number;
  liveFixMs: number;
  stepMs?: number;
}): PassageBackfillPoint[] {
  const stepMs = opts.stepMs ?? PASSAGE_BACKFILL_STEP_MS;
  const liveBucket = floorToStep(opts.liveFixMs, stepMs);
  const collected: PassageBackfillPoint[] = [];
  const seenAt = new Set<number>();

  for (let t = liveBucket - stepMs; t > opts.lookbackStartMs; t -= stepMs) {
    const fix = nearestFix(opts.history, t, stepMs);
    if (!fix) continue;
    if (fix.atMs <= opts.lookbackStartMs) break;
    if (Math.abs(fix.atMs - opts.liveFixMs) < 1000) continue;
    if (!isPassageMotion(fix.position)) break;
    if (seenAt.has(fix.atMs)) continue;
    seenAt.add(fix.atMs);
    collected.push({
      atMs: fix.atMs,
      state: 'underway',
      position: fix.position,
    });
  }

  collected.reverse();
  return collected;
}

export function historyPositionsToFixes(
  positions: readonly DatalasticVesselPosition[],
): PassageHistoryFix[] {
  const out: PassageHistoryFix[] = [];
  for (const position of positions) {
    const atMs = getAisPositionTimestampMs(position);
    if (atMs == null || !Number.isFinite(atMs)) continue;
    if (typeof position.lat !== 'number' || typeof position.lon !== 'number') continue;
    out.push({ atMs, position });
  }
  out.sort((a, b) => a.atMs - b.atMs);
  return out;
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export async function backfillPassageStartIfNeeded(opts: {
  vesselId: string;
  previousState: string | null | undefined;
  previousFetchedAt: string | null | undefined;
  currentState: DailyStatus;
  currentPosition: DatalasticVesselPosition;
  mmsi?: string | null;
  imo?: string | null;
  nowMs?: number;
}): Promise<{
  insertedObservations: number;
  insertedVesselSamples: number;
  insertedCrewSamples: number;
  skipped?: string;
}> {
  const nowMs = opts.nowMs ?? Date.now();
  const previousFetchedAtMs = opts.previousFetchedAt
    ? Date.parse(opts.previousFetchedAt)
    : NaN;

  if (
    !shouldBackfillPassageStart({
      previousState: opts.previousState,
      currentState: opts.currentState,
      previousFetchedAtMs: Number.isFinite(previousFetchedAtMs)
        ? previousFetchedAtMs
        : null,
      nowMs,
    })
  ) {
    return {
      insertedObservations: 0,
      insertedVesselSamples: 0,
      insertedCrewSamples: 0,
      skipped: 'not_departure_gap',
    };
  }

  if (!opts.mmsi && !opts.imo) {
    return {
      insertedObservations: 0,
      insertedVesselSamples: 0,
      insertedCrewSamples: 0,
      skipped: 'missing_identity',
    };
  }

  const startMs = lookbackStartMs({
    previousFetchedAtMs,
    nowMs,
  });
  const liveFixMs =
    getAisPositionTimestampMs(opts.currentPosition) ?? nowMs;
  const from = utcDateKey(startMs);
  const to = utcDateKey(Math.max(liveFixMs, nowMs));

  let positions: DatalasticVesselPosition[] = [];
  try {
    positions = await fetchVesselHistory(
      {
        mmsi: opts.mmsi,
        imo: opts.imo,
        from,
        to,
      },
      {
        vesselId: opts.vesselId,
        triggerSource: 'history_import',
        triggerDetail: 'passage_start_backfill',
        scheduledReason: 'stationary_to_underway',
      },
    );
  } catch (err) {
    console.warn('[passage-backfill] history fetch failed', opts.vesselId, err);
    return {
      insertedObservations: 0,
      insertedVesselSamples: 0,
      insertedCrewSamples: 0,
      skipped: 'history_fetch_failed',
    };
  }

  const points = selectPassageStartBackfill({
    history: historyPositionsToFixes(positions),
    lookbackStartMs: startMs,
    liveFixMs,
  });

  if (points.length === 0) {
    return {
      insertedObservations: 0,
      insertedVesselSamples: 0,
      insertedCrewSamples: 0,
      skipped: 'no_underway_gap_points',
    };
  }

  let insertedObservations = 0;
  let insertedVesselSamples = 0;
  const dates = new Set<string>();

  for (const point of points) {
    const atIso = isoFromMs(point.atMs);
    const sampleDate = utcDateKey(point.atMs);
    dates.add(sampleDate);
    const navStatus = getNormalizedAisNavStatus(point.position) || null;
    const lat = point.position.lat as number;
    const lon = point.position.lon as number;
    const speedKn =
      typeof point.position.speed === 'number' ? point.position.speed : null;

    const { error: obsError } = await supabaseAdmin.from('ais_observations').insert({
      vessel_id: opts.vesselId,
      latitude: lat,
      longitude: lon,
      speed_kn: speedKn,
      course:
        typeof point.position.course === 'number' ? point.position.course : null,
      heading:
        typeof point.position.heading === 'number' ? point.position.heading : null,
      raw_navigation_status: navStatus,
      seajourney_state: point.state,
      provider: 'datalastic',
      provider_timestamp: point.position.last_position_UTC ?? atIso,
      fetched_at: atIso,
      raw_position: point.position as unknown as Record<string, unknown>,
    });

    if (!obsError) {
      insertedObservations += 1;
    } else if ((obsError as { code?: string }).code !== '23505') {
      console.warn('[passage-backfill] observation insert failed', opts.vesselId, obsError);
    }

    const { error: sampleError } = await supabaseAdmin
      .from('vessel_ais_state_samples')
      .insert({
        vessel_id: opts.vesselId,
        sample_date: sampleDate,
        sampled_at: atIso,
        ais_position_at: point.position.last_position_UTC ?? atIso,
        state: point.state,
        nav_status: navStatus,
        speed_kn: speedKn,
        lat,
        lon,
        raw_position: point.position as unknown as Record<string, unknown>,
      });

    if (!sampleError) {
      insertedVesselSamples += 1;
    } else if ((sampleError as { code?: string }).code !== '23505') {
      console.warn('[passage-backfill] vessel sample insert failed', opts.vesselId, sampleError);
    }
  }

  dates.add(utcDateKey(liveFixMs));
  for (const date of dates) {
    try {
      await rebuildDailyAisSummary(opts.vesselId, date);
    } catch (err) {
      console.warn('[passage-backfill] daily summary rebuild failed', opts.vesselId, date, err);
    }
  }

  const insertedCrewSamples = await insertCrewBackfillSamples({
    vesselId: opts.vesselId,
    lookbackStartIso: isoFromMs(startMs),
    points,
  });

  return {
    insertedObservations,
    insertedVesselSamples,
    insertedCrewSamples,
  };
}

async function insertCrewBackfillSamples(opts: {
  vesselId: string;
  lookbackStartIso: string;
  points: readonly PassageBackfillPoint[];
}): Promise<number> {
  const { data: recent, error } = await supabaseAdmin
    .from('crew_ais_state_samples')
    .select('user_id')
    .eq('vessel_id', opts.vesselId)
    .gte('sampled_at', opts.lookbackStartIso);

  if (error) {
    console.warn('[passage-backfill] crew sample lookup failed', opts.vesselId, error);
    return 0;
  }

  const userIds = Array.from(
    new Set((recent ?? []).map((row) => row.user_id as string).filter(Boolean)),
  );
  if (userIds.length === 0) return 0;

  let inserted = 0;
  for (const userId of userIds) {
    for (const point of opts.points) {
      const atIso = isoFromMs(point.atMs);
      const { error: sampleError } = await supabaseAdmin
        .from('crew_ais_state_samples')
        .insert({
          user_id: userId,
          vessel_id: opts.vesselId,
          sample_date: utcDateKey(point.atMs),
          sampled_at: atIso,
          ais_position_at: point.position.last_position_UTC ?? atIso,
          state: point.state,
          nav_status: getNormalizedAisNavStatus(point.position) || null,
          speed_kn:
            typeof point.position.speed === 'number' ? point.position.speed : null,
          lat: point.position.lat,
          lon: point.position.lon,
          raw_position: point.position as unknown as Record<string, unknown>,
        });

      if (!sampleError) {
        inserted += 1;
      } else if ((sampleError as { code?: string }).code !== '23505') {
        console.warn(
          '[passage-backfill] crew sample insert failed',
          opts.vesselId,
          userId,
          sampleError,
        );
      }
    }
  }

  return inserted;
}
