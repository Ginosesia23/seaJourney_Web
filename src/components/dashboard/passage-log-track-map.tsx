'use client';

/**
 * Passage Log Book expand-panel map cutout.
 *
 * Same MapLibre offline basemap + track paint language as Passage Tracks /
 * voyage-map, fitted tightly around one passage so you see the local chart
 * context. Theme follows the site light/dark setting.
 */

import {
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTheme } from 'next-themes';
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2, Map as MapIcon } from 'lucide-react';

import {
  buildOfflineWorldStyle,
  getOfflineBordersGeoJson,
  getOfflineCoastlineGeoJson,
  getOfflineCountryLayers,
  getOfflineLandGeoJson,
  type OfflineTheme,
} from '@/lib/passages-map/build-offline-style';
import {
  ensurePassageArrowImage,
  PASSAGE_ARROW_IMAGE_ID,
} from '@/lib/passages-map/passage-icons';
import { installRemoteChartDetail } from '@/lib/passages-map/remote-chart-detail';
import { ensureMaplibreWorkerConfigured } from '@/lib/passages-map/setup-maplibre-worker';
import type { PassageLog } from '@/lib/types';
import { cn } from '@/lib/utils';

const SOURCE_ID = 'logbook-passage';
const ENDPOINTS_ID = `${SOURCE_ID}:endpoints`;
/** Same sky accent used for live/selected tracks on Passage Tracks. */
const TRACK_COLOR = '#0ea5e9';

/** Same OpenFreeMap styles Passage Tracks upgrades to for local detail. */
const REMOTE_STYLE_BY_THEME = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
} as const;

const OFFLINE_MAX_ZOOM = 9;
const REMOTE_MAX_ZOOM = 15;
const CUTOUT_MAX_ZOOM_OFFLINE = 8.5;
const CUTOUT_MAX_ZOOM_REMOTE = 13;
const REMOTE_UPGRADE_TIMEOUT_MS = 8000;

const TRACK_PAINT = {
  dark: {
    lineOpacity: 0.97,
    glowOpacity: 0.28,
    glowBlur: 2.4,
    lineWidthLow: 2.1,
    lineWidthHigh: 4.4,
    glowWidthLow: 6,
    glowWidthHigh: 13,
    casingColor: '#020617',
    casingOpacity: 0.88,
    casingExtra: 2.6,
    sheenColor: '#ffffff',
    sheenOpacity: 0.28,
    endpointStroke: '#f8fafc',
  },
  light: {
    lineOpacity: 0.94,
    glowOpacity: 0.2,
    glowBlur: 1.8,
    lineWidthLow: 2.0,
    lineWidthHigh: 4.0,
    glowWidthLow: 5,
    glowWidthHigh: 11,
    casingColor: '#f8fafc',
    casingOpacity: 0.98,
    casingExtra: 2.7,
    sheenColor: '#ffffff',
    sheenOpacity: 0.35,
    endpointStroke: '#0f172a',
  },
} as const;

function widthAtZoom(low: number, high: number): unknown {
  return ['interpolate', ['exponential', 1.5], ['zoom'], 0, low, 10, high];
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asLonLat(c: unknown): [number, number] | null {
  if (!Array.isArray(c) || c.length < 2) return null;
  const lon = toFiniteNumber(c[0]);
  const lat = toFiniteNumber(c[1]);
  if (lon == null || lat == null) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

/** Prefer AIS track polyline; fall back to departure → arrival points. */
export function resolvePassageTrackCoordinates(
  passage: Pick<
    PassageLog,
    | 'track_data'
    | 'departure_lat'
    | 'departure_lon'
    | 'arrival_lat'
    | 'arrival_lon'
  >,
): [number, number][] | null {
  const td = passage.track_data as Record<string, unknown> | null | undefined;

  const fromArray = (raw: unknown): [number, number][] | null => {
    if (!Array.isArray(raw)) return null;
    const coords = raw.map(asLonLat).filter((c): c is [number, number] => !!c);
    return coords.length >= 2 ? coords : null;
  };

  const direct = fromArray(td?.coordinates);
  if (direct) return direct;

  const geom = td?.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (geom?.type === 'LineString') {
    const nested = fromArray(geom.coordinates);
    if (nested) return nested;
  }

  const dLat = toFiniteNumber(passage.departure_lat);
  const dLon = toFiniteNumber(passage.departure_lon);
  const aLat = toFiniteNumber(passage.arrival_lat);
  const aLon = toFiniteNumber(passage.arrival_lon);

  if (dLat != null && dLon != null && aLat != null && aLon != null) {
    if (dLon === aLon && dLat === aLat) return [[dLon, dLat]];
    return [
      [dLon, dLat],
      [aLon, aLat],
    ];
  }

  return null;
}

function bboxOfCoords(
  coords: [number, number][],
): [number, number, number, number] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon)) return null;
  if (maxLon - minLon < 0.04) {
    minLon -= 0.12;
    maxLon += 0.12;
  }
  if (maxLat - minLat < 0.04) {
    minLat -= 0.1;
    maxLat += 0.1;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function lineFC(coords: [number, number][]): GeoJSON.FeatureCollection {
  if (coords.length < 2) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  };
}

