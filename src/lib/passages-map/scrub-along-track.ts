/**
 * Project a pointer onto a passage LineString and estimate clock time,
 * local speed, and heading at that point for hover-scrub popups.
 *
 * Timing model
 * ────────────
 * Passage features only store start/end timestamps. We distribute time
 * **uniformly across consecutive AIS vertices** (equal dwell per fix),
 * which matches how sparse AIS usually samples and lets local SOG vary
 * — slow approaches read slow, open-ocean legs read faster. Distance-
 * uniform timing would force every point to the passage average.
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';

export type ScrubSample = {
  lon: number;
  lat: number;
  /** 0..1 along the passage by distance. */
  progress: number;
  /** Interpolated UTC ms at this point, or null if times missing. */
  atMs: number | null;
  /** Local segment speed in knots, or null. */
  speedKn: number | null;
  /** Course along the track at this point (degrees true), or null. */
  bearingDeg: number | null;
  /** Distance from passage start to this point (NM). */
  distanceFromStartNm: number;
  /** Distance remaining to passage end (NM). */
  distanceRemainingNm: number;
  /** Estimated ms remaining to end, or null. */
  remainingMs: number | null;
  /** Total passage length (NM). */
  totalDistanceNm: number;
};

type LngLat = { lng: number; lat: number };

type ScrubTimingOpts = {
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  /** Fallback average speed when local segment can't be timed. */
  avgSpeedKn?: number | null;
};

/**
 * Sample a point along the track by distance progress (0..1).
 * Used by the bottom timeline scrubber for a "live" replay feel.
 */
export function sampleAtProgress(
  coordinates: readonly [number, number][],
  progress: number,
  opts?: ScrubTimingOpts,
): ScrubSample | null {
  if (!coordinates || coordinates.length < 2) return null;

  const segNm: number[] = [];
  let totalNm = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    const d = haversineNm(a[1], a[0], b[1], b[0]);
    segNm.push(d);
    totalNm += d;
  }

  const p = Math.min(1, Math.max(0, progress));
  const timing = resolveTiming(opts);

  if (totalNm <= 0) {
    const c = coordinates[0]!;
    return {
      lon: c[0],
      lat: c[1],
      progress: 0,
      atMs: timing.startMs,
      speedKn: opts?.avgSpeedKn ?? null,
      bearingDeg: bearingBetween(
        coordinates[0]!,
        coordinates[1] ?? coordinates[0]!,
      ),
      distanceFromStartNm: 0,
      distanceRemainingNm: 0,
      remainingMs: timing.durationMs,
      totalDistanceNm: 0,
    };
  }

  const targetNm = p * totalNm;
  let cum = 0;
  let segIdx = 0;
  let t = 0;
  for (let i = 0; i < segNm.length; i++) {
    const len = segNm[i]!;
    if (cum + len >= targetNm || i === segNm.length - 1) {
      segIdx = i;
      t = len > 0 ? Math.min(1, Math.max(0, (targetNm - cum) / len)) : 0;
      break;
    }
    cum += len;
  }

  const a = coordinates[segIdx]!;
  const b = coordinates[segIdx + 1] ?? a;
  const lon = a[0] + t * (b[0] - a[0]);
  const lat = a[1] + t * (b[1] - a[1]);

  return buildSample({
    lon,
    lat,
    progress: p,
    distanceFromStartNm: targetNm,
    distanceRemainingNm: Math.max(0, totalNm - targetNm),
    totalNm,
    segIdx,
    t,
    segNm,
    coordinates,
    timing,
    avgSpeedKn: opts?.avgSpeedKn,
  });
}

/**
 * Find the closest point on `coordinates` to `pointer` and return scrub
 * metadata. Returns null when the geometry is too short.
 */
