/**
 * Find the nearest curated port/city to a lat/lon.
 *
 * Used to label the start/end of each passage in the hover popup as
 * "Palma → Antibes" rather than raw coordinates. When there's no
 * suitable match (open-ocean start/end, or the vessel was more than
 * `MAX_MATCH_DISTANCE_NM` from any city in our curated list), the
 * caller gets `null` and shows a fallback label like "open sea".
 *
 * Distance thresholds
 * ───────────────────
 * MAX_MATCH_DISTANCE_NM = 40 nautical miles. That comfortably covers
 * yacht-relevant approaches — every mediterranean marina is within
 * 40 NM of *some* named city in MAJOR_CITIES — but is short enough
 * that a passage terminating mid-Atlantic doesn't get mislabelled as
 * "Casablanca".
 *
 * Only Tier 1/2 cities are considered for start/end labelling — Tier 3
 * (secondary yacht destinations like Formentera, Cannes, Kotor) still
 * appear in the map's label layer, but are excluded here because they
 * lie close enough to bigger neighbours that the popup would flip
 * between "Palma" and "Formentera" depending on exactly where the
 * anchor dropped.
 */

import { MAJOR_CITIES, type MajorCity } from './major-cities';

/**
 * Nautical miles per degree of latitude — used for the cheap
 * equirectangular distance check we do BEFORE haversine to prune the
 * candidate list. 1° lat ≈ 60 NM.
 */
const NM_PER_DEG_LAT = 60;

const MAX_MATCH_DISTANCE_NM = 40;

/**
 * Return the closest curated port to `lat`, `lon` (within
 * MAX_MATCH_DISTANCE_NM), or `null` if there's nothing close enough.
 */
export function findNearestPort(
  lat: number,
  lon: number,
  opts?: { maxDistanceNm?: number },
): { name: string; distanceNm: number } | null {
  const max = opts?.maxDistanceNm ?? MAX_MATCH_DISTANCE_NM;
  // Convert the max distance to a rough lat-window so we can prune the
  // candidate list to just the cities within that lat band. At
  // higher-magnitude latitudes 1° longitude gets shorter, so we don't
  // prune by lon here — it'd be more work than just haversineing.
  const maxDegLat = max / NM_PER_DEG_LAT;

  let best: MajorCity | null = null;
  let bestDist = Infinity;
  for (const c of MAJOR_CITIES) {
    if (c.tier === 3) continue;
    if (Math.abs(c.lat - lat) > maxDegLat) continue;
    const d = haversineNm(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }

  if (!best || bestDist > max) return null;
  return { name: best.name, distanceNm: bestDist };
}

/**
 * Convenience: given a passage's start + end coordinates, return a
 * short "Palma → Antibes" label (or "Palma → open sea" / null when
 * neither endpoint matches).
 */
export function passagePortLabel(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): string | null {
  const s = findNearestPort(startLat, startLon);
  const e = findNearestPort(endLat, endLon);
  if (!s && !e) return null;
  const startLabel = s?.name ?? 'Open sea';
  const endLabel = e?.name ?? 'Open sea';
  if (s && e && s.name === e.name) return `${s.name} (round trip)`;
  return `${startLabel} → ${endLabel}`;
}

/**
 * Standard haversine distance between two lat/lon points, in nautical
 * miles. Kept local (rather than pulling from `analyze-daily-state`) so
 * this module doesn't drag AIS state analysis into the client bundle.
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
