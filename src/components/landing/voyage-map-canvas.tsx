'use client';

/**
 * Public demo MapLibre canvas for /voyage-map.
 * Uses the same offline basemap + track paint language as the dashboard
 * passages map, but only ever loads anonymised sample GeoJSON.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  Popup,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Eye, EyeOff, Loader2, Ship } from 'lucide-react';
import {
  DEMO_PASSAGE_VESSELS,
  type DemoPassageVessel,
} from '@/data/demo-passage-tracks';
import {
  buildOfflineWorldStyle,
  getOfflineBordersGeoJson,
  getOfflineCoastlineGeoJson,
  getOfflineCountryLayers,
  getOfflineLandGeoJson,
} from '@/lib/passages-map/build-offline-style';
import { ensurePassageArrowImage, PASSAGE_ARROW_IMAGE_ID } from '@/lib/passages-map/passage-icons';
import {
  PASSAGE_POPUP_STYLE,
  renderPassagePopupHtml,
} from '@/lib/passages-map/passage-popup-content';
import { ensureMaplibreWorkerConfigured } from '@/lib/passages-map/setup-maplibre-worker';
import { cn } from '@/lib/utils';

const TRACK_PAINT = {
  lineOpacity: 0.97,
  glowOpacity: 0.28,
  glowBlur: 2.4,
  lineWidthLow: 1.85,
  lineWidthHigh: 4.0,
  glowWidthLow: 5.5,
  glowWidthHigh: 12,
  casingColor: '#020617',
  casingOpacity: 0.88,
  casingExtra: 2.6,
  sheenColor: '#ffffff',
  sheenOpacity: 0.28,
  endpointColor: '#f8fafc',
};

function widthAtZoom(low: number, high: number): unknown {
  return [
    'interpolate',
    ['exponential', 1.5],
    ['zoom'],
    0,
    low,
    10,
    high,
  ];
}

function bboxOfVessels(vessels: DemoPassageVessel[]): [number, number, number, number] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let any = false;
  for (const v of vessels) {
    for (const f of v.featureCollection.features) {
      for (const [lon, lat] of f.geometry.coordinates) {
        any = true;
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (!any) return null;
  return [minLon, minLat, maxLon, maxLat];
}

function deriveEndpoints(
  fc: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== 'LineString') continue;
    const coords = f.geometry.coordinates;
    if (!coords.length) continue;
    features.push({
      type: 'Feature',
      properties: { ...(f.properties || {}), kind: 'start' },
      geometry: { type: 'Point', coordinates: coords[0] },
    });
    features.push({
      type: 'Feature',
      properties: { ...(f.properties || {}), kind: 'end' },
      geometry: { type: 'Point', coordinates: coords[coords.length - 1] },
    });
  }
  return { type: 'FeatureCollection', features };
}

function installOfflineBasemap(map: MapLibreMap) {
  map.addSource('offline-land', {
    type: 'geojson',
    data: getOfflineLandGeoJson(),
    buffer: 64,
    tolerance: 0.1,
  });
  map.addSource('offline-coastline', {
    type: 'geojson',
    data: getOfflineCoastlineGeoJson(),
    buffer: 64,
    tolerance: 0.1,
  });
  map.addSource('offline-borders', {
    type: 'geojson',
    data: getOfflineBordersGeoJson(),
    buffer: 64,
    tolerance: 0.1,
  });
  for (const layer of getOfflineCountryLayers({ theme: 'dark' })) {
    map.addLayer(layer);
  }
}

function applyVesselLayers(
  map: MapLibreMap,
  vessels: DemoPassageVessel[],
  hidden: Set<string>,
) {
  ensurePassageArrowImage(map);
  for (const vessel of vessels) {
    const sourceId = `demo:${vessel.id}`;
    const endpointsId = `${sourceId}:endpoints`;
    const visible = !hidden.has(vessel.id);
    const visibility = visible ? 'visible' : 'none';

    const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(vessel.featureCollection as any);
      const ep = map.getSource(endpointsId) as GeoJSONSource | undefined;
      if (ep) ep.setData(deriveEndpoints(vessel.featureCollection as any) as any);
      for (const suffix of [
        'glow',
        'casing',
        'line',
        'sheen',
        'arrows',
        'endpoint-halo',
        'endpoint-fill',
      ]) {
        const layerId = `${sourceId}:${suffix}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      }
      continue;
    }

    map.addSource(sourceId, {
      type: 'geojson',
      data: vessel.featureCollection as any,
    });
    map.addSource(endpointsId, {
      type: 'geojson',
      data: deriveEndpoints(vessel.featureCollection as any) as any,
    });

    map.addLayer({
      id: `${sourceId}:glow`,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility,
      },
      paint: {
        'line-color': vessel.colorHex,
        'line-opacity': TRACK_PAINT.glowOpacity,
        'line-blur': TRACK_PAINT.glowBlur,
        'line-width': widthAtZoom(
          TRACK_PAINT.glowWidthLow,
          TRACK_PAINT.glowWidthHigh,
        ) as any,
      },
    });
    map.addLayer({
      id: `${sourceId}:casing`,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility,
      },
      paint: {
        'line-color': TRACK_PAINT.casingColor,
        'line-opacity': TRACK_PAINT.casingOpacity,
        'line-width': widthAtZoom(
          TRACK_PAINT.lineWidthLow + TRACK_PAINT.casingExtra,
          TRACK_PAINT.lineWidthHigh + TRACK_PAINT.casingExtra,
        ) as any,
      },
    });
    map.addLayer({
      id: `${sourceId}:line`,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility,
      },
      paint: {
        'line-color': vessel.colorHex,
        'line-opacity': TRACK_PAINT.lineOpacity,
        'line-width': widthAtZoom(
          TRACK_PAINT.lineWidthLow,
          TRACK_PAINT.lineWidthHigh,
        ) as any,
      },
    });
    map.addLayer({
      id: `${sourceId}:sheen`,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility,
      },
      paint: {
        'line-color': TRACK_PAINT.sheenColor,
        'line-opacity': TRACK_PAINT.sheenOpacity,
        'line-width': widthAtZoom(
          TRACK_PAINT.lineWidthLow * 0.35,
          TRACK_PAINT.lineWidthHigh * 0.35,
        ) as any,
      },
    });
    map.addLayer({
      id: `${sourceId}:arrows`,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 72,
        'icon-image': PASSAGE_ARROW_IMAGE_ID,
        'icon-size': 0.55,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        visibility,
      },
      paint: {
        'icon-color': vessel.colorHex,
        'icon-opacity': 0.9,
      },
    });
    map.addLayer({
      id: `${sourceId}:endpoint-halo`,
      type: 'circle',
      source: endpointsId,
      layout: { visibility },
      paint: {
        'circle-radius': 8,
        'circle-color': vessel.colorHex,
        'circle-opacity': 0.2,
      },
    });
    map.addLayer({
      id: `${sourceId}:endpoint-fill`,
      type: 'circle',
      source: endpointsId,
      layout: { visibility },
      paint: {
        'circle-radius': 4.5,
        'circle-color': vessel.colorHex,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': TRACK_PAINT.endpointColor,
      },
    });
  }
}

export function VoyageMapCanvas({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(DEMO_PASSAGE_VESSELS[0]?.id ?? null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureMaplibreWorkerConfigured();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildOfflineWorldStyle({ theme: 'dark' }),
      center: [8, 42],
      zoom: 3.2,
      attributionControl: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(
      new AttributionControl({ compact: true }),
      'bottom-right',
    );

    const popup = new Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '320px',
      className: 'voyage-map-popup',
      offset: 14,
    });
    popupRef.current = popup;

    const onLoad = () => {
      installOfflineBasemap(map);
      applyVesselLayers(map, DEMO_PASSAGE_VESSELS, hiddenRef.current);
      const bbox = bboxOfVessels(DEMO_PASSAGE_VESSELS);
      if (bbox) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 56, duration: 900, maxZoom: 5.2 },
        );
      }
      setReady(true);
    };

    const onClick = (e: MapMouseEvent) => {
      const lineLayers = DEMO_PASSAGE_VESSELS.map((v) => `demo:${v.id}:line`);
      const hits = map.queryRenderedFeatures(e.point, { layers: lineLayers });
      const hit = hits[0];
      if (!hit) {
        popup.remove();
        return;
      }
      const vesselId = String(hit.source || '').replace(/^demo:/, '');
      const vessel = DEMO_PASSAGE_VESSELS.find((v) => v.id === vesselId);
      if (!vessel) return;
      const props = hit.properties || {};
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          renderPassagePopupHtml({
            vesselName: vessel.name,
            colorHex: vessel.colorHex,
            passageIndex:
              typeof props.passageIndex === 'number'
                ? props.passageIndex
                : Number(props.passageIndex),
            startTime: props.startTime,
            endTime: props.endTime,
            durationMs:
              typeof props.durationMs === 'number'
                ? props.durationMs
                : Number(props.durationMs),
            distanceNm:
              typeof props.distanceNm === 'number'
                ? props.distanceNm
                : Number(props.distanceNm),
            avgSpeedKn:
              props.avgSpeedKn == null ? null : Number(props.avgSpeedKn),
            maxSpeedKn:
              props.maxSpeedKn == null ? null : Number(props.maxSpeedKn),
            pointCount:
              typeof props.pointCount === 'number'
                ? props.pointCount
                : Number(props.pointCount),
            routeLabel: vessel.region,
          }),
        )
        .addTo(map);
      setFocusedId(vessel.id);
    };

    map.on('load', onLoad);
    map.on('click', onClick);
    map.getCanvas().style.cursor = 'grab';

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyVesselLayers(map, DEMO_PASSAGE_VESSELS, hidden);
  }, [hidden, ready]);

  const focusVessel = (vessel: DemoPassageVessel) => {
    setFocusedId(vessel.id);
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(vessel.id);
      return next;
    });
    const map = mapRef.current;
    if (!map) return;
    const bbox = bboxOfVessels([vessel]);
    if (!bbox) return;
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 72, duration: 800, maxZoom: 6.5 },
    );
  };

  const toggleVessel = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className={cn(
        'voyage-map-canvas relative overflow-hidden rounded-2xl',
        className,
      )}
      style={{
        border: '1px solid var(--wk-line)',
        boxShadow: 'var(--wk-shadow-lg)',
        backgroundColor: '#0b1220',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            ${PASSAGE_POPUP_STYLE}
            .voyage-map-canvas .maplibregl-ctrl-group {
              background: rgba(15, 23, 42, 0.92);
              border: 1px solid rgba(148, 163, 184, 0.25);
              box-shadow: none;
            }
            .voyage-map-canvas .maplibregl-ctrl-group button span {
              filter: invert(1) brightness(1.2);
            }
            .voyage-map-canvas .maplibregl-ctrl-attrib {
              background: rgba(15, 23, 42, 0.75);
              color: #94a3b8;
            }
            .voyage-map-canvas .maplibregl-ctrl-attrib a { color: #cbd5e1; }
            .voyage-map-popup .maplibregl-popup-content {
              background: transparent;
              padding: 0;
              box-shadow: none;
            }
            .voyage-map-popup .maplibregl-popup-tip {
              border-top-color: rgba(15, 23, 42, 0.95);
            }
          `,
        }}
      />

      <div ref={containerRef} className="h-full w-full min-h-[420px]" />

      {!ready && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center"
          style={{ backgroundColor: '#0b1220' }}
        >
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading passage map…
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-4 sm:pr-[4.5rem]">
        <div
          className="pointer-events-auto mx-auto flex max-w-5xl gap-2 overflow-x-auto rounded-xl p-2 backdrop-blur-md"
          style={{
            backgroundColor: 'rgba(8, 15, 30, 0.78)',
            border: '1px solid rgba(148, 163, 184, 0.22)',
          }}
        >
          {DEMO_PASSAGE_VESSELS.map((vessel) => {
            const isHidden = hidden.has(vessel.id);
            const isFocused = focusedId === vessel.id;
            return (
              <div
                key={vessel.id}
                className={cn(
                  'flex min-w-[220px] flex-1 items-start gap-2 rounded-lg px-3 py-2.5 transition-colors',
                  isFocused && !isHidden && 'bg-white/10',
                )}
              >
                <button
                  type="button"
                  onClick={() => focusVessel(vessel)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: `${vessel.colorHex}22`,
                        color: vessel.colorHex,
                        border: `1px solid ${vessel.colorHex}55`,
                      }}
                    >
                      <Ship className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {vessel.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {vessel.passageCount} passages · {Math.round(vessel.totalDistanceNm)} NM
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={isHidden ? `Show ${vessel.name}` : `Hide ${vessel.name}`}
                  onClick={() => toggleVessel(vessel.id)}
                  className="mt-0.5 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                >
                  {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
