/**
 * Water-aware passage routing for sparse AIS.
 *
 * Hourly (or quieter) fixes are joined with straight chords. Around
 * islands and headlands those chords cut inland — impossible for a
 * vessel. Instead of dropping the hop or painting through land, we
 * insert a coastal detour:
 *
 *   1. Fast geometric arcs (sine-shaped port/starboard offsets)
 *   2. Coarse A* over a Natural Earth water grid if geometry fails
 *
 * Display-only: fingerprints / distances stay on the original AIS
 * vertices. Denser Datalastic pulls rarely help — the gap is usually
 * real AIS silence, not missing samples we can buy back.
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import {
  interpolateLonLat,
  isPointOnLand,
  segmentCrossesLand,
  splitFeaturesOnLandCrossings,
} from '@/lib/passages-map/segment-crosses-land';
import type {
  PassageFeature,
  PassageFeatureCollection,
} from '@/lib/passages-map/segment-tracks';

export type LngLat = [number, number];

/** Reject detours longer than this multiple of the straight chord. */
const MAX_DETOUR_FACTOR = 3.5;
/** Match land-check floor. */
const MIN_ROUTE_NM = 0.35;
/** Hard cap — continent-scale teleports stay split, not routed. */
const MAX_ROUTE_NM = 900;
/** A* only for longer island hops — coastal push covers straits. */
const MIN_ASTAR_NM = 18;

function pathLengthNm(coords: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    total += haversineNm(a[1], a[0], b[1], b[0]);
  }
  return total;
}

function pathStaysOnWater(coords: readonly LngLat[]): boolean {
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    if (segmentCrossesLand(a[0], a[1], b[0], b[1])) return false;
  }
  return true;
}

function wrapLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/** Offset a point by degree deltas in a local east/north frame. */
function offsetPoint(
  lon: number,
  lat: number,
  eastDeg: number,
  northDeg: number,
): LngLat {
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [wrapLon(lon + eastDeg / cosLat), lat + northDeg];
}

/** Unit perpendicular (east, north) for the chord direction. */
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

/**
 * Sine-bulge detours on both sides of the chord. Cheap and looks like a
 * natural coastal rounding for peninsula / island clips.
 */
