/**
 * Remote-tile chart detail for the Passages Map (OpenFreeMap / OpenMapTiles):
 *   - Sharper water/land coastline stroke
 *   - Harbour & marina POIs that appear when zoomed in
 *
 * No-ops when the openmaptiles vector source is absent (offline style).
 */

import type { Map as MapLibreMap } from 'maplibre-gl';

import type { OfflineTheme } from './build-offline-style';

const COAST_LAYER = 'sj-water-coast';
const HARBOUR_AREA = 'sj-harbour-area';
export const HARBOUR_DOTS_LAYER = 'sj-harbour-dots';
export const HARBOUR_LABELS_LAYER = 'sj-harbour-labels';
const HARBOUR_DOTS = HARBOUR_DOTS_LAYER;
const HARBOUR_LABELS = HARBOUR_LABELS_LAYER;

const HARBOUR_FILTER: unknown[] = [
  'any',
  ['==', ['get', 'class'], 'harbor'],
  ['==', ['get', 'class'], 'marina'],
  ['==', ['get', 'class'], 'ferry_terminal'],
  [
    'in',
    ['get', 'subclass'],
    [
      'literal',
      ['marina', 'dock', 'harbour', 'harbor', 'ferry_terminal', 'boatyard'],
    ],
  ],
];

const HARBOUR_LANDUSE_FILTER: unknown[] = [
  'any',
  ['==', ['get', 'class'], 'harbour'],
  ['==', ['get', 'class'], 'harbor'],
  ['==', ['get', 'class'], 'marina'],
];

function openmaptilesSourceId(map: MapLibreMap): string | null {
  const style = map.getStyle();
  if (!style?.sources) return null;
  for (const [id, src] of Object.entries(style.sources)) {
    if ((src as { type?: string }).type !== 'vector') continue;
    const url = String((src as { url?: string }).url ?? '');
    const tiles = (src as { tiles?: string[] }).tiles ?? [];
    const tileHint = tiles.join(' ');
    if (
      id === 'openmaptiles' ||
      url.includes('openfreemap') ||
      url.includes('openmaptiles') ||
      tileHint.includes('openfreemap') ||
      tileHint.includes('openmaptiles')
    ) {
      return id;
    }
  }
  return null;
}

/** True when the current style has OpenMapTiles / OpenFreeMap vector sources. */
export function hasRemoteVectorTiles(map: MapLibreMap): boolean {
  return openmaptilesSourceId(map) != null;
}

function coastColor(theme: OfflineTheme): string {
  if (theme === 'light') return '#3d5570';
  if (theme === 'muted') return '#a7bdd8';
  return '#9bb0cf';
}

function harbourFill(theme: OfflineTheme): string {
  if (theme === 'light') return '#0284c7';
  return '#7dd3fc';
}

function harbourText(theme: OfflineTheme): string {
  if (theme === 'light') return 'rgba(3, 105, 161, 0.92)';
  if (theme === 'muted') return 'rgba(186, 230, 253, 0.88)';
  return 'rgba(186, 230, 253, 0.9)';
}

function harbourHalo(theme: OfflineTheme): string {
  if (theme === 'light') return 'rgba(255, 255, 255, 0.85)';
  return 'rgba(4, 12, 24, 0.85)';
}

function beforeRoadsId(map: MapLibreMap): string | undefined {
  for (const id of [
    'building',
    'highway_path',
    'highway_minor',
    'aeroway-area',
  ]) {
    if (map.getLayer(id)) return id;
  }
  const style = map.getStyle();
  return style?.layers?.find((l) => l.type === 'symbol')?.id;
}

/**
 * Install / refresh coastline outline + harbour/marina POIs on remote tiles.
 */
