/**
 * Harbour-scale track refinement against the live basemap.
 *
 * Scoped to the current viewport and capped sample counts so zooming
 * into a marina stays responsive. Natural Earth handles island-scale
 * clips server-side; this only bends lines around OSM piers/quays.
 */

import type { Map as MapLibreMap, LngLatBounds } from 'maplibre-gl';

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import {
  interpolateLonLat,
  isPointOnLand,
} from '@/lib/passages-map/segment-crosses-land';
import type { LngLat } from '@/lib/passages-map/route-around-land';
import type { PassageFeatureCollection } from '@/lib/passages-map/segment-tracks';

const MIN_ZOOM = 9;
const MIN_SEG_NM = 0.04;
const MAX_DETOUR_FACTOR = 4.5;
/** Cap work per FeatureCollection so loads stay snappy. */
const MAX_SEGMENTS_PER_FC = 120;
const MAX_BLOCKED_QUERIES_PER_FC = 700;
/** Harbour + strait clips in view — skip only long ocean legs. */
const MAX_BASEMAP_SEG_NM = 25;

function wrapLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function offsetPoint(
  lon: number,
  lat: number,
  eastDeg: number,
  northDeg: number,
): LngLat {
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [wrapLon(lon + eastDeg / cosLat), lat + northDeg];
}

function chordPerpUnit(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): { east: number; north: number } {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const dLat = lat2 - lat1;
  const cosLat = Math.max(0.2, Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180));
  const east = dLon * cosLat;
  const north = dLat;
  const len = Math.hypot(east, north) || 1;
  return { east: -north / len, north: east / len };
}

function pathLengthNm(coords: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    total += haversineNm(a[1], a[0], b[1], b[0]);
  }
  return total;
}

function pointInExpandedBounds(
  bounds: LngLatBounds,
  lon: number,
  lat: number,
  padDeg: number,
): boolean {
  const west = bounds.getWest() - padDeg;
  const east = bounds.getEast() + padDeg;
  const south = bounds.getSouth() - padDeg;
  const north = bounds.getNorth() + padDeg;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

function lineNearViewport(
  bounds: LngLatBounds,
  coords: readonly LngLat[],
): boolean {
  const pad = 0.15;
  for (const [lon, lat] of coords) {
    if (pointInExpandedBounds(bounds, lon, lat, pad)) return true;
  }
  return false;
}

export function isRenderedBlocked(
  map: MapLibreMap,
  lon: number,
  lat: number,
): boolean | null {
  if (!map?.getStyle || !map.isStyleLoaded()) return null;
  let pt: { x: number; y: number };
  try {
    pt = map.project([lon, lat]);
  } catch {
    return null;
  }

  const canvas = map.getCanvas();
  if (
    pt.x < -2 ||
    pt.y < -2 ||
    pt.x > canvas.width + 2 ||
    pt.y > canvas.height + 2
  ) {
    return isPointOnLand(lon, lat);
  }

  let feats: Array<{
    layer?: { id?: string };
    properties?: Record<string, unknown> | null;
  }> = [];
  try {
    feats = map.queryRenderedFeatures([
      [pt.x - 1, pt.y - 1],
      [pt.x + 1, pt.y + 1],
    ]) as typeof feats;
  } catch {
    return null;
  }

  if (!feats.length) return null;

  let water = false;
  let pier = false;
  let land = false;

  for (const f of feats) {
    const id = String(f.layer?.id ?? '');
    if (
      id.startsWith('passages:') ||
      id.startsWith('sj-') ||
      id.startsWith('live') ||
      id.startsWith('land-') ||
      id.startsWith('country-')
    ) {
      continue;
    }
    const cls = String(
      (f.properties as { class?: string } | null)?.class ?? '',
    ).toLowerCase();
    const subclass = String(
      (f.properties as { subclass?: string } | null)?.subclass ?? '',
    ).toLowerCase();

    if (id === 'water' || id.startsWith('water')) {
      water = true;
      continue;
    }
    if (
      id.includes('pier') ||
      id.includes('breakwater') ||
      cls === 'pier' ||
      subclass === 'pier' ||
      cls === 'breakwater' ||
      cls === 'groyne' ||
      cls === 'harbour' ||
      cls === 'harbor'
    ) {
      pier = true;
      continue;
    }
    if (
      id.startsWith('landcover') ||
      id.startsWith('landuse') ||
      id.startsWith('building') ||
      id === 'airport_area' ||
      id === 'bridge_area'
    ) {
      land = true;
    }
  }

  if (pier) return true;
  if (land && !water) return true;
  if (water) return false;
  if (land) return true;
  return null;
}

type Budget = { queries: number };

function segmentBlockedOnBasemap(
  map: MapLibreMap,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  budget: Budget,
): boolean {
  const distNm = haversineNm(lat1, lon1, lat2, lon2);
  if (distNm < MIN_SEG_NM) return false;
  if (distNm > MAX_BASEMAP_SEG_NM) return false;

  const stepNm = distNm < 2 ? 0.05 : distNm < 8 ? 0.12 : 0.35;
  const samples = Math.min(24, Math.max(5, Math.ceil(distNm / stepNm)));
  for (let i = 1; i <= samples; i++) {
    if (budget.queries >= MAX_BLOCKED_QUERIES_PER_FC) return false;
    budget.queries += 1;
    const t = i / (samples + 1);
    const [lon, lat] = interpolateLonLat(lon1, lat1, lon2, lat2, t);
    const blocked = isRenderedBlocked(map, lon, lat);
    if (blocked === true) return true;
  }
  return false;
}

function pathClearOnBasemap(
  map: MapLibreMap,
  coords: readonly LngLat[],
  budget: Budget,
): boolean {
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    if (segmentBlockedOnBasemap(map, a[0], a[1], b[0], b[1], budget)) {
      return false;
    }
  }
  return true;
}

