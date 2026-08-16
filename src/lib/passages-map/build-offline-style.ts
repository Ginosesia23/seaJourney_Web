/**
 * Fully self-contained MapLibre style built from bundled topojson.
 *
 * Why this exists:
 *   Third-party vector-tile CDNs (CARTO, OpenFreeMap, MapTiler, etc.) are
 *   frequently blocked by adblockers, corporate proxies, and privacy
 *   extensions. When they're blocked the map simply never draws — even
 *   though our fetches for passage data succeed — and the user sees a
 *   blank canvas. That's a terrible experience for a feature we're
 *   gating behind a paid tier.
 *
 *   This module builds a MapLibre-compatible `StyleSpecification` from
 *   the exact same `world-atlas/countries-110m.json` file already used
 *   by /dashboard/world-map. No network requests. No external hosts.
 *   It's not as pretty as vector tiles, but it always renders, and
 *   layered with our vessel tracks it still looks premium in dark mode.
 *
 * Usage:
 *   import { buildOfflineWorldStyle } from '@/lib/passages-map/build-offline-style';
 *   const style = buildOfflineWorldStyle({ theme: 'dark' });
 *   new maplibregl.Map({ style, ... });
 */

import type {
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import * as topojson from 'topojson-client';
// 1:50 million world atlas — proper cartographic accuracy.
//
// Both datasets are needed to render a professional-looking map:
//   - `land-50m.json` gives the CONTINUOUS landmass polygons (no country
//     borders cutting continents into slivers), which we fill.
//   - `countries-50m.json` gives per-country polygons; we draw them as
//     a thin subtle STROKE on top of the land fill.
//
// The upstream world-atlas package ships three resolutions
// (110m / 50m / 10m). 110m is what we shipped originally — 108 KB but
// visibly blocky at anything above continent-level zoom. 10m is
// gorgeous but ~3.7 MB per file which is too much to bundle for a
// single-page feature. 50m sits at ~600–750 KB per file and gives
// clean coastlines + all the major islands (Balearics, Cyclades,
// British Isles, etc.) rendering correctly.
import landTopo from 'world-atlas/land-50m.json';
import countriesTopo from 'world-atlas/countries-50m.json';

/**
 * Themes tune the ocean / land / border colours together so the map
 * feels intentional across all three basemap options in the switcher.
 * Kept lightweight — just the handful of colours MapLibre needs.
 */
export type OfflineTheme = 'dark' | 'muted' | 'light';

const THEME_COLORS: Record<
  OfflineTheme,
  {
    /** Background water paint. */
    ocean: string;
    /** Fill colour applied to continuous landmass. */
    landFill: string;
    /** Thin outline drawn around each continent — the "coastline". */
    coastline: string;
    coastlineWidth: number;
    coastlineOpacity: number;
    /** Interior country border lines drawn on top of the fill. */
    border: string;
    borderWidth: number;
    borderOpacity: number;
  }
> = {
  // Premium dark — deeper ocean, lifted land, crisp coastlines.
  dark: {
    ocean: '#070e1a',
    landFill: '#27344f',
    coastline: '#7a91b4',
    coastlineWidth: 0.85,
    coastlineOpacity: 1,
    border: '#455772',
    borderWidth: 0.5,
    borderOpacity: 0.62,
  },
  // Muted mid-tone — antique chart on parchment.
  muted: {
    ocean: '#172333',
    landFill: '#3a4d68',
    coastline: '#8aa0c0',
    coastlineWidth: 0.85,
    coastlineOpacity: 1,
    border: '#5a6e8a',
    borderWidth: 0.5,
    borderOpacity: 0.6,
  },
  // Minimal light — paper ocean, clearer grey continents.
  light: {
    ocean: '#e4ebf4',
    landFill: '#c5d0e0',
    coastline: '#536480',
    coastlineWidth: 0.75,
    coastlineOpacity: 0.95,
    border: '#8fa0b6',
    borderWidth: 0.45,
    borderOpacity: 0.65,
  },
};

/**
 * Build a MapLibre style from bundled country polygons.
 *
 * Countries are baked into the style JSON as an inline GeoJSON source —
 * MapLibre supports inline `data` on a geojson source, so no separate
 * fetch is needed. The topojson-to-geojson conversion happens once per
 * page load (fast; the file is ~100 KB).
 */
/**
 * The base style is DELIBERATELY minimal — just a background colour.
 *
 * Why not include the country geojson inline as a source?
 *   Prior experiment inlined the 177-feature countries-110m FeatureCollection
 *   directly in the StyleSpecification. On some environments MapLibre never
 *   fired `load` OR `styledata` (with isStyleLoaded === true), leaving the
 *   map showing only the background paint and no continents. Post-mortem:
 *   MapLibre serialises inline geojson to a worker via postMessage on init,
 *   and something in the countries-110m + Turbopack HMR combination
 *   sporadically prevents the source from ever completing that transfer.
 *
 *   Splitting concerns fixes it — the base style is trivial and loads
 *   deterministically, then we add the country source via `addSource()`
 *   in a normal request path after `load` fires. That path uses the same
 *   postMessage under the hood but is much better tested and doesn't
 *   block the initial `load` event either way.
 */
export function buildOfflineWorldStyle(opts: {
  theme: OfflineTheme;
}): StyleSpecification {
  const colors = THEME_COLORS[opts.theme];

  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background-ocean',
        type: 'background',
        paint: { 'background-color': colors.ocean },
      },
    ],
  };
}

