/**
 * Produce a downloadable, value-filled version of a scanned document.
 *
 * The AI scanner extracts fields + normalized `[0, 1000]` bounding boxes from
 * the uploaded document. `fillScannedDocument` takes those fields together
 * with the user's edited values and stamps the values into their bounding
 * boxes, returning a PDF `Blob` ready to download.
 *
 *   - PDFs  → loaded with `pdf-lib`, each field's value is drawn as text at
 *             the detected position on the correct page.
 *   - Images → rendered onto a canvas, values drawn at the detected
 *             positions, then the annotated canvas is embedded as a single-
 *             page PDF.
 *
 * This is what the user gets out of the scanner instead of having to copy
 * values by hand.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface FillableField {
  fieldName: string;
  value: string;
  page?: number;
  bbox?: { yMin: number; xMin: number; yMax: number; xMax: number };
}

export interface FillOptions {
  /** How we scale font size relative to bbox height (default 0.55). */
  fontScale?: number;
  /** Text color in 0..1 RGB tuple (default black). */
  color?: { r: number; g: number; b: number };
  /** Minimum font size in points (default 6). */
  minFontSize?: number;
  /** Maximum font size in points (default 14). */
  maxFontSize?: number;
}

const DEFAULT_OPTS: Required<FillOptions> = {
  fontScale: 0.55,
  color: { r: 0, g: 0, b: 0 },
  minFontSize: 6,
  maxFontSize: 14,
};

/**
 * Keep only the fields the caller actually wants stamped: must have a value,
 * a bbox, and coherent coordinates.
 */
function usableFields(fields: FillableField[]): FillableField[] {
  return fields.filter((f) => {
    if (!f.value || !f.bbox) return false;
    const { xMin, xMax, yMin, yMax } = f.bbox;
    if (xMax <= xMin || yMax <= yMin) return false;
    if (xMin < 0 || xMax > 1000 || yMin < 0 || yMax > 1000) return false;
    return true;
  });
}

/**
 * pdf-lib's standard Helvetica uses WinAnsi encoding, which can't
 * represent newlines, tabs, or any character outside the WinAnsi code
 * page. Passing such characters to `font.widthOfTextAtSize` or
 * `page.drawText` throws ("WinAnsi cannot encode ..."). We preflight
 * every value through this helper so stamping never blows up on:
 *   - newlines (\n, \r\n) coming from multiline textareas or pasted text,
 *   - tabs (\t),
 *   - smart/curly quotes, en/em dashes, ellipses, non-breaking spaces,
 *     which users get for free from iOS autocorrect + Word docs,
 *   - anything else outside the Latin-1 range — replaced with '?' so
 *     the stamp shows missing glyphs instead of crashing.
 *
 * Returns one entry per logical line. Multiline fields get drawn line-
 * by-line by the caller; single-line values always return `[sanitized]`.
 */
function sanitizeForWinAnsi(value: string): string[] {
  if (!value) return [];
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');
  const lines = normalized.split('\n').map((line) =>
    Array.from(line)
      .map((ch) => (ch.charCodeAt(0) > 255 ? '?' : ch))
      .join(''),
  );
  // Drop purely-empty trailing lines that users often accidentally add
  // with a stray Enter at the end of a textarea.
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Fit a string to a given pixel width by picking the largest font size that
 * renders within `maxWidthPt`, clamped to [minFontSize, maxFontSize].
 */
function computeFontSize(
  font: any,
  text: string,
  maxWidthPt: number,
  maxHeightPt: number,
  opts: Required<FillOptions>,
): number {
  let size = Math.min(opts.maxFontSize, maxHeightPt * opts.fontScale);
  size = Math.max(opts.minFontSize, size);
  // Shrink until it fits horizontally or hits the min.
  while (size > opts.minFontSize) {
    const width = font.widthOfTextAtSize(text, size);
    if (width <= maxWidthPt) break;
    size -= 0.5;
  }
  return size;
}

/**
 * Stamp values onto a PDF, returning a new PDF as bytes.
 */
async function fillPdf(
  pdfBytes: ArrayBuffer,
  fields: FillableField[],
  options: FillOptions,
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_OPTS, ...options };
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const color = rgb(opts.color.r, opts.color.g, opts.color.b);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const lines = sanitizeForWinAnsi(field.value);
    if (!lines.length) continue;

    const pageIdx = Math.max(0, Math.min((field.page ?? 1) - 1, pages.length - 1));
    const page = pages[pageIdx];
    const { width: pw, height: ph } = page.getSize();
    const b = field.bbox!;
    // Convert normalized [0, 1000] -> PDF points. pdf-lib's origin is
    // bottom-left, so we flip Y.
    const xPt = (b.xMin / 1000) * pw;
    const widthPt = ((b.xMax - b.xMin) / 1000) * pw;
    const heightPt = ((b.yMax - b.yMin) / 1000) * ph;
    const yTopPt = ph - (b.yMin / 1000) * ph;

    if (lines.length === 1) {
      // Single-line: keep existing behaviour — fit to width then vertically
      // centre inside the bbox.
      const fontSize = computeFontSize(font, lines[0], widthPt - 2, heightPt, opts);
      const baselineY =
        yTopPt - heightPt + Math.max(2, (heightPt - fontSize) / 2);
      page.drawText(lines[0], {
        x: xPt + 1,
        y: baselineY,
        size: fontSize,
        font,
        color,
      });
    } else {
      // Multi-line: pick a font size that fits both the widest line
      // horizontally AND the full block vertically (each line gets
      // `heightPt / lines.length` of room), then draw each line with
      // ~15% leading.
      const widest = lines.reduce((a, c) => (a.length >= c.length ? a : c));
      const perLineH = heightPt / lines.length;
      const fontSize = computeFontSize(font, widest, widthPt - 2, perLineH, opts);
      const lineHeightPt = fontSize * 1.15;
      const totalTextH = lineHeightPt * lines.length;
      const topPad = Math.max(2, (heightPt - totalTextH) / 2);
      // First baseline: from the top of the box, inset by top padding +
      // one font-size (baselines sit at the bottom of the glyph box).
      const firstBaselineY = yTopPt - topPad - fontSize;
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: xPt + 1,
          y: firstBaselineY - i * lineHeightPt,
          size: fontSize,
          font,
          color,
        });
      });
    }
  }

  return pdfDoc.save();
}

