/**
 * Bucket a passage FeatureCollection into per-month FeatureCollections so
 * the Passages Map cache can store one row per (user, vessel, month).
 *
 * The bucket key is the **UTC year-month of `feature.properties.startTime`**.
 * A passage that begins on July 31 23:59 UTC and ends on August 1 goes into
 * July's bucket only — we do NOT split individual passages across months.
 * Rationale: a passage is an atomic thing (one continuous trip), splitting
 * it would produce ugly geometry breaks and confuse the "passage count"
 * stat. In practice the vast majority of passages both start and end in
 * the same month, and the handful that straddle a month boundary look
 * correct attributed to their start.
 *
 * See sql/create-crew-passage-month-cache.sql for the corresponding table
 * schema and the invariant that ties them together: every Feature in a
 * cache row's `track_geojson` must have `startTime` inside that row's
 * month.
 */

import type {
  PassageFeature,
  PassageFeatureCollection,
} from './segment-tracks';

export type MonthBucket = {
  /** First day of the UTC month as `YYYY-MM-DD` (e.g. `2026-07-01`). */
  monthKey: string;
  featureCollection: PassageFeatureCollection;
  bbox: [number, number, number, number] | null;
  passageCount: number;
  totalDistanceNm: number;
  pointCount: number;
  /** ISO8601 UTC of the earliest passage start in this bucket. */
  firstFixAt: string | null;
  /** ISO8601 UTC of the latest passage end in this bucket. */
  lastFixAt: string | null;
};

/**
 * Turn a UTC ISO timestamp into a month key, e.g.
 *   "2026-07-15T12:34:56.000Z" → "2026-07-01".
 * Returns null on invalid input.
 */
export function monthKeyFromIsoUtc(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** First day of the CURRENT UTC month as `YYYY-MM-DD`. */
export function currentMonthKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Bump a month key by ±N months. `monthKey` should be a first-of-month
 * `YYYY-MM-DD` (produced by any function in this module).
 */
export function addMonthsToKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const total = (y as number) * 12 + ((m as number) - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/**
 * Bucket every Feature in `fc` into a Map<monthKey, MonthBucket>. Features
 * with missing / unparseable `startTime` are silently dropped.
 *
 * The output buckets contain the same Feature objects as the input (no
 * deep clone) and preserve the original `passageIndex` on each feature.
 */
export function bucketFeaturesByMonth(
  fc: PassageFeatureCollection,
): Map<string, MonthBucket> {
  const buckets = new Map<string, MonthBucket>();

  for (const feat of fc.features) {
    const startTime = feat.properties?.startTime;
    if (typeof startTime !== 'string') continue;
    const monthKey = monthKeyFromIsoUtc(startTime);
    if (!monthKey) continue;

    let bucket = buckets.get(monthKey);
    if (!bucket) {
      bucket = {
        monthKey,
        featureCollection: { type: 'FeatureCollection', features: [] },
        bbox: null,
        passageCount: 0,
        totalDistanceNm: 0,
        pointCount: 0,
        firstFixAt: null,
        lastFixAt: null,
      };
      buckets.set(monthKey, bucket);
    }

    bucket.featureCollection.features.push(feat);
    bucket.passageCount += 1;
    bucket.totalDistanceNm +=
      typeof feat.properties.distanceNm === 'number'
        ? feat.properties.distanceNm
        : 0;
    bucket.pointCount +=
      typeof feat.properties.pointCount === 'number'
        ? feat.properties.pointCount
        : 0;

    const startMs = Date.parse(startTime);
    if (
      Number.isFinite(startMs) &&
      (!bucket.firstFixAt || startMs < Date.parse(bucket.firstFixAt))
    ) {
      bucket.firstFixAt = new Date(startMs).toISOString();
    }
    const endTime = feat.properties.endTime;
    const endMs = typeof endTime === 'string' ? Date.parse(endTime) : NaN;
    const lastMs = Number.isFinite(endMs) ? endMs : startMs;
    if (
      Number.isFinite(lastMs) &&
      (!bucket.lastFixAt || lastMs > Date.parse(bucket.lastFixAt))
    ) {
      bucket.lastFixAt = new Date(lastMs).toISOString();
    }

    extendBbox(bucket, feat);
  }

  // Round distances to 2dp for stable storage & display.
  for (const b of buckets.values()) {
    b.totalDistanceNm = Number(b.totalDistanceNm.toFixed(2));
  }
  return buckets;
}

function extendBbox(bucket: MonthBucket, feat: PassageFeature) {
  const coords = feat.geometry?.coordinates;
  if (!Array.isArray(coords)) return;
  for (const c of coords) {
    if (
      !Array.isArray(c) ||
      typeof c[0] !== 'number' ||
      typeof c[1] !== 'number'
    ) {
      continue;
    }
    const [lon, lat] = c;
    if (!bucket.bbox) bucket.bbox = [lon, lat, lon, lat];
    else {
      if (lon < bucket.bbox[0]) bucket.bbox[0] = lon;
      if (lat < bucket.bbox[1]) bucket.bbox[1] = lat;
      if (lon > bucket.bbox[2]) bucket.bbox[2] = lon;
      if (lat > bucket.bbox[3]) bucket.bbox[3] = lat;
    }
  }
}

/**
 * Union a set of MonthBuckets (typically pulled from cache for the
 * user's "All time" view) into a single MonthBucket-shaped aggregate.
 * The result carries a synthetic `monthKey` of "all" and its
 * `featureCollection` is the flat concatenation of every bucket's
 * features.
 */
export function mergeMonthBuckets(
  buckets: readonly Omit<MonthBucket, 'monthKey'>[],
): Omit<MonthBucket, 'monthKey'> {
  const features: PassageFeature[] = [];
  let passageCount = 0;
  let totalDistanceNm = 0;
  let pointCount = 0;
  let firstFixAt: string | null = null;
  let lastFixAt: string | null = null;
  let bbox: [number, number, number, number] | null = null;

  for (const b of buckets) {
    features.push(...b.featureCollection.features);
    passageCount += b.passageCount;
    totalDistanceNm += b.totalDistanceNm;
    pointCount += b.pointCount;
    if (b.firstFixAt && (!firstFixAt || b.firstFixAt < firstFixAt))
      firstFixAt = b.firstFixAt;
    if (b.lastFixAt && (!lastFixAt || b.lastFixAt > lastFixAt))
      lastFixAt = b.lastFixAt;
    if (b.bbox) {
      if (!bbox) bbox = [...b.bbox];
      else {
        if (b.bbox[0] < bbox[0]) bbox[0] = b.bbox[0];
        if (b.bbox[1] < bbox[1]) bbox[1] = b.bbox[1];
        if (b.bbox[2] > bbox[2]) bbox[2] = b.bbox[2];
        if (b.bbox[3] > bbox[3]) bbox[3] = b.bbox[3];
      }
    }
  }

  return {
    featureCollection: { type: 'FeatureCollection', features },
    bbox,
    passageCount,
    totalDistanceNm: Number(totalDistanceNm.toFixed(2)),
    pointCount,
    firstFixAt,
    lastFixAt,
  };
}
