/**
 * Snap Form Builder field boxes onto the PDF's real text layer and table grid.
 *
 * Gemini Pass-2 guesses normalised [0,1000] boxes from the page image. On
 * born-digital PDFs (MCA testimonials, company forms, etc.) that guess
 * routinely lands on the printed label or a neighbouring row. The PDF
 * already knows where every label sits — and usually draws the table
 * borders as vector rectangles/lines — so we:
 *   1. Match each field to its printed label.
 *   2. Size the box to the VALUE CELL of that table (not the label, not
 *      the width of any already-typed text).
 *
 * Image uploads and scanned PDFs with no text layer are left unchanged.
 */

import type { TemplateBbox, TemplateField, TemplateFieldType } from '@/lib/vessel-document-templates';

export interface PdfTextItem {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface PdfTextLine {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  yMid: number;
  items: PdfTextItem[];
}

export interface TableCell {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface HRule {
  y: number;
  x0: number;
  x1: number;
}

export interface PageSnapData {
  lines: PdfTextLine[];
  cells: TableCell[];
  vLines: number[];
  hLines: number[];
  hRules: HRule[];
}

const ROW_Y_TOLERANCE = 12;
const MIN_VALUE_WIDTH = 40;
const PAGE_RIGHT_CAP = 920;
const PAGE_LEFT_PAD = 8;
const CELL_INSET = 4;
const MIN_CELL_W = 80;
const MIN_CELL_H = 16;
const MAX_ROW_H = 72;
const LINE_CLUSTER_TOL = 3;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function sanitise(b: TemplateBbox): TemplateBbox {
  const xMin = clamp(Math.round(b.xMin), 0, 999);
  const yMin = clamp(Math.round(b.yMin), 0, 999);
  const xMax = clamp(Math.round(Math.max(b.xMax, xMin + 8)), 1, 1000);
  const yMax = clamp(Math.round(Math.max(b.yMax, yMin + 8)), 1, 1000);
  return { xMin, yMin, xMax, yMax };
}

function insetCell(cell: TableCell, inset = CELL_INSET): TemplateBbox {
  const xMin = cell.xMin + inset;
  const yMin = cell.yMin + inset;
  const xMax = cell.xMax - inset;
  const yMax = cell.yMax - inset;
  return sanitise({
    xMin,
    yMin,
    xMax: Math.max(xMax, xMin + 8),
    yMax: Math.max(yMax, yMin + 8),
  });
}

export function normalizeFormLabel(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|of|or|and|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeKeepStops(raw: string): string[] {
  return (raw || '')
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0);
}

function tokenize(raw: string): string[] {
  return normalizeFormLabel(raw).split(' ').filter((t) => t.length > 0);
}

/**
 * Locate the printed label on a line, including "of"/"in" and trailing : **
 * so the value box starts after the whole caption, not mid-word.
 */
export function coverLabelOnLine(
  line: PdfTextLine,
  label: string,
): { xMin: number; xMax: number } | null {
  const words = tokenizeKeepStops(label.replace(/\*+$/g, ''));
  if (!words.length) return null;

  const items = line.items.filter((it) => it.text.trim().length > 0);
  if (!items.length) return null;

  let wordIdx = 0;
  let xMin: number | null = null;
  let xMax: number | null = null;

  const normItem = (s: string) => s.toLowerCase().replace(/[^a-z0-9*]+/g, '');

  for (const it of items) {
    const raw = it.text.trim();
    const n = normItem(raw);
    if (wordIdx >= words.length) {
      if (/^[:*]+$/.test(raw) || /[:*]+$/.test(raw)) {
        xMax = it.xMax;
        continue;
      }
      break;
    }
    const want = words[wordIdx].replace(/[^a-z0-9]/g, '');
    if (!want) {
      wordIdx += 1;
      continue;
    }
    if (n && (n === want || n.includes(want) || want.includes(n))) {
      if (xMin == null) xMin = it.xMin;
      xMax = it.xMax;
      wordIdx += 1;
      if (/[:*]+$/.test(raw)) xMax = it.xMax;
      continue;
    }
    if (xMin != null && /^[:*]+$/.test(raw)) {
      xMax = it.xMax;
    }
  }

  if (xMin == null || xMax == null) return labelSpanOnLine(line, label);
  if (wordIdx < Math.max(1, Math.ceil(words.length * 0.5))) return labelSpanOnLine(line, label);
  return { xMin, xMax };
}

/**
 * Score how well `haystack` contains `needle` as an ordered token sequence.
 * Exact / prefix matches beat long instructional sentences that merely
 * mention the same words ("in capacity of master..." vs "Capacity:").
 */
export function scoreLabelAgainstText(needle: string, haystack: string): number {
  const n = tokenize(needle);
  const h = tokenize(haystack);
  if (!n.length || !h.length) return 0;
  if (h.join(' ') === n.join(' ')) return 100;

  const needleJoined = n.join(' ');
  const hayJoined = h.join(' ');
  if (hayJoined.startsWith(needleJoined)) {
    return Math.max(70, 96 - Math.min(20, hayJoined.length - needleJoined.length));
  }

  let hi = 0;
  let matched = 0;
  for (const token of n) {
    while (hi < h.length && h[hi] !== token) hi += 1;
    if (hi >= h.length) break;
    matched += 1;
    hi += 1;
  }
  if (matched < n.length) return 0;

  const coverage = matched / Math.max(h.length, 1);
  const compactness = matched / n.length;
  const extraTokens = Math.max(0, h.length - n.length - 1);
  const penalty = extraTokens * 7;
  return Math.max(0, Math.round(55 + compactness * 25 + coverage * 15 - penalty));
}

function clusterItemsIntoLines(items: PdfTextItem[]): PdfTextLine[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => {
    const ya = (a.yMin + a.yMax) / 2;
    const yb = (b.yMin + b.yMax) / 2;
    if (Math.abs(ya - yb) > ROW_Y_TOLERANCE) return ya - yb;
    return a.xMin - b.xMin;
  });