export function scrubAlongTrack(
  coordinates: readonly [number, number][],
  pointer: LngLat,
  opts?: ScrubTimingOpts & {
    /**
     * Ignore projections farther than this many NM from the pointer
     * (keeps scrub from latching onto a distant parallel track).
     */
    maxSnapNm?: number;
  },
): ScrubSample | null {
  if (!coordinates || coordinates.length < 2) return null;

  const segNm: number[] = [];
  let totalNm = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    const d = haversineNm(a[1], a[0], b[1], b[0]);
    segNm.push(d);
    totalNm += d;
  }

  const timing = resolveTiming(opts);

  if (totalNm <= 0) {
    const c = coordinates[0]!;
    return {
      lon: c[0],
      lat: c[1],
      progress: 0,
      atMs: timing.startMs,
      speedKn: opts?.avgSpeedKn ?? null,
      bearingDeg: bearingBetween(
        coordinates[0]!,
        coordinates[1] ?? coordinates[0]!,
      ),
      distanceFromStartNm: 0,
      distanceRemainingNm: 0,
      remainingMs: timing.durationMs,
      totalDistanceNm: 0,
    };
  }

  let bestDist = Infinity;
  let bestLon = coordinates[0]![0];
  let bestLat = coordinates[0]![1];
  let bestCumNm = 0;
  let bestSegIdx = 0;
  let bestT = 0;
  let cum = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    const projected = projectPointToSegment(
      pointer.lng,
      pointer.lat,
      a[0],
      a[1],
      b[0],
      b[1],
    );
    const d = haversineNm(pointer.lat, pointer.lng, projected.lat, projected.lon);
    if (d < bestDist) {
      bestDist = d;
      bestLon = projected.lon;
      bestLat = projected.lat;
      bestCumNm = cum + projected.t * segNm[i - 1]!;
      bestSegIdx = i - 1;
      bestT = projected.t;
    }
    cum += segNm[i - 1]!;
  }

  const maxSnap = opts?.maxSnapNm ?? 25;
  if (bestDist > maxSnap) return null;

  const progress = Math.min(1, Math.max(0, bestCumNm / totalNm));
  const distanceRemainingNm = Math.max(0, totalNm - bestCumNm);

  return buildSample({
    lon: bestLon,
    lat: bestLat,
    progress,
    distanceFromStartNm: bestCumNm,
    distanceRemainingNm,
    totalNm,
    segIdx: bestSegIdx,
    t: bestT,
    segNm,
    coordinates,
    timing,
    avgSpeedKn: opts?.avgSpeedKn,
  });
}

function resolveTiming(opts?: ScrubTimingOpts): {
  startMs: number | null;
  durationMs: number | null;
} {
  const startMs = parseTime(opts?.startTime);
  const endMs = parseTime(opts?.endTime);
  let durationMs = opts?.durationMs;
  if (
    (durationMs == null || !Number.isFinite(durationMs)) &&
    startMs != null &&
    endMs != null
  ) {
    durationMs = Math.max(0, endMs - startMs);
  }
  return {
    startMs,
    durationMs: durationMs ?? null,
  };
}

