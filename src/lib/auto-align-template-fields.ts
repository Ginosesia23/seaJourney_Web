/**
 * Post-processing pass that cleans up the AI's bounding-box predictions for
 * form-builder templates.
 *
 * The problem: Gemini reliably finds the right value area for most fields
 * but its bbox predictions drift by a few units each — single-line blanks
 * that visually share a row end up with different `yMin` / `yMax`, and
 * columns that should stack vertically have slightly different `xMin`s.
 * Stamping values into those boxes produces a document that looks
 * subtly crooked.
 *
 * What this does (per page):
 *   1. Groups fields whose y-midpoints are within `rowTolerance` into
 *      rows and snaps every row member to the cluster's average y + a
 *      single normalised height.
 *   2. Groups fields whose `xMin` values are within `colTolerance` into
 *      left-columns and snaps them to the cluster's average `xMin`.
 *   3. Same for `xMax` right-edges — keeps right-aligned data columns
 *      from drifting.
 *   4. Normalises single-line blanks to a consistent height (median
 *      observed height on the page, clamped to a sensible range).
 *
 * Intentional non-goals:
 *   - We do NOT snap PLACEHOLDER boxes (ones stacked on the left margin)
 *     because those are deliberately unpositioned and snapping would hide
 *     that the user still needs to move them.
 *   - We do NOT move anything outside the cluster — fields that sit on
 *     their own get their height normalised but keep their original x/y.
 */

import type { TemplateField, TemplateBbox } from './vessel-document-templates';
import { isPositionedField } from './vessel-document-templates';

export interface AutoAlignOptions {
  /**
   * Y-midpoint tolerance (in [0,1000] units) under which two fields are
   * considered to share a row. 15 ≈ half a typical blank's height.
   */
  rowToleranceY?: number;
  /**
   * X tolerance (in [0,1000] units) under which two fields are considered
   * to share a left-column. A small form column is ~30 units wide so 12
   * is a reasonable default.
   */
  colToleranceX?: number;
  /**
   * Target single-line blank height, used as fallback when the page has
   * too few fields to compute a useful median.
   */
  fallbackHeight?: number;
  /**
   * Minimum width enforced on any box — if the AI returned a 5-unit-wide
   * sliver, widen it to this. Helps the overlay click-target stay usable.
   */
  minWidth?: number;
  /**
   * If true, fields that sit on their own (not part of a row or column
   * cluster) still get their height normalised to the page median. Leave
   * `false` to only touch clustered fields (gentler pass).
   */
  normaliseSingletonHeight?: boolean;
}

const DEFAULTS: Required<AutoAlignOptions> = {
  rowToleranceY: 15,
  colToleranceX: 12,
  fallbackHeight: 28,
  minWidth: 80,
  normaliseSingletonHeight: true,
};

/**
 * Runs the alignment pass. Returns a new field array with updated bboxes;
 * non-positioned (placeholder) fields are passed through untouched.
 */
