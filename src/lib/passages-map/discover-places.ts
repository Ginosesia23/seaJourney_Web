/**
 * Progressive place discovery for the Passages Map.
 *
 * Sample track endpoints (and sparse mid-track points), then resolve the
 * closest curated port / reverse-geocoded town. Cells are keyed on a
 * ~0.1° grid so sailing the same coast again does not re-resolve or
 * stack duplicate labels.
 */

import { MAJOR_CITIES } from './major-cities';
import {
  CLOSE_MATCH_NM,
  findNearestPort,
} from './nearest-port';

/** ~0.1° ≈ 6 nm of latitude — same anchorage / port approach. */
export const PLACE_CELL_DEG = 0.1;

/** Sample along a long passage about every this many nautical miles. */
const SAMPLE_EVERY_NM = 90;

/** Cap how many brand-new cells we ask the API to resolve per batch. */
export const MAX_DISCOVER_PER_BATCH = 10;

export type DiscoveredPlaceKind = 'city' | 'town' | 'port';

export type DiscoveredPlace = {
  cellKey: string;
  lat: number;
  lon: number;
  name: string;
  kind: DiscoveredPlaceKind;
  /** Nearest curated hub when primary label is a geocoded town. */
  portName?: string | null;
};

export type TrackPlaceSample = {
  cellKey: string;
  lat: number;
  lon: number;
};

export function placeCellKey(lat: number, lon: number): string {
  const r = (n: number) =>
    (Math.round(n / PLACE_CELL_DEG) * PLACE_CELL_DEG).toFixed(1);
  return `${r(lat)},${r(lon)}`;
}

function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065;
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

/**
 * Collect unique place samples from passage LineStrings: start, end,
 * and sparse mid-track points so coastal hops unlock intermediate towns.
 */
export function collectTrackPlaceSamples(
  featureCollections: Array<GeoJSON.FeatureCollection | null | undefined>,
): TrackPlaceSample[] {
  const byCell = new Map<string, TrackPlaceSample>();

  const add = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    const cellKey = placeCellKey(lat, lon);
    if (byCell.has(cellKey)) return;
    byCell.set(cellKey, { cellKey, lat, lon });
  };

  for (const fc of featureCollections) {
    for (const feature of fc?.features ?? []) {
      if (feature.geometry?.type !== 'LineString') continue;
      const coords = feature.geometry.coordinates as [number, number][];
      if (!coords.length) continue;

      const [startLon, startLat] = coords[0]!;
      const [endLon, endLat] = coords[coords.length - 1]!;
      add(startLat, startLon);
      add(endLat, endLon);

      let sinceNm = 0;
      for (let i = 1; i < coords.length; i++) {
        const [lon0, lat0] = coords[i - 1]!;
        const [lon1, lat1] = coords[i]!;
        sinceNm += haversineNm(lat0, lon0, lat1, lon1);
        if (sinceNm >= SAMPLE_EVERY_NM) {
          add(lat1, lon1);
          sinceNm = 0;
        }
      }
    }
  }

  return [...byCell.values()];
}

/**
 * True when `name` is already covered by the static world city list
 * within `maxNm` of this sample (so we don't double-label Antibes etc.).
 */
export function isCoveredByMajorCity(
  lat: number,
  lon: number,
  name: string,
  maxNm = 12,
): boolean {
  const needle = normalizePlaceName(name);
  if (!needle) return false;
  for (const c of MAJOR_CITIES) {
    if (normalizePlaceName(c.name) !== needle) continue;
    if (haversineNm(lat, lon, c.lat, c.lon) <= maxNm) return true;
  }
  return false;
}

export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Instant curated-port resolution (no network). Used client-side so
 * ports near track ends appear before the geocode round-trip finishes.
 */
export function resolveSampleFromCurated(
  sample: TrackPlaceSample,
): DiscoveredPlace | null {
  const port = findNearestPort(sample.lat, sample.lon, {
    maxDistanceNm: CLOSE_MATCH_NM,
  });
  if (!port) return null;
  if (isCoveredByMajorCity(sample.lat, sample.lon, port.name)) return null;
  return {
    cellKey: sample.cellKey,
    lat: sample.lat,
    lon: sample.lon,
    name: port.name,
    kind: 'port',
    portName: port.name,
  };
}

/** Collapse places that share a name within `mergeNm` — keep first. */
export function dedupeDiscoveredPlaces(
  places: DiscoveredPlace[],
  mergeNm = 28,
): DiscoveredPlace[] {
  const out: DiscoveredPlace[] = [];
  for (const p of places) {
    const key = normalizePlaceName(p.name);
    const dup = out.find(
      (o) =>
        normalizePlaceName(o.name) === key &&
        haversineNm(o.lat, o.lon, p.lat, p.lon) <= mergeNm,
    );
    if (dup) continue;
    out.push(p);
  }
  return out;
}

const STORAGE_PREFIX = 'sj:passages-map:places:';

export function loadCachedDiscoveredPlaces(
  userId: string,
): DiscoveredPlace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DiscoveredPlace[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) =>
        p &&
        typeof p.cellKey === 'string' &&
        typeof p.name === 'string' &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon),
    );
  } catch {
    return [];
  }
}

export function saveCachedDiscoveredPlaces(
  userId: string,
  places: DiscoveredPlace[],
): void {
  if (typeof window === 'undefined') return;
  try {
    const deduped = dedupeDiscoveredPlaces(places);
    window.localStorage.setItem(
      STORAGE_PREFIX + userId,
      JSON.stringify(deduped),
    );
  } catch {
    /* quota / private mode */
  }
}

export function mergeDiscoveredPlaces(
  existing: DiscoveredPlace[],
  incoming: DiscoveredPlace[],
): DiscoveredPlace[] {
  const byCell = new Map<string, DiscoveredPlace>();
  for (const p of existing) byCell.set(p.cellKey, p);
  for (const p of incoming) {
    if (!byCell.has(p.cellKey)) byCell.set(p.cellKey, p);
  }
  return dedupeDiscoveredPlaces([...byCell.values()]);
}
