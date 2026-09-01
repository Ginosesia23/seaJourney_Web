/**
 * Detect (and optionally split) passage chords that cut across land.
 *
 * Natural Earth 110m is fast enough for open-ocean rejects and still
 * catches Messina / island tips. A coarse 2° occupancy mask skips
 * geoContains entirely on clear ocean hops. OSM piers still need the
 * client basemap refiner.
 */

import { geoContains } from 'd3-geo';
import * as topojson from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import type {
  PassageFeature,
  PassageFeatureCollection,
} from './segment-tracks';

const LAND = topojson.feature(
  landTopo as any,
  (landTopo as any).objects.land,
) as GeoJSON.Feature;

/** Skip only GPS jitter — post-smooth tip clips are often ~0.5 NM. */
export const MIN_LAND_CHECK_NM = 0.35;

const landCache = new Map<string, boolean>();

/** 2° land occupancy — stamped from land vertices (no geoContains loop). */
const COARSE_DEG = 2;
const COARSE_COLS = Math.ceil(360 / COARSE_DEG);
const COARSE_ROWS = Math.ceil(180 / COARSE_DEG);
const coarseLand = new Uint8Array(COARSE_COLS * COARSE_ROWS);

(function buildCoarseMask() {
  const stamp = (lon: number, lat: number) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        let c = Math.floor((lon + 180) / COARSE_DEG) + dc;
        let r = Math.floor((lat + 90) / COARSE_DEG) + dr;
        if (c < 0) c += COARSE_COLS;
        if (c >= COARSE_COLS) c -= COARSE_COLS;
        if (r < 0 || r >= COARSE_ROWS) continue;
        coarseLand[r * COARSE_COLS + c] = 1;
      }
    }
  };

  const walkRing = (ring: number[][]) => {
    for (const pt of ring) {
      if (pt && pt.length >= 2) stamp(pt[0]!, pt[1]!);
    }
  };

  const walkGeometry = (geom: GeoJSON.Geometry | null | undefined) => {
    if (!geom) return;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) walkRing(ring as number[][]);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        for (const ring of poly) walkRing(ring as number[][]);
      }
    } else if (geom.type === 'GeometryCollection') {
      for (const g of geom.geometries) walkGeometry(g);
    }
  };

  const feat = LAND as GeoJSON.Feature | GeoJSON.FeatureCollection;
  if (feat.type === 'FeatureCollection') {
    for (const f of feat.features) walkGeometry(f.geometry);
  } else {
    walkGeometry(feat.geometry);
  }
})();

function coarseCell(lon: number, lat: number): number {
  const c = Math.min(
    COARSE_COLS - 1,
    Math.max(0, Math.floor((lon + 180) / COARSE_DEG)),
  );
  const r = Math.min(
    COARSE_ROWS - 1,
    Math.max(0, Math.floor((lat + 90) / COARSE_DEG)),
  );
  return r * COARSE_COLS + c;
}

/** True when the chord's coarse cells include any land — false ⇒ open ocean. */
function coarseChordMayHitLand(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): boolean {
  const samples = 8;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const [lon, lat] = interpolateLonLat(lon1, lat1, lon2, lat2, t);
    if (coarseLand[coarseCell(lon, lat)]) return true;
  }
  return false;
}

export function interpolateLonLat(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  t: number,
): [number, number] {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  let lon = lon1 + dLon * t;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  const lat = lat1 + (lat2 - lat1) * t;
  return [lon, lat];
}

/** True when a lon/lat sits on the Natural Earth landmass (cached). */
export function isPointOnLand(lon: number, lat: number): boolean {
  const key = `${(lon * 80) | 0}:${(lat * 80) | 0}`;
  const hit = landCache.get(key);
  if (hit != null) return hit;
  let onLand = false;
  try {
    onLand = geoContains(LAND as any, [lon, lat]);
  } catch {
    onLand = false;
  }
  landCache.set(key, onLand);
  return onLand;
}

/**
 * True when the straight chord between two fixes crosses land.
 * Samples exclude exact endpoints (vessels often sit on a quay) but
 * probe close to them so headland tips aren't skipped.
 */
export function segmentCrossesLand(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): boolean {
  const distNm = haversineNm(lat1, lon1, lat2, lon2);
  if (distNm < MIN_LAND_CHECK_NM) return false;

  // Open-ocean fast path — no geoContains.
  if (!coarseChordMayHitLand(lon1, lat1, lon2, lat2)) return false;

  const stepNm =
    distNm < 3 ? 0.25 : distNm < 15 ? 0.85 : distNm < 60 ? 3 : 14;
  const samples = Math.min(32, Math.max(5, Math.ceil(distNm / stepNm)));
  for (let i = 1; i <= samples; i++) {
    const t = i / (samples + 1);
    const [lon, lat] = interpolateLonLat(lon1, lat1, lon2, lat2, t);
    if (isPointOnLand(lon, lat)) return true;
  }
  return false;
}

/**
 * Split each passage LineString wherever consecutive vertices are
 * joined by a land-crossing chord. Last resort when coastal routing
 * cannot find a water path. Prefer `rerouteFeaturesAroundLand`.
 */
export function splitFeaturesOnLandCrossings(
  fc: PassageFeatureCollection,
): PassageFeatureCollection {
  if (!fc?.features?.length) return fc;

  const out: PassageFeature[] = [];

  for (const feat of fc.features) {
    const coords = feat.geometry?.coordinates as [number, number][] | undefined;
    if (!coords || coords.length < 2) {
      out.push(feat);
      continue;
    }

    let run: [number, number][] = [coords[0]!];
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      const startIdx = out.length;
      out.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: run },
        properties: {
          ...feat.properties,
          passageIndex: startIdx,
          pointCount: run.length,
        },
      });
      run = [];
    };

    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1]!;
      const curr = coords[i]!;
      if (segmentCrossesLand(prev[0], prev[1], curr[0], curr[1])) {
        flush();
        run = [curr];
      } else {
        run.push(curr);
      }
    }
    flush();
  }

  return {
    type: 'FeatureCollection',
    features: out.map((f, i) => ({
      ...f,
      properties: { ...f.properties, passageIndex: i },
    })),
  };
}