/**
 * Natural Earth land topology is cut at the antimeridian (±180°). When
 * `topojson.mesh` walks exterior edges it also emits the artificial
 * "stitch" segments that reconnect those cuts — straight lines spanning
 * nearly 360° of longitude at a nearly-constant latitude (Arctic cuts
 * around 65–72°N, Antarctic around −84/−90°, plus a Pacific wrap near
 * −16°). At world zoom those look exactly like the horizontal grid
 * lines users report; they leave the viewport as soon as you zoom in.
 *
 * Drop any segment whose longitude span is huge but latitude barely
 * changes. Real coastlines never do that in a single segment.
 */
function stripDatelineWrapEdges(
  geometry: GeoJSON.MultiLineString | GeoJSON.LineString | null,
): GeoJSON.MultiLineString | null {
  if (!geometry) return null;

  const MIN_LON_SPAN = 40; // degrees — wrap stitches are ~180–360
  const MAX_LAT_DELTA = 1.25; // degrees — stitches are nearly flat

  const inputLines: [number, number][][] =
    geometry.type === 'LineString'
      ? [geometry.coordinates as [number, number][]]
      : (geometry.coordinates as [number, number][][]);

  const outputLines: [number, number][][] = [];

  for (const line of inputLines) {
    if (line.length < 2) continue;
    let current: [number, number][] = [line[0]!];

    for (let i = 1; i < line.length; i++) {
      const prev = current[current.length - 1]!;
      const pt = line[i]!;
      const dLon = Math.abs(pt[0] - prev[0]);
      const dLat = Math.abs(pt[1] - prev[1]);

      if (dLon > MIN_LON_SPAN && dLat < MAX_LAT_DELTA) {
        // Artificial wrap edge — break the line here and continue.
        if (current.length >= 2) outputLines.push(current);
        current = [pt];
      } else {
        current.push(pt);
      }
    }

    if (current.length >= 2) outputLines.push(current);
  }

  if (outputLines.length === 0) return null;
  return { type: 'MultiLineString', coordinates: outputLines };
}

/**
 * Wrap a topojson.mesh MultiLineString as a one-feature FeatureCollection
 * so MapLibre can consume it as a geojson source.
 *
 * When `stripWrapEdges` is true (coastline meshes), antimeridian stitch
 * segments are removed first — see `stripDatelineWrapEdges`.
 */
function meshToFeatureCollection(
  geometry: GeoJSON.MultiLineString | GeoJSON.LineString | null,
  opts?: { stripWrapEdges?: boolean },
): GeoJSON.FeatureCollection {
  const cleaned = opts?.stripWrapEdges
    ? stripDatelineWrapEdges(geometry)
    : geometry;
  if (!cleaned) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: cleaned,
      },
    ],
  };
}

/**
 * Continuous landmass polygons (no interior country lines) — used to
 * paint the continent FILL. Cached because the topojson→geojson
 * conversion for the 50m dataset costs ~10–20ms on a modern laptop and
 * we don't want to redo it every time the user swaps basemaps.
 */
