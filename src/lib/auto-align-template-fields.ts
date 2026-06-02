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
import { isPositionedField, PROFILE_KEY_OPTIONS } from './vessel-document-templates';

/**
 * Lookup from profileKey → category. Built once at module load. Used by
 * the column-snap pass so we can prefer aligning fields that belong to
 * the same logical block (e.g. all the address lines) ahead of the more
 * aggressive "any boxes whose xMin is within tolerance" rule.
 */
const PROFILE_KEY_TO_CATEGORY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const o of PROFILE_KEY_OPTIONS) out[o.value] = o.category;
  return out;
})();

function fieldCategory(field: TemplateField): string | null {
  if (!field.profileKey) return null;
  return PROFILE_KEY_TO_CATEGORY[field.profileKey] ?? null;
}

export interface AutoAlignOptions {
  /**
   * Y-midpoint tolerance (in [0,1000] units) under which two fields are
   * considered to share a row. 15 ≈ half a typical blank's height.
   */
  rowToleranceY?: number;
  /**
   * X tolerance (in [0,1000] units) under which two fields are considered
   * to share a left-column. A small form column is ~30 units wide so 20
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
   * Minimum height enforced on any box — prevents invisible zero-height
   * slivers from making it to the viewer.
   */
  minHeight?: number;
  /**
   * If true, fields that sit on their own (not part of a row or column
   * cluster) still get their height normalised to the page median. Leave
   * `false` to only touch clustered fields (gentler pass).
   */
  normaliseSingletonHeight?: boolean;
}

