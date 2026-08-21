import jsPDF from 'jspdf';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import type { WatchSchedulePDFData, WatchAssignment, CrewWatchSchedulePDFData } from './watch-schedule-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [
    Number.isFinite(r) ? r : 80,
    Number.isFinite(g) ? g : 80,
    Number.isFinite(b) ? b : 80,
  ];
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function safe(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

function trunc(value: unknown, max = 120, fallback = '—'): string {
  const s = safe(value, fallback);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Logo loader
// ---------------------------------------------------------------------------

const __logoCache = new Map<string, string>();
const __logoDimCache = new Map<string, { width: number; height: number }>();

function loadLogo(path: string): Promise<{ dataURL: string; w: number; h: number }> {
  const cached = __logoCache.get(path);
  if (cached) {
    const dim = __logoDimCache.get(path) ?? { width: 1, height: 1 };
    return Promise.resolve({ dataURL: cached, w: dim.width, h: dim.height });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas ctx')); return; }
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        __logoCache.set(path, dataURL);
        __logoDimCache.set(path, { width: canvas.width, height: canvas.height });
        resolve({ dataURL, w: canvas.width, h: canvas.height });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error(`logo load failed: ${path}`));
    img.src = path.startsWith('http')
      ? path
      : `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
    if (img.complete) img.onload!(new Event('load') as any);
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23

const NAVY: RGB   = [23, 43, 66];
const ACCENT: RGB = [37, 99, 235];
const GREY: RGB   = [100, 116, 139];
const LGREY: RGB  = [241, 245, 249];
const MGREY: RGB  = [226, 232, 240];
const WHITE: RGB  = [255, 255, 255];
const HEADER_ACCENT_H = 1.1;

// A rotating palette for crew whose blocks carry no named shift colour
const CREW_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateWatchSchedulePDF(data: WatchSchedulePDFData): Promise<void> {
  const { schedule, vesselName, generatedByName } = data;

  // ---- A4 landscape ----
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 297 mm
  const pageH = doc.internal.pageSize.getHeight();  // 210 mm
  const M = 10; // margin
  const CW = pageW - M * 2; // content width

  const startLabel = format(parseISO(schedule.startDate), 'd MMM yyyy');
  const endLabel   = format(parseISO(schedule.endDate),   'd MMM yyyy');

  // -------------------------------------------------------------------------
  // 1. Navy header band (first page only — we re-draw on addPage calls via footer loop)
  // -------------------------------------------------------------------------
  function drawHeader() {
    const HH = 18;
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, HH, 'F');
    doc.setFillColor(...ACCENT);
    doc.rect(0, HH, pageW, HEADER_ACCENT_H, 'F');

    // Logo (best-effort)
    // We pre-load below; if it succeeds we draw it
    // (handled outside this function after await)

    // Title centred
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...WHITE);
    doc.text(safe(schedule.name, 'WATCH SCHEDULE').toUpperCase(), pageW / 2, HH / 2 + 1.5, { align: 'center' });

    // Vessel + date range right-aligned
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `${trunc(vesselName, 40)}  ·  ${startLabel} – ${endLabel}`,
      pageW - M, HH / 2 + 1.5, { align: 'right' },
    );

    return HH + HEADER_ACCENT_H;
  }

  // -------------------------------------------------------------------------
  // 2. Logo (async, best-effort)
  // -------------------------------------------------------------------------
  let logoData: { dataURL: string; w: number; h: number } | null = null;
  try {
    logoData = await loadLogo('/logo-seajourney.png');
  } catch { /* no logo — that's fine */ }

  function drawLogoOnPage(headerH: number) {
    if (!logoData) return;
    const lh = 6; // fixed height regardless of header band size
    const lw = (logoData.w / logoData.h) * lh;
    const navyH = Math.max(headerH - HEADER_ACCENT_H, lh);
    const ly = (navyH - lh) / 2; // vertically centred in the navy band
    doc.addImage(logoData.dataURL, 'PNG', M, ly, lw, lh);
  }

  // -------------------------------------------------------------------------
  // 2b. Continuation header — used on pages 2+ (no navy band, no logo)
  // -------------------------------------------------------------------------
  function drawContinuationHeader(): number {
    const HH = 8;
    doc.setFillColor(...LGREY);
    doc.rect(0, 0, pageW, HH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(safe(schedule.name, 'WATCH SCHEDULE').toUpperCase(), M, HH / 2 + 1.5);
    doc.text(
      `${trunc(vesselName, 40)}  ·  ${startLabel} – ${endLabel}`,
      pageW - M, HH / 2 + 1.5, { align: 'right' },
    );
    return HH;
  }

  // -------------------------------------------------------------------------
  // 3. Meta bar (schedule info row)
  // -------------------------------------------------------------------------
  // NOTE: the legacy "Watch system" column was dropped from the meta
  // bar — the editor no longer surfaces a watch-system preset (every
  // schedule is drag-built), so the value would always be the same
  // placeholder ("Custom") and just confuse readers.
  function drawMetaBar(y: number): number {
    const BAR_H = 7;
    doc.setFillColor(...LGREY);
    doc.rect(M, y, CW, BAR_H, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    const parts = [
      `Generated by: ${safe(generatedByName)}`,
      `Printed: ${format(new Date(), 'd MMM yyyy')}`,
    ];
    const colW = CW / parts.length;
    parts.forEach((p, i) => doc.text(p, M + colW * i + 3, y + BAR_H / 2 + 1.2));
    return y + BAR_H;
  }

  // -------------------------------------------------------------------------
  // 4. Crew colour map — tries shift colours, falls back to palette by crew index
  // -------------------------------------------------------------------------
  // Build a unique ordered list of crew from all assignments
  const crewOrder: Array<{ userId: string; userName: string; userPosition?: string | null }> = [];
  const seenCrew = new Set<string>();
  for (const a of schedule.assignments) {
    if (!seenCrew.has(a.userId)) {
      seenCrew.add(a.userId);
      crewOrder.push({ userId: a.userId, userName: a.userName, userPosition: a.userPosition });
    }
  }

  // Build a colour for each crew member from their blocks
  // (If a block has shiftName, find that shift's colour; else use palette)
  const shiftColorMap = new Map<string, string>(schedule.shifts.map((s) => [s.name, s.color]));

  function crewHexColor(userId: string, idx: number): string {
    // First block for this crew that has a shiftName we know
    const block = schedule.assignments.find(
      (a) => a.userId === userId && a.shiftName && shiftColorMap.has(a.shiftName),
    );
    if (block?.shiftName) return shiftColorMap.get(block.shiftName)!;
    return CREW_PALETTE[idx % CREW_PALETTE.length];
  }

  // -------------------------------------------------------------------------
  // 5. Build a fast lookup: userId::date → blocks[]
  // -------------------------------------------------------------------------
  const blockLookup = new Map<string, WatchAssignment[]>();
  for (const a of schedule.assignments) {
    const key = `${a.userId}::${a.date}`;
    if (!blockLookup.has(key)) blockLookup.set(key, []);
    blockLookup.get(key)!.push(a);
  }

  // -------------------------------------------------------------------------
  // 6. Days list
  // -------------------------------------------------------------------------
  const days = eachDayOfInterval({ start: parseISO(schedule.startDate), end: parseISO(schedule.endDate) });

  // -------------------------------------------------------------------------
  // 7. Layout constants for the day tables
  // -------------------------------------------------------------------------
  // We have 24 hour columns + 1 crew-name column + 1 position column
  // Available content width is CW
  const LEFT_COLS_W = 40; // mm — name column only
  const HOUR_COL_W  = Math.max(4.5, (CW - LEFT_COLS_W) / 24);  // shrink to fit
  const CELL_H      = 4.5;  // row height mm

  // -------------------------------------------------------------------------
  // 8. Draw first page header + logo + meta
  // -------------------------------------------------------------------------
  const mainHeaderH = drawHeader();
  drawLogoOnPage(mainHeaderH);
  let y = drawMetaBar(mainHeaderH + 2) + 4;

  // -------------------------------------------------------------------------
  // 9. Crew colour legend
  // -------------------------------------------------------------------------
  if (crewOrder.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...NAVY);
    doc.text('Crew', M, y + 3);

    const SWATCH = 3.5;
    const LEGEND_GAP = 2;
    let lx = M + 14;
    crewOrder.forEach((c, idx) => {
      const col = crewHexColor(c.userId, idx);
      const [r, g, b] = hexToRgb(col);
      doc.setFillColor(r, g, b);
      doc.rect(lx, y + 0.5, SWATCH, SWATCH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...NAVY);
      const label = trunc(c.userName, 20);
      doc.text(label, lx + SWATCH + 1, y + 3);
      lx += SWATCH + 1 + doc.getTextWidth(label) + LEGEND_GAP + 4;
      // Wrap to next line if we overflow
      if (lx > pageW - M - 20) {
        lx = M + 14;
        y += 6;
      }
    });
    y += 7;
  }

  // -------------------------------------------------------------------------
  // 10. One section per day
  // -------------------------------------------------------------------------
  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayLabel = format(day, 'EEEE d MMMM yyyy').toUpperCase();

    // How much space does this day section need?
    const rowsNeeded = Math.max(1, crewOrder.length);
    const sectionH = 7 + rowsNeeded * CELL_H + 4; // day-header + crew rows + gap

    // Page break if needed
    if (y + sectionH > pageH - 12) {
      doc.addPage();
      const hh = drawContinuationHeader();
      y = hh + 4;
    }

    // --- Day header bar ---
    doc.setFillColor(...NAVY);
    doc.rect(M, y, CW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...WHITE);
    doc.text(dayLabel, M + 2, y + 4);
    y += 6;

    // --- Column header row (Name | 00 | 01 | ... | 23) ---
    const colHeaderH = 4.5;
    // Left name column
    doc.setFillColor(...MGREY);
    doc.rect(M, y, LEFT_COLS_W, colHeaderH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text('Name', M + 1, y + 3);

    // Hour columns header
    HOURS.forEach((h) => {
      const hx = M + LEFT_COLS_W + h * HOUR_COL_W;
      const isEven = h % 2 === 0;
      doc.setFillColor(isEven ? MGREY[0] : LGREY[0], isEven ? MGREY[1] : LGREY[1], isEven ? MGREY[2] : LGREY[2]);
      doc.rect(hx, y, HOUR_COL_W, colHeaderH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.setTextColor(...GREY);
      // Place label at the very top of the cell, left-aligned to the column
      // start — makes it unambiguous that the time marks the start of that hour.
      doc.text(`${String(h).padStart(2, '0')}:00`, hx + 0.3, y + 3);
    });

    // Draw vertical border between name col and hour cols
    doc.setDrawColor(...MGREY);
    doc.setLineWidth(0.2);
    doc.line(M + LEFT_COLS_W, y, M + LEFT_COLS_W, y + colHeaderH);

    y += colHeaderH;

    // --- Crew rows ---
    if (crewOrder.length === 0) {
      // No assignments for this day — show an empty placeholder row
      doc.setFillColor(...WHITE);
      doc.rect(M, y, CW, CELL_H, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...GREY);
      doc.text('No assignments', M + 2, y + CELL_H / 2 + 1);
      y += CELL_H;
    } else {
      crewOrder.forEach((crew, idx) => {
        const rowY = y + idx * CELL_H;
        const isAlt = idx % 2 === 1;

        // Row background
        doc.setFillColor(isAlt ? LGREY[0] : WHITE[0], isAlt ? LGREY[1] : WHITE[1], isAlt ? LGREY[2] : WHITE[2]);
        doc.rect(M, rowY, CW, CELL_H, 'F');

        // Name text
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...NAVY);
        const nameText = trunc(crew.userName, 24);
        doc.text(nameText, M + 1, rowY + CELL_H / 2 + 1);

        // Hour cells — fill those covered by a block
        const crewBlocks = blockLookup.get(`${crew.userId}::${dateStr}`) ?? [];
        const crewCol = crewHexColor(crew.userId, idx);
        const [cr, cg, cb] = hexToRgb(crewCol);

        HOURS.forEach((h) => {
          const hx = M + LEFT_COLS_W + h * HOUR_COL_W;
          const covered = crewBlocks.some((b) => b.startHour <= h && h < b.endHour);
          if (covered) {
            // Filled block
            doc.setFillColor(cr, cg, cb);
            doc.rect(hx + 0.2, rowY + 0.5, HOUR_COL_W - 0.4, CELL_H - 1, 'F');
          }
          // Light hour separator
          doc.setDrawColor(...MGREY);
          doc.setLineWidth(0.1);
          doc.line(hx, rowY, hx, rowY + CELL_H);
        });

        // Row bottom border
        doc.setDrawColor(...MGREY);
        doc.setLineWidth(0.15);
        doc.line(M, rowY + CELL_H, M + CW, rowY + CELL_H);

        // Vertical divider between name col and hour cols
        doc.setLineWidth(0.2);
        doc.line(M + LEFT_COLS_W, rowY, M + LEFT_COLS_W, rowY + CELL_H);
      });

      y += crewOrder.length * CELL_H;
    }

    // Outer border for the day section
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.3);
    const sectionTop = y - (crewOrder.length || 1) * CELL_H - colHeaderH - 6;
    doc.rect(M, sectionTop, CW, y - sectionTop, 'S');

    y += 3; // gap between day sections
  }

  // -------------------------------------------------------------------------
  // 11. Footer on every page
  // -------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = pageH - 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(`${safe(schedule.name)} · ${vesselName} · ${startLabel} – ${endLabel}`, M, fy);
    doc.text(`Page ${p} of ${totalPages}`, pageW - M, fy, { align: 'right' });
  }

  // -------------------------------------------------------------------------
  // 12. Save
  // -------------------------------------------------------------------------
  const safeName = safe(schedule.name, 'watch-schedule')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  doc.save(`${safeName}-${format(parseISO(schedule.startDate), 'yyyy-MM-dd')}.pdf`);
}

// ---------------------------------------------------------------------------
// Crew-specific proof PDF
// Generates a portrait A4 document listing only the requesting crew
// member's watch assignments — suitable as proof of watch schedule.
// ---------------------------------------------------------------------------

export async function generateCrewWatchSchedulePDF(data: CrewWatchSchedulePDFData): Promise<void> {
  const { schedule, crewUserId, crewName, vesselName } = data;

  const myAssignments = schedule.assignments
    .filter((a) => a.userId === crewUserId)
    .sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return a.startHour - b.startHour;
    });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 210 mm
  const pageH = doc.internal.pageSize.getHeight();  // 297 mm
  const M = 14;
  const CW = pageW - M * 2;

  const startLabel = format(parseISO(schedule.startDate), 'd MMM yyyy');
  const endLabel   = format(parseISO(schedule.endDate),   'd MMM yyyy');

  let logoData: { dataURL: string; w: number; h: number } | null = null;
  try { logoData = await loadLogo('/logo-seajourney.png'); } catch { /* ok */ }

  // ---- Header band ----
  const HH = 22;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, HH, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, HH, pageW, HEADER_ACCENT_H, 'F');

  if (logoData) {
    const lh = 7;
    const lw = (logoData.w / logoData.h) * lh;
    doc.addImage(logoData.dataURL, 'PNG', M, (HH - lh) / 2, lw, lh);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text('WATCH SCHEDULE PROOF', pageW / 2, HH / 2 + 1.5, { align: 'center' });

  // ---- Sub-header: vessel + schedule ----
  let y = HH + HEADER_ACCENT_H + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(safe(crewName), M, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text(`Vessel: ${safe(vesselName)}`, M, y);
  doc.text(`Schedule: ${safe(schedule.name)}`, pageW / 2, y);
  y += 5;
  doc.text(`Period: ${startLabel} – ${endLabel}`, M, y);
  doc.text(`Printed: ${format(new Date(), 'd MMM yyyy')}`, pageW / 2, y);
  y += 8;

  // ---- Divider ----
  doc.setDrawColor(...MGREY);
  doc.setLineWidth(0.4);
  doc.line(M, y, M + CW, y);
  y += 6;

  // ---- Summary stats ----
  const totalHours = myAssignments.reduce((sum, a) => sum + (a.endHour - a.startHour), 0);
  const uniqueDays = new Set(myAssignments.map((a) => a.date)).size;

  const stats = [
    { label: 'Total watches', value: String(myAssignments.length) },
    { label: 'Days on watch', value: String(uniqueDays) },
    { label: 'Total hours',   value: `${totalHours}h` },
  ];

  const colW = CW / stats.length;
  stats.forEach((s, i) => {
    const bx = M + colW * i;
    doc.setFillColor(...LGREY);
    doc.roundedRect(bx, y, colW - 3, 14, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...NAVY);
    doc.text(s.value, bx + (colW - 3) / 2, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(s.label.toUpperCase(), bx + (colW - 3) / 2, y + 12, { align: 'center' });
  });
  y += 20;

  // ---- Table header ----
  const COL = { date: 40, shift: 30, start: 22, end: 22, duration: 22, rest: CW - 40 - 30 - 22 - 22 - 22 };
  const TABLE_H = 6.5;

  doc.setFillColor(...NAVY);
  doc.rect(M, y, CW, TABLE_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...WHITE);

  let cx = M + 2;
  doc.text('Date', cx, y + TABLE_H / 2 + 1.2); cx += COL.date;
  doc.text('Shift', cx, y + TABLE_H / 2 + 1.2); cx += COL.shift;
  doc.text('Start', cx, y + TABLE_H / 2 + 1.2); cx += COL.start;
  doc.text('End', cx, y + TABLE_H / 2 + 1.2); cx += COL.end;
  doc.text('Duration', cx, y + TABLE_H / 2 + 1.2);
  y += TABLE_H;

  // ---- Table rows ----
  if (myAssignments.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text('No watch assignments found for this schedule.', M + 2, y + 8);
    y += 14;
  } else {
    myAssignments.forEach((a, idx) => {
      if (y + TABLE_H > pageH - 18) {
        doc.addPage();
        // Continuation header
        doc.setFillColor(...LGREY);
        doc.rect(0, 0, pageW, 8, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GREY);
        doc.text(`${safe(crewName)} · ${safe(vesselName)} · ${safe(schedule.name)}`, M, 5.5);
        y = 14;
      }

      const isAlt = idx % 2 === 1;
      doc.setFillColor(isAlt ? LGREY[0] : WHITE[0], isAlt ? LGREY[1] : WHITE[1], isAlt ? LGREY[2] : WHITE[2]);
      doc.rect(M, y, CW, TABLE_H, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...NAVY);

      const dateLabel = (() => {
        try { return format(parseISO(a.date), 'EEE d MMM yyyy'); } catch { return a.date; }
      })();
      const startStr = `${String(a.startHour === 24 ? 0 : a.startHour).padStart(2, '0')}:00`;
      const endStr   = `${String(a.endHour   === 24 ? 0 : a.endHour).padStart(2, '0')}:00`;
      const dur      = `${a.endHour - a.startHour}h`;

      cx = M + 2;
      doc.text(dateLabel, cx, y + TABLE_H / 2 + 1.2); cx += COL.date;
      doc.setTextColor(...GREY);
      doc.text(safe(a.shiftName, '—'), cx, y + TABLE_H / 2 + 1.2); cx += COL.shift;
      doc.setTextColor(...NAVY);
      doc.text(startStr, cx, y + TABLE_H / 2 + 1.2); cx += COL.start;
      doc.text(endStr, cx, y + TABLE_H / 2 + 1.2); cx += COL.end;
      doc.setFont('helvetica', 'bold');
      doc.text(dur, cx, y + TABLE_H / 2 + 1.2);

      // Row bottom border
      doc.setDrawColor(...MGREY);
      doc.setLineWidth(0.1);
      doc.line(M, y + TABLE_H, M + CW, y + TABLE_H);

      y += TABLE_H;
    });
  }

  y += 6;

  // ---- Certification note ----
  doc.setFillColor(...LGREY);
  doc.roundedRect(M, y, CW, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...NAVY);
  doc.text('Certification', M + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GREY);
  doc.text(
    `This document confirms that ${safe(crewName)} was assigned to the above watch duties aboard ${safe(vesselName)}`,
    M + 4, y + 11,
  );
  doc.text(
    `as part of schedule "${safe(schedule.name)}" (${startLabel} – ${endLabel}). Generated by SeaJourney.`,
    M + 4, y + 15,
  );

  // ---- Page footers ----
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = pageH - 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text(`${safe(crewName)} · ${safe(vesselName)} · ${safe(schedule.name)}`, M, fy);
    doc.text(`Page ${p} of ${totalPages}`, pageW - M, fy, { align: 'right' });
  }

  const safeCrewName = safe(crewName, 'crew')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
  const safeSched = safe(schedule.name, 'schedule')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
  doc.save(`watch-proof-${safeCrewName}-${safeSched}.pdf`);
}
