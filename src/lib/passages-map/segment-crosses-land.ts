/**
 * Detect (and optionally split) passage chords that cut across land.
 *
 * AIS dropouts are bridged with a straight line when the implied speed
 * looks like underway transit. Around islands that chord often goes
 * over land (e.g. SW of Sardinia → east coast straight through the
 * island) — impossible for a boat. We refuse those bridges at segment
 * time, and also split already-cached LineStrings on read so old cache
 * rows don't keep painting over continents until the next refresh.
 */

import { geoContains } from 'd3-geo';
import * as topojson from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import type {
  PassageFeature,
  PassageFeatureCollection,
} from './segment-tracks';

/**
 * Continuous landmass polygons (110m is enough to catch island-scale
 * crossings like Sardinia / Corsica / Sicily without the weight of 50m).
 */
const LAND = topojson.feature(
  landTopo as any,
  (landTopo as any).objects.land,
) as GeoJSON.Feature;

/** Skip the land check for short hops — harbour GPS noise / quay clips. */
const MIN_CHECK_NM = 8;

function interpolateLonLat(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  t: number,
): [number, number] {
  // Unwrap longitude so we don't interpolate the long way across ±180.
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  let lon = lon1 + dLon * t;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  const lat = lat1 + (lat2 - lat1) * t;
  return [lon, lat];
}

function pointOnLand(lon: number, lat: number): boolean {
  try {
    return geoContains(LAND as any, [lon, lat]);
  } catch {
    return false;
  }
}

/**
 * True when the straight chord between two fixes crosses land (sampled
 * along the segment, endpoints excluded — vessels often sit in port).
 */
export function segmentCrossesLand(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): boolean {
  const distNm = haversineNm(lat1, lon1, lat2, lon2);
  if (distNm < MIN_CHECK_NM) return false;

  // ~one sample per 12 NM, clamped so long ocean hops stay cheap.
  const samples = Math.min(32, Math.max(5, Math.ceil(distNm / 12)));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const [lon, lat] = interpolateLonLat(lon1, lat1, lon2, lat2, t);
    if (pointOnLand(lon, lat)) return true;
  }
  return false;
}

/**
 * Split each passage LineString wherever consecutive vertices are
 * joined by a land-crossing chord. Produces more features (gaps over
 * land) instead of painting through islands. Safe no-op when nothing
 * crosses land.
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
      // Inherit parent properties; distance/times are approximate for
      // the split piece — good enough for map display until refresh.
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