  const lines: PdfTextLine[] = [];
  let current: PdfTextItem[] = [sorted[0]];

  const flush = () => {
    if (!current.length) return;
    const ordered = [...current].sort((a, b) => a.xMin - b.xMin);
    const text = ordered
      .map((it, i) => {
        const prev = ordered[i - 1];
        const gap = prev ? it.xMin - prev.xMax : 0;
        const joiner = gap > 6 ? ' ' : '';
        return `${joiner}${it.text}`;
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    lines.push({
      text,
      xMin: Math.min(...ordered.map((it) => it.xMin)),
      yMin: Math.min(...ordered.map((it) => it.yMin)),
      xMax: Math.max(...ordered.map((it) => it.xMax)),
      yMax: Math.max(...ordered.map((it) => it.yMax)),
      yMid:
        (Math.min(...ordered.map((it) => it.yMin)) +
          Math.max(...ordered.map((it) => it.yMax))) /
        2,
      items: ordered,
    });
    current = [];
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const prevMid =
      (current[current.length - 1].yMin + current[current.length - 1].yMax) / 2;
    const nextMid = (sorted[i].yMin + sorted[i].yMax) / 2;
    if (Math.abs(nextMid - prevMid) <= ROW_Y_TOLERANCE) {
      current.push(sorted[i]);
    } else {
      flush();
      current = [sorted[i]];
    }
  }
  flush();
  return lines;
}

function labelSpanOnLine(
  line: PdfTextLine,
  label: string,
): { xMin: number; xMax: number } | null {
  const nTokens = tokenize(label);
  if (!nTokens.length) return null;
  const itemTokens = line.items.map((it) => ({
    item: it,
    tokens: tokenize(it.text),
  }));
  const flat: { token: string; xMin: number; xMax: number }[] = [];
  for (const { item, tokens } of itemTokens) {
    if (!tokens.length) continue;
    const width = Math.max(1, item.xMax - item.xMin);
    tokens.forEach((token, ti) => {
      const start = item.xMin + (width * ti) / tokens.length;
      const end = item.xMin + (width * (ti + 1)) / tokens.length;
      flat.push({ token, xMin: start, xMax: end });
    });
  }
  if (!flat.length) return null;

  for (let i = 0; i <= flat.length - nTokens.length; i += 1) {
    let ok = true;
    for (let t = 0; t < nTokens.length; t += 1) {
      if (flat[i + t].token !== nTokens[t]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    return {
      xMin: flat[i].xMin,
      xMax: flat[i + nTokens.length - 1].xMax,
    };
  }
  return { xMin: line.xMin, xMax: Math.min(line.xMax, line.xMin + 180) };
}

function nextLabelXOnLine(
  line: PdfTextLine,
  afterX: number,
  otherLabels: string[],
): number | null {
  let best: number | null = null;
  for (const other of otherLabels) {
    const span = labelSpanOnLine(line, other);
    if (!span) continue;
    if (span.xMin < afterX + 20) continue;
    if (scoreLabelAgainstText(other, line.text) < 70) continue;
    if (best == null || span.xMin < best) best = span.xMin;
  }
  return best;
}

function yOverlap(a: TableCell, b: TableCell): number {
  return Math.min(a.yMax, b.yMax) - Math.max(a.yMin, b.yMin);
}

function cellArea(c: TableCell): number {
  return Math.max(0, c.xMax - c.xMin) * Math.max(0, c.yMax - c.yMin);
}

function containsPoint(c: TableCell, x: number, y: number, pad = 2): boolean {
  return x >= c.xMin - pad && x <= c.xMax + pad && y >= c.yMin - pad && y <= c.yMax + pad;
}

function isPlausibleRowCell(c: TableCell): boolean {
  const w = c.xMax - c.xMin;
  const h = c.yMax - c.yMin;
  return w >= MIN_CELL_W && h >= MIN_CELL_H && h <= MAX_ROW_H;
}

/**
 * Given a label sitting in (or just left of) a table, return the VALUE
 * cell — the empty/input rectangle a user would write in — not the label cell.
 */
export function findValueCell(opts: {
  labelSpan: { xMin: number; xMax: number };
  yMid: number;
  cells: TableCell[];
  vLines: number[];
}): TableCell | null {
  const { labelSpan, yMid, cells, vLines } = opts;
  if (!cells.length) return null;

  const lx = (labelSpan.xMin + labelSpan.xMax) / 2;
  const plausible = cells.filter(isPlausibleRowCell);
  const containing = plausible.filter((c) => containsPoint(c, lx, yMid, 3));
  const home =
    containing.sort((a, b) => cellArea(a) - cellArea(b))[0] ??
    plausible
      .filter((c) => yMid >= c.yMin - 4 && yMid <= c.yMax + 4 && labelSpan.xMax <= c.xMax + 4)
      .sort((a, b) => Math.abs(a.xMin - labelSpan.xMax) - Math.abs(b.xMin - labelSpan.xMax))[0];

  if (!home) return null;

  const homeH = home.yMax - home.yMin;
  const neighbors = plausible
    .filter((c) => {
      if (c === home) return false;
      if (yOverlap(c, home) < homeH * 0.55) return false;
      return c.xMin >= home.xMax - 10 && c.xMin <= home.xMax + 24;
    })
    .sort((a, b) => a.xMin - b.xMin);

  const labelWidth = labelSpan.xMax - labelSpan.xMin;
  const homeW = home.xMax - home.xMin;
  const labelFillsCell = labelWidth > homeW * 0.35 && labelSpan.xMax > home.xMin + homeW * 0.4;

  if (neighbors.length && (labelFillsCell || homeW < 320)) {
    const value = neighbors[0];
    return splitCellByVerticals(value, labelSpan, vLines) ?? value;
  }

  const split = splitCellByVerticals(home, labelSpan, vLines);
  if (split && split.xMax - split.xMin >= MIN_VALUE_WIDTH) return split;

  if (home.xMax - (labelSpan.xMax + 4) >= MIN_VALUE_WIDTH) {
    return {
      xMin: Math.max(home.xMin, labelSpan.xMax + 3),
      yMin: home.yMin,
      xMax: home.xMax,
      yMax: home.yMax,
    };
  }

  return neighbors[0] ?? home;
}

function splitCellByVerticals(
  cell: TableCell,
  labelSpan: { xMin: number; xMax: number },
  vLines: number[],
): TableCell | null {
  const interior = vLines
    .filter((x) => x > cell.xMin + 12 && x < cell.xMax - 12)
    .sort((a, b) => a - b);
  if (!interior.length) return null;

  const afterLabel = interior.filter((x) => x >= labelSpan.xMax - 8);
  if (!afterLabel.length) return null;

  const xMin = afterLabel[0];
  const xMax = afterLabel[1] ?? cell.xMax;
  if (xMax - xMin < MIN_VALUE_WIDTH) return null;
  return { xMin, yMin: cell.yMin, xMax, yMax: cell.yMax };
}

function rowBandFromHLines(yMid: number, hLines: number[]): { yMin: number; yMax: number } | null {
  if (hLines.length < 2) return null;
  const sorted = [...hLines].sort((a, b) => a - b);
  let above: number | null = null;
  let below: number | null = null;
  for (const y of sorted) {
    if (y <= yMid + 1) above = y;
    if (y >= yMid - 1 && below == null) below = y;
  }
  if (above == null || below == null || below === above) return null;
  const h = below - above;
  if (h < MIN_CELL_H || h > MAX_ROW_H) return null;
  return { yMin: above, yMax: below };
}

function stackedRowBand(line: PdfTextLine, lines: PdfTextLine[]): { yMin: number; yMax: number } {
  const col = lines
    .filter((l) => Math.abs(l.xMin - line.xMin) < 50)
    .sort((a, b) => a.yMid - b.yMid);
  const i = col.findIndex((l) => l === line || Math.abs(l.yMid - line.yMid) < 2);
  const prev = i > 0 ? col[i - 1] : null;
  const next = i >= 0 && i < col.length - 1 ? col[i + 1] : null;

  let yMin = prev ? (prev.yMax + line.yMin) / 2 : line.yMin - 6;
  let yMax = next ? (line.yMax + next.yMin) / 2 : line.yMax + 6;

  if (yMax - yMin > MAX_ROW_H) {
    const mid = line.yMid;
    yMin = mid - 16;
    yMax = mid + 16;
  }
  if (yMax - yMin < MIN_CELL_H) {
    const extra = (MIN_CELL_H - (yMax - yMin)) / 2;
    yMin -= extra;
    yMax += extra;
  }
  return {
    yMin: clamp(yMin, 0, 999),
    yMax: clamp(yMax, 1, 1000),
  };
}

function inferTableRight(opts: {
  yMin: number;
  yMax: number;
  labelEndX: number;
  hRules: HRule[];
  vLines: number[];
  lines: PdfTextLine[];
}): number {
  const { yMin, yMax, labelEndX, hRules, vLines, lines } = opts;
  const minRight = labelEndX + MIN_VALUE_WIDTH;
  const candidates: number[] = [];

  for (const r of hRules) {
    const nearRow =
      (r.y >= yMin - 8 && r.y <= yMax + 8) ||
      Math.abs(r.y - yMin) < 6 ||
      Math.abs(r.y - yMax) < 6;
    if (nearRow && r.x1 - r.x0 > 120) candidates.push(r.x1);
  }

  const vRight = vLines.filter((x) => x > labelEndX + 24 && x <= PAGE_RIGHT_CAP);
  if (vRight.length) candidates.push(Math.max(...vRight));

  const stampLabels = lines.filter(
    (l) =>
      l.xMin > 480 &&
      l.xMin > labelEndX + 20 &&
      l.yMid >= yMin - 70 &&
      l.yMid <= yMax + 70,
  );
  if (stampLabels.length) {
    candidates.push(Math.min(...stampLabels.map((l) => l.xMin)) - 5);
  }

  const plausible = candidates.filter((x) => x >= minRight && x <= PAGE_RIGHT_CAP);
  if (!plausible.length) return clamp(labelEndX + 380, minRight, 820);

  if (stampLabels.length) {
    const stampLeft = Math.min(...stampLabels.map((l) => l.xMin)) - 5;
    if (stampLeft >= minRight) return clamp(stampLeft, minRight, PAGE_RIGHT_CAP);
  }

  const ruleRights = candidates.filter((x) => x <= 900);
  return clamp(Math.max(...(ruleRights.length ? ruleRights : plausible)), minRight, PAGE_RIGHT_CAP);
}

function valueBoxForLabel(opts: {
  line: PdfTextLine;
  labelSpan: { xMin: number; xMax: number };
  otherLabels: string[];
  type?: TemplateFieldType;
  cells: TableCell[];
  vLines: number[];
  hLines: number[];
  hRules: HRule[];
  lines: PdfTextLine[];
}): TemplateBbox {
  const { line, labelSpan, otherLabels, type, cells, vLines, hLines, hRules, lines } = opts;

  if (type === 'checkbox') {
    const size = 22;
    const xMin = clamp(labelSpan.xMin - size - 6, PAGE_LEFT_PAD, 970);
    return sanitise({
      xMin,
      yMin: line.yMid - size / 2,
      xMax: xMin + size,
      yMax: line.yMid + size / 2,
    });
  }

  const stacked = stackedRowBand(line, lines);
  const hBand = rowBandFromHLines(line.yMid, hLines);
  const band = hBand ?? stacked;

  const tableRight = inferTableRight({
    yMin: band.yMin,
    yMax: band.yMax,
    labelEndX: labelSpan.xMax,
    hRules,
    vLines,
    lines,
  });

  const cell = findValueCell({
    labelSpan,
    yMid: line.yMid,
    cells,
    vLines,
  });

  if (cell) {
    const yMin = cell.yMax - cell.yMin > MAX_ROW_H && type !== 'multiline' ? band.yMin : cell.yMin;
    const yMax = cell.yMax - cell.yMin > MAX_ROW_H && type !== 'multiline' ? band.yMax : cell.yMax;
    const xMin = Math.max(cell.xMin + CELL_INSET, labelSpan.xMax + 4);
    const xMax = Math.min(cell.xMax - CELL_INSET, tableRight);
    if (xMax - xMin >= MIN_VALUE_WIDTH) {
      return sanitise({ xMin, yMin: yMin + CELL_INSET, xMax, yMax: yMax - CELL_INSET });
    }
  }

  const gapStart = labelSpan.xMax + 5;
  const nextLabel = nextLabelXOnLine(line, gapStart, otherLabels);
  let xMax = nextLabel != null ? Math.min(nextLabel - 6, tableRight) : tableRight;
  xMax = Math.min(xMax, tableRight);
  const xMin = clamp(gapStart, 0, 960);

  if (line.xMax - labelSpan.xMax < 28 && nextLabel == null) {
    return sanitise({
      xMin,
      yMin: band.yMin + CELL_INSET,
      xMax: Math.min(xMin + 220, tableRight),
      yMax: band.yMax - CELL_INSET,
    });
  }

  return sanitise({
    xMin,
    yMin: band.yMin + CELL_INSET,
    xMax: clamp(xMax, xMin + MIN_VALUE_WIDTH, PAGE_RIGHT_CAP),
    yMax: band.yMax - CELL_INSET,
  });
}

interface LineMatch {
  lineIndex: number;
  score: number;
}

function findLineMatches(label: string, lines: PdfTextLine[]): LineMatch[] {
  const out: LineMatch[] = [];
  lines.forEach((line, lineIndex) => {
    const score = scoreLabelAgainstText(label, line.text);
    if (score >= 70) out.push({ lineIndex, score });
  });
  return out.sort((a, b) => b.score - a.score);
}

function asPageData(value: PageSnapData | PdfTextLine[]): PageSnapData {
  if (Array.isArray(value)) {
    return { lines: value, cells: [], vLines: [], hLines: [], hRules: [] };
  }
  return value;
}

/**
 * Reposition fields onto value cells adjacent to matching PDF labels.
 */
export function snapFieldsToPdfLines(
  fields: TemplateField[],
  pages: Map<number, PageSnapData | PdfTextLine[]>,
): TemplateField[] {
  const used = new Set<string>();
  const labels = fields.map((f) => f.label || f.originalLabel || '');
  const resolved = new Map<number, PageSnapData>();
  for (const [page, value] of pages) resolved.set(page, asPageData(value));

  const snapped = fields.map((field, fieldIndex) => {
    const label = field.label || field.originalLabel || '';
    if (!label.trim()) return field;
    const pageData = resolved.get(field.page ?? 1);
    if (!pageData?.lines.length) return field;

    const matches = findLineMatches(label, pageData.lines);
    if (!matches.length) return field;

    const hintY = field.bbox ? (field.bbox.yMin + field.bbox.yMax) / 2 : 0;
    const unused = matches.filter(
      (m) => !used.has(`${field.page ?? 1}:${m.lineIndex}:${normalizeFormLabel(label)}`),
    );
    const pool = unused.length ? unused : matches;

    const uniqueHigh = pool.filter((m) => m.score >= 88);
    let chosen = uniqueHigh[0] ?? pool[0];
    if (pool.length > 1) {
      chosen = [...pool].sort((a, b) => {
        const da = Math.abs(pageData.lines[a.lineIndex].yMid - hintY);
        const db = Math.abs(pageData.lines[b.lineIndex].yMid - hintY);
        if (a.score !== b.score && Math.abs(a.score - b.score) > 8) return b.score - a.score;
        return da - db;
      })[0];
    }

    const line = pageData.lines[chosen.lineIndex];
    const span = coverLabelOnLine(line, label) ?? labelSpanOnLine(line, label);
    if (!span) return field;

    const otherLabels = labels.filter((_, i) => i !== fieldIndex && labels[i].trim());
    const bbox = valueBoxForLabel({
      line,
      labelSpan: span,
      otherLabels,
      type: field.type,
      cells: pageData.cells,
      vLines: pageData.vLines,
      hLines: pageData.hLines,
      hRules: pageData.hRules ?? [],
      lines: pageData.lines,
    });

    used.add(`${field.page ?? 1}:${chosen.lineIndex}:${normalizeFormLabel(label)}`);
    return { ...field, bbox };
  });

  return snapped;
}

function alignLeftColumnValueEdges(fields: TemplateField[]): TemplateField[] {
  const leftValues = fields
    .map((f) => ({ f, xMin: f.bbox.xMin }))
    .filter(({ f }) => f.bbox.xMin >= 180 && f.bbox.xMin <= 520 && f.bbox.xMax - f.bbox.xMin > 80);
  if (leftValues.length < 3) return fields;
  const sorted = [...leftValues].map((v) => v.xMin).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return fields.map((f) => {
    if (Math.abs(f.bbox.xMin - median) > 40) return f;
    if (f.bbox.xMax <= median + MIN_VALUE_WIDTH) return f;
    return { ...f, bbox: sanitise({ ...f.bbox, xMin: median }) };
  });
}

// ---------------------------------------------------------------------------
// Vector table-grid extraction (pdf.js operator list)
// ---------------------------------------------------------------------------

function multiplyCtm(m: number[], n: number[]): number[] {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function applyCtm(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function clusterCoords(values: number[], tol: number): number[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = groups[groups.length - 1];
    if (sorted[i] - last[last.length - 1] <= tol) last.push(sorted[i]);
    else groups.push([sorted[i]]);
  }
  return groups
    .filter((g) => g.length >= 1)
    .map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}

function isCellSized(w: number, h: number): boolean {
  return w >= MIN_CELL_W && w <= 990 && h >= MIN_CELL_H && h <= MAX_ROW_H;
}

function buildCellsFromGrid(vLines: number[], hLines: number[]): TableCell[] {
  if (vLines.length < 2 || hLines.length < 2) return [];
  const vs = [...vLines].sort((a, b) => a - b);
  const hs = [...hLines].sort((a, b) => a - b);
  const cells: TableCell[] = [];
  for (let i = 0; i < vs.length - 1; i += 1) {
    for (let j = 0; j < hs.length - 1; j += 1) {
      const w = vs[i + 1] - vs[i];
      const h = hs[j + 1] - hs[j];
      if (!isCellSized(w, h)) continue;
      cells.push({ xMin: vs[i], yMin: hs[j], xMax: vs[i + 1], yMax: hs[j + 1] });
    }
  }
  return cells;
}

function mergeSimilarCells(cells: TableCell[]): TableCell[] {
  if (!cells.length) return cells;
  const out: TableCell[] = [];
  const used = new Set<number>();
  for (let i = 0; i < cells.length; i += 1) {
    if (used.has(i)) continue;
    let acc = { ...cells[i] };
    for (let k = i + 1; k < cells.length; k += 1) {
      if (used.has(k)) continue;
      const c = cells[k];
      const same =
        Math.abs(c.xMin - acc.xMin) < 5 &&
        Math.abs(c.xMax - acc.xMax) < 5 &&
        Math.abs(c.yMin - acc.yMin) < 5 &&
        Math.abs(c.yMax - acc.yMax) < 5;
      if (!same) continue;
      used.add(k);
      acc = {
        xMin: (acc.xMin + c.xMin) / 2,
        yMin: (acc.yMin + c.yMin) / 2,
        xMax: (acc.xMax + c.xMax) / 2,
        yMax: (acc.yMax + c.yMax) / 2,
      };
    }
    out.push(acc);
  }
  return out;
}

async function extractPageGeometry(
  page: any,
  viewport: { width: number; height: number; convertToViewportPoint: (x: number, y: number) => number[] },
  pdfjs: { OPS: Record<string, number> },
): Promise<{ cells: TableCell[]; vLines: number[]; hLines: number[]; hRules: HRule[] }> {
  const OPS = pdfjs.OPS;
  const toNorm = (xPdf: number, yPdf: number): { x: number; y: number } => {
    const [vx, vy] = viewport.convertToViewportPoint(xPdf, yPdf);
    return {
      x: (vx / viewport.width) * 1000,
      y: (vy / viewport.height) * 1000,
    };
  };

  const rawRects: TableCell[] = [];
  const rawV: { x: number; y0: number; y1: number }[] = [];
  const rawH: { y: number; x0: number; x1: number }[] = [];

  const addRectPdf = (x0: number, y0: number, x1: number, y1: number, ctm: number[]) => {
    const [p0x, p0y] = applyCtm(ctm, x0, y0);
    const [p1x, p1y] = applyCtm(ctm, x1, y1);
    const a = toNorm(p0x, p0y);
    const b = toNorm(p1x, p1y);
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    const w = xMax - xMin;
    const h = yMax - yMin;
    if (h < 6 && w >= 40) {
      rawH.push({ y: (yMin + yMax) / 2, x0: xMin, x1: xMax });
      return;
    }
    if (w < 4 && h >= 20) {
      rawV.push({ x: (xMin + xMax) / 2, y0: yMin, y1: yMax });
      return;
    }
    if (isCellSized(w, h) && !(w > 820 && h > 820)) {
      rawRects.push({ xMin, yMin, xMax, yMax });
    }
    // Cell borders also contribute grid lines.
    if (w >= 40 && h >= 8) {
      rawH.push({ y: yMin, x0: xMin, x1: xMax });
      rawH.push({ y: yMax, x0: xMin, x1: xMax });
      rawV.push({ x: xMin, y0: yMin, y1: yMax });
      rawV.push({ x: xMax, y0: yMin, y1: yMax });
    }
  };

  const addSegPdf = (x0: number, y0: number, x1: number, y1: number, ctm: number[]) => {
    const [p0x, p0y] = applyCtm(ctm, x0, y0);
    const [p1x, p1y] = applyCtm(ctm, x1, y1);
    const a = toNorm(p0x, p0y);
    const b = toNorm(p1x, p1y);
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx < 2.5 && dy >= 18) {
      rawV.push({ x: (a.x + b.x) / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
    } else if (dy < 2.5 && dx >= 30) {
      rawH.push({ y: (a.y + b.y) / 2, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) });
    }
  };

  const parseConstructPath = (ops: ArrayLike<number>, coords: ArrayLike<number>, ctm: number[]) => {
    let j = 0;
    let px = 0;
    let py = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < ops.length; i += 1) {
      const op = ops[i] | 0;
      if (op === OPS.rectangle) {
        const x = coords[j++];
        const y = coords[j++];
        const w = coords[j++];
        const h = coords[j++];
        addRectPdf(x, y, x + w, y + h, ctm);
        px = x;
        py = y;
      } else if (op === OPS.moveTo) {
        px = coords[j++];
        py = coords[j++];
        sx = px;
        sy = py;
      } else if (op === OPS.lineTo) {
        const x = coords[j++];
        const y = coords[j++];
        addSegPdf(px, py, x, y, ctm);
        px = x;
        py = y;
      } else if (op === OPS.closePath) {
        addSegPdf(px, py, sx, sy, ctm);
        px = sx;
        py = sy;
      } else if (op === OPS.curveTo) {
        j += 6;
      } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
        j += 4;
      }
    }
  };

  try {
    const opList = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];

    for (let i = 0; i < opList.fnArray.length; i += 1) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i] as any;
      if (fn === OPS.save) {
        stack.push(ctm.slice());
      } else if (fn === OPS.restore) {
        ctm = stack.pop() ?? ctm;
      } else if (fn === OPS.transform && args && args.length >= 6) {
        ctm = multiplyCtm(ctm, Array.from(args as ArrayLike<number>));
      } else if (fn === OPS.paintFormXObjectBegin && args?.[0]) {
        stack.push(ctm.slice());
        const matrix = args[0] as number[];
        if (matrix && matrix.length >= 6) ctm = multiplyCtm(ctm, Array.from(matrix));
      } else if (fn === OPS.paintFormXObjectEnd) {
        ctm = stack.pop() ?? ctm;
      } else if (fn === OPS.constructPath && args?.[0] != null && args?.[1] != null) {
        const next = opList.fnArray[i + 1];
        if (next === OPS.clip || next === OPS.eoClip) continue;
        parseConstructPath(args[0], args[1], ctm);
      }
    }
  } catch (err) {
    console.warn('[form-builder] PDF path extraction failed', err);
  }