const DEFAULTS: Required<AutoAlignOptions> = {
  rowToleranceY: 15,   // Gemini y-drift is typically ≤10 units; 15 catches outliers
                       // without accidentally merging adjacent rows on dense forms.
  colToleranceX: 20,   // Column xMin drift can be larger — 20 is safe.
  fallbackHeight: 28,
  minWidth: 30,
  minHeight: 15,
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
  // Step 2: parallel type array so all passes can make type-aware decisions.
  const types = fields.map((f) => f.type ?? 'text');

  // Step 3: Pre-alignment sanity filter — expand degenerate boxes before any
  // clustering so they don't skew the median/mode height computation.
  for (const b of boxes) {
    const w = b.xMax - b.xMin;
    const h = b.yMax - b.yMin;
    if (w < 5) b.xMax = Math.min(1000, b.xMin + 5);
    if (h < 5) b.yMax = Math.min(1000, b.yMin + 5);
    // Whole-page bbox: Gemini returned the full-page boundary for an
    // unlocated field. Collapse to a stub at the centre.
    if ((b.xMax - b.xMin) > 800 && (b.yMax - b.yMin) > 800) {
      const midX = Math.round((b.xMin + b.xMax) / 2);
      const midY = Math.round((b.yMin + b.yMax) / 2);
      b.xMin = Math.max(0, midX - 100);
      b.xMax = Math.min(1000, midX + 100);
      b.yMin = Math.max(0, midY - 15);
      b.yMax = Math.min(1000, midY + 15);
    }
  }

  // Step 4: Type-aware target height — only single-line field heights feed
  // the mode/median computation so multiline/signature outliers don't skew it.
  const targetHeight = computeTargetHeight(boxes, types, opts.fallbackHeight);

  // Step 4b: Two-column table label-cell correction.
  // Some maritime forms use a simple two-column layout: left cell = label,
  // right cell = empty value area. Gemini sometimes places the bbox on the
  // label cell. We detect this ONLY when the form is clearly two-column:
  //   - The MAJORITY of boxes have xMax ≤ 350 (i.e. most value cells end in
  //     the left half), AND no box starts beyond x=500 (ruling out multi-
  //     section forms like AMSA 771 which have 4+ column sections).
  // This guard prevents the heuristic from firing on dense multi-column forms.
  const allXMax = boxes.filter((_, i) => types[i] !== 'checkbox').map((b) => b.xMax);
  const maxXMax = allXMax.length ? Math.max(...allXMax) : 0;
  const leftLeaningBoxes = boxes.filter(
    (b, i) => types[i] !== 'checkbox' && b.xMax <= 350 && (b.xMax - b.xMin) > 60,
  );
  // Only apply when >50% of boxes are left-leaning AND no box reaches past
  // x=550 (a multi-section form will have boxes spanning the full width).
  const isTwoColumnForm =
    leftLeaningBoxes.length >= 2 &&
    leftLeaningBoxes.length > boxes.length * 0.5 &&
    maxXMax <= 550;
  if (isTwoColumnForm) {
    const dividerCandidates = leftLeaningBoxes.map((b) => b.xMax).sort((a, b) => a - b);
    const divider = dividerCandidates[Math.floor(dividerCandidates.length / 2)];

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (types[i] === 'checkbox') continue;
      if (b.xMax > divider + 50) continue;
      if (b.xMax - b.xMin < 60) continue;
      const hasRightNeighbour = boxes.some(
        (ob, oi) => oi !== i && ob.xMin >= b.xMax - 20 && ob.xMin <= b.xMax + 100,
      );
      if (hasRightNeighbour) continue;
      const newXMin = Math.min(divider + 5, 950);
      const newXMax = Math.max(newXMin + opts.minWidth, 990);
      b.xMin = newXMin;
      b.xMax = Math.min(newXMax, 1000);
    }
  }

  // Step 5 + Step 6: Row clusters.
  // We do NOT run mergeClusters on rows: on dense forms rows can be as little
  // as 30–40 units apart, so merging adjacent clusters would collapse the whole
  // page into one band. Trust clusterBy's greedy split — any two fields whose
  // y-midpoints differ by more than rowToleranceY are on different rows.
  const rowClusters = clusterBy(
    boxes.map((b, i) => ({ i, key: (b.yMin + b.yMax) / 2 })),
    opts.rowToleranceY,
  );
  for (const cluster of rowClusters) {
    if (cluster.length < 2) continue;
    const avgMid = cluster.reduce((s, c) => s + c.key, 0) / cluster.length;
    for (const { i } of cluster) {
      const fType = types[i];
      if (fType === 'multiline' || fType === 'signature') {
        // Preserve original height — only snap the vertical midpoint so
        // the field stays on the same baseline as its row neighbours.
        const origH = boxes[i].yMax - boxes[i].yMin;
        const yMin = clamp(Math.round(avgMid - origH / 2), 0, 1000 - origH);
        boxes[i].yMin = yMin;
        boxes[i].yMax = yMin + origH;
      } else {
        // Single-line: snap to uniform targetHeight.
        const half = targetHeight / 2;
        const yMin = clamp(Math.round(avgMid - half), 0, 1000 - targetHeight);
        boxes[i].yMin = yMin;
        boxes[i].yMax = yMin + targetHeight;
      }
    }
  }

  // Category-first left-column clusters. Fields with the same profile
  // category (e.g. all the "address" lines) almost always share a
  // visual column on the printed form, so we snap them first with a
  // looser tolerance — that catches alignments the generic xMin
  // clustering would miss when the AI's bbox prediction drifts by 20+
  // units between consecutive lines of a block.
  const byCategory = new Map<string, number[]>();
  fields.forEach((f, i) => {
    const cat = fieldCategory(f);
    if (!cat) return;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(i);
  });
  for (const indices of byCategory.values()) {
    if (indices.length < 2) continue;
    // Cluster INSIDE the category using a slightly looser tolerance —
    // enough to catch a column that drifts by ~25 units, but not so
    // loose that we'd accidentally merge two visually distinct columns.
    const looseTolerance = opts.colToleranceX * 2;
    const clusters = mergeClusters(
      clusterBy(
        indices.map((i) => ({ i, key: boxes[i].xMin })),
        looseTolerance,
      ),
      looseTolerance,  // merge gap = same as tolerance (not 2×) to avoid over-merging
    );
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const avgX = cluster.reduce((s, c) => s + c.key, 0) / cluster.length;
      const xMin = clamp(Math.round(avgX), 0, 990);
      for (const { i } of cluster) {
        const width = boxes[i].xMax - boxes[i].xMin;
        boxes[i].xMin = xMin;
        const w = Math.max(width, opts.minWidth);
        boxes[i].xMax = Math.min(xMin + w, 1000);
      }
    }
  }

  // Generic left-column clusters with merge pass. Runs AFTER the category
  // pass so generic fields can still align against category-snapped ones.
  const leftClusters = mergeClusters(
    clusterBy(
      boxes.map((b, i) => ({ i, key: b.xMin })),
      opts.colToleranceX,
    ),
    opts.colToleranceX,  // merge gap = same as tolerance to avoid over-merging columns
  );
  for (const cluster of leftClusters) {
    if (cluster.length < 2) continue;
    const avgX = cluster.reduce((s, c) => s + c.key, 0) / cluster.length;
    const xMin = clamp(Math.round(avgX), 0, 990);
    for (const { i } of cluster) {
      const width = boxes[i].xMax - boxes[i].xMin;
      boxes[i].xMin = xMin;
      // Re-apply width so the right edge follows the left snap. Enforce
      // minWidth so narrow boxes stay clickable.
      const w = Math.max(width, opts.minWidth);
      boxes[i].xMax = Math.min(xMin + w, 1000);
    }
  }

  // Right-edge clusters with merge pass — handles right-aligned data columns.
  const rightClusters = mergeClusters(
    clusterBy(
      boxes.map((b, i) => ({ i, key: b.xMax })),
      opts.colToleranceX,
    ),
    opts.colToleranceX,  // merge gap = same as tolerance to avoid over-merging
  );
  for (const cluster of rightClusters) {
    if (cluster.length < 2) continue;
    const avgX = cluster.reduce((s, c) => s + c.key, 0) / cluster.length;
    const xMax = clamp(Math.round(avgX), 10, 1000);
    for (const { i } of cluster) {
      boxes[i].xMax = xMax;
      // Make sure xMin didn't drift past xMax after snapping.
      if (boxes[i].xMin >= xMax - opts.minWidth) {
        boxes[i].xMin = Math.max(0, xMax - opts.minWidth);
      }
    }
  }

  // Step 7: Height normalisation for singletons (fields not already matched
  // by the row clusters above). Multiline and signature fields keep their
  // original height. Only snap when the height is drastically off — we
  // use a wide ±50% band so that fields in compact table cells (which are
  // intentionally shorter than the global average) are left alone.
  if (opts.normaliseSingletonHeight) {
    for (let i = 0; i < boxes.length; i += 1) {
      const fType = types[i];
      if (fType === 'multiline' || fType === 'signature') continue;
      const b = boxes[i];
      const h = b.yMax - b.yMin;
      // Leave tall boxes alone (table cells, multiline masquerading as text).
      if (h >= targetHeight * 2) continue;
      // Only normalize if height is less than half the target (really tiny
      // slivers) — don't touch anything that's in a reasonable range.
      if (h >= targetHeight * 0.5) continue;
      const mid = (b.yMin + b.yMax) / 2;
      const yMin = clamp(Math.round(mid - targetHeight / 2), 0, 1000 - targetHeight);
      b.yMin = yMin;
      b.yMax = yMin + targetHeight;
    }
  }

  // Step 8: Final safety pass — enforce minWidth + minHeight + valid ordering.
  // Type-aware: checkboxes get a smaller minimum so they stay square.
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    const fType = types[i];
    const effectiveMinW = fType === 'checkbox' ? 15 : opts.minWidth;
    const effectiveMinH = fType === 'checkbox' ? 15 : opts.minHeight;
    if (b.xMax - b.xMin < effectiveMinW) {
      b.xMax = Math.min(1000, b.xMin + effectiveMinW);
    }
    if (b.yMax - b.yMin < effectiveMinH) {
      b.yMax = Math.min(1000, b.yMin + effectiveMinH);
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

/**
 * Post-process clusters by merging adjacent pairs whose ranges are within
 * `mergeGap` of each other. Fixes the case where greedy-consecutive
 * clustering split a real row/column into two clusters because one field
 * happened to sit just outside the primary tolerance.
 */
function mergeClusters<T extends { key: number }>(
  clusters: T[][],
  mergeGap: number,
): T[][] {
  if (clusters.length <= 1) return clusters;
  const out: T[][] = [clusters[0]];
  for (let c = 1; c < clusters.length; c += 1) {
    const prev = out[out.length - 1];
    const curr = clusters[c];
    const prevMax = Math.max(...prev.map((it) => it.key));
    const currMin = Math.min(...curr.map((it) => it.key));
    if (currMin - prevMax <= mergeGap) {
      out[out.length - 1] = prev.concat(curr);
    } else {
      out.push(curr);
    }
  }
  return out;
}

/**
 * Types that represent single-line form blanks. Only these feed the
 * target-height computation so multiline/signature outliers don't skew it.
 */
const SINGLE_LINE_TYPES = new Set<string>(['text', 'number', 'date', 'email']);

/**
 * Compute the target single-line field height for this page.
 *
 * Strategy (in priority order):
 *   1. Mode of heights among single-line fields, bucketed to nearest 5 units.
 *      Requires at least 2 fields sharing the same bucket to count as a mode.
 *   2. Median of those same heights when no mode has a clear plurality.
 *   3. Caller-supplied `fallback` when fewer than 2 single-line fields exist.
 *
 * Result is always clamped to [20, 40] so extreme Gemini outliers don't
 * corrupt the whole page.
 */
function computeTargetHeight(
  boxes: TemplateBbox[],
  types: string[],
  fallback: number,
): number {
  const heights = boxes
    .filter((_, i) => SINGLE_LINE_TYPES.has(types[i]))
    .map((b) => b.yMax - b.yMin)
    .filter((h) => Number.isFinite(h) && h > 0);

  if (heights.length < 2) return clamp(fallback, 20, 40);

  // Mode: round each height to the nearest 5, find the most common bucket.
  const buckets = new Map<number, number>();
  for (const h of heights) {
    const bucket = Math.round(h / 5) * 5;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  let modeCount = 0;
  let modeValue = 0;
  for (const [val, count] of buckets) {
    if (count > modeCount) {
      modeCount = count;
      modeValue = val;
    }
  }
  if (modeCount >= 2) return clamp(modeValue, 20, 40);

  // Fallback: median of all single-line heights.
  const sorted = [...heights].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return clamp(median, 20, 40);
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
