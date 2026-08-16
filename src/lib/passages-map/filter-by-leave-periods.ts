/**
 * Filter passage features against a crew member's leave periods for a
 * given vessel.
 *
 * Rationale
 * ─────────
 * The Passages Map plots AIS history for every vessel the crew member
 * has an assignment on. But a crew member on rotation isn't onboard the
 * whole time — during their leave the vessel may still be moving with a
 * different rotation crew aboard. Those passages don't belong to this
 * user's sea-time and shouldn't appear on their map (they can't claim
 * days at sea when they were literally on shore).
 *
 * Exclusion semantic
 * ──────────────────
 * A passage is excluded if its `[startTime, endTime]` interval
 * OVERLAPS any leave period for that vessel. While on leave the user
 * is not onboard — AIS movement belongs to another rotation and must
 * not appear on their map or land in their Passage Logbook.
 *
 * Leave date semantics
 * ────────────────────
 * `crew_leave_periods.start_date` / `end_date` are DATE columns. Per
 * the app's convention `end_date` is INCLUSIVE — the last day the
 * crew member is on leave. Translated to an instantaneous interval:
 *   leave = [start_date 00:00 UTC, end_date+1 day 00:00 UTC)
 *
 * Overlapping / adjacent leave periods are merged before the check so a
 * passage that spans two back-to-back leave rows still gets excluded.
 */

import type {
  PassageFeature,
  PassageFeatureCollection,
} from './segment-tracks';

/**
 * Minimal shape of a leave-period row needed for filtering. The route
 * that queries `crew_leave_periods` should project just these columns.
 */
export type LeavePeriod = {
  vesselId: string;
  /** DATE `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** DATE `YYYY-MM-DD`, INCLUSIVE (per app convention). */
  endDate: string;
};

/**
 * Simple half-open ms interval `[startMs, endMs)`. Kept internal.
 */
type MsInterval = { startMs: number; endMs: number };

/**
 * Convert a leave-period DATE row into an instantaneous half-open UTC
 * ms interval. Returns null if either date is malformed.
 */
