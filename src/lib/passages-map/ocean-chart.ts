/**
 * Chart overlays for the Passages Map.
 *
 * Ocean bathymetry (Open Waters / GEBCO) is Deep Sea only — Atlas/Chart
 * stay flat. Source maxzoom is capped low so tiles overzoom instead of
 * loading a flickering mid-zoom patchwork; opacity fades out before
 * harbour scale where seams fought the shoreline.
 *
 * Ocean names live in `map-labels.ts` (curated HTML markers).
 */

import type { Map as MapLibreMap } from 'maplibre-gl';

import type { OfflineTheme } from './build-offline-style';

const BATHYMETRY_SOURCE = 'sj-bathymetry-dem';
const BATHYMETRY_LAYER = 'sj-bathymetry-depth';
const BATHYMETRY_TILEJSON = 'https://tiles.openwaters.io/seascape/raster.json';

/** Cap DEM requests low — overzoom is smoother than a z7–8 mosaic. */
const BATHYMETRY_SOURCE_MAXZOOM = 5;

const LEGACY_LAYER_IDS = [
  'sj-ne2-relief',
  'sj-land-elevation',
  'sj-land-hillshade',
] as const;
const LEGACY_SOURCE_IDS = ['sj-ne2-relief', 'sj-land-dem'] as const;

const OVERLAY_PROBE_MS = 4_000;

function depthColorRamp(): unknown[] {
  // Deep Sea only — abyss ink → shelf sky, shore fades to clear.
  return [
    'interpolate',
    ['linear'],
    ['elevation'],
    -11000, '#02060e',
    -6000, '#040d1a',
    -3000, '#081628',
    -1000, '#0e2240',
    -200, '#153458',
    -80, '#1e4a74',
    -40, 'rgba(40, 96, 144, 0.75)',
    -20, 'rgba(52, 120, 168, 0.4)',
    -8, 'rgba(66, 144, 190, 0.12)',
    -0.05, 'rgba(0,0,0,0)',
    0, 'rgba(0,0,0,0)',
    2, 'rgba(0,0,0,0)',
  ];
}

/** Soft at ocean zoom; fully clear by ~z6.5 to avoid shoreline seams. */
function bathymetryOpacityByZoom(): unknown[] {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    0, 0.72,
    2.5, 0.72,
    4.5, 0.5,
    5.5, 0.22,
    6.5, 0,
  ];
}

function beforeIdForBathymetry(map: MapLibreMap): string | undefined {
  for (const id of [
    'land-fill',
    'land-coastline-halo',
    'land-coastline',
    'country-borders',
    'building',
    'highway_path',
    'highway_minor',
    'aeroway-area',
  ]) {
    if (map.getLayer(id)) return id;
  }
  const style = map.getStyle();
  const firstSymbol = style?.layers?.find((l) => l.type === 'symbol');
  return firstSymbol?.id;
}

let installInflight: Promise<void> | null = null;

/**
 * Deep Sea → install bathymetry. Atlas/Chart → remove it.
 * Idempotent; coalesces concurrent calls.
 */
export async function installChartOverlays(
  map: MapLibreMap,
  theme: OfflineTheme,
): Promise<void> {
  tearDownLegacyOverlays(map);

  if (theme !== 'dark') {
    removeBathymetry(map);
    return;
  }

  if (installInflight) {
    await installInflight;
    applyBathymetryPaint(map);
    return;
  }

  installInflight = installBathymetryDepthShading(map).then(() => {
    /* done */
  });
  try {
    await installInflight;
  } finally {
    installInflight = null;
  }
}

function applyBathymetryPaint(map: MapLibreMap): void {
  if (!map.getLayer(BATHYMETRY_LAYER)) return;
  try {
    map.setPaintProperty(
      BATHYMETRY_LAYER,
      'color-relief-color',
      depthColorRamp() as any,
    );
    map.setPaintProperty(
      BATHYMETRY_LAYER,
      'color-relief-opacity',
      bathymetryOpacityByZoom() as any,
    );
  } catch {
    /* ignore */
  }
}

async function installBathymetryDepthShading(map: MapLibreMap): Promise<boolean> {
  try {
    if (!map.getSource(BATHYMETRY_SOURCE)) {
      const ok = await probeUrl(BATHYMETRY_TILEJSON);
      if (!ok) return false;
      if (!map.getStyle() || !map.isStyleLoaded()) return false;
      if (!map.getSource(BATHYMETRY_SOURCE)) {
        map.addSource(BATHYMETRY_SOURCE, {
          type: 'raster-dem',
          url: BATHYMETRY_TILEJSON,
          encoding: 'terrarium',
          tileSize: 512,
          maxzoom: BATHYMETRY_SOURCE_MAXZOOM,
        });
      }
    }

    if (map.getLayer(BATHYMETRY_LAYER)) {
      applyBathymetryPaint(map);
      return true;
    }

    map.addLayer(
      {
        id: BATHYMETRY_LAYER,
        type: 'color-relief',
        source: BATHYMETRY_SOURCE,
        paint: {
          'color-relief-color': depthColorRamp() as any,
          'color-relief-opacity': bathymetryOpacityByZoom() as any,
        },
      },
      beforeIdForBathymetry(map),
    );
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.info('[passages-map] bathymetry unavailable', err);
    return false;
  }
}

