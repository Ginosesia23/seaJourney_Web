/**
 * City + country labels for the Passages Map, rendered as MapLibre
 * `Marker` HTML overlays rather than symbol layers.
 *
 * Why Marker instead of a symbol layer with glyphs?
 *   MapLibre's symbol layers need a `glyphs:` URL in the style spec to
 *   render any text. The go-to option (`https://demotiles.maplibre.org/
 *   font/{fontstack}/{range}.pbf`) is fine, but external URLs on this
 *   page have already been unreliable for some of our users (adblocker
 *   / corporate proxy blocking). We already went to a lot of trouble to
 *   make the base map fully offline; introducing a hard dependency on a
 *   remote glyph server now would undo that.
 *
 *   MapLibre `Marker`s are just HTML DOM elements the map keeps
 *   projected at a given lng/lat. They render via CSS — no glyphs, no
 *   worker traffic. Downsides: no collision detection between labels
 *   (we control this by tier + zoom), and slightly higher per-frame
 *   cost. For ~250 labels total it's negligible.
 *
 * Visibility model (kept sparse so tracks stay readable):
 *   Zoom 2.4+ → tier-1 country names (giants)
 *   Zoom 3.4+ → tier-1 cities (mega-hubs)
 *   Zoom 3.8+ → tier-2 country names
 *   Zoom 5.0+ → tier-2 cities
 *   Zoom 5.6+ → tier-3 country names
 *   Zoom 6.4+ → tier-3 cities + discovered ports
 */

import { Marker, type Map as MapLibreMap } from 'maplibre-gl';

import { MAJOR_CITIES } from './major-cities';
import { getCountryLabelPoints } from './country-label-points';
import { MAJOR_OCEAN_LABELS } from './ocean-chart';
import type { DiscoveredPlace } from './discover-places';

type LabelKind =
  | 'city'
  | 'country'
  | 'ocean'
  | 'discovered-city'
  | 'discovered-port';

type ManagedLabel = {
  marker: Marker;
  el: HTMLElement;
  minZoom: number;
  kind: LabelKind;
  /** Set for sailed-area labels so we can replace the set without touching base labels. */
  discoveredKey?: string;
};

/**
 * Installed labels attached to a specific map instance. Returned from
 * `installMapLabels` so the caller can `dispose()` it on unmount and
 * `retheme()` when the user changes the basemap tone.
 */
export type MapLabelHandle = {
  /** Remove all label markers from the map + drop event handlers. */
  dispose: () => void;
  /** Re-apply CSS classes when the basemap tone changes. */
  retheme: (tone: 'dark' | 'muted' | 'light') => void;
  /**
   * Add / refresh labels unlocked by sailing. Replaces the previous
   * discovered set only — base city/country labels stay put.
   */
  syncDiscoveredPlaces: (places: DiscoveredPlace[]) => void;
};

/**
 * Hide dense text from remote vector basemaps (OpenFreeMap / OpenMapTiles).
 * We already draw curated city/country/ocean markers; stacking remote place
 * names on top of tracks made the map unreadable.
 *
 * Safe to call repeatedly after every style load.
 */
export function thinBasemapTextLabels(map: MapLibreMap): void {
  const style = map.getStyle();
  if (!style?.layers?.length) return;

  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    const id = layer.id.toLowerCase();
    // Keep nothing that competes with passage tracks or our HTML labels.
    const hide =
      id.includes('water') ||
      id.includes('place') ||
      id.includes('poi') ||
      id.includes('label') ||
      id.includes('name') ||
      id.includes('housenumber') ||
      id.includes('mountain') ||
      id.includes('airport') ||
      id.includes('aerodrome') ||
      id.includes('transit') ||
      id.includes('road') ||
      id.includes('highway');
    if (!hide) continue;
    try {
      if (map.getLayer(layer.id)) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    } catch {
      /* layer may have been removed mid-swap */
    }
  }
}