function endpointsFC(coords: [number, number][]): GeoJSON.FeatureCollection {
  if (!coords.length) return { type: 'FeatureCollection', features: [] };
  const features: GeoJSON.Feature[] = [
    {
      type: 'Feature',
      properties: { kind: 'start' },
      geometry: { type: 'Point', coordinates: coords[0]! },
    },
  ];
  if (coords.length > 1) {
    features.push({
      type: 'Feature',
      properties: { kind: 'end' },
      geometry: { type: 'Point', coordinates: coords[coords.length - 1]! },
    });
  }
  return { type: 'FeatureCollection', features };
}

function installOfflineBasemap(map: MapLibreMap, theme: OfflineTheme) {
  if (!map.getSource('offline-land')) {
    map.addSource('offline-land', {
      type: 'geojson',
      data: getOfflineLandGeoJson(),
      buffer: 64,
      tolerance: 0.1,
    });
  }
  if (!map.getSource('offline-coastline')) {
    map.addSource('offline-coastline', {
      type: 'geojson',
      data: getOfflineCoastlineGeoJson(),
      buffer: 64,
      tolerance: 0.1,
    });
  }
  if (!map.getSource('offline-borders')) {
    map.addSource('offline-borders', {
      type: 'geojson',
      data: getOfflineBordersGeoJson(),
      buffer: 64,
      tolerance: 0.1,
    });
  }
  for (const layer of getOfflineCountryLayers({ theme })) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
}

function installTrackLayers(
  map: MapLibreMap,
  tone: 'dark' | 'light',
) {
  const paint = TRACK_PAINT[tone];
  ensurePassageArrowImage(map);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getSource(ENDPOINTS_ID)) {
    map.addSource(ENDPOINTS_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  const addIfMissing = (id: string, layer: any) => {
    if (!map.getLayer(id)) map.addLayer(layer);
  };

  addIfMissing(`${SOURCE_ID}:glow`, {
    id: `${SOURCE_ID}:glow`,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': TRACK_COLOR,
      'line-opacity': paint.glowOpacity,
      'line-blur': paint.glowBlur,
      'line-width': widthAtZoom(paint.glowWidthLow, paint.glowWidthHigh),
    },
  });
  addIfMissing(`${SOURCE_ID}:casing`, {
    id: `${SOURCE_ID}:casing`,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': paint.casingColor,
      'line-opacity': paint.casingOpacity,
      'line-width': widthAtZoom(
        paint.lineWidthLow + paint.casingExtra,
        paint.lineWidthHigh + paint.casingExtra,
      ),
    },
  });
  addIfMissing(`${SOURCE_ID}:line`, {
    id: `${SOURCE_ID}:line`,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': TRACK_COLOR,
      'line-opacity': paint.lineOpacity,
      'line-width': widthAtZoom(paint.lineWidthLow, paint.lineWidthHigh),
    },
  });
  addIfMissing(`${SOURCE_ID}:sheen`, {
    id: `${SOURCE_ID}:sheen`,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': paint.sheenColor,
      'line-opacity': paint.sheenOpacity,
      'line-width': widthAtZoom(
        paint.lineWidthLow * 0.35,
        paint.lineWidthHigh * 0.35,
      ),
    },
  });
  addIfMissing(`${SOURCE_ID}:arrows`, {
    id: `${SOURCE_ID}:arrows`,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 64,
      'icon-image': PASSAGE_ARROW_IMAGE_ID,
      'icon-size': 0.55,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-color': TRACK_COLOR,
      'icon-opacity': 0.92,
    },
  });
  addIfMissing(`${SOURCE_ID}:endpoint-halo`, {
    id: `${SOURCE_ID}:endpoint-halo`,
    type: 'circle',
    source: ENDPOINTS_ID,
    paint: {
      'circle-radius': 9,
      'circle-color': TRACK_COLOR,
      'circle-opacity': 0.22,
    },
  });
  addIfMissing(`${SOURCE_ID}:endpoint-fill`, {
    id: `${SOURCE_ID}:endpoint-fill`,
    type: 'circle',
    source: ENDPOINTS_ID,
    paint: {
      'circle-radius': 5,
      'circle-color': [
        'match',
        ['get', 'kind'],
        'start',
        '#22c55e',
        'end',
        '#ef4444',
        TRACK_COLOR,
      ],
      'circle-stroke-width': 1.6,
      'circle-stroke-color': paint.endpointStroke,
    },
  });
}

