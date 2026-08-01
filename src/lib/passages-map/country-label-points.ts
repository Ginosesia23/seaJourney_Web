/**
 * Build country label points from the offline `countries-50m` topojson.
 *
 * MapLibre needs a lng/lat + name for each label; we don't need to draw
 * the polygons for labels themselves — they're already drawn by the
 * `country-borders` layer in build-offline-style.ts. This module walks
 * the country FeatureCollection once (cached) and returns a light
 * `{ name, lon, lat }[]` list suitable for spawning MapLibre `Marker`
 * instances.
 *
 * Centroid strategy
 * ─────────────────
 * Real cartographic label points (Natural Earth's `label_x`/`label_y`)
 * would be ideal but aren't in the world-atlas package. Instead we
 * compute a "best polygon area-weighted centroid":
 *
 *   1. For a Polygon country, take the arithmetic mean of the outer
 *      ring vertices (skips holes — they only remove tiny areas
 *      relative to the outer ring so their impact on the centroid is
 *      negligible for label placement).
 *   2. For a MultiPolygon country, pick the SINGLE LARGEST polygon by
 *      bounding-box area and use its outer-ring centroid. This is
 *      critical because arithmetic-mean centroids on multipolygon
 *      countries with distant territories (France ↔ French Guiana, USA
 *      ↔ Alaska ↔ Hawaii, Norway ↔ Svalbard) end up in the middle of
 *      the ocean between them — a well-known cartographer's headache.
 *
 * Tier system
 * ───────────
 * Countries are tagged by geographic size so the caller can hide small
 * country labels when the map is zoomed out (otherwise the map would
 * fill up with overlapping labels for tiny states at world view).
 * Tier is computed from the bounding box area of the country's largest
 * polygon — a rough but effective proxy.
 *
 *   1 = Continental-scale (Russia, USA, China, Brazil, Australia…)
 *   2 = Standard national scale (France, UK, Japan, South Africa…)
 *   3 = Small nations & territories (Malta, Monaco, Vatican, Singapore…)
 */

import { getOfflineCountriesGeoJson } from './build-offline-style';

export type CountryLabelPoint = {
  name: string;
  lon: number;
  lat: number;
  tier: 1 | 2 | 3;
};

let cached: CountryLabelPoint[] | null = null;

export function getCountryLabelPoints(): CountryLabelPoint[] {
  if (cached) return cached;

  const fc = getOfflineCountriesGeoJson();
  const out: CountryLabelPoint[] = [];
  for (const feat of fc.features) {
    const nameRaw = (feat.properties as any)?.name;
    if (typeof nameRaw !== 'string' || nameRaw.length === 0) continue;
    const geom = feat.geometry as any;
    if (!geom) continue;

    let bestRing: [number, number][] | null = null;
    let bestArea = 0;
    if (geom.type === 'Polygon') {
      bestRing = geom.coordinates?.[0] ?? null;
      bestArea = bboxArea(bestRing);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates ?? []) {
        const outer = poly?.[0];
        if (!outer) continue;
        const area = bboxArea(outer);
        if (area > bestArea) {
          bestArea = area;
          bestRing = outer;
        }
      }
    } else {
      continue;
    }

    if (!bestRing || bestRing.length === 0) continue;

    const [lon, lat] = ringCentroid(bestRing);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    out.push({
      name: nameRaw,
      lon,
      lat,
      tier: tierFromArea(bestArea),
    });
  }

  cached = out;
  return out;
}

/**
 * Arithmetic mean of a ring's vertices — good enough for label
 * placement on convex-ish shapes. For strongly concave shapes (Chile,
 * Norway) the centroid can land slightly off the country but for label
 * anchoring at 3-6 zoom levels that's imperceptible.
 */
function ringCentroid(ring: [number, number][]): [number, number] {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  // Skip the last point if it's a duplicate of the first (closed rings).
  const n = ring.length;
  const skipLast =
    n > 1 && ring[0]?.[0] === ring[n - 1]?.[0] && ring[0]?.[1] === ring[n - 1]?.[1]
      ? 1
      : 0;
  for (let i = 0; i < n - skipLast; i++) {
    const p = ring[i];
    if (!p) continue;
    sumX += p[0];
    sumY += p[1];
    count++;
  }
  return count > 0 ? [sumX / count, sumY / count] : [0, 0];
}

/** Rough "area" of a ring via its bounding box. Cheap and monotonic. */
function bboxArea(ring: [number, number][] | null): number {
  if (!ring || ring.length === 0) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (!p) continue;
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return Math.max(0, w) * Math.max(0, h);
}

/**
 * Bucket a country into a visibility tier by its bounding-box area (in
 * degrees²). Thresholds chosen so the world's ~15 largest countries end
 * up in tier 1, most sovereign states in tier 2, and the small-island +
 * micro-state long tail in tier 3.
 */
function tierFromArea(area: number): 1 | 2 | 3 {
  if (area > 200) return 1;
  if (area > 8) return 2;
  return 3;
}
