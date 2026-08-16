/**
 * Anonymised sample passage tracks for the public /voyage-map showcase.
 * Coordinates are illustrative (not real vessel AIS) so the landing page
 * never depends on auth, Datalastic, or live crew data.
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import type { PassageFeatureCollection } from '@/lib/passages-map/segment-tracks';

export type DemoPassageVessel = {
  id: string;
  name: string;
  type: string;
  region: string;
  colorHex: string;
  summary: string;
  featureCollection: PassageFeatureCollection;
  totalDistanceNm: number;
  passageCount: number;
};

type LonLat = [number, number];

/** Linear interpolate between waypoints with slight lateral jitter for chart feel. */
function densifyRoute(waypoints: LonLat[], stepsPerLeg = 18): LonLat[] {
  const out: LonLat[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lon0, lat0] = waypoints[i];
    const [lon1, lat1] = waypoints[i + 1];
    for (let s = 0; s < stepsPerLeg; s++) {
      const t = s / stepsPerLeg;
      // Deterministic micro-jitter so tracks look AIS-like, not ruler-straight.
      const wobble = Math.sin((i + 1) * 12.7 + s * 1.9) * 0.035;
      const lon = lon0 + (lon1 - lon0) * t + wobble * Math.cos((lat0 * Math.PI) / 180);
      const lat = lat0 + (lat1 - lat0) * t + wobble * 0.55;
      out.push([lon, lat]);
    }
  }
  out.push(waypoints[waypoints.length - 1]);
  return out;
}

function pathDistanceNm(coords: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon0, lat0] = coords[i - 1];
    const [lon1, lat1] = coords[i];
    total += haversineNm(lat0, lon0, lat1, lon1);
  }
  return total;
}

function makePassage(
  passageIndex: number,
  waypoints: LonLat[],
  startIso: string,
  endIso: string,
  avgSpeedKn: number,
): PassageFeatureCollection['features'][number] {
  const coordinates = densifyRoute(waypoints);
  const distanceNm = Math.round(pathDistanceNm(coordinates) * 10) / 10;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: {
      passageIndex,
      startTime: startIso,
      endTime: endIso,
      distanceNm,
      pointCount: coordinates.length,
      avgSpeedKn,
      maxSpeedKn: Math.round(avgSpeedKn * 1.35 * 10) / 10,
      durationMs: Math.max(0, endMs - startMs),
    },
  };
}

function vesselFromPassages(
  meta: Omit<DemoPassageVessel, 'featureCollection' | 'totalDistanceNm' | 'passageCount'>,
  features: PassageFeatureCollection['features'],
): DemoPassageVessel {
  const featureCollection: PassageFeatureCollection = {
    type: 'FeatureCollection',
    features,
  };
  const totalDistanceNm =
    Math.round(features.reduce((sum, f) => sum + f.properties.distanceNm, 0) * 10) / 10;
  return {
    ...meta,
    featureCollection,
    totalDistanceNm,
    passageCount: features.length,
  };
}

/** Mediterranean season — Balearics → Riviera → Aegean. */
const aurora = vesselFromPassages(
  {
    id: 'demo-aurora',
    name: 'M/Y Aurora',
    type: 'Motor yacht',
    region: 'Western Mediterranean',
    colorHex: '#38bdf8',
    summary: 'Summer Med circuit with port calls in Palma, Antibes, and the Aegean.',
  },
  [
    makePassage(
      0,
      [
        [2.65, 39.55], // Palma
        [1.45, 38.95], // Ibiza approach
        [0.2, 38.9],
        [-0.35, 39.45], // Valencia
        [1.1, 41.2],
        [2.15, 41.35], // Barcelona
      ],
      '2025-06-04T08:00:00.000Z',
      '2025-06-06T18:30:00.000Z',
      11.2,
    ),
    makePassage(
      1,
      [
        [2.15, 41.35],
        [3.2, 42.1],
        [5.0, 42.9],
        [7.05, 43.55], // Antibes / Nice
      ],
      '2025-06-18T06:00:00.000Z',
      '2025-06-19T22:00:00.000Z',
      12.4,
    ),
    makePassage(
      2,
      [
        [7.05, 43.55],
        [8.4, 43.9],
        [10.2, 43.5],
        [12.3, 41.9], // Rome approaches
        [14.25, 40.85], // Naples
        [15.3, 38.2],
        [18.0, 37.5],
        [23.7, 37.95], // Athens approaches
        [25.35, 37.45], // Cyclades
      ],
      '2025-07-02T05:00:00.000Z',
      '2025-07-08T16:00:00.000Z',
      13.1,
    ),
  ],
);