function fitCutout(
  map: MapLibreMap,
  coords: [number, number][],
  maxZoom = CUTOUT_MAX_ZOOM_OFFLINE,
) {
  const bbox = bboxOfCoords(coords);
  if (!bbox) return;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const padLon = Math.max((maxLon - minLon) * 0.18, 0.03);
  const padLat = Math.max((maxLat - minLat) * 0.18, 0.025);
  map.fitBounds(
    [
      [minLon - padLon, minLat - padLat],
      [maxLon + padLon, maxLat + padLat],
    ],
    {
      padding: 36,
      duration: 0,
      maxZoom,
      minZoom: 3,
    },
  );
}

function paintPassage(
  map: MapLibreMap,
  coords: [number, number][],
  tone: 'dark' | 'light',
  detail: 'offline' | 'remote' = 'offline',
) {
  installTrackLayers(map, tone);
  const lineSrc = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  const endSrc = map.getSource(ENDPOINTS_ID) as GeoJSONSource | undefined;
  lineSrc?.setData(lineFC(coords) as any);
  endSrc?.setData(endpointsFC(coords) as any);
  if (detail === 'remote') {
    try {
      installRemoteChartDetail(map, tone);
    } catch {
      /* harbour layers optional */
    }
  }
  fitCutout(
    map,
    coords,
    detail === 'remote' ? CUTOUT_MAX_ZOOM_REMOTE : CUTOUT_MAX_ZOOM_OFFLINE,
  );
}