  try {
    const annots = (await page.getAnnotations()) as Array<{ rect?: number[]; subtype?: string }>;
    for (const annot of annots ?? []) {
      const rect = annot.rect;
      if (!rect || rect.length < 4) continue;
      const a = toNorm(rect[0], rect[1]);
      const b = toNorm(rect[2], rect[3]);
      const cell = {
        xMin: Math.min(a.x, b.x),
        yMin: Math.min(a.y, b.y),
        xMax: Math.max(a.x, b.x),
        yMax: Math.max(a.y, b.y),
      };
      if (isCellSized(cell.xMax - cell.xMin, cell.yMax - cell.yMin)) rawRects.push(cell);
    }
  } catch {
    // Annotations are optional.
  }

  const longV = rawV.filter((s) => s.y1 - s.y0 >= 24);
  const longH = rawH.filter((s) => s.x1 - s.x0 >= 50);
  const vLines = clusterCoords(
    longV.map((s) => s.x),
    LINE_CLUSTER_TOL,
  );
  const hLines = clusterCoords(
    longH.map((s) => s.y),
    LINE_CLUSTER_TOL,
  );

  const gridCells = buildCellsFromGrid(vLines, hLines);
  const cells = mergeSimilarCells([...rawRects, ...gridCells]);
  const hRules: HRule[] = hLines.map((y) => {
    const group = longH.filter((s) => Math.abs(s.y - y) <= LINE_CLUSTER_TOL + 1);
    return {
      y,
      x0: group.length ? Math.min(...group.map((s) => s.x0)) : 40,
      x1: group.length ? Math.max(...group.map((s) => s.x1)) : 900,
    };
  });

