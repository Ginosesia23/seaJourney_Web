/**
 * Extend cached passage LineStrings with fresher AIS sample points.
 *
 * The month cache is rebuilt from Datalastic on a TTL (hours). Live
 * `crew_ais_state_samples` arrive hourly in between. Without this step,
 * an in-progress voyage looks truncated: the solid past track stops
 * mid-ocean at the last cache fetch, and only a short live dashed
 * fragment (or just the vessel pin) appears near the current position.
 *
 * We append sample fixes that fall AFTER the newest passage's endTime
 * when the hop still looks like continuous transit (same bridge rules
 * as segmentation — plausible implied speed, not a multi-day stop).
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import type {
  PassageFeature,
  PassageFeatureCollection,
  RawAisFix,
} from './segment-tracks';

const MAX_EXTEND_GAP_MS = 72 * 60 * 60 * 1000;
const MIN_IMPLIED_KN = 0.25;
const MAX_IMPLIED_KN = 35;
/** Ignore sample points that sit on top of the last drawn coordinate. */
const DEDUPE_NM = 0.05;

function impliedKn(distanceNm: number, dtMs: number): number | null {
  if (dtMs <= 0) return null;
  return distanceNm / (dtMs / 3_600_000);
}

function canExtend(distanceNm: number, dtMs: number): boolean {
  if (dtMs < 0 || dtMs > MAX_EXTEND_GAP_MS) return false;
  if (distanceNm <= 2 && dtMs <= 12 * 60 * 60 * 1000) return true;
  const kn = impliedKn(distanceNm, dtMs);
  if (kn == null) return false;
  return kn >= MIN_IMPLIED_KN && kn <= MAX_IMPLIED_KN;
}

function latestPassageIndex(features: PassageFeature[]): number {
  let best = -1;
  let bestEnd = -Infinity;
  for (let i = 0; i < features.length; i++) {
    const end = Date.parse(features[i]!.properties.endTime);
    if (Number.isFinite(end) && end >= bestEnd) {
      bestEnd = end;
      best = i;
    }
  }
  return best;
}

/**
 * Return a new FeatureCollection with the newest passage extended by
 * any later sample fixes that look like the same voyage. Unrelated
 * samples (after a real stop) are ignored — they become their own
 * passage on the next Datalastic refresh.
 */
export function extendPassagesWithSamples(
  fc: PassageFeatureCollection,
  samples: readonly RawAisFix[],
): PassageFeatureCollection {
  if (!fc?.features?.length || !samples?.length) return fc;

  const usable = samples
    .filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        Number.isFinite(p.timestampMs),
    )
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs);
  if (usable.length === 0) return fc;

  const idx = latestPassageIndex(fc.features);
  if (idx < 0) return fc;

  const target = fc.features[idx]!;
  const coords = target.geometry.coordinates.slice() as [number, number][];
  if (coords.length < 2) return fc;

  let lastLon = coords[coords.length - 1]![0];
  let lastLat = coords[coords.length - 1]![1];
  let lastMs = Date.parse(target.properties.endTime);
  if (!Number.isFinite(lastMs)) return fc;

  let addedNm = 0;
  let addedPoints = 0;
  let maxSpeed = target.properties.maxSpeedKn ?? 0;
  let speedSum =
    (target.properties.avgSpeedKn ?? 0) * Math.max(1, target.properties.pointCount);
  let speedCount =
    target.properties.avgSpeedKn != null ? target.properties.pointCount : 0;

  for (const s of usable) {
    // Only consider samples at/after the cached passage end (small
    // overlap tolerance for clock skew between Datalastic & samples).
    if (s.timestampMs < lastMs - 2 * 60 * 1000) continue;

    const dtMs = s.timestampMs - lastMs;
    const segNm = haversineNm(lastLat, lastLon, s.lat, s.lon);
    if (segNm < DEDUPE_NM && dtMs < 30 * 60 * 1000) {
      // Same spot / denser sample — advance time so the next hop is
      // measured from the fresher fix, but don't add a duplicate vertex.
      if (s.timestampMs > lastMs) lastMs = s.timestampMs;
      continue;
    }

    if (!canExtend(segNm, dtMs)) {
      // Real stop (or teleport) — stop extending this passage.
      break;
    }
    // Land-cutting hops are fine here — assembleVesselResponse runs
    // rerouteFeaturesAroundLand before the map sees the line.

    coords.push([s.lon, s.lat]);
    addedNm += segNm;
    addedPoints += 1;
    lastLon = s.lon;
    lastLat = s.lat;
    lastMs = s.timestampMs;
    if (typeof s.speedKn === 'number' && Number.isFinite(s.speedKn)) {
      const abs = Math.abs(s.speedKn);
      speedSum += abs;
      speedCount += 1;
      if (abs > maxSpeed) maxSpeed = abs;
    }
  }

  if (addedPoints === 0) return fc;

  const extended: PassageFeature = {
    ...target,
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
      ...target.properties,
      endTime: new Date(lastMs).toISOString(),
      distanceNm: Number((target.properties.distanceNm + addedNm).toFixed(2)),
      pointCount: target.properties.pointCount + addedPoints,
      avgSpeedKn:
        speedCount > 0 ? Number((speedSum / speedCount).toFixed(2)) : target.properties.avgSpeedKn,
      maxSpeedKn: maxSpeed > 0 ? Number(maxSpeed.toFixed(2)) : target.properties.maxSpeedKn,
      durationMs: Math.max(0, lastMs - Date.parse(target.properties.startTime)),
    },
  };

  const features = fc.features.slice();
  features[idx] = extended;
  return { type: 'FeatureCollection', features };
}
