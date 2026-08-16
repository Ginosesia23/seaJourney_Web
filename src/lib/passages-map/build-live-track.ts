/**
 * Build the "active live track" for a vessel that is currently underway.
 *
 * Input is a time-ordered list of recent `crew_ais_state_samples` rows.
 * We walk BACKWARDS from the newest sample and keep collecting points
 * while the vessel still looks like one continuous voyage — bridging
 * brief stationary flickers and multi-hour AIS sample gaps when the
 * implied transit speed is still plausible. A hard stop (long silence
 * with almost no movement, teleport, or a chord across land) ends the
 * active passage.
 *
 * Returns null when there aren't enough points to draw a LineString
 * (a single live fix is enough for the marker; a track needs ≥ 2).
 */

import { segmentCrossesLand } from '@/lib/passages-map/segment-crosses-land';
import { smoothLineCoordinates } from '@/lib/passages-map/smooth-track';
import { haversineNm } from '@/lib/ais/analyze-daily-state';

export type LiveSamplePoint = {
  lat: number;
  lon: number;
  /** ISO timestamp — prefer ais_position_at, fall back to sampled_at. */
  at: string;
  state?: string | null;
  speedKn?: number | null;
};

const MOTION_SPEED_THRESHOLD_KN = 0.5;
/** Tolerate this much consecutive near-stationary time mid-voyage. */
const STATIONARY_BREAK_MS = 6 * 60 * 60 * 1000;
/** Max silence to bridge inside the live track. */
const MAX_BRIDGE_GAP_MS = 72 * 60 * 60 * 1000;
const BRIDGE_MIN_KN = 0.25;
const BRIDGE_MAX_KN = 35;

export type ActiveLiveTrack = {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: {
    kind: 'live-active';
    startTime: string;
    endTime: string;
    pointCount: number;
    distanceNm: number;
  };
};

function isMoving(s: LiveSamplePoint): boolean {
  if (s.state === 'underway') return true;
  return typeof s.speedKn === 'number' && s.speedKn >= MOTION_SPEED_THRESHOLD_KN;
}

function parseAt(s: LiveSamplePoint): number {
  const ms = Date.parse(s.at);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Samples must be sorted oldest → newest. Returns a LineString Feature
 * for the trailing underway segment, or null if there is no usable
 * active track.
 */
export function buildActiveLiveTrack(
  samples: readonly LiveSamplePoint[],
): ActiveLiveTrack | null {
  if (samples.length === 0) return null;

  const usable = samples.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && Number.isFinite(parseAt(s)),
  );
  if (usable.length < 2) return null;

  // Walk back from newest, bridging plausible hops. Stop when we hit a
  // real break (sustained stationary or an unbridgeable silence).
  let startIdx = usable.length - 1;
  let stationaryMs = 0;

  for (let i = usable.length - 1; i > 0; i--) {
    const curr = usable[i]!;
    const prev = usable[i - 1]!;
    const currMs = parseAt(curr);
    const prevMs = parseAt(prev);
    const dtMs = currMs - prevMs;
    const segNm = haversineNm(prev.lat, prev.lon, curr.lat, curr.lon);

    if (dtMs > MAX_BRIDGE_GAP_MS) break;

    // Never walk the live track backwards across an island.
    if (segmentCrossesLand(prev.lon, prev.lat, curr.lon, curr.lat)) break;

    if (dtMs > 4 * 60 * 60 * 1000) {
      const kn = dtMs > 0 ? segNm / (dtMs / 3_600_000) : null;
      const bridgeable =
        kn != null && kn >= BRIDGE_MIN_KN && kn <= BRIDGE_MAX_KN;
      if (!bridgeable) break;
      stationaryMs = 0;
      startIdx = i - 1;
      continue;
    }

    if (isMoving(prev) || isMoving(curr) || segNm / Math.max(dtMs / 3_600_000, 1e-6) >= MOTION_SPEED_THRESHOLD_KN) {
      stationaryMs = 0;
      startIdx = i - 1;
      continue;
    }

    // Both ends look stationary / barely moving.
    stationaryMs += Math.max(0, dtMs);
    if (stationaryMs >= STATIONARY_BREAK_MS) break;
    // Still inside grace — keep walking so a brief overnight blip
    // doesn't truncate yesterday's half of the voyage.
    startIdx = i - 1;
  }

  const slice = usable.slice(startIdx);
  if (slice.length < 2) return null;

  const coordinates: [number, number][] = [];
  let distanceNm = 0;
  let prev: LiveSamplePoint | null = null;
  for (const s of slice) {
    coordinates.push([s.lon, s.lat]);
    if (prev) distanceNm += haversineNm(prev.lat, prev.lon, s.lat, s.lon);
    prev = s;
  }
  if (coordinates.length < 2) return null;

  const drawn = smoothLineCoordinates(coordinates);

  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: drawn },
    properties: {
      kind: 'live-active',
      startTime: first.at,
      endTime: last.at,
      pointCount: coordinates.length,
      distanceNm: Number(distanceNm.toFixed(2)),
    },
  };
}