export function installMapLabels(
  map: MapLibreMap,
  initialTone: 'dark' | 'muted' | 'light',
): MapLabelHandle {
  const labels: ManagedLabel[] = [];
  let tone: 'dark' | 'muted' | 'light' = initialTone;

  const cityMinZoomByTier: Record<1 | 2 | 3, number> = {
    1: 3.4,
    2: 4.8,
    3: 5.8,
  };
  const countryMinZoomByTier: Record<1 | 2 | 3, number> = {
    1: 2.4,
    2: 3.8,
    3: 5.6,
  };
  const oceanMinZoomByTier: Record<1 | 2 | 3, number> = {
    1: 1.4,
    2: 3.2,
    3: 4.8,
  };

  // ── Ocean / sea labels (curated; always available offline) ──
  for (const o of MAJOR_OCEAN_LABELS) {
    const el = document.createElement('div');
    el.className = 'passages-label passages-label--ocean';
    el.setAttribute('data-tier', String(o.tier));
    el.textContent = o.name;
    const marker = new Marker({ element: el, anchor: 'center' })
      .setLngLat([o.lon, o.lat])
      .addTo(map);
    labels.push({
      marker,
      el,
      minZoom: oceanMinZoomByTier[o.tier] ?? 4,
      kind: 'ocean',
    });
  }

  // ── Country name labels ──
  for (const p of getCountryLabelPoints()) {
    const el = document.createElement('div');
    el.className = 'passages-label passages-label--country';
    el.setAttribute(
      'data-tier',
      String(Math.max(1, Math.min(3, p.tier))),
    );
    el.textContent = p.name;
    const marker = new Marker({ element: el, anchor: 'center' })
      .setLngLat([p.lon, p.lat])
      .addTo(map);
    labels.push({
      marker,
      el,
      minZoom: countryMinZoomByTier[p.tier] ?? 4.5,
      kind: 'country',
    });
  }

  // ── City / port / marina labels ──
  for (const c of MAJOR_CITIES) {
    const isMaritime = c.kind === 'port' || c.kind === 'marina';
    const el = document.createElement('div');
    el.className = isMaritime
      ? 'passages-label passages-label--city passages-label--port'
      : 'passages-label passages-label--city';
    el.setAttribute('data-tier', String(c.tier));
    if (c.kind) el.setAttribute('data-kind', c.kind);
    const dot = document.createElement('span');
    dot.className = 'passages-label__dot';
    if (isMaritime) {
      dot.title = c.name;
      el.title = c.name;
    }
    const name = document.createElement('span');
    name.className = 'passages-label__name';
    name.textContent = c.name;
    el.append(dot, name);
    const marker = new Marker({ element: el, anchor: 'left', offset: [6, 0] })
      .setLngLat([c.lon, c.lat])
      .addTo(map);
    labels.push({
      marker,
      el,
      // Marinas wait a touch longer than regional ports so coasts stay tidy.
      minZoom:
        c.kind === 'marina'
          ? Math.max(cityMinZoomByTier[c.tier] ?? 5.8, 6.2)
          : (cityMinZoomByTier[c.tier] ?? 5.5),
      kind: isMaritime ? 'discovered-port' : 'city',
    });
  }

  applyTone(labels, tone);

  const updateVisibility = () => {
    const z = map.getZoom();
    for (const l of labels) {
      const visible = z >= l.minZoom;
      const desired = visible ? '' : 'none';
      if (l.el.style.display !== desired) l.el.style.display = desired;
    }
  };
  updateVisibility();
  map.on('zoom', updateVisibility);
  map.on('idle', updateVisibility);

  const syncDiscoveredPlaces = (places: DiscoveredPlace[]) => {
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i]!;
      if (!l.discoveredKey) continue;
      l.marker.remove();
      labels.splice(i, 1);
    }

    for (const place of places) {
      // Skip generic geocoded towns — they stack densely along coasts.
      if (place.kind === 'town') continue;

      const isPort = place.kind === 'port';
      const el = document.createElement('div');
      el.className = isPort
        ? 'passages-label passages-label--city passages-label--discovered passages-label--port'
        : 'passages-label passages-label--city passages-label--discovered';
      el.setAttribute('data-tier', isPort ? '2' : '3');
      const dot = document.createElement('span');
      dot.className = 'passages-label__dot';
      const name = document.createElement('span');
      name.className = 'passages-label__name';
      name.textContent = place.name;
      el.append(dot, name);
      const marker = new Marker({ element: el, anchor: 'left', offset: [6, 0] })
        .setLngLat([place.lon, place.lat])
        .addTo(map);
      labels.push({
        marker,
        el,
        minZoom: isPort ? 5.4 : 6.2,
        kind: isPort ? 'discovered-port' : 'discovered-city',
        discoveredKey: place.cellKey,
      });
    }

    applyTone(labels, tone);
    updateVisibility();
  };

  return {
    dispose: () => {
      map.off('zoom', updateVisibility);
      map.off('idle', updateVisibility);
      for (const l of labels) l.marker.remove();
      labels.length = 0;
    },
    retheme: (nextTone) => {
      tone = nextTone;
      applyTone(labels, tone);
    },
    syncDiscoveredPlaces,
  };
}

function applyTone(
  labels: readonly ManagedLabel[],
  tone: 'dark' | 'muted' | 'light',
) {
  for (const l of labels) l.el.setAttribute('data-tone', tone);
}