export function autoAlignTemplateFields(
  fields: TemplateField[],
  options: AutoAlignOptions = {},
): TemplateField[] {
  const opts = { ...DEFAULTS, ...options };
  if (!fields.length) return fields;

  // Separate positioned fields from placeholders — we only align the
  // former. Placeholders survive in their original order.
  const byPage = new Map<number, { field: TemplateField; index: number }[]>();
  fields.forEach((field, index) => {
    if (!isPositionedField(field)) return;
    const p = field.page ?? 1;
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p)!.push({ field, index });
  });

  // Start from the unchanged array, then overwrite aligned entries.
  const out = fields.slice();

  for (const pageEntries of byPage.values()) {
    const aligned = alignPage(pageEntries.map((e) => e.field), opts);
    pageEntries.forEach(({ index }, i) => {
      out[index] = aligned[i];
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function alignPage(
  fields: TemplateField[],
  opts: Required<AutoAlignOptions>,
): TemplateField[] {
  if (!fields.length) return fields;

  const boxes = fields.map((f) => ({ ...f.bbox }));
  const medianH = medianHeight(boxes, opts.fallbackHeight);
  const targetHeight = clamp(medianH, 20, 40);

  // Row clusters: indices of boxes grouped by y-midpoint.
  const rowClusters = clusterBy(
    boxes.map((b, i) => ({ i, key: (b.yMin + b.yMax) / 2 })),
    opts.rowToleranceY,
  );
  for (const cluster of rowClusters) {
    if (cluster.length < 2) continue;
    const avgMid =
      cluster.reduce((s, c) => s + c.key, 0) / cluster.length;
    const half = targetHeight / 2;
    const yMin = clamp(Math.round(avgMid - half), 0, 1000 - targetHeight);
    const yMax = yMin + targetHeight;
    for (const { i } of cluster) {
      boxes[i].yMin = yMin;
      boxes[i].yMax = yMax;
    }
  }

  // Left-column clusters.
  const leftClusters = clusterBy(
    boxes.map((b, i) => ({ i, key: b.xMin })),
    opts.colToleranceX,
  );
  for (const cluster of leftClusters) {
    if (cluster.length < 2) continue;
    const avgX =
      cluster.reduce((s, c) => s + c.key, 0) / cluster.length;
    const xMin = clamp(Math.round(avgX), 0, 990);
    for (const { i } of cluster) {
      const width = boxes[i].xMax - boxes[i].xMin;
      boxes[i].xMin = xMin;
      // Re-apply width so the right edge follows the left snap. Enforce
      // minWidth so narrow boxes become clickable.
      const w = Math.max(width, opts.minWidth);
      boxes[i].xMax = Math.min(xMin + w, 1000);
    }
  }

  // Right-edge clusters — handle data columns that right-align values.
  const rightClusters = clusterBy(
    boxes.map((b, i) => ({ i, key: b.xMax })),
    opts.colToleranceX,
  );
  for (const cluster of rightClusters) {
    if (cluster.length < 2) continue;
    const avgX =
      cluster.reduce((s, c) => s + c.key, 0) / cluster.length;
    const xMax = clamp(Math.round(avgX), 10, 1000);
    for (const { i } of cluster) {
      boxes[i].xMax = xMax;
      // Make sure xMin didn't drift past xMax after snapping.
      if (boxes[i].xMin >= xMax - opts.minWidth) {
        boxes[i].xMin = Math.max(0, xMax - opts.minWidth);
      }
    }
  }

  // Height normalisation for singletons (fields not already matched by the
  // row clusters above). Skip for tables where cells are obviously taller
  // (height > targetHeight * 1.6) — those are multi-line or numeric cells
  // and forcing them smaller would truncate.
  if (opts.normaliseSingletonHeight) {
    for (let i = 0; i < boxes.length; i += 1) {
      const b = boxes[i];
      const h = b.yMax - b.yMin;
      if (h < targetHeight * 0.6 || (h > targetHeight * 1.4 && h < targetHeight * 1.6)) {
        const mid = (b.yMin + b.yMax) / 2;
        const yMin = clamp(Math.round(mid - targetHeight / 2), 0, 1000 - targetHeight);
        b.yMin = yMin;
        b.yMax = yMin + targetHeight;
      }
    }
  }

  // Final safety pass: enforce minWidth + valid ordering.
  for (const b of boxes) {
    if (b.xMax - b.xMin < opts.minWidth) {
      b.xMax = Math.min(1000, b.xMin + opts.minWidth);
    }
    if (b.yMax <= b.yMin) b.yMax = b.yMin + targetHeight;
  }

  return fields.map((f, i) => ({ ...f, bbox: sanitise(boxes[i]) }));
}

/**
 * Simple 1-D clustering: sort items by key, then greedily start a new
 * cluster whenever the gap between consecutive items exceeds `tolerance`.
 * Good enough for form layouts where rows/columns are well separated.
 */
function clusterBy<T extends { key: number }>(
  items: T[],
  tolerance: number,
): T[][] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => a.key - b.key);
  const out: T[][] = [];
  let current: T[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = current[current.length - 1].key;
    if (sorted[i].key - prev <= tolerance) {
      current.push(sorted[i]);
    } else {
      out.push(current);
      current = [sorted[i]];
    }
  }
  out.push(current);
  return out;
}

function medianHeight(boxes: TemplateBbox[], fallback: number): number {
  const heights = boxes
    .map((b) => b.yMax - b.yMin)
    .filter((h) => Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b);
  if (!heights.length) return fallback;
  const mid = Math.floor(heights.length / 2);
  return heights.length % 2 === 0
    ? (heights[mid - 1] + heights[mid]) / 2
    : heights[mid];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function sanitise(b: TemplateBbox): TemplateBbox {
  return {
    xMin: clamp(Math.round(b.xMin), 0, 999),
    yMin: clamp(Math.round(b.yMin), 0, 999),
    xMax: clamp(Math.round(b.xMax), 1, 1000),
    yMax: clamp(Math.round(b.yMax), 1, 1000),
  };
}
