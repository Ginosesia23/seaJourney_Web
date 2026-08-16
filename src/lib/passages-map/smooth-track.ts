/**
 * Soften sharp AIS polyline corners so voyage tracks look more like
 * continuous courses than zig-zag GPS joins.
 *
 * Uses two iterations of Chaikin corner-cutting — a light, stable
 * smoother that rounds vertices without the overshoot Catmull-Rom can
 * produce on uneven AIS spacing. Endpoints are preserved exactly.
 * Lines with fewer than 3 points are returned unchanged.
 *
 * Display-only: distance / fingerprints / leave filtering should keep
 * using the original AIS vertices when those matter. Call this after
 * those steps when building map GeoJSON.
 */

export type LngLat = [number, number];

export type SmoothTrackOptions = {
  /**
   * Chaikin iterations. 1 = subtle, 2 = visibly smoother (default),
   * 3 = quite soft. Capped at 3 to keep geometry size reasonable.
   */
  iterations?: number;
};

/**
 * Smooth a single LineString coordinate ring.
 */
export function smoothLineCoordinates(
  coords: readonly LngLat[],
  opts: SmoothTrackOptions = {},
): LngLat[] {
  const iterations = Math.max(1, Math.min(3, opts.iterations ?? 2));
  if (!coords || coords.length < 3) {
    return coords ? coords.map((c) => [c[0], c[1]] as LngLat) : [];
  }

  // Unwrap across the antimeridian so we don't cut corners the long
  // way around the globe on Pacific voyages.
  let current = unwrapLongitudes(coords);
  for (let iter = 0; iter < iterations; iter++) {
    current = chaikinOnce(current);
  }

  // Re-wrap and force exact original endpoints.
  const start = wrapLngLat(coords[0]!);
  const end = wrapLngLat(coords[coords.length - 1]!);
  const out = current.map(wrapLngLat);
  if (out.length === 0) return [start, end];
  out[0] = start;
  out[out.length - 1] = end;
  return out;
}

/**
 * Smooth every LineString feature in a FeatureCollection. Non-line
 * geometries are left alone. Returns a new collection when anything
 * changes.
 */
export function smoothPassageFeatureCollection<
  T extends GeoJSON.FeatureCollection,
>(fc: T, opts?: SmoothTrackOptions): T {
  if (!fc?.features?.length) return fc;
  let changed = false;
  const features = fc.features.map((feat) => {
    if (!feat || feat.geometry?.type !== 'LineString') return feat;
    const coords = feat.geometry.coordinates as LngLat[];
    if (!coords || coords.length < 3) return feat;
    const smoothed = smoothLineCoordinates(coords, opts);
    changed = true;
    return {
      ...feat,
      geometry: {
        ...feat.geometry,
        coordinates: smoothed,
      },
    };
  });
  if (!changed) return fc;
  return { ...fc, features } as T;
}

/**
 * One Chaikin pass: each segment A→B contributes
 *   Q = ¾A + ¼B,  R = ¼A + ¾B
 * Open polylines keep the first and last vertices.
 */
function chaikinOnce(coords: readonly LngLat[]): LngLat[] {
  if (coords.length < 3) {
    return coords.map((c) => [c[0], c[1]] as LngLat);
  }
  const out: LngLat[] = [[coords[0]![0], coords[0]![1]]];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    out.push([
      0.75 * a[0] + 0.25 * b[0],
      0.75 * a[1] + 0.25 * b[1],
    ]);
    out.push([
      0.25 * a[0] + 0.75 * b[0],
      0.25 * a[1] + 0.75 * b[1],
    ]);
  }
  const last = coords[coords.length - 1]!;
  out.push([last[0], last[1]]);
  return out;
}

function unwrapLongitudes(coords: readonly LngLat[]): LngLat[] {
  const out: LngLat[] = [[coords[0]![0], coords[0]![1]]];
  for (let i = 1; i < coords.length; i++) {
    let lon = coords[i]![0];
    const prev = out[i - 1]![0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, coords[i]![1]]);
  }
  return out;
}

function wrapLngLat([lon, lat]: LngLat): LngLat {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return [x, lat];
}