let cachedLandGeo: GeoJSON.FeatureCollection | null = null;
export function getOfflineLandGeoJson(): GeoJSON.FeatureCollection {
  if (cachedLandGeo) return cachedLandGeo;
  const geo = topojson.feature(
    landTopo as any,
    (landTopo as any).objects.land,
  ) as unknown as GeoJSON.FeatureCollection;
  cachedLandGeo = geo;
  return geo;
}

/**
 * True coastline as MultiLineString via topojson.mesh.
 *
 * CRITICAL: never stroke a fill-polygon source as a MapLibre `line`
 * layer. geojson-vt clips polygons to each tile and the clipped tile
 * edges get stroked as if they were coastlines — that produces the
 * horizontal/vertical "grid lines" and rectangular colour blocks seen
 * at world zoom. Mesh output is real line geometry, so tile clips
 * only truncate lines instead of inventing new edges.
 */
let cachedCoastlineGeo: GeoJSON.FeatureCollection | null = null;
export function getOfflineCoastlineGeoJson(): GeoJSON.FeatureCollection {
  if (cachedCoastlineGeo) return cachedCoastlineGeo;
  const geometry = topojson.mesh(
    landTopo as any,
    (landTopo as any).objects.land,
  ) as GeoJSON.MultiLineString;
  cachedCoastlineGeo = meshToFeatureCollection(geometry, {
    stripWrapEdges: true,
  });
  return cachedCoastlineGeo;
}

/**
 * Interior country borders as MultiLineString (shared edges only).
 * Same rationale as the coastline mesh — must be line geometry, not
 * stroked polygons.
 */
let cachedBordersGeo: GeoJSON.FeatureCollection | null = null;
export function getOfflineBordersGeoJson(): GeoJSON.FeatureCollection {
  if (cachedBordersGeo) return cachedBordersGeo;
  const geometry = topojson.mesh(
    countriesTopo as any,
    (countriesTopo as any).objects.countries,
    (a: unknown, b: unknown) => a !== b,
  ) as GeoJSON.MultiLineString;
  cachedBordersGeo = meshToFeatureCollection(geometry);
  return cachedBordersGeo;
}

/**
 * Per-country polygons — used for label centroid placement, NOT for
 * map stroke layers (see getOfflineBordersGeoJson for that).
 */
let cachedCountriesGeo: GeoJSON.FeatureCollection | null = null;
export function getOfflineCountriesGeoJson(): GeoJSON.FeatureCollection {
  if (cachedCountriesGeo) return cachedCountriesGeo;
  const geo = topojson.feature(
    countriesTopo as any,
    (countriesTopo as any).objects.countries,
  ) as unknown as GeoJSON.FeatureCollection;
  cachedCountriesGeo = geo;
  return geo;
}

// ─── High-detail (1:10 million) progressive upgrade ────────────────────
//
// The bundled 50m data renders the map in <20ms with zero network hit
// (great first paint). But at anything past continent zoom the coastline
// still looks noticeably simplified — Norwegian fjords disappear, the
// Aegean's Cyclades collapse into a single blob, Cornwall's peninsula
// gets clipped. Upgrading the source data to Natural Earth's 1:10m
// dataset fixes all of that at the cost of ~6 MB of extra JSON.
//
// Strategy: keep the sync 50m data as the immediate source for the
// map, then in the background dynamic-import the 10m files and hot-swap
// the source data in place via `setData`. That means:
//   1. The initial JS bundle only contains 50m data (bundle stays lean).
//   2. First paint happens instantly with 50m.
//   3. The user sees the coastline "sharpen" once ~1s later without any
//      camera reset or flicker.
//
// Dynamic-import boundary is important — with a top-level `import` the
// bundler would eagerly include the 10m files, defeating the whole
// purpose. `import()` gives us the code-split entry we want.
let cachedHighDetail: {
  land: GeoJSON.FeatureCollection;
  coastline: GeoJSON.FeatureCollection;
  borders: GeoJSON.FeatureCollection;
} | null = null;

let inflightHighDetail: Promise<{
  land: GeoJSON.FeatureCollection;
  coastline: GeoJSON.FeatureCollection;
  borders: GeoJSON.FeatureCollection;
}> | null = null;

/**
 * Asynchronously load the Natural Earth 1:10 million dataset and
 * return land fill + coastline/border meshes. Cached on first
 * success — the second caller gets the already-parsed data
 * synchronously via the returned promise.
 *
 * Never rejects; on network/parse failure the caller keeps the 50m
 * fallback that was already on the map. That's the whole point of
 * making this a progressive upgrade.
 */
