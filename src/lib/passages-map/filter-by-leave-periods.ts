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
 * A passage is excluded if its FULL `[startTime, endTime]` interval
 * lies within the union of the crew's leave periods for that vessel.
 * Partial overlaps (started before leave began, or ended after leave
 * ended) are kept — the user was probably onboard for at least part of
 * the passage. This matches the user's stated intent: "do not show
 * passages that fall within the users leave period".
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
 * True if `[passageStart, passageEnd]` is fully inside any of the
 * (already-merged) leave intervals.
 */
function passageIsFullyInsideLeave(
  passageStartMs: number,
  passageEndMs: number,
  merged: MsInterval[],
): boolean {
  for (const iv of merged) {
    if (passageStartMs >= iv.startMs && passageEndMs <= iv.endMs) return true;
    // Early exit: intervals are sorted, so if the next interval starts
    // after the passage ends, none of the remaining ones will contain
    // this passage either.
    if (iv.startMs > passageEndMs) break;
  }
  return false;
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
 * Drop passages that fall fully within any leave period. Recomputed
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
    if (passageIsFullyInsideLeave(startMs, endMs, merged)) {
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