/**
 * Stamp values onto a raster image (png/jpg) and embed it as a single-page
 * PDF so the caller can download a uniform filetype.
 */
async function fillImage(
  file: File,
  fields: FillableField[],
  options: FillOptions,
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_OPTS, ...options };
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to decode image'));
    i.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = `rgb(${opts.color.r * 255}, ${opts.color.g * 255}, ${opts.color.b * 255})`;
  ctx.textBaseline = 'alphabetic';

  for (const field of fields) {
    // Canvas supports full unicode, but we still split on newlines so
    // multiline textareas render as multiple lines rather than one long
    // stretch. We reuse the sanitiser to keep behaviour identical with
    // the PDF path (tabs → spaces, NBSP → space, etc.).
    const lines = sanitizeForWinAnsi(field.value);
    if (!lines.length) continue;

    const b = field.bbox!;
    const x = (b.xMin / 1000) * canvas.width;
    const y = (b.yMin / 1000) * canvas.height;
    const w = ((b.xMax - b.xMin) / 1000) * canvas.width;
    const h = ((b.yMax - b.yMin) / 1000) * canvas.height;

    const perLineH = h / lines.length;
    let size = Math.max(
      opts.minFontSize,
      Math.min(opts.maxFontSize, perLineH * opts.fontScale),
    );
    ctx.font = `${size}px Helvetica, Arial, sans-serif`;
    const widest = lines.reduce((a, c) => (a.length >= c.length ? a : c));
    while (size > opts.minFontSize && ctx.measureText(widest).width > w - 2) {
      size -= 0.5;
      ctx.font = `${size}px Helvetica, Arial, sans-serif`;
    }
    const lineHeight = size * 1.15;
    const totalTextH = lineHeight * lines.length;
    const startY = y + (h - totalTextH) / 2 + size * 0.8;
    lines.forEach((line, i) => {
      ctx.fillText(line, x + 1, startY + i * lineHeight);
    });
  }

  const pdfDoc = await PDFDocument.create();
  const pngBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Canvas export failed'));
      resolve(await blob.arrayBuffer());
    }, 'image/png');
  });
  const embedded = await pdfDoc.embedPng(pngBytes);
  const page = pdfDoc.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return pdfDoc.save();
}

/**
 * Build a PDF `Blob` of the source document with `fields` stamped in.
 *
 * Only fields that have both a value and a bounding box are rendered.
 * Everything else is silently skipped.
 */
export async function fillScannedDocument(
  file: File,
  fields: FillableField[],
  options: FillOptions = {},
): Promise<{ blob: Blob; filledCount: number; skippedCount: number }> {
  const usable = usableFields(fields);
  const skipped = fields.length - usable.length;

  let bytes: Uint8Array;
  if (file.type === 'application/pdf') {
    const ab = await file.arrayBuffer();
    bytes = await fillPdf(ab, usable, options);
  } else if (file.type.startsWith('image/')) {
    bytes = await fillImage(file, usable, options);
  } else {
    throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
  }

  // Copy into a plain ArrayBuffer to keep Blob constructor happy under strict
  // DOM typings (some TS configs flag SharedArrayBuffer unions).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return {
    blob: new Blob([ab], { type: 'application/pdf' }),
    filledCount: usable.length,
    skippedCount: skipped,
  };
}

/** Trigger a browser download of a blob under the given filename. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
