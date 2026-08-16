/**
 * Find the nearest curated port/city to a lat/lon, and resolve human
 * endpoint labels for AIS passages (sync / client-safe).
 *
 * Used to label the start/end of each passage as "Palma → Antibes"
 * rather than "Open sea → Open sea". When nothing curated is close
 * enough, we fall back to a short GPS coordinate label.
 *
 * Server routes that can call reverse geocode should use
 * `resolveEndpointNameFromGps` in `./resolve-endpoint-name`.
 *
 * Distance thresholds
 * ───────────────────
 * CLOSE_MATCH_NM (50) — treat as that port/marina.
 * NEAR_MATCH_NM (140) — "Near Palma" when nothing closer; better than
 * blank open-sea labels for coastal passages just outside a curated hub.
 *
 * All city tiers are considered for endpoint labelling (including Tier 3
 * yacht destinations). Closest wins.
 */

import { MAJOR_CITIES, type MajorCity } from './major-cities';

const NM_PER_DEG_LAT = 60;

/** Within this range we use the city name as-is. */
export const CLOSE_MATCH_NM = 50;

/** Beyond close, still useful as "Near X" before falling back to coords. */
export const NEAR_MATCH_NM = 140;

export type NearestPortMatch = {
  name: string;
  distanceNm: number;
  tier: 1 | 2 | 3;
  country?: string;
};

/**
 * Return the closest curated port to `lat`, `lon` within
 * `maxDistanceNm`, or `null` if nothing is close enough.
 */
export function findNearestPort(
  lat: number,
  lon: number,
  opts?: {
    maxDistanceNm?: number;
    /** Default includes all tiers (1–3). Pass e.g. `[1, 2]` to exclude yacht hubs. */
    tiers?: Array<1 | 2 | 3>;
  },
): NearestPortMatch | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const max = opts?.maxDistanceNm ?? CLOSE_MATCH_NM;
  const allowed = opts?.tiers ? new Set(opts.tiers) : null;
  const maxDegLat = max / NM_PER_DEG_LAT;

  let best: MajorCity | null = null;
  let bestDist = Infinity;
  for (const c of MAJOR_CITIES) {
    if (allowed && !allowed.has(c.tier)) continue;
    if (Math.abs(c.lat - lat) > maxDegLat) continue;
    const d = haversineNm(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  if (!best || bestDist > max) return null;
  return {
    name: best.name,
    distanceNm: bestDist,
    tier: best.tier,
    country: best.country,
  };
}

/**
 * Compact GPS label for endpoints with no nearby named place.
 * Example: `43.58°N 7.13°E`
 */
export function formatLatLonLabel(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/**
 * Sync resolver for map UI / client: curated port → "Near X" → GPS.
 * Never returns "Open sea" when coordinates are valid.
 */
export function resolveEndpointLabel(
  lat: number,
  lon: number,
  opts?: { closeNm?: number; nearNm?: number },
): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Unknown';

  const closeNm = opts?.closeNm ?? CLOSE_MATCH_NM;
  const nearNm = opts?.nearNm ?? NEAR_MATCH_NM;

  const close = findNearestPort(lat, lon, { maxDistanceNm: closeNm });
  if (close) return close.name;

  const near = findNearestPort(lat, lon, { maxDistanceNm: nearNm });
  if (near) return `Near ${near.name}`;

  return formatLatLonLabel(lat, lon);
}

/**
 * Convenience: given a passage's start + end coordinates, return a
 * short "Palma → Antibes" / "Near Genoa → 43.12°N 8.40°E" label.
 */
export function passagePortLabel(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): string | null {
  if (
    ![startLat, startLon, endLat, endLon].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  const startLabel = resolveEndpointLabel(startLat, startLon);
  const endLabel = resolveEndpointLabel(endLat, endLon);
  if (startLabel === endLabel) return `${startLabel} (round trip)`;
  return `${startLabel} → ${endLabel}`;
}

/**
 * Standard haversine distance between two lat/lon points, in nautical
 * miles. Kept local so this module doesn't drag AIS state analysis into
 * the client bundle.
 */
function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065; // Earth mean radius in NM
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