/** Caribbean island hop. */
const windward = vesselFromPassages(
  {
    id: 'demo-windward',
    name: 'S/Y Windward',
    type: 'Sailing yacht',
    region: 'Eastern Caribbean',
    colorHex: '#f59e0b',
    summary: 'Trade-wind island hop across the Leewards with overnight passages.',
  },
  [
    makePassage(
      0,
      [
        [-64.93, 18.34], // St Thomas
        [-63.05, 18.05],
        [-61.85, 17.15], // Antigua
      ],
      '2025-01-12T14:00:00.000Z',
      '2025-01-14T09:00:00.000Z',
      7.8,
    ),
    makePassage(
      1,
      [
        [-61.85, 17.15],
        [-61.55, 16.25],
        [-61.35, 15.3],
        [-61.0, 14.6], // Dominica / Martinique corridor
        [-60.95, 13.85], // St Lucia
      ],
      '2025-01-22T11:00:00.000Z',
      '2025-01-24T07:30:00.000Z',
      8.2,
    ),
    makePassage(
      2,
      [
        [-60.95, 13.85],
        [-60.6, 13.15],
        [-59.65, 13.1], // Barbados
      ],
      '2025-02-03T16:00:00.000Z',
      '2025-02-04T20:00:00.000Z',
      8.6,
    ),
  ],
);

/** Northern European / North Sea season. */
const northStar = vesselFromPassages(
  {
    id: 'demo-north-star',
    name: 'M/Y North Star',
    type: 'Explorer yacht',
    region: 'North Sea & Scandinavia',
    colorHex: '#a78bfa',
    summary: 'North Sea transit with Norwegian fjord approaches and Baltic return.',
  },
  [
    makePassage(
      0,
      [
        [-1.4, 50.9], // Solent / Portsmouth
        [1.3, 51.4],
        [3.2, 52.0],
        [4.5, 52.4], // IJmuiden approaches
        [5.5, 53.5],
        [7.0, 54.0],
        [8.5, 55.0],
        [10.0, 57.2], // Skagen approaches
        [10.7, 59.9], // Oslofjord entrance
      ],
      '2025-05-08T04:00:00.000Z',
      '2025-05-12T21:00:00.000Z',
      12.0,
    ),
    makePassage(
      1,
      [
        [10.7, 59.9],
        [5.3, 60.4], // Bergen approaches
        [5.0, 61.5],
        [6.2, 62.5], // Geiranger corridor (illustrative)
      ],
      '2025-06-01T08:00:00.000Z',
      '2025-06-04T18:00:00.000Z',
      10.5,
    ),
    makePassage(
      2,
      [
        [6.2, 62.5],
        [10.0, 59.0],
        [12.5, 56.0],
        [15.5, 55.5],
        [18.1, 59.3], // Stockholm approaches
      ],
      '2025-07-10T05:00:00.000Z',
      '2025-07-15T14:00:00.000Z',
      11.4,
    ),
  ],
);

export const DEMO_PASSAGE_VESSELS: DemoPassageVessel[] = [aurora, windward, northStar];

export const DEMO_PASSAGE_STATS = {
  vessels: DEMO_PASSAGE_VESSELS.length,
  passages: DEMO_PASSAGE_VESSELS.reduce((n, v) => n + v.passageCount, 0),
  distanceNm: Math.round(
    DEMO_PASSAGE_VESSELS.reduce((n, v) => n + v.totalDistanceNm, 0),
  ),
};