export async function loadHighDetailWorldGeo(): Promise<{
  land: GeoJSON.FeatureCollection;
  coastline: GeoJSON.FeatureCollection;
  borders: GeoJSON.FeatureCollection;
} | null> {
  if (cachedHighDetail) return cachedHighDetail;
  if (inflightHighDetail) return inflightHighDetail;

  inflightHighDetail = (async () => {
    // Two separate dynamic imports so the bundler can code-split each
    // file individually. Both are static-analyzable — the bundler
    // will emit each as its own async chunk.
    const [landModule, countriesModule] = await Promise.all([
      import('world-atlas/land-10m.json'),
      import('world-atlas/countries-10m.json'),
    ]);
    const landTopoHi = (landModule as any).default ?? landModule;
    const countriesTopoHi = (countriesModule as any).default ?? countriesModule;

    const land = topojson.feature(
      landTopoHi,
      landTopoHi.objects.land,
    ) as unknown as GeoJSON.FeatureCollection;
    const coastline = meshToFeatureCollection(
      topojson.mesh(
        landTopoHi,
        landTopoHi.objects.land,
      ) as GeoJSON.MultiLineString,
      { stripWrapEdges: true },
    );
    const borders = meshToFeatureCollection(
      topojson.mesh(
        countriesTopoHi,
        countriesTopoHi.objects.countries,
        (a: unknown, b: unknown) => a !== b,
      ) as GeoJSON.MultiLineString,
    );

    cachedHighDetail = { land, coastline, borders };
    return cachedHighDetail;
  })();

  try {
    return await inflightHighDetail;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[passages-map] high-detail geo load failed', err);
    inflightHighDetail = null;
    return null;
  }
}

/**
 * Layer specs for the offline continent + border overlay, themed to
 * match the current basemap tone.
 *
 * Order (bottom → top):
 *   1. `land-fill`      — solid fill of every continent and island
 *   2. `country-borders`— thin subtle line between countries (mesh)
 *   3. `land-coastline` — coastline mesh around every landmass
 *
 * The caller MUST have first added THREE sources named exactly
 * `offline-land`, `offline-borders`, and `offline-coastline`.
 */
export function getOfflineCountryLayers(opts: {
  theme: OfflineTheme;
}): LayerSpecification[] {
  const colors = THEME_COLORS[opts.theme];
  return [
    {
      id: 'land-fill',
      type: 'fill',
      source: 'offline-land',
      paint: {
        'fill-color': colors.landFill,
        // Opacity MUST be 1 and antialias MUST be false. With
        // fill-opacity < 1, MapLibre's tile buffers overlap and
        // compound into darker rectangular bands / grid seams at
        // world zoom — exactly the artefact users reported.
        'fill-opacity': 1,
        'fill-antialias': false,
      },
    },
    {
      id: 'country-borders',
      type: 'line',
      source: 'offline-borders',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.border,
        // Fade country borders IN gradually — at world zoom (< 2) they
        // just add noise; at continent-plus zoom they become useful
        // political context.
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          1.2, 0,
          2.0, colors.borderOpacity * 0.5,
          3.5, colors.borderOpacity,
          8, colors.borderOpacity * 0.95,
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2, colors.borderWidth * 0.6,
          4, colors.borderWidth,
          7, colors.borderWidth * 1.55,
          11, colors.borderWidth * 2.2,
        ],
      },
    },
    {
      id: 'land-coastline',
      type: 'line',
      source: 'offline-coastline',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colors.coastline,
        'line-opacity': colors.coastlineOpacity,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, colors.coastlineWidth * 0.7,
          2, colors.coastlineWidth,
          4, colors.coastlineWidth * 1.25,
          7, colors.coastlineWidth * 1.85,
          10, colors.coastlineWidth * 2.6,
          13, colors.coastlineWidth * 3.2,
        ],
      },
    },
  ];
}

/**
 * Which theme tone maps to which `OfflineTheme` in the page-level
 * `MAP_STYLES` record. Exported so the canvas can pass the current
 * theme to `getOfflineCountryLayers()` when the user swaps basemaps.
 */
export const OFFLINE_THEME_FOR_STYLE: Record<string, OfflineTheme> = {
  'deep-sea': 'dark',
  atlas: 'muted',
  chart: 'light',
};