export function installRemoteChartDetail(
  map: MapLibreMap,
  theme: OfflineTheme,
): void {
  const sourceId = openmaptilesSourceId(map);
  if (!sourceId || !map.isStyleLoaded()) {
    removeRemoteChartDetail(map);
    return;
  }

  // Soften the stock water fill edge, then add our own stroke for detail.
  try {
    if (map.getLayer('water')) {
      map.setPaintProperty('water', 'fill-antialias', true);
      map.setPaintProperty('water', 'fill-outline-color', coastColor(theme));
    }
  } catch {
    /* ignore */
  }

  const beforeId = beforeRoadsId(map);

  if (map.getLayer(COAST_LAYER)) {
    map.setPaintProperty(COAST_LAYER, 'line-color', coastColor(theme));
  } else {
    map.addLayer(
      {
        id: COAST_LAYER,
        type: 'line',
        source: sourceId,
        'source-layer': 'water',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': coastColor(theme),
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1, 0.55,
            3, 0.8,
            6, 0.92,
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1, 0.4,
            4, 0.75,
            7, 1.3,
            10, 1.95,
            13, 2.6,
          ],
        },
      },
      beforeId,
    );
  }

  // Harbour / marina basins from landuse (fills in dock shapes when zoomed).
  if (map.getLayer(HARBOUR_AREA)) {
    map.setPaintProperty(HARBOUR_AREA, 'fill-color', harbourFill(theme));
  } else {
    map.addLayer(
      {
        id: HARBOUR_AREA,
        type: 'fill',
        source: sourceId,
        'source-layer': 'landuse',
        minzoom: 9,
        filter: HARBOUR_LANDUSE_FILTER as any,
        paint: {
          'fill-color': harbourFill(theme),
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 0.12,
            12, 0.22,
            14, 0.28,
          ],
        },
      },
      beforeId,
    );
  }

  if (map.getLayer(HARBOUR_DOTS)) {
    map.setPaintProperty(HARBOUR_DOTS, 'circle-color', harbourFill(theme));
  } else {
    map.addLayer({
      id: HARBOUR_DOTS,
      type: 'circle',
      source: sourceId,
      'source-layer': 'poi',
      minzoom: 7,
      filter: HARBOUR_FILTER as any,
      paint: {
        'circle-color': harbourFill(theme),
        'circle-stroke-color':
          theme === 'light' ? '#ffffff' : 'rgba(15, 23, 42, 0.9)',
        'circle-stroke-width': 1.1,
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 2.0,
          10, 3.2,
          13, 4.2,
        ],
        'circle-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 0.5,
          9, 0.95,
        ],
      },
    });
  }

  if (map.getLayer(HARBOUR_LABELS)) {
    map.setPaintProperty(HARBOUR_LABELS, 'text-color', harbourText(theme));
    map.setPaintProperty(HARBOUR_LABELS, 'text-halo-color', harbourHalo(theme));
  } else {
    map.addLayer({
      id: HARBOUR_LABELS,
      type: 'symbol',
      source: sourceId,
      'source-layer': 'poi',
      minzoom: 8.5,
      filter: [
        'all',
        HARBOUR_FILTER,
        ['has', 'name'],
        ['!=', ['get', 'name'], ''],
      ] as any,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8.5, 10,
          12, 12,
          14, 13,
        ],
        'text-offset': [0, 0.95],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-padding': 2,
        'text-optional': true,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint: {
        'text-color': harbourText(theme),
        'text-halo-color': harbourHalo(theme),
        'text-halo-width': 1.25,
      },
    });
  }
}

export function removeRemoteChartDetail(map: MapLibreMap): void {
  for (const id of [HARBOUR_LABELS, HARBOUR_DOTS, HARBOUR_AREA, COAST_LAYER]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* ignore */
    }
  }
}

/** Read a harbour / marina display name from an OpenMapTiles POI feature. */
export function harbourFeatureName(feat: {
  properties?: Record<string, unknown> | null;
}): string | null {
  const props = feat.properties ?? {};
  const name = props.name ?? props.name_en ?? props.name_int;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const subclass = props.subclass ?? props.class;
  if (typeof subclass === 'string' && subclass.trim()) {
    const pretty = subclass.replace(/_/g, ' ');
    return pretty.charAt(0).toUpperCase() + pretty.slice(1);
  }
  return null;
}

export function harbourHoverHtml(name: string, kind?: string | null): string {
  const kindLabel =
    kind === 'marina'
      ? 'Marina'
      : kind === 'harbour' || kind === 'harbor'
        ? 'Harbour'
        : kind === 'ferry_terminal'
          ? 'Ferry'
          : kind === 'dock'
            ? 'Dock'
            : null;
  return `<div class="passages-harbour-tip">
    <div class="passages-harbour-tip__name">${escapeHtml(name)}</div>
    ${kindLabel ? `<div class="passages-harbour-tip__kind">${kindLabel}</div>` : ''}
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const HARBOUR_POPUP_STYLE = `
  .passages-harbour-tip {
    padding: 2px 2px 0;
    min-width: 0;
  }
  .passages-harbour-tip__name {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: rgba(241, 245, 249, 0.95);
    line-height: 1.25;
  }
  .passages-harbour-tip__kind {
    margin-top: 2px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(125, 211, 252, 0.75);
  }
`;