function tryGeometricDetours(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  chordNm: number,
): LngLat[] | null {
  const perp = chordPerpUnit(lon1, lat1, lon2, lat2);
  // Strait tips need modest offsets; open-ocean island hops need larger.
  const baseAmp =
    chordNm < 8
      ? Math.min(0.35, Math.max(0.02, chordNm * 0.04))
      : Math.min(4.5, Math.max(0.3, chordNm / 90));
  const amplitudes =
    chordNm < 8
      ? [baseAmp * 0.6, baseAmp, baseAmp * 1.8, baseAmp * 3, baseAmp * 4.5]
      : [baseAmp * 0.7, baseAmp, baseAmp * 1.8, baseAmp * 2.8];
  const midCounts =
    chordNm < 5 ? [3, 5, 7] : chordNm > 120 ? [5, 7] : [3, 5];

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
        if (!pathStaysOnWater(pts)) continue;
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

/**
 * Densify the chord and shove inland samples sideways into water.
 * Then repair any remaining crossing segments by inserting/pushing
 * midpoints — needed for Messina tip clips where sparse points sit in
 * water but the chord between them still nicks land.
 */
function tryCoastalPush(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  chordNm: number,
): LngLat[] | null {
  const perp = chordPerpUnit(lon1, lat1, lon2, lat2);
  const steps = Math.min(28, Math.max(8, Math.ceil(chordNm / 0.55)));
  const maxPushDeg = Math.min(0.5, Math.max(0.035, chordNm * 0.035));
  const pushStep = Math.max(0.004, maxPushDeg / 12);

  const pushPoint = (
    lon: number,
    lat: number,
    side: 1 | -1,
  ): LngLat | null => {
    if (!isPointOnLand(lon, lat)) {
      // Already wet — try a tiny nudge if neighbours will need room.
      return [lon, lat];
    }
    for (let d = pushStep; d <= maxPushDeg; d += pushStep) {
      const p = offsetPoint(lon, lat, perp.east * d * side, perp.north * d * side);
      if (!isPointOnLand(p[0], p[1])) return p;
    }
    return null;
  };

  const pushFurther = (
    lon: number,
    lat: number,
    side: 1 | -1,
  ): LngLat | null => {
    for (let d = pushStep; d <= maxPushDeg; d += pushStep) {
      const p = offsetPoint(lon, lat, perp.east * d * side, perp.north * d * side);
      if (!isPointOnLand(p[0], p[1])) return p;
    }
    return null;
  };

  // Prefer the side that clears the first inland sample.
  let preferredSide: 1 | -1 = 1;
  for (let i = 1; i < steps; i++) {
    const [lon, lat] = interpolateLonLat(lon1, lat1, lon2, lat2, i / steps);
    if (!isPointOnLand(lon, lat)) continue;
    for (const side of [1, -1] as const) {
      if (pushFurther(lon, lat, side)) {
        preferredSide = side;
        break;
      }
    }
    break;
  }

  const sides: Array<1 | -1> = [
    preferredSide,
    preferredSide === 1 ? -1 : 1,
  ];

  for (const side of sides) {
    let pts: LngLat[] = [[lon1, lat1]];
    let failed = false;
    for (let i = 1; i < steps; i++) {
      const [lon, lat] = interpolateLonLat(lon1, lat1, lon2, lat2, i / steps);
      const pushed = pushPoint(lon, lat, side);
      if (!pushed) {
        failed = true;
        break;
      }
      // If still on land somehow, force further search.
      if (isPointOnLand(pushed[0], pushed[1])) {
        const again = pushFurther(lon, lat, side);
        if (!again) {
          failed = true;
          break;
        }
        pts.push(again);
      } else {
        pts.push(pushed);
      }
    }
    if (failed) continue;
    pts.push([lon2, lat2]);

    // Repair nicks: chord between two wet points can still clip a tip.
    for (let repair = 0; repair < 8; repair++) {
      let crossed = false;
      const next: LngLat[] = [pts[0]!];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        if (!segmentCrossesLand(a[0], a[1], b[0], b[1])) {
          next.push(b);
          continue;
        }
        crossed = true;
        const [mlon, mlat] = interpolateLonLat(a[0], a[1], b[0], b[1], 0.5);
        let mid = pushFurther(mlon, mlat, side);
        if (!mid) {
          // Mid already water but segment clips — nudge further anyway.
          for (let d = pushStep; d <= maxPushDeg; d += pushStep) {
            const p = offsetPoint(
              mlon,
              mlat,
              perp.east * d * side,
              perp.north * d * side,
            );
            if (
              !segmentCrossesLand(a[0], a[1], p[0], p[1]) &&
              !segmentCrossesLand(p[0], p[1], b[0], b[1])
            ) {
              mid = p;
              break;
            }
          }
        }
        if (!mid) {
          failed = true;
          break;
        }
        next.push(mid, b);
      }
      if (failed) break;
      pts = next;
      if (!crossed) break;
    }
    if (failed) continue;
    if (!pathStaysOnWater(pts)) continue;
    const len = pathLengthNm(pts);
    if (len > chordNm * MAX_DETOUR_FACTOR) continue;
    return simplifyRoute(pts);
  }

  return null;
}

type Grid = {
  originLon: number;
  originLat: number;
  step: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
};

function buildWaterGrid(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  chordNm: number,
): Grid {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const midLon = wrapLon(lon1 + dLon / 2);
  const midLat = (lat1 + lat2) / 2;

  const padDeg = Math.min(4, Math.max(0.35, chordNm / 45));
  const spanLon = Math.abs(dLon) + padDeg * 2;
  const spanLat = Math.abs(lat2 - lat1) + padDeg * 2;

  // Strait channels (Messina ~3 km) need sub-0.03° cells or A* seals them shut.
  const minStep = chordNm < 25 ? 0.018 : 0.12;
  const targetCells = chordNm < 25 ? 48 : 40;
  const step = Math.max(minStep, Math.max(spanLon, spanLat) / targetCells);
  const cols = Math.min(64, Math.max(14, Math.ceil(spanLon / step) + 1));
  const rows = Math.min(64, Math.max(14, Math.ceil(spanLat / step) + 1));

  const originLon = wrapLon(midLon - ((cols - 1) * step) / 2);
  const originLat = midLat - ((rows - 1) * step) / 2;

  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lon = wrapLon(originLon + c * step);
      const lat = originLat + r * step;
      if (isPointOnLand(lon, lat)) blocked[r * cols + c] = 1;
    }
  }

  return { originLon, originLat, step, cols, rows, blocked };
}