function leavePeriodToInterval(p: LeavePeriod): MsInterval | null {
  const startMs = Date.parse(`${p.startDate}T00:00:00.000Z`);
  const endInclusiveMs = Date.parse(`${p.endDate}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endInclusiveMs)) return null;
  // `end_date` is inclusive → treat leave as ending at the START of the
  // day AFTER `end_date` (half-open convention). This means a passage
  // that starts at 23:59 on the last leave day is still counted as
  // "during leave"; one that starts at 00:00 the following day is not.
  const endMs = endInclusiveMs + 24 * 60 * 60 * 1000;
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

/**
 * Sort + merge overlapping/adjacent intervals. Adjacent = one ends
 * exactly where the next begins (or with < 1s gap — noise tolerance).
 */
function mergeIntervals(intervals: MsInterval[]): MsInterval[] {
  if (intervals.length <= 1) return intervals.slice();
  const sorted = intervals.slice().sort((a, b) => a.startMs - b.startMs);
  const out: MsInterval[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = sorted[i]!;
    // Merge if the current interval starts within (or immediately after)
    // the previous one. A 1s gap threshold treats consecutive leave
    // rows created on different days but abutting each other as one
    // continuous stretch of leave.
    if (cur.startMs <= prev.endMs + 1000) {
      if (cur.endMs > prev.endMs) prev.endMs = cur.endMs;
    } else {
      out.push(cur);
    }
  }
  return out;
}

/**
 * True if `[passageStart, passageEnd]` overlaps any merged leave
 * interval (half-open). Touching at an endpoint (passage ends exactly
 * when leave starts) is NOT an overlap.
 */
function passageOverlapsLeave(
  passageStartMs: number,
  passageEndMs: number,
  merged: MsInterval[],
): boolean {
  const pEnd = Math.max(passageEndMs, passageStartMs);
  for (const iv of merged) {
    if (passageStartMs < iv.endMs && pEnd > iv.startMs) return true;
    if (iv.startMs > pEnd) break;
  }
  return false;
}

/**
 * Public helper for logbook / promote / sync routes: does this ISO
 * time range fall on any leave period?
 */
export function timeRangeOverlapsLeave(
  startIso: string,
  endIso: string,
  leavePeriods: readonly LeavePeriod[],
): boolean {
  if (leavePeriods.length === 0) return false;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const intervals: MsInterval[] = [];
  for (const p of leavePeriods) {
    const iv = leavePeriodToInterval(p);
    if (iv) intervals.push(iv);
  }
  if (intervals.length === 0) return false;
  return passageOverlapsLeave(startMs, endMs, mergeIntervals(intervals));
}

/**
 * True when every millisecond of `[rangeStartMs, rangeEndMs)` is
 * covered by the union of leave intervals. Used to skip Datalastic
 * fetches for months the crew spent entirely on leave.
 */
export function rangeFullyCoveredByLeave(
  rangeStartMs: number,
  rangeEndMs: number,
  leavePeriods: readonly LeavePeriod[],
): boolean {
  if (!(rangeEndMs > rangeStartMs) || leavePeriods.length === 0) return false;
  const intervals: MsInterval[] = [];
  for (const p of leavePeriods) {
    const iv = leavePeriodToInterval(p);
    if (iv) intervals.push(iv);
  }
  const merged = mergeIntervals(intervals);
  if (merged.length === 0) return false;

  let cursor = rangeStartMs;
  for (const iv of merged) {
    if (iv.endMs <= cursor) continue;
    if (iv.startMs > cursor) return false; // uncovered gap
    cursor = Math.max(cursor, iv.endMs);
    if (cursor >= rangeEndMs) return true;
  }
  return cursor >= rangeEndMs;
}

/**
 * Collapse consecutive `YYYY-MM-DD` dates into inclusive leave periods.
 * Used when deriving leave from `daily_state_logs` on-leave rows.
 */
export function collapseDatesToLeavePeriods(
  vesselId: string,
  dates: readonly string[],
): LeavePeriod[] {
  const sorted = Array.from(
    new Set(
      dates
        .map((d) => d.slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ).sort();
  if (sorted.length === 0) return [];

  const out: LeavePeriod[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prevMs = Date.parse(`${prev}T00:00:00.000Z`);
    const curMs = Date.parse(`${cur}T00:00:00.000Z`);
    const dayMs = 24 * 60 * 60 * 1000;
    if (
      Number.isFinite(prevMs) &&
      Number.isFinite(curMs) &&
      curMs === prevMs + dayMs
    ) {
      prev = cur;
      continue;
    }
    out.push({ vesselId, startDate: start, endDate: prev });
    start = cur;
    prev = cur;
  }
  out.push({ vesselId, startDate: start, endDate: prev });
  return out;
}

/**
 * Result of filtering a FeatureCollection against leave periods.
 *
 * `excludedCount` is exposed so the API/UI can surface transparency:
 * "N passages hidden because you were on leave." Silent exclusion
 * creates a "why is my last month empty?" surprise; showing the count
 * builds trust.
 */
export type LeaveFilterResult = {
  featureCollection: PassageFeatureCollection;
  excludedCount: number;
  /**
   * Sum of `distanceNm` for the excluded passages — used by the API to
   * report "N NM hidden" alongside the excluded count.
   */
  excludedDistanceNm: number;
};

/**
 * Drop passages that overlap any leave period. Recomputed
 * FeatureCollection preserves feature ordering for the ones we keep;
 * no other properties are mutated.
 *
 * If `leavePeriods` is empty this is a fast no-op that returns the
 * input FeatureCollection unchanged (same reference — cheap to detect
 * with `===` in callers if useful).
 */
export function filterFeaturesByLeavePeriods(
  fc: PassageFeatureCollection,
  leavePeriods: readonly LeavePeriod[],
): LeaveFilterResult {
  if (leavePeriods.length === 0) {
    return { featureCollection: fc, excludedCount: 0, excludedDistanceNm: 0 };
  }

  const intervals: MsInterval[] = [];
  for (const p of leavePeriods) {
    const iv = leavePeriodToInterval(p);
    if (iv) intervals.push(iv);
  }
  if (intervals.length === 0) {
    return { featureCollection: fc, excludedCount: 0, excludedDistanceNm: 0 };
  }
  const merged = mergeIntervals(intervals);

  const kept: PassageFeature[] = [];
  let excludedCount = 0;
  let excludedDistanceNm = 0;
  for (const feat of fc.features) {
    const startTime = feat.properties?.startTime;
    const endTime = feat.properties?.endTime;
    const startMs = typeof startTime === 'string' ? Date.parse(startTime) : NaN;
    const endMs = typeof endTime === 'string' ? Date.parse(endTime) : startMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      // Malformed timestamps — keep the feature (better to over-show
      // than to silently drop something we can't reason about).
      kept.push(feat);
      continue;
    }
    if (passageOverlapsLeave(startMs, endMs, merged)) {
      excludedCount += 1;
      excludedDistanceNm +=
        typeof feat.properties.distanceNm === 'number'
          ? feat.properties.distanceNm
          : 0;
      continue;
    }
    kept.push(feat);
  }

  return {
    featureCollection: { type: 'FeatureCollection', features: kept },
    excludedCount,
    excludedDistanceNm: Number(excludedDistanceNm.toFixed(2)),
  };
}

/**
 * Compute a fresh `[minLon, minLat, maxLon, maxLat]` bbox for a
 * FeatureCollection. Used after `filterFeaturesByLeavePeriods` shrinks
 * the feature set so the map fitBounds still frames only the visible
 * passages. Returns null when there are no coordinates to consider.
 */
export function bboxOfFeatureCollection(
  fc: PassageFeatureCollection,
): [number, number, number, number] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const f of fc.features) {
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords)) continue;
    for (const c of coords as [number, number][]) {
      if (!Array.isArray(c)) continue;
      const [lon, lat] = c;
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Aggregate `passageCount`, `totalDistanceNm`, `pointCount`,
 * `firstFixAt`, `lastFixAt` from a FeatureCollection. Used to
 * rebuild the totals on a bucket after leave-period filtering
 * (otherwise the totals would still reflect the pre-filter numbers,
 * which is misleading).
 */
export function aggregateBucketStats(fc: PassageFeatureCollection): {
  passageCount: number;
  totalDistanceNm: number;
  pointCount: number;
  firstFixAt: string | null;
  lastFixAt: string | null;
} {
  let passageCount = 0;
  let totalDistanceNm = 0;
  let pointCount = 0;
  let firstFixMs = Infinity;
  let lastFixMs = -Infinity;
  for (const f of fc.features) {
    passageCount += 1;
    if (typeof f.properties?.distanceNm === 'number') {
      totalDistanceNm += f.properties.distanceNm;
    }
    if (typeof f.properties?.pointCount === 'number') {
      pointCount += f.properties.pointCount;
    }
    const startMs = Date.parse(String(f.properties?.startTime ?? ''));
    if (Number.isFinite(startMs) && startMs < firstFixMs) firstFixMs = startMs;
    const endMs = Date.parse(String(f.properties?.endTime ?? ''));
    const lastMs = Number.isFinite(endMs) ? endMs : startMs;
    if (Number.isFinite(lastMs) && lastMs > lastFixMs) lastFixMs = lastMs;
  }
  return {
    passageCount,
    totalDistanceNm: Number(totalDistanceNm.toFixed(2)),
    pointCount,
    firstFixAt: Number.isFinite(firstFixMs) ? new Date(firstFixMs).toISOString() : null,
    lastFixAt: Number.isFinite(lastFixMs) ? new Date(lastFixMs).toISOString() : null,
  };
}