  return { cells, vLines, hLines, hRules };
}

async function extractPdfPageData(file: File): Promise<Map<number, PageSnapData>> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = new Map<number, PageSnapData>();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];

    for (const raw of content.items) {
      if (!raw || typeof raw !== 'object' || !('str' in raw)) continue;
      const item = raw as {
        str: string;
        transform: number[];
        width: number;
      };
      const text = (item.str || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const [, , c, d, e, f] = item.transform;
      const fontHeightPdf = Math.hypot(c, d) || Math.abs(d) || 9;
      const widthPdf = item.width || 0;
      const [x0, y0] = viewport.convertToViewportPoint(e, f);
      const [x1, y1] = viewport.convertToViewportPoint(e + widthPdf, f + fontHeightPdf);
      const xMinPx = Math.min(x0, x1);
      const xMaxPx = Math.max(x0, x1);
      const yMinPx = Math.min(y0, y1);
      const yMaxPx = Math.max(y0, y1);
      if (xMaxPx - xMinPx < 0.5 && yMaxPx - yMinPx < 0.5) continue;
      items.push({
        text,
        xMin: (xMinPx / viewport.width) * 1000,
        xMax: (xMaxPx / viewport.width) * 1000,
        yMin: (yMinPx / viewport.height) * 1000,
        yMax: (yMaxPx / viewport.height) * 1000,
      });
    }

    const geometry = await extractPageGeometry(page, viewport, pdfjs);
    pages.set(pageNum, {
      lines: clusterItemsIntoLines(items),
      cells: geometry.cells,
      vLines: geometry.vLines,
      hLines: geometry.hLines,
      hRules: geometry.hRules,
    });
  }

  return pages;
}

function pageHasUsableText(lines: PdfTextLine[]): boolean {
  const chars = lines.reduce((n, line) => n + line.text.replace(/\s+/g, '').length, 0);
  return chars >= 40 && lines.length >= 4;
}

/**
 * Client-side entry: load the PDF with the same pdf.js the overlay uses,
 * then snap every field whose label we can find onto its table value cell.
 */
export async function snapTemplateFieldsToPdfText(
  file: File,
  fields: TemplateField[],
): Promise<TemplateField[]> {
  if (!file || file.type !== 'application/pdf' || !fields.length) return fields;

  const pages = await extractPdfPageData(file);
  const usable = new Map<number, PageSnapData>();
  for (const [page, data] of pages) {
    if (pageHasUsableText(data.lines)) usable.set(page, data);
  }
  if (!usable.size) return fields;

  return snapFieldsToPdfLines(fields, usable);
}