function cellOf(grid: Grid, lon: number, lat: number): { c: number; r: number } {
  let dLon = lon - grid.originLon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const c = Math.round(dLon / grid.step);
  const r = Math.round((lat - grid.originLat) / grid.step);
  return {
    c: Math.max(0, Math.min(grid.cols - 1, c)),
    r: Math.max(0, Math.min(grid.rows - 1, r)),
  };
}

function coordOf(grid: Grid, c: number, r: number): LngLat {
  return [wrapLon(grid.originLon + c * grid.step), grid.originLat + r * grid.step];
}

function findNearestWater(
  grid: Grid,
  c0: number,
  r0: number,
  maxRadius = 8,
): { c: number; r: number } | null {
  if (!grid.blocked[r0 * grid.cols + c0]) return { c: c0, r: r0 };
  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
        if (!grid.blocked[r * grid.cols + c]) return { c, r };
      }
    }
  }
  return null;
}

/** 8-connected A* over the water grid → cell-centre waypoints. */
function astarWaterRoute(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  chordNm: number,
): LngLat[] | null {
  const grid = buildWaterGrid(lon1, lat1, lon2, lat2, chordNm);
  const s0 = cellOf(grid, lon1, lat1);
  const e0 = cellOf(grid, lon2, lat2);
  const start = findNearestWater(grid, s0.c, s0.r);
  const goal = findNearestWater(grid, e0.c, e0.r);
  if (!start || !goal) return null;

  const idx = (c: number, r: number) => r * grid.cols + c;
  const open: { c: number; r: number; f: number; g: number }[] = [
    { c: start.c, r: start.r, f: 0, g: 0 },
  ];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[idx(start.c, start.r), 0]]);

  const heuristic = (c: number, r: number) => {
    const [lon, lat] = coordOf(grid, c, r);
    return haversineNm(lat, lon, lat2, lon2);
  };

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const;

  let guard = 0;
  const GUARD_MAX = grid.cols * grid.rows * 4;

  while (open.length > 0 && guard++ < GUARD_MAX) {
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestI]!.f) bestI = i;
    }
    const cur = open.splice(bestI, 1)[0]!;
    if (cur.c === goal.c && cur.r === goal.r) {
      const cells: LngLat[] = [];
      let k = idx(cur.c, cur.r);
      for (;;) {
        const r = Math.floor(k / grid.cols);
        const c = k - r * grid.cols;
        cells.push(coordOf(grid, c, r));
        const prev = came.get(k);
        if (prev == null) break;
        k = prev;
      }
      cells.reverse();
      return cells;
    }

    for (const [dc, dr] of neighbors) {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      if (grid.blocked[nr * grid.cols + nc]) continue;
      const stepCost = dc !== 0 && dr !== 0 ? 1.414 : 1;
      const tentative = cur.g + stepCost;
      const nk = idx(nc, nr);
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      came.set(nk, idx(cur.c, cur.r));
      gScore.set(nk, tentative);
      open.push({
        c: nc,
        r: nr,
        f: tentative + heuristic(nc, nr),
        g: tentative,
      });
    }
  }

  return null;
}