function removeBathymetry(map: MapLibreMap): void {
  try {
    if (map.getLayer(BATHYMETRY_LAYER)) map.removeLayer(BATHYMETRY_LAYER);
  } catch {
    /* ignore */
  }
  try {
    if (map.getSource(BATHYMETRY_SOURCE)) map.removeSource(BATHYMETRY_SOURCE);
  } catch {
    /* ignore */
  }
}

function tearDownLegacyOverlays(map: MapLibreMap): void {
  for (const id of LEGACY_LAYER_IDS) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* ignore */
    }
  }
  for (const id of LEGACY_SOURCE_IDS) {
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch {
      /* ignore */
    }
  }
}

const probeCache = new Map<string, Promise<boolean>>();

function probeUrl(url: string): Promise<boolean> {
  const cached = probeCache.get(url);
  if (cached) return cached;
  const p = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), OVERLAY_PROBE_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
      return res.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  })();
  probeCache.set(url, p);
  p.then((ok) => {
    if (!ok) probeCache.delete(url);
  });
  return p;
}

/** Tear down all chart overlays (style swap / unmount). */
export function removeChartOverlays(map: MapLibreMap): void {
  tearDownLegacyOverlays(map);
  removeBathymetry(map);
}

/** @deprecated Use removeChartOverlays */
export function removeBathymetryDepthShading(map: MapLibreMap): void {
  removeChartOverlays(map);
}

export type OceanLabel = {
  name: string;
  lon: number;
  lat: number;
  /** 1 = oceans (early), 2 = major seas, 3 = regional seas/gulfs */
  tier: 1 | 2 | 3;
};

/** Curated ocean / sea labels. Positions sit in open water. */
export const MAJOR_OCEAN_LABELS: OceanLabel[] = [
  { name: 'Pacific Ocean', lon: -150, lat: 0, tier: 1 },
  { name: 'Atlantic Ocean', lon: -30, lat: 5, tier: 1 },
  { name: 'Indian Ocean', lon: 75, lat: -15, tier: 1 },
  { name: 'Southern Ocean', lon: 0, lat: -60, tier: 1 },
  { name: 'Arctic Ocean', lon: 0, lat: 78, tier: 1 },
  { name: 'Mediterranean Sea', lon: 18, lat: 35.5, tier: 2 },
  { name: 'Caribbean Sea', lon: -72, lat: 15, tier: 2 },
  { name: 'South China Sea', lon: 115, lat: 12, tier: 2 },
  { name: 'Bering Sea', lon: -175, lat: 58, tier: 2 },
  { name: 'Arabian Sea', lon: 62, lat: 15, tier: 2 },
  { name: 'Bay of Bengal', lon: 88, lat: 15, tier: 2 },
  { name: 'North Sea', lon: 3, lat: 56, tier: 2 },
  { name: 'Coral Sea', lon: 155, lat: -18, tier: 2 },
  { name: 'Gulf of Mexico', lon: -90, lat: 25, tier: 2 },
  { name: 'Sea of Okhotsk', lon: 150, lat: 53, tier: 2 },
  { name: 'Baltic Sea', lon: 19, lat: 58, tier: 3 },
  { name: 'Red Sea', lon: 38, lat: 20, tier: 3 },
  { name: 'Black Sea', lon: 34, lat: 43, tier: 3 },
  { name: 'Tasman Sea', lon: 160, lat: -38, tier: 3 },
  { name: 'Persian Gulf', lon: 52, lat: 26, tier: 3 },
  { name: 'Sea of Japan', lon: 135, lat: 39, tier: 3 },
  { name: 'Andaman Sea', lon: 96, lat: 10, tier: 3 },
  { name: 'Philippine Sea', lon: 140, lat: 18, tier: 3 },
  { name: 'Norwegian Sea', lon: 2, lat: 66, tier: 3 },
  { name: 'Labrador Sea', lon: -55, lat: 58, tier: 3 },
  { name: 'Celtic Sea', lon: -8, lat: 50, tier: 3 },
  { name: 'Aegean Sea', lon: 25, lat: 37.5, tier: 3 },
  { name: 'Adriatic Sea', lon: 16, lat: 42.5, tier: 3 },
];