export const MAP_LABELS_STYLE = `
  .passages-label {
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-weight: 500;
    white-space: nowrap;
    letter-spacing: 0.02em;
    user-select: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  .passages-label--country {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.36);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    transform: translateY(0);
    padding: 0 4px;
  }
  .passages-label--country[data-tone="light"] {
    color: rgba(15, 23, 42, 0.42);
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.85);
  }
  .passages-label--country[data-tone="muted"] {
    color: rgba(226, 232, 240, 0.4);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  }
  .passages-label--country[data-tier="1"] {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.48);
  }
  .passages-label--country[data-tone="light"][data-tier="1"] {
    color: rgba(15, 23, 42, 0.55);
  }
  .passages-label--country[data-tone="muted"][data-tier="1"] {
    color: rgba(226, 232, 240, 0.52);
  }

  .passages-label--ocean {
    font-size: 11px;
    font-weight: 500;
    font-style: italic;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: rgba(147, 197, 230, 0.38);
    text-shadow: 0 1px 4px rgba(2, 8, 18, 0.7);
    padding: 0 6px;
  }
  .passages-label--ocean[data-tier="1"] {
    font-size: 13px;
    letter-spacing: 0.34em;
    color: rgba(168, 210, 240, 0.44);
  }
  .passages-label--ocean[data-tier="3"] {
    font-size: 10px;
    letter-spacing: 0.2em;
    color: rgba(147, 197, 230, 0.34);
  }
  .passages-label--ocean[data-tone="light"] {
    color: rgba(30, 74, 120, 0.42);
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
  }
  .passages-label--ocean[data-tone="light"][data-tier="1"] {
    color: rgba(22, 64, 110, 0.5);
  }
  .passages-label--ocean[data-tone="muted"] {
    color: rgba(186, 214, 235, 0.4);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .passages-label--ocean[data-tone="muted"][data-tier="1"] {
    color: rgba(198, 222, 240, 0.48);
  }

  .passages-label--city {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.82);
    text-shadow:
      0 0 4px rgba(0, 0, 0, 0.8),
      0 1px 2px rgba(0, 0, 0, 0.7);
  }
  .passages-label--city[data-tone="light"] {
    color: rgba(15, 23, 42, 0.78);
    text-shadow:
      0 0 3px rgba(255, 255, 255, 0.9),
      0 1px 1px rgba(255, 255, 255, 0.8);
  }
  .passages-label--city[data-tone="muted"] {
    color: rgba(241, 245, 249, 0.8);
    text-shadow:
      0 0 4px rgba(0, 0, 0, 0.55),
      0 1px 2px rgba(0, 0, 0, 0.45);
  }
  .passages-label__dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    box-shadow:
      0 0 4px rgba(0, 0, 0, 0.6),
      0 0 0 1px rgba(0, 0, 0, 0.35);
  }
  .passages-label--city[data-tone="light"] .passages-label__dot {
    background: rgba(15, 23, 42, 0.85);
    box-shadow:
      0 0 3px rgba(255, 255, 255, 0.9),
      0 0 0 1px rgba(255, 255, 255, 0.75);
  }
  .passages-label--city[data-tier="1"] {
    font-size: 12px;
    font-weight: 600;
  }
  .passages-label--city[data-tier="1"] .passages-label__dot {
    width: 5px;
    height: 5px;
  }
  .passages-label--city[data-tier="3"] {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.55);
  }
  .passages-label--city[data-tone="light"][data-tier="3"] {
    color: rgba(15, 23, 42, 0.58);
  }

  .passages-label--discovered {
    font-size: 11px;
    font-weight: 560;
    color: rgba(186, 230, 253, 0.92);
  }
  .passages-label--discovered[data-tone="light"] {
    color: rgba(3, 105, 161, 0.88);
  }
  .passages-label--discovered .passages-label__dot {
    background: rgba(125, 211, 252, 0.95);
    box-shadow:
      0 0 4px rgba(14, 165, 233, 0.55),
      0 0 0 1px rgba(0, 0, 0, 0.35);
  }
  .passages-label--discovered[data-tone="light"] .passages-label__dot {
    background: rgba(2, 132, 199, 0.9);
  }
  .passages-label--port .passages-label__dot {
    width: 5px;
    height: 5px;
    border-radius: 1px;
    transform: rotate(45deg);
    background: rgba(125, 211, 252, 0.95);
    box-shadow:
      0 0 4px rgba(14, 165, 233, 0.5),
      0 0 0 1px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
    cursor: default;
  }
  .passages-label--port[data-tone="light"] .passages-label__dot {
    background: rgba(2, 132, 199, 0.92);
  }
  .passages-label--port[data-kind="marina"] .passages-label__name {
    font-weight: 560;
  }
`;