function buildSample(args: {
  lon: number;
  lat: number;
  progress: number;
  distanceFromStartNm: number;
  distanceRemainingNm: number;
  totalNm: number;
  segIdx: number;
  t: number;
  segNm: number[];
  coordinates: readonly [number, number][];
  timing: {
    startMs: number | null;
    durationMs: number | null;
  };
  avgSpeedKn?: number | null;
}): ScrubSample {
  const {
    lon,
    lat,
    progress,
    distanceFromStartNm,
    distanceRemainingNm,
    totalNm,
    segIdx,
    t,
    segNm,
    coordinates,
    timing,
    avgSpeedKn,
  } = args;

  const intervals = Math.max(1, coordinates.length - 1);
  const msPerInterval =
    timing.durationMs != null && timing.durationMs > 0
      ? timing.durationMs / intervals
      : null;

  let atMs: number | null = null;
  if (timing.startMs != null && msPerInterval != null) {
    atMs = timing.startMs + (segIdx + t) * msPerInterval;
  } else if (
    timing.startMs != null &&
    timing.durationMs != null &&
    timing.durationMs > 0
  ) {
    atMs = timing.startMs + timing.durationMs * progress;
  } else if (timing.startMs != null) {
    atMs = timing.startMs;
  }

  const segLen = segNm[segIdx] ?? 0;
  let speedKn: number | null = null;
  if (msPerInterval != null && msPerInterval > 0 && segLen > 0) {
    speedKn = segLen / (msPerInterval / 3_600_000);
  } else if (typeof avgSpeedKn === 'number') {
    speedKn = avgSpeedKn;
  }
  if (
    speedKn != null &&
    (!Number.isFinite(speedKn) || speedKn > 45 || speedKn < 0)
  ) {
    speedKn = avgSpeedKn ?? null;
  }

  if (speedKn != null && msPerInterval != null && msPerInterval > 0) {
    const windowNm =
      (segNm[segIdx - 1] ?? 0) + segLen + (segNm[segIdx + 1] ?? 0);
    const windowIntervals =
      (segIdx > 0 ? 1 : 0) + 1 + (segIdx < segNm.length - 1 ? 1 : 0);
    if (windowNm > 0 && windowIntervals > 0) {
      const smoothed =
        windowNm / ((windowIntervals * msPerInterval) / 3_600_000);
      if (Number.isFinite(smoothed) && smoothed > 0 && smoothed <= 45) {
        speedKn = speedKn * 0.35 + smoothed * 0.65;
      }
    }
  }

  const a = coordinates[segIdx]!;
  const b = coordinates[segIdx + 1] ?? a;
  const bearingDeg = bearingBetween(a, b);

  let remainingMs: number | null = null;
  if (timing.durationMs != null && timing.durationMs > 0) {
    if (msPerInterval != null) {
      const elapsed = (segIdx + t) * msPerInterval;
      remainingMs = Math.max(0, timing.durationMs - elapsed);
    } else {
      remainingMs = timing.durationMs * (1 - progress);
    }
  } else if (speedKn != null && speedKn > 0.2) {
    remainingMs = (distanceRemainingNm / speedKn) * 3_600_000;
  }

  return {
    lon,
    lat,
    progress,
    atMs,
    speedKn:
      typeof speedKn === 'number' && Number.isFinite(speedKn)
        ? Number(speedKn.toFixed(1))
        : null,
    bearingDeg:
      typeof bearingDeg === 'number' && Number.isFinite(bearingDeg)
        ? Math.round(bearingDeg)
        : null,
    distanceFromStartNm: Number(distanceFromStartNm.toFixed(2)),
    distanceRemainingNm: Number(distanceRemainingNm.toFixed(2)),
    remainingMs:
      remainingMs != null && Number.isFinite(remainingMs)
        ? Math.round(remainingMs)
        : null,
    totalDistanceNm: Number(totalNm.toFixed(2)),
  };
}

function parseTime(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Initial bearing from A → B in degrees true [0, 360). */
function bearingBetween(
  a: [number, number],
  b: [number, number],
): number | null {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  if (lon1 === lon2 && lat1 === lat2) return null;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/** Closest point on segment AB to P, with t in [0,1]. */
function projectPointToSegment(
  pLon: number,
  pLat: number,
  aLon: number,
  aLat: number,
  bLon: number,
  bLat: number,
): { lon: number; lat: number; t: number } {
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const cosLat = Math.max(0.15, Math.cos(midLat));
  const ax = aLon * cosLat;
  const ay = aLat;
  const bx = bLon * cosLat;
  const by = bLat;
  const px = pLon * cosLat;
  const py = pLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) return { lon: aLon, lat: aLat, t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return {
    lon: aLon + t * (bLon - aLon),
    lat: aLat + t * (bLat - aLat),
    t,
  };
}