function simplifyRoute(coords: LngLat[]): LngLat[] {
  if (coords.length <= 3) return coords;
  const out: LngLat[] = [coords[0]!];
  for (let i = 1; i < coords.length - 1; i++) {
    const prev = out[out.length - 1]!;
    const cur = coords[i]!;
    const next = coords[i + 1]!;
    // Drop near-colinear / tiny steps.
    const a = haversineNm(prev[1], prev[0], cur[1], cur[0]);
    const b = haversineNm(cur[1], cur[0], next[1], next[0]);
    if (a < 2 && b < 2) continue;
    if (
      !segmentCrossesLand(prev[0], prev[1], next[0], next[1]) &&
      a + b < haversineNm(prev[1], prev[0], next[1], next[0]) * 1.08
    ) {
      continue;
    }
    out.push(cur);
  }
  out.push(coords[coords.length - 1]!);
  return out;
}

/**
 * Water path between two AIS fixes. Returns at least `[start, end]`.
 * When routing fails, returns the straight chord (still may cross land —
 * caller can split as a last resort).
 */
export function routeWaterPath(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): LngLat[] {
  const start: LngLat = [lon1, lat1];
  const end: LngLat = [lon2, lat2];
  const chordNm = haversineNm(lat1, lon1, lat2, lon2);

  if (chordNm < MIN_ROUTE_NM || !segmentCrossesLand(lon1, lat1, lon2, lat2)) {
    return [start, end];
  }
  if (chordNm > MAX_ROUTE_NM) {
    return [start, end];
  }

  const geometric = tryGeometricDetours(lon1, lat1, lon2, lat2, chordNm);
  if (geometric && geometric.length >= 2) {
    return simplifyRoute(geometric);
  }

  const coastal = tryCoastalPush(lon1, lat1, lon2, lat2, chordNm);
  if (coastal && coastal.length >= 2) {
    return coastal;
  }

  // A* for longer island-scale clips coastal push couldn't clear.
  if (chordNm < MIN_ASTAR_NM) {
    return [start, end];
  }

  const cells = astarWaterRoute(lon1, lat1, lon2, lat2, chordNm);
  if (!cells || cells.length < 2) {
    return [start, end];
  }

  // Stitch true AIS endpoints around the grid path.
  const routed: LngLat[] = [start];
  for (const p of cells) {
    const last = routed[routed.length - 1]!;
    if (haversineNm(last[1], last[0], p[1], p[0]) < 1.5) continue;
    routed.push(p);
  }
  const last = routed[routed.length - 1]!;
  if (haversineNm(last[1], last[0], end[1], end[0]) > 1.5) {
    routed.push(end);
  } else {
    routed[routed.length - 1] = end;
  }

  if (!pathStaysOnWater(routed)) return [start, end];
  if (pathLengthNm(routed) > chordNm * MAX_DETOUR_FACTOR) return [start, end];
  return simplifyRoute(routed);
}

/**
 * Replace every land-crossing chord in a LineString with a water detour.
 * Endpoints (true AIS fixes) are preserved.
 */
export function densifyLineAwayFromLand(coords: readonly LngLat[]): LngLat[] {
  if (!coords || coords.length < 2) {
    return coords ? coords.map((c) => [c[0], c[1]] as LngLat) : [];
  }

  const out: LngLat[] = [[coords[0]![0], coords[0]![1]]];
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1]!;
    const curr = coords[i]!;
    const routed = routeWaterPath(prev[0], prev[1], curr[0], curr[1]);
    // Skip first point (already in `out`).
    for (let j = 1; j < routed.length; j++) {
      out.push(routed[j]!);
    }
  }
  return out;
}

/**
 * Display pipeline: route around land, then split any hop that still
 * cannot stay wet (continent-scale / unroutable).
 */
export function rerouteFeaturesAroundLand(
  fc: PassageFeatureCollection,
): PassageFeatureCollection {
  if (!fc?.features?.length) return fc;

  const routed: PassageFeature[] = fc.features.map((feat, i) => {
    const coords = feat.geometry?.coordinates as LngLat[] | undefined;
    if (!coords || coords.length < 2) return feat;
    const next = densifyLineAwayFromLand(coords);
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
    return {
      ...feat,
      geometry: { type: 'LineString', coordinates: next },
      properties: {
        ...feat.properties,
        passageIndex: i,
        pointCount: next.length,
      },
    };
  });

  return splitFeaturesOnLandCrossings({
    type: 'FeatureCollection',
    features: routed,
  });
}
