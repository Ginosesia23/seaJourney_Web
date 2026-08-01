/**
 * Explicit worker-URL setup for MapLibre GL JS v6 in Next.js.
 *
 * Why this exists:
 *   MapLibre v6 splits its runtime into a main-thread bundle and a
 *   separate worker script. MapLibre picks the worker URL automatically
 *   at load time, but that auto-detection assumes a plain classic-bundler
 *   chunk graph — which Next.js/Turbopack's module system doesn't
 *   produce. The result: MapLibre creates a `new Worker()` at a URL
 *   Next.js won't serve, the worker fails to boot silently, and every
 *   geojson source on the map stays stuck at `isSourceLoaded: false`.
 *   The canvas paints the background layer fine (no worker needed) but
 *   every source-backed layer — country fills, vessel track lines — never
 *   renders. From the outside it looks like a blank map painted only in
 *   the ocean colour.
 *
 * How the fix works:
 *   We copied BOTH of the MapLibre v6 worker-side ES modules into
 *   `public/`:
 *     - `public/maplibre-gl-worker.mjs`         (the worker entry, ~20 KB)
 *     - `public/maplibre-gl-shared.mjs`         (the shared bundle it
 *                                                imports, ~500 KB)
 *   Next.js serves everything under `public/` at the root path, so both
 *   files resolve at `/maplibre-gl-worker.mjs` and
 *   `/maplibre-gl-shared.mjs`. MapLibre v6's worker is a tiny ES module
 *   whose first line is `import { ... } from "./maplibre-gl-shared.mjs"`
 *   — if the shared bundle isn't sitting NEXT TO the worker on the same
 *   URL path, the worker 404s on import, silently fails to boot, and
 *   every geojson source on the map (countries, vessel tracks, …) stays
 *   stuck at `isSourceLoaded: false`. The canvas paints the background
 *   layer fine and pan/zoom still work, but nothing tile-backed ever
 *   renders. That's a nightmarish failure mode; copying both files
 *   makes it impossible.
 *
 *   MapLibre picks the worker URL via `setWorkerUrl('/maplibre-gl-worker.mjs')`;
 *   the shared bundle URL is derived by the worker itself from the
 *   relative import above, so we don't need a separate configuration
 *   for it — we just need the file to exist at that path.
 *
 * Keeping the worker files in sync:
 *   If you bump the `maplibre-gl` package, re-run BOTH copies:
 *     cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/
 *     cp node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs public/
 *   An out-of-date worker will typically fail with an internal-protocol
 *   error in the console; a missing shared bundle will show as a 404
 *   for `/maplibre-gl-shared.mjs` in the Network tab and a completely
 *   blank map with no continents.
 *
 * Usage:
 *   ```ts
 *   import { ensureMaplibreWorkerConfigured } from '@/lib/passages-map/setup-maplibre-worker';
 *   ensureMaplibreWorkerConfigured();
 *   ```
 *
 *   Call once (idempotent) at module scope OR at the very top of your
 *   map-hosting effect. Noop on the server, noop after first call.
 */

import { setWorkerUrl, getWorkerUrl } from 'maplibre-gl';

const HOSTED_WORKER_URL = '/maplibre-gl-worker.mjs';

let configured = false;

export function ensureMaplibreWorkerConfigured(): void {
  if (configured) return;
  if (typeof window === 'undefined') return;
  const previousUrl = getWorkerUrl();
  setWorkerUrl(HOSTED_WORKER_URL);
  configured = true;
  // eslint-disable-next-line no-console
  console.info('[maplibre-worker-setup] worker URL configured', {
    previousUrl,
    newUrl: HOSTED_WORKER_URL,
  });
}