export function PassageLogTrackMap({
  coordinates,
  className,
  heightClassName = 'h-72 sm:h-80',
}: {
  coordinates: [number, number][] | null;
  className?: string;
  heightClassName?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const offlineTheme: OfflineTheme = isDark ? 'dark' : 'light';
  const tone: 'dark' | 'light' = isDark ? 'dark' : 'light';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const coordsRef = useRef(coordinates);
  const toneRef = useRef(tone);
  const detailTierRef = useRef<'offline' | 'remote'>('offline');
  coordsRef.current = coordinates;
  toneRef.current = tone;

  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const coordsKey = useMemo(
    () =>
      coordinates?.length
        ? `${coordinates.length}:${coordinates[0]?.join(',')}:${coordinates[coordinates.length - 1]?.join(',')}`
        : '',
    [coordinates],
  );

  // Same deferred boot pattern as Passage Tracks — never hand MapLibre a
  // 0×0 container inside a freshly expanded table row.
  useLayoutEffect(() => {
    if (!mounted || !coordinates?.length) return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let raf = 0;
    let attempts = 0;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let upgradeAbort: AbortController | null = null;

    ensureMaplibreWorkerConfigured();
    detailTierRef.current = 'offline';

    const repaint = (map: MapLibreMap) => {
      const coords = coordsRef.current;
      if (!coords?.length) return;
      paintPassage(map, coords, toneRef.current, detailTierRef.current);
    };

    const tryRemoteUpgrade = (map: MapLibreMap) => {
      const remoteUrl = REMOTE_STYLE_BY_THEME[toneRef.current];
      upgradeAbort?.abort();
      const controller = new AbortController();
      upgradeAbort = controller;
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        REMOTE_UPGRADE_TIMEOUT_MS,
      );

      fetch(remoteUrl, { signal: controller.signal, mode: 'cors' })
        .then((res) => {
          window.clearTimeout(timeoutId);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (cancelled || mapRef.current !== map) return;
          detailTierRef.current = 'remote';
          map.setMaxZoom(REMOTE_MAX_ZOOM);
          map.setStyle(remoteUrl);
        })
        .catch((err) => {
          window.clearTimeout(timeoutId);
          if (controller.signal.aborted) return;
          console.info(
            '[passage-log-track-map] remote tiles unavailable — staying offline',
            err?.message ?? String(err),
          );
        });
    };

    const boot = () => {
      if (cancelled || mapRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 8 || h < 8) {
        attempts += 1;
        if (attempts < 40) {
          raf = requestAnimationFrame(boot);
          return;
        }
      }

      const map = new MapLibreMap({
        container,
        style: buildOfflineWorldStyle({ theme: offlineTheme }),
        center: coordinates[Math.floor(coordinates.length / 2)] ?? [0, 20],
        zoom: 4,
        minZoom: 1,
        maxZoom: OFFLINE_MAX_ZOOM,
        fadeDuration: 200,
        renderWorldCopies: false,
        attributionControl: false,
        cooperativeGestures: true,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      mapRef.current = map;

      map.addControl(
        new NavigationControl({ showCompass: false, visualizePitch: false }),
        'top-right',
      );
      map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

      const onStyleReady = () => {
        if (cancelled || mapRef.current !== map) return;
        map.resize();
        try {
          if (detailTierRef.current === 'offline') {
            installOfflineBasemap(map, offlineTheme);
          }
          repaint(map);
          setReady(true);
        } catch (err) {
          console.warn('[passage-log-track-map] style ready failed', err);
        }
      };

      map.on('load', () => {
        onStyleReady();
        // Upgrade to the same high-detail OpenFreeMap tiles as Passage Tracks.
        tryRemoteUpgrade(map);
        timers.push(
          setTimeout(() => {
            if (cancelled || !mapRef.current) return;
            map.resize();
            repaint(map);
          }, 120),
          setTimeout(() => {
            if (cancelled || !mapRef.current) return;
            map.resize();
            repaint(map);
          }, 400),
        );
      });

      // setStyle() (remote upgrade) clears overlays — reattach on every
      // finished style rebuild, same as Passage Tracks.
      map.on('styledata', () => {
        if (cancelled || !map.isStyleLoaded()) return;
        onStyleReady();
      });

      map.on('error', (e: { error?: { message?: string }; message?: string }) => {
        console.warn(
          '[passage-log-track-map]',
          e?.error?.message ?? e?.message,
        );
      });
    };

    raf = requestAnimationFrame(boot);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      upgradeAbort?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [coordsKey, offlineTheme, mounted, coordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !coordinates?.length) return;
    try {
      paintPassage(map, coordinates, tone, detailTierRef.current);
      map.resize();
    } catch {
      /* ignore */
    }
  }, [coordsKey, ready, coordinates, tone]);

  if (!coordinates?.length) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center',
          heightClassName,
          className,
        )}
      >
        <MapIcon className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No track geometry for this passage yet.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          AIS-linked passages show the chart cutout here.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'passage-log-track-map relative isolate overflow-hidden rounded-xl border border-border',
        isDark ? 'bg-[#040b16]' : 'bg-[#d5e4f2]',
        heightClassName,
        className,
      )}
    >
      {/* Explicitly sized map host — Passage Tracks boots against this pattern */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      {!ready && (
        <div
          className={cn(
            'absolute inset-0 z-10 flex items-center justify-center',
            isDark ? 'bg-[#040b16]/80' : 'bg-[#d5e4f2]/80',
          )}
        >
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-3 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Start
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" /> End
        </span>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .passage-log-track-map .maplibregl-ctrl-group {
              background: ${isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)'};
              border: 1px solid ${isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.12)'};
              box-shadow: none;
            }
            .passage-log-track-map .maplibregl-ctrl-group button span {
              filter: ${isDark ? 'invert(1) brightness(1.2)' : 'none'};
            }
            .passage-log-track-map .maplibregl-ctrl-attrib {
              background: ${isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.8)'};
              color: ${isDark ? '#94a3b8' : '#64748b'};
            }
          `,
        }}
      />
    </div>
  );
}
