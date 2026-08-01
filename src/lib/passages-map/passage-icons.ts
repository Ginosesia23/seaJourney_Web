/**
 * Runtime-generated icons for the Passages Map (right now: just the
 * direction arrow rendered every N pixels along each passage line).
 *
 * Why generate the icon rather than ship a PNG?
 *   - No extra network fetch — fully offline.
 *   - It's tiny (16×16) so canvas draw cost is negligible.
 *   - We can regenerate on the fly if we ever want theme-aware
 *     variants without touching the deploy pipeline.
 *
 * SDF (Signed Distance Field):
 *   MapLibre's symbol icons can be plain raster images or SDF. SDF
 *   icons are single-channel alpha masks that the renderer can TINT to
 *   any colour at paint time via `icon-color`. That's what we want here
 *   because each vessel has its own colour and we don't want to
 *   generate one arrow image per vessel — we generate ONE white arrow
 *   as SDF and colour it per layer.
 *
 *   Enabling SDF is a single `{ sdf: true }` flag on `map.addImage`.
 *   The image itself must be a solid opaque shape on transparent
 *   background — MapLibre computes the distance field for us.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';

export const PASSAGE_ARROW_IMAGE_ID = 'passage-arrow-v2';

/**
 * Draw a small forward-pointing chevron into a canvas and register it
 * with the map as an SDF icon so it can be tinted per-vessel via
 * `icon-color`. Idempotent — safe to call every time we (re)install
 * layers; second call is a no-op.
 */
export function ensurePassageArrowImage(map: MapLibreMap): void {
  if (map.hasImage(PASSAGE_ARROW_IMAGE_ID)) return;

  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, size, size);
  // Solid arrowhead pointing right (+X). MapLibre rotates it along the
  // line via `icon-rotation-alignment: 'map'`, so +X = along-track.
  // A filled wedge reads cleaner on thin coloured tracks than a hollow
  // chevron, especially once SDF-tinted and haloed.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(1.5, 2.5);
  ctx.lineTo(14, 8);
  ctx.lineTo(1.5, 13.5);
  ctx.lineTo(4.2, 8);
  ctx.closePath();
  ctx.fill();

  const imageData = ctx.getImageData(0, 0, size, size);
  map.addImage(
    PASSAGE_ARROW_IMAGE_ID,
    {
      width: size,
      height: size,
      data: new Uint8Array(imageData.data.buffer),
    },
    { sdf: true, pixelRatio: 2 },
  );
}