function tryHarbourDetours(
  map: MapLibreMap,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  chordNm: number,
  budget: Budget,
): LngLat[] | null {
  const perp = chordPerpUnit(lon1, lat1, lon2, lat2);
  const baseAmp = Math.min(0.18, Math.max(0.006, chordNm * 0.035));
  const amplitudes = [baseAmp * 0.7, baseAmp, baseAmp * 2, baseAmp * 3.5, baseAmp * 5];
  const midCounts = chordNm < 3 ? [3, 5, 7] : [3, 5];

  let best: LngLat[] | null = null;
  let bestLen = Infinity;

  for (const side of [1, -1] as const) {
    for (const amp of amplitudes) {
      for (const mids of midCounts) {
        const pts: LngLat[] = [[lon1, lat1]];
        for (let i = 1; i < mids; i++) {
          const t = i / mids;
          const [lon, lat] = interpolateLonLat(lon1, lat1, lon2, lat2, t);
          const bulge = Math.sin(Math.PI * t) * amp * side;
          pts.push(
            offsetPoint(lon, lat, perp.east * bulge, perp.north * bulge),
          );
        }
        pts.push([lon2, lat2]);
        if (!pathClearOnBasemap(map, pts, budget)) continue;
        const len = pathLengthNm(pts);
        if (len > chordNm * MAX_DETOUR_FACTOR) continue;
        if (len < bestLen) {
          bestLen = len;
          best = pts;
        }
      }
    }
  }

  return best;
}

export function densifyLineAgainstBasemap(
  map: MapLibreMap,
  coords: readonly LngLat[],
  budget: Budget = { queries: 0 },
): LngLat[] {
  if (!coords || coords.length < 2) {
    return coords ? coords.map((c) => [c[0], c[1]] as LngLat) : [];
  }
  if (map.getZoom() < MIN_ZOOM) {
    return coords.map((c) => [c[0], c[1]] as LngLat);
  }

  const out: LngLat[] = [[coords[0]![0], coords[0]![1]]];
  let segmentsDone = 0;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1]!;
    const curr = coords[i]!;
    if (
      segmentsDone >= MAX_SEGMENTS_PER_FC ||
      budget.queries >= MAX_BLOCKED_QUERIES_PER_FC
    ) {
      out.push([curr[0], curr[1]]);
      continue;
    }
    segmentsDone += 1;

    if (!segmentBlockedOnBasemap(map, prev[0], prev[1], curr[0], curr[1], budget)) {
      out.push([curr[0], curr[1]]);
      continue;
    }

    const chordNm = haversineNm(prev[1], prev[0], curr[1], curr[0]);
    const harbour = tryHarbourDetours(
      map,
      prev[0],
      prev[1],
      curr[0],
      curr[1],
      chordNm,
      budget,
    );
    if (harbour && harbour.length >= 2) {
      for (let j = 1; j < harbour.length; j++) out.push(harbour[j]!);
    } else {
      out.push([curr[0], curr[1]]);
    }
  }
  return out;
}

export function refineFeatureCollectionOnBasemap(
  map: MapLibreMap,
  fc: PassageFeatureCollection | GeoJSON.FeatureCollection,
): PassageFeatureCollection {
  if (!fc?.features?.length) {
    return fc as PassageFeatureCollection;
  }
  if (!map.isStyleLoaded() || map.getZoom() < MIN_ZOOM) {
    return fc as PassageFeatureCollection;
  }

  let bounds: LngLatBounds;
  try {
    bounds = map.getBounds();
  } catch {
    return fc as PassageFeatureCollection;
  }

  const budget: Budget = { queries: 0 };
  let changed = false;
  const features = fc.features.map((feat, i) => {
    if (!feat || feat.geometry?.type !== 'LineString') return feat;
    const coords = feat.geometry.coordinates as LngLat[];
    if (!coords || coords.length < 2) return feat;
    if (!lineNearViewport(bounds, coords)) return feat;
    if (budget.queries >= MAX_BLOCKED_QUERIES_PER_FC) return feat;

    const next = densifyLineAgainstBasemap(map, coords, budget);
    if (next.length === coords.length) {
      let same = true;
      for (let k = 0; k < next.length; k++) {
        if (next[k]![0] !== coords[k]![0] || next[k]![1] !== coords[k]![1]) {
          same = false;
          break;
        }
      }
      if (same) return feat;
    }
    changed = true;
    return {
      ...feat,
      geometry: { type: 'LineString', coordinates: next },
      properties: {
        ...(feat.properties as object),
        passageIndex:
          (feat.properties as { passageIndex?: number })?.passageIndex ?? i,
        pointCount: next.length,
      },
    };
  });

  if (!changed) return fc as PassageFeatureCollection;
  return { type: 'FeatureCollection', features } as PassageFeatureCollection;
}
