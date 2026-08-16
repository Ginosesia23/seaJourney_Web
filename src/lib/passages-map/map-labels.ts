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
 * Visibility model
 *   Every label carries a `minZoom` — below that zoom the label's DOM
 *   element gets `display: none`. Zoom thresholds are tuned so we never
 *   render more than ~120 labels at once:
 *
 *     Zoom 1.8+ → tier-1 country names (giants: Russia, USA…)
 *     Zoom 2.4+ → tier-1 cities (mega-hubs)
 *     Zoom 2.8+ → tier-2 country names (normal-sized states)
 *     Zoom 3.4+ → tier-2 cities (regional hubs, capitals)
 *     Zoom 4.2+ → tier-3 country names (micro-states)
 *     Zoom 4.8+ → tier-3 cities (yacht destinations)
 *
 *   The map's `zoom` event drives a single walk over the whole label
 *   set — cheap, no reflow because we only touch style.display.
 */

import { Marker, type Map as MapLibreMap } from 'maplibre-gl';

import { MAJOR_CITIES } from './major-cities';
import { getCountryLabelPoints } from './country-label-points';
import type { DiscoveredPlace } from './discover-places';

type LabelKind = 'city' | 'country' | 'discovered-city' | 'discovered-port';

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

export function installMapLabels(
  map: MapLibreMap,
  initialTone: 'dark' | 'muted' | 'light',
): MapLabelHandle {
  const labels: ManagedLabel[] = [];
  let tone: 'dark' | 'muted' | 'light' = initialTone;

  const cityMinZoomByTier: Record<1 | 2 | 3, number> = {
    1: 2.4,
    2: 3.4,
    3: 4.8,
  };
  const countryMinZoomByTier: Record<1 | 2 | 3, number> = {
    1: 1.8,
    2: 2.8,
    3: 4.2,
  };

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
      minZoom: countryMinZoomByTier[p.tier] ?? 3.5,
      kind: 'country',
    });
  }

  // ── City labels ──
  for (const c of MAJOR_CITIES) {
    const el = document.createElement('div');
    el.className = 'passages-label passages-label--city';
    el.setAttribute('data-tier', String(c.tier));
    // Structured markup so we can style the dot + name independently.
    const dot = document.createElement('span');
    dot.className = 'passages-label__dot';
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
      minZoom: cityMinZoomByTier[c.tier] ?? 4.0,
      kind: 'city',
    });
  }

  // Apply the current theme tone to every label's root <div> so CSS
  // rules scoped by `[data-tone="dark"]` etc. can restyle without a
  // re-render.
  applyTone(labels, tone);

  // Re-evaluate visibility on every zoom change. Cheap DOM update —
  // only style.display flips, no reflows for unchanged labels.
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
  // Also run once after `idle` in case the map's first render zoom
  // differs from what we captured above.
  map.on('idle', updateVisibility);

  const syncDiscoveredPlaces = (places: DiscoveredPlace[]) => {
    // Drop previous discovered markers only.
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i]!;
      if (!l.discoveredKey) continue;
      l.marker.remove();
      labels.splice(i, 1);
    }

    for (const place of places) {
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
      if (place.portName && place.portName !== place.name) {
        const port = document.createElement('span');
        port.className = 'passages-label__port';
        port.textContent = place.portName;
        el.append(port);
      }
      const marker = new Marker({ element: el, anchor: 'left', offset: [6, 0] })
        .setLngLat([place.lon, place.lat])
        .addTo(map);
      labels.push({
        marker,
        el,
        // Show a bit earlier than tier-3 world cities — these are
        // places you've actually sailed, so they're worth emphasizing.
        minZoom: isPort ? 3.6 : 4.0,
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

/**
 * Injected once alongside the map's other scoped CSS. Uses the same
 * dark-glass design language as the popup + legend so labels feel like
 * part of the same layer, not a bolt-on.
 *
 * The `.passages-label` root uses tone-aware colours via
 * `[data-tone="dark"]`, `[data-tone="light"]` etc. — matching what
 * `MapLabelHandle.retheme` sets.
 */
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

  /* ── Country labels — subtle, all-caps, no marker dot ── */
  .passages-label--country {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.42);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    transform: translateY(0);
    padding: 0 4px;
  }
  .passages-label--country[data-tone="light"] {
    color: rgba(15, 23, 42, 0.5);
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.85);
  }
  .passages-label--country[data-tone="muted"] {
    color: rgba(226, 232, 240, 0.48);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  }
  /* Bigger country names (tier 1) render slightly larger to lead
     the eye first when you zoom out. */
  .passages-label--country[data-tier="1"] {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }
  .passages-label--country[data-tone="light"][data-tier="1"] {
    color: rgba(15, 23, 42, 0.62);
  }
  .passages-label--country[data-tone="muted"][data-tier="1"] {
    color: rgba(226, 232, 240, 0.6);
  }

  /* ── City labels — small dot + name to the right ── */
  .passages-label--city {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.86);
    text-shadow:
      0 0 4px rgba(0, 0, 0, 0.8),
      0 1px 2px rgba(0, 0, 0, 0.7);
  }
  .passages-label--city[data-tone="light"] {
    color: rgba(15, 23, 42, 0.82);
    text-shadow:
      0 0 3px rgba(255, 255, 255, 0.9),
      0 1px 1px rgba(255, 255, 255, 0.8);
  }
  .passages-label--city[data-tone="muted"] {
    color: rgba(241, 245, 249, 0.85);
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
  /* Tier 1 cities get a slightly bigger dot + bolder name */
  .passages-label--city[data-tier="1"] {
    font-size: 12px;
    font-weight: 600;
  }
  .passages-label--city[data-tier="1"] .passages-label__dot {
    width: 5px;
    height: 5px;
  }
  /* Tier 3 cities render one shade lighter so tier-1/2 remain the eye
     leads at any zoom. */
  .passages-label--city[data-tier="3"] {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
  }
  .passages-label--city[data-tone="light"][data-tier="3"] {
    color: rgba(15, 23, 42, 0.62);
  }

  /* ── Places unlocked by sailing — slightly warmer / earlier than base ── */
  .passages-label--discovered {
    font-size: 11px;
    font-weight: 560;
    color: rgba(186, 230, 253, 0.95);
  }
  .passages-label--discovered[data-tone="light"] {
    color: rgba(3, 105, 161, 0.9);
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
  }
  .passages-label__port {
    margin-left: 4px;
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.72;
  }
`;
