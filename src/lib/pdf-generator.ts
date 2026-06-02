// pdf-export.ts
// Single-file, copy/paste-ready PDF generators for SeaJourney
//
// Includes:
// - generateTestimonialPDF (Sea Service Testimonial)
// - generateSeaTimeTestimonial (Sea Time Summary Report)
// - generatePassageLogPDF (Passage Log Extract)
//
// Improvements applied:
// ✅ doc.getNumberOfPages() everywhere (no off-by-one)
// ✅ ensureSpace() helper (clean pagination)
// ✅ safeText()/truncate() helpers (layout safety)
// ✅ loadLogoImage() caching + crossOrigin + absolute URL
// ✅ output modes for testimonial (download | newtab | blob)
// ✅ consistent simple footer (Document ID + Page X of Y) on testimonial

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { format, parse, parseISO, isValid, differenceInHours, addDays } from 'date-fns';
import QRCode from 'qrcode';
import type { SeaTimeReportData } from '@/app/actions';
import type { AmsaSeaServiceReference } from '@/lib/amsa-sea-service-reference';
import { formatAmsaReferencePartsForPdf } from '@/lib/amsa-sea-service-reference';

/* ========================================================================== */
/*                        VERIFICATION QR HELPERS                             */
/* ========================================================================== */

/**
 * Base URL used to build the verification deep-link encoded in QR codes.
 * Prefers the public site URL so scans from a printed receipt always land
 * on production regardless of where the PDF was generated.
 */
function getVerificationBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    'https://www.seajourney.co.uk'
  );
}

/**
 * Builds the deep-link URL that takes a scanner straight to the verify result
 * page for a given testimonial (SJ-…) or proof-of-service (POS-…) code.
 */
export function buildVerificationUrl(code: string, type: 'sj' | 'pos'): string {
  const base = getVerificationBaseUrl().replace(/\/$/, '');
  return `${base}/verify/result?code=${encodeURIComponent(code)}&type=${type}`;
}

/** Returns a PNG data URL for the verification QR, or null if generation fails. */
export async function generateVerificationQRDataUrl(
  code: string,
  type: 'sj' | 'pos',
  sizePx = 360,
): Promise<string | null> {
  try {
    if (!code) return null;
    const url = buildVerificationUrl(code, type);
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: sizePx,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch (e) {
    console.warn('[PDF] Failed to build verification QR:', e);
    return null;
  }
}

/** Raw PNG bytes version for pdf-lib embedding. Works in both browser and Node. */
async function generateVerificationQRBytes(
  code: string,
  type: 'sj' | 'pos',
  sizePx = 360,
): Promise<Uint8Array | null> {
  try {
    const dataUrl = await generateVerificationQRDataUrl(code, type, sizePx);
    if (!dataUrl) return null;
    const base64 = dataUrl.split(',')[1] || '';
    const bin =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch (err) {
    console.warn('[PDF] Failed to build verification QR bytes:', err);
    return null;
  }
}

// Re-export the type for use in this file
type SeaTimeReportDataType = SeaTimeReportData;

/* ========================================================================== */
/*                                   TYPES                                    */
/* ========================================================================== */

export interface TestimonialPDFData {
  testimonial: {
    id: string;
    start_date: string;
    end_date: string;
    total_days: number;
    at_sea_days: number;
    standby_days: number;
    yard_days: number;
    leave_days: number;
    captain_name: string | null;
    captain_email: string | null;
    captain_position?: string | null; // Captain position saved at approval time
    captain_signature?: string | null; // Captain signature saved at approval time
    captain_comment_conduct?: string | null; // Captain comment on conduct
    captain_comment_ability?: string | null; // Captain comment on ability
    captain_comment_general?: string | null; // Captain general comments
    official_body: string | null;
    official_reference: string | null;
    notes: string | null;
    testimonial_code: string | null;
    status: 'draft' | 'pending_captain' | 'pending_official' | 'approved' | 'rejected';
    signoff_used_at: string | null;
    approved_at?: string | null; // Date when testimonial was approved (from approved_testimonials table)
    created_at: string;
    updated_at: string;
  };
  userProfile: {
    firstName?: string;
    lastName?: string;
    username: string;
    email: string;
    dateOfBirth?: string | null;
    position?: string | null;
    dischargeBookNumber?: string | null;
    mobile?: string | null;
    telephone?: string | null;
  };
  companyDetails?: {
    name?: string | null;
    address?: string | null;
    contactDetails?: string | null;
  } | null;
  vessel: {
    name: string;
    type: string | null;
    officialNumber?: string | null;
    flag_state?: string | null;
    length_m?: number | null;
    gross_tonnage?: number | null;
    call_sign?: string | null;
    company_contact?: string | null;
    /**
     * Optional ship's stamp as a base64 image data URL. When provided the
     * stamp is rendered automatically inside the "Ship's Stamp" field on the
     * generated testimonial.
     */
    stamp?: string | null;
  };
  captainProfile?: {
    firstName?: string;
    lastName?: string;
    position?: string | null;
    email?: string;
    signature?: string | null; // Base64 encoded signature image
  } | null;
  receiptData?: MCAReceiptData; // Optional receipt/verification data
  standbyPeriods?: Array<{
    passageStartDate: string; // YYYY-MM-DD (voyage)
    passageEndDate: string; // YYYY-MM-DD (voyage)
    /** Actual standby period start (in-port/at-anchor only; does not extend into yard) */
    standbyStartDate?: string; // YYYY-MM-DD
    /** Actual standby period end (in-port/at-anchor only; does not extend into yard) */
    standbyEndDate?: string; // YYYY-MM-DD
    standbyDays: number;
  }>; // Standby service periods for Table A
  /** AMSA 771 sea service reference codes — optional overlay on Form 771 */
  amsaReference?: AmsaSeaServiceReference | null;
}

export type TestimonialPDFFormat = 'mca' | 'mlc' | 'seajourney' | 'amsa';

/** Official AMSA 771 blank form (served from /public). */
export const AMSA_771_FORM_PUBLIC_PATH = '/forms/AMSA_Form_771.pdf';
export type TestimonialPDFOutput = 'download' | 'newtab' | 'blob';

export interface TestimonialPDFOptions {
  /** When true, AMSA overlay draws red crosshairs at each field anchor. */
  debug?: boolean;
}

const A4_RECEIPT_PT = { w: 595.28, h: 841.89 };

/** Embed a PNG logo into a pdf-lib PDFDocument. Returns null if not available. */
async function embedLogoForPdfLib(
  pdfDoc: PDFDocument,
  path: string,
): Promise<{ image: import('pdf-lib').PDFImage; width: number; height: number } | null> {
  try {
    if (typeof window === 'undefined') return null;
    const { dataURL, width, height } = await loadLogoImageWithDimensions(path);
    const base64 = dataURL.split(',')[1] || '';
    const bin =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const image = await pdfDoc.embedPng(bytes);
    return { image, width, height };
  } catch {
    return null;
  }
}

/**
 * SVG markup for the SeaJourney full lockup (icon + wordmark) in white.
 * Mirrors the SVG used by the landing page <Logo /> component so the PDF
 * header stays visually in sync with the site navigation.
 */
const SEAJOURNEY_LOGO_LOCKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 2048 532">
<path transform="translate(75,124)" d="m0 0h19l23 2 27 5 28 8 24 9 16 8 5 2 10-6 21-10 17-6 18-5 16-3 16-2h20l24 3 17 4 3 2v93l-5-1-12-8-12-5-8-3-14-2h-24l-10 1-11 2-20 9-16 8-15 9-14 10-10 8-11 9-15 13-13 10-18 13-19 11-23 11-21 7-26 6-18 2h-34l-5-2-1-25v-163l2-8 13-6 18-5 25-4z" fill="#ffffff"/>
<path transform="translate(616,173)" d="m0 0h29l17 4 11 5 10 7 8 8 6 10 4 12 1 12-2 1h-45l-4-10-6-5-8-3h-14l-10 4-4 6v7l4 6 12 5 30 7 15 5 13 7 10 9 6 8 5 16v20l-4 13-7 11-8 7-15 8-15 4-12 2h-26l-17-3-15-5-11-7-9-8-7-11-4-11-2-9v-12h46l3 9 5 8 5 4 8 3 14 1 10-2 7-4 3-5-1-9-5-5-9-4-30-7-20-6-14-8-7-6-7-11-3-9-1-16 3-14 5-10 8-10 11-8 12-6 14-4z" fill="#ffffff"/>
<path transform="translate(306,278)" d="m0 0h22l15 2 16 5 13 7 7 6 1 3v30l-1 34h-4l-24-13-15-4-5-1h-24l-13 1-33 10-16 7-21 10-9 6-26 13-20 9-26 8-16 3-26 2-18-1-19-4-15-5-16-8-21-13-5-6 6 1 4 2 2-3 8 1 16 4 15 2h27l25-5 18-6 20-9 19-10 22-14 18-13 11-9 8-6 21-14 16-9 7-3 7-2 3-2h9l7-5z" fill="#ffffff"/>
<path transform="translate(1898,221)" d="m0 0h51l2 6 18 77 1 10h3l1-8 17-71 3-13 1-1h51l-3 12-14 41-21 62-11 33-8 16-9 10-8 6-13 5-12 2h-18l-16-3-3-1v-6l5-15 4-13 5-1 4 1h12l4-4-1-10-23-68-12-35-10-30z" fill="#ffffff"/>
<path transform="translate(1679,219)" d="m0 0h18l13 4 11 8 6 7 5 9 3 9 1 7v93l-3 1h-45l-1-1-1-80-4-11-5-4-10-2-9 2-6 5-3 7-1 5-1 78-1 1h-47l-1-1v-134l1-1h45l1 1v20l-1 4 3-2 4-8 6-7 11-7z" fill="#ffffff"/>
<path transform="translate(1327,221)" d="m0 0h49l1 5v73l2 9 4 6 8 4h10l8-4 4-5 2-13 1-75h49v135l-2 1h-44v-26l-3 3-6 10-9 8-11 5-9 2h-13l-12-3-10-6-6-5-7-10-5-15-1-8z" fill="#ffffff"/>
<path transform="translate(925,219)" d="m0 0h25l15 3 17 8 10 9 6 10 2 6 1 12v89l-2 1h-44l-1-18-11 12-12 6-8 2h-19l-13-4-10-6-6-7-5-12v-21l4-11 8-10 12-7 14-4 31-4 8-3 3-3 1-4-2-7-11-3-9 1-6 4-3 7h-44l-1-5 4-12 7-11 9-8 15-7 7-2zm23 79-21 5-8 4-3 5v8l6 7 3 1h11l8-4 6-7 2-6v-13z" fill="#ffffff"/>
<path transform="translate(1225,219)" d="m0 0h23l12 2 13 5 10 7 9 8 8 12 5 13 2 10v27l-4 16-7 13-11 12-10 7-16 6-8 2-18 1-15-2-14-4-12-7-9-8-8-11-6-14-3-14v-22l4-17 7-14 11-12 9-7 13-6zm9 35-7 3-6 7-4 11-1 6v16l3 13 6 9 8 4h9l7-4 5-8 3-12v-22l-3-11-7-9-7-3z" fill="#ffffff"/>
<path transform="translate(1813,219)" d="m0 0h22l15 3 14 7 9 7v2h2l8 11 5 11 4 16 1 23-1 1-88 1 1 9 5 9 11 5h11l10-4 4-5 1-2h45l-2 11-6 11-9 10-11 7-15 5-9 2-17 1-17-2-15-5-11-6-12-12-7-12-4-12-2-12v-20l3-15 8-16 8-11 12-9 13-6zm8 34-8 3-6 5-4 9 1 3h43l1-2-5-10-6-5-8-3z" fill="#ffffff"/>
<path transform="translate(777,219)" d="m0 0h22l14 3 12 5 13 10 9 12 6 14 3 15v22h-89l3 13 4 6 7 4 4 1h10l9-3 5-4 2-4h45l-2 10-7 13-10 10-12 7-21 6-18 1-16-2-13-4-13-7-6-5-8-10-7-14-3-10-1-7v-24l4-16 7-14 8-10 10-8 15-7zm8 34-10 4-6 7-2 5 1 4h43l-1-7-6-8-8-4-4-1z" fill="#ffffff"/>
<path transform="translate(1099,175)" d="m0 0h46l2 1v126l-2 15-4 9-7 11-7 7-11 7-12 5-13 3h-26l-16-4-12-6-10-9-6-8-4-9-3-16v-6l1-1h47l2 1 3 12 5 5 5 2h9l8-5 2-4 1-6 1-129z" fill="#ffffff"/>
<path transform="translate(1561,219)" d="m0 0h17l4 1v42l-9-1h-16l-8 4-7 8-2 7-1 76-2 1h-47v-136h47v25l2-1 3-9 6-8 8-7z" fill="#ffffff"/>
</svg>`;

/**
 * Rasterize the white SeaJourney icon+wordmark lockup SVG to a PNG and embed
 * it into a pdf-lib PDFDocument. This gives us the same "icon on left, name
 * on right" lockup used in the site's header navigation. Returns null in
 * server environments or on failure.
 */
async function embedSeaJourneyWordmarkLockup(
  pdfDoc: PDFDocument,
  targetHeightPx = 160,
): Promise<{ image: import('pdf-lib').PDFImage; width: number; height: number } | null> {
  try {
    if (typeof window === 'undefined') return null;
    const viewBoxW = 2048;
    const viewBoxH = 532;
    const aspect = viewBoxW / viewBoxH;
    const height = Math.max(32, Math.round(targetHeightPx));
    const width = Math.round(height * aspect);

    const svgBlob = new Blob([SEAJOURNEY_LOGO_LOCKUP_SVG], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('svg load failed'));
        i.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1] || '';
      const bin =
        typeof atob === 'function'
          ? atob(base64)
          : Buffer.from(base64, 'base64').toString('binary');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const image = await pdfDoc.embedPng(bytes);
      return { image, width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/**
 * Modern SeaJourney header ribbon for receipt / verification pages.
 * Layout:
 *   [ SeaJourney icon + wordmark lockup ]     │     DOCUMENT TYPE
 *   DOCUMENT VERIFICATION SUMMARY  •          │     <value>
 *                                             │     ISSUED
 *                                             │     <date>
 * Single deep-navy fill across the whole band, with a thin vertical accent
 * rule separating the brand side from the meta card on the right. No top or
 * bottom accent stripes — the section reads as one calm, solid slab.
 */
async function drawSeaJourneyReceiptHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  opts: {
    pageWidth: number;
    pageHeight: number;
    font: PDFFont;
    fontBold: PDFFont;
    documentTypeLine: string;
    subtitle?: string;
    generatedAt?: Date;
    margin?: number;
    headerH?: number;
  },
): Promise<void> {
  const W = opts.pageWidth;
  const H = opts.pageHeight;
  const font = opts.font;
  const fontBold = opts.fontBold;
  const M = opts.margin ?? 50;
  const headerH = opts.headerH ?? 88;
  const subtitle = (opts.subtitle ?? 'Document Verification Summary').toUpperCase();
  const docType = opts.documentTypeLine.replace(/^\s*Type\s*:\s*/i, '').trim() || opts.documentTypeLine;
  const dateStr = format(opts.generatedAt ?? new Date(), 'dd MMMM yyyy');

  // Brand palette
  const NAVY_DEEP = rgb(0.04, 0.09, 0.18);
  const ACCENT = rgb(0.12, 0.45, 0.95);
  const ACCENT_SOFT = rgb(0.62, 0.80, 1.0);
  const DIVIDER = rgb(0.28, 0.38, 0.55);
  const WHITE = rgb(1, 1, 1);

  // Single-tone deep navy header covering the full width + height
  const metaPanelW = 210;
  page.drawRectangle({
    x: 0,
    y: H - headerH,
    width: W,
    height: headerH,
    color: NAVY_DEEP,
  });

  // ====== LEFT SIDE: Logo lockup (icon + wordmark) + subtitle ======
  const navyCenterY = H - headerH / 2; // vertical center of navy band
  const logoMaxH = 30;
  const logoBottomY = navyCenterY - logoMaxH / 2 + 4; // nudge up a hair

  const lockup = await embedSeaJourneyWordmarkLockup(pdfDoc, 200);
  if (lockup) {
    const aspect = lockup.width / lockup.height;
    const h = logoMaxH;
    const w = aspect * h;
    page.drawImage(lockup.image, {
      x: M,
      y: logoBottomY,
      width: w,
      height: h,
    });
  } else {
    // Fallback: draw the wordmark as text
    const wordmarkSize = 22;
    page.drawText('SeaJourney', {
      x: M,
      y: logoBottomY + 6,
      size: wordmarkSize,
      font: fontBold,
      color: WHITE,
    });
  }

  // Subtitle line under the logo lockup with an accent bullet
  const subSize = 8;
  const subY = logoBottomY - 12;
  page.drawText(subtitle, {
    x: M,
    y: subY,
    size: subSize,
    font: fontBold,
    color: ACCENT_SOFT,
  });
  const subW = fontBold.widthOfTextAtSize(subtitle, subSize);
  page.drawCircle({
    x: M + subW + 6,
    y: subY + subSize / 2 - 0.5,
    size: 1.2,
    color: ACCENT,
  });
  // short accent underline to the right of the bullet
  page.drawRectangle({
    x: M + subW + 10,
    y: subY + subSize / 2 - 0.5,
    width: 18,
    height: 0.8,
    color: ACCENT,
  });

  // ====== RIGHT SIDE: Meta card (label / value pairs) ======
  const metaX = W - metaPanelW + 18;
  const metaInnerW = metaPanelW - 36;

  // A small accent vertical rule on the far left edge of the meta panel
  page.drawRectangle({
    x: W - metaPanelW,
    y: H - headerH + 10,
    width: 1.5,
    height: headerH - 24,
    color: ACCENT,
  });

  const row1LabelY = H - 20;
  const row1ValueY = row1LabelY - 12;
  const dividerY = row1ValueY - 10;
  const row2LabelY = dividerY - 10;
  const row2ValueY = row2LabelY - 12;

  page.drawText('DOCUMENT TYPE', {
    x: metaX,
    y: row1LabelY,
    size: 7,
    font: fontBold,
    color: ACCENT_SOFT,
  });
  // Ellipsize docType to fit within metaInnerW at 9pt
  const valueFont = fontBold;
  const docValueSize = 9;
  let docDisplay = docType;
  const measure = (s: string) => valueFont.widthOfTextAtSize(s, docValueSize);
  if (measure(docDisplay) > metaInnerW) {
    const ell = '…';
    while (docDisplay.length > 1 && measure(docDisplay + ell) > metaInnerW) {
      docDisplay = docDisplay.slice(0, -1);
    }
    docDisplay = docDisplay + ell;
  }
  page.drawText(docDisplay, {
    x: metaX,
    y: row1ValueY,
    size: docValueSize,
    font: valueFont,
    color: WHITE,
  });

  // Thin divider between the two rows
  page.drawRectangle({
    x: metaX,
    y: dividerY,
    width: metaInnerW,
    height: 0.4,
    color: DIVIDER,
  });

  page.drawText('ISSUED', {
    x: metaX,
    y: row2LabelY,
    size: 7,
    font: fontBold,
    color: ACCENT_SOFT,
  });
  page.drawText(dateStr, {
    x: metaX,
    y: row2ValueY,
    size: 9,
    font: fontBold,
    color: WHITE,
  });
  void font; // fontBold is used for all header text; keep reference to `font` param
}

/**
 * Draws a SeaJourney-branded "credential card" containing the authentication
 * code on the left and a scannable verification QR on the right. Designed to
 * feel like a small certificate section: a navy ribbon header with the
 * SeaJourney mark, a vertical hairline divider, a prominent code with an
 * accent underline, and the QR in its own white card.
 *
 * Returns the Y coordinate of the bottom of the panel so callers can continue
 * laying content beneath it.
 */
async function drawSeaJourneyVerificationPanel(
  pdfDoc: PDFDocument,
  page: PDFPage,
  opts: {
    x: number;
    /** Top-left Y of the panel (pdf-lib coords: larger Y = higher on page). */
    y: number;
    width: number;
    code: string;
    codeType: 'sj' | 'pos';
    font: PDFFont;
    fontBold: PDFFont;
    ribbonLabel?: string;
  },
): Promise<number> {
  const { x, y, width, code, codeType, font, fontBold } = opts;
  const ribbonLabel = (opts.ribbonLabel ?? 'Verified Sea Service Record').toUpperCase();

  // Brand palette
  const NAVY = rgb(0.06, 0.14, 0.26);
  const ACCENT = rgb(0.12, 0.45, 0.95);
  const ACCENT_SOFT = rgb(0.62, 0.80, 1.0);
  const CREAM = rgb(0.984, 0.990, 0.998);
  const INK = rgb(0.11, 0.14, 0.20);
  const MUTED = rgb(0.48, 0.52, 0.60);
  const LINE = rgb(0.80, 0.85, 0.92);
  const WHITE = rgb(1, 1, 1);

  const ribbonH = 22;
  const bodyH = 110;
  const panelH = ribbonH + bodyH;
  const panelBottomY = y - panelH;
  const ribbonY = y - ribbonH;

  // Panel body background (sits under the ribbon)
  page.drawRectangle({
    x,
    y: panelBottomY,
    width,
    height: panelH,
    color: CREAM,
    borderColor: NAVY,
    borderWidth: 1,
  });

  // Navy ribbon header
  page.drawRectangle({
    x,
    y: ribbonY,
    width,
    height: ribbonH,
    color: NAVY,
  });

  // Thin accent bar right below the ribbon for extra polish
  page.drawRectangle({
    x,
    y: ribbonY - 2,
    width,
    height: 2,
    color: ACCENT,
  });

  // Ribbon left text: label + small decorative mark
  const ribbonTextSize = 8.5;
  const ribbonCenterY = ribbonY + (ribbonH - ribbonTextSize) / 2 + 1;
  const markX = x + 18;
  const markCenterY = ribbonY + ribbonH / 2;
  // Outer accent ring + inner white dot — a tiny brand mark
  page.drawCircle({ x: markX, y: markCenterY, size: 3, color: ACCENT });
  page.drawCircle({ x: markX, y: markCenterY, size: 1.2, color: WHITE });
  page.drawText(ribbonLabel, {
    x: markX + 10,
    y: ribbonCenterY,
    size: ribbonTextSize,
    font: fontBold,
    color: WHITE,
  });

  // Ribbon right text: brand wordmark with bullet separator
  const brand = 'SeaJourney';
  const brandSize = 10;
  const brandW = fontBold.widthOfTextAtSize(brand, brandSize);
  const brandX = x + width - 18 - brandW;
  const brandY = ribbonY + (ribbonH - brandSize) / 2 + 1;
  page.drawText(brand, {
    x: brandX,
    y: brandY,
    size: brandSize,
    font: fontBold,
    color: WHITE,
  });
  // bullet separator
  page.drawCircle({
    x: brandX - 6,
    y: brandY + brandSize / 2 - 0.5,
    size: 1.2,
    color: ACCENT_SOFT,
  });
  // tag text before brand
  const tagline = 'Authenticated by';
  const tagSize = 7.5;
  const tagW = font.widthOfTextAtSize(tagline, tagSize);
  page.drawText(tagline, {
    x: brandX - 6 - 4 - tagW,
    y: brandY + (brandSize - tagSize) / 2 + 0.5,
    size: tagSize,
    font,
    color: ACCENT_SOFT,
  });

  // ===== Body two-column layout =====
  // Body top edge is just below the accent bar (ribbonY - 2)
  const bodyTopY = ribbonY - 2;
  const rightColW = 118;
  const leftColW = width - rightColW;
  const dividerX = x + leftColW;

  // Vertical hairline divider (inset from body top/bottom)
  page.drawRectangle({
    x: dividerX,
    y: panelBottomY + 14,
    width: 0.5,
    height: bodyH - 28,
    color: LINE,
  });

  // -------- Right column: QR card (sized/positioned first) --------
  const scanLabelSize = 7;
  const scanLabelReserve = 14; // space below card for "SCAN TO VERIFY"
  const bodyInnerPad = 10;
  const availableCardH = bodyH - bodyInnerPad * 2 - scanLabelReserve;
  const qrCardSize = Math.min(rightColW - 16, availableCardH); // square
  const qrPadding = 6;
  const qrSize = qrCardSize - qrPadding * 2;
  const qrCardX = dividerX + (rightColW - qrCardSize) / 2;
  // Top of QR card inset from body top by bodyInnerPad
  const qrCardY = bodyTopY - bodyInnerPad - qrCardSize;

  // White card behind the QR
  page.drawRectangle({
    x: qrCardX,
    y: qrCardY,
    width: qrCardSize,
    height: qrCardSize,
    color: WHITE,
    borderColor: NAVY,
    borderWidth: 0.8,
  });

  // Tiny accent strip on top of the QR card for continuity with ribbon
  page.drawRectangle({
    x: qrCardX,
    y: qrCardY + qrCardSize - 2,
    width: qrCardSize,
    height: 2,
    color: ACCENT,
  });

  let qrEmbedded = false;
  try {
    const qrBytes = await generateVerificationQRBytes(code, codeType, 360);
    if (qrBytes) {
      const qrImage = await pdfDoc.embedPng(qrBytes);
      page.drawImage(qrImage, {
        x: qrCardX + qrPadding,
        y: qrCardY + qrPadding - 1, // slight nudge to balance around accent strip
        width: qrSize,
        height: qrSize,
      });
      qrEmbedded = true;
    }
  } catch {
    // fall through to text-only presentation
  }

  // "SCAN TO VERIFY" label under the QR card (inside the body)
  const scanText = qrEmbedded ? 'SCAN TO VERIFY' : 'VERIFY ONLINE';
  const scanW = fontBold.widthOfTextAtSize(scanText, scanLabelSize);
  page.drawText(scanText, {
    x: dividerX + (rightColW - scanW) / 2,
    y: qrCardY - scanLabelReserve + 4,
    size: scanLabelSize,
    font: fontBold,
    color: MUTED,
  });

  // -------- Left column: auth code block (vertically centered with QR) --------
  const lx = x + 22;
  // Place the label near the top of the body, code centered vertically,
  // URL near the bottom — all inside the cream area.
  const leftTopY = bodyTopY - 18;

  // Tiny uppercase label
  page.drawText('AUTHENTICATION CODE', {
    x: lx,
    y: leftTopY,
    size: 7.5,
    font: fontBold,
    color: MUTED,
  });

  // Large code
  const codeSize = 22;
  const codeTextW = fontBold.widthOfTextAtSize(code, codeSize);
  const codeY = leftTopY - 28;
  page.drawText(code, {
    x: lx,
    y: codeY,
    size: codeSize,
    font: fontBold,
    color: NAVY,
  });

  // Accent underline under code
  page.drawRectangle({
    x: lx,
    y: codeY - 6,
    width: Math.min(codeTextW, leftColW - 44),
    height: 1.5,
    color: ACCENT,
  });

  // URL hint line
  const urlLine = 'Verify at www.seajourney.co.uk/verify';
  page.drawText(urlLine, {
    x: lx,
    y: codeY - 22,
    size: 8,
    font,
    color: INK,
  });

  return panelBottomY;
}

/** Second page: SeaJourney verification summary (same layout as MCA deckhand/officer testimonials). */
async function appendSeaJourneyTestimonialReceiptPage(
  pdfDoc: PDFDocument,
  data: TestimonialPDFData,
  font: PDFFont,
  fontBold: PDFFont,
  labels: { documentTypeLine: string; supportingFooterLine: string },
): Promise<void> {
  if (!data.receiptData) return;

  const { testimonial, userProfile, vessel, receiptData } = data;
  const safe = (v?: string | null, fallback = '') => (v ?? '').trim() || fallback;
  const formatDateLocal = (dateStr: string, fmt: 'DD/MM/YYYY' | 'DD MMMM YYYY' = 'DD/MM/YYYY') => {
    try {
      const raw = String(dateStr).trim();
      const date = /^\d{4}-\d{2}-\d{2}/.test(raw)
        ? parse(raw.slice(0, 10), 'yyyy-MM-dd', new Date())
        : parseISO(raw);
      if (Number.isNaN(date.getTime())) return dateStr;
      return fmt === 'DD/MM/YYYY' ? format(date, 'dd/MM/yyyy') : format(date, 'dd MMMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const fullName =
    `${safe(userProfile.firstName)} ${safe(userProfile.lastName)}`.trim() || safe(userProfile.username);
  const dobReceipt = getDateOfBirthRawFromUserProfile(userProfile);
  const dateOfBirth = dobReceipt ? formatDateDdMmYyyyForPdf(dobReceipt) : '';
  const displayStandbyDays = Math.round(Number(testimonial.standby_days ?? 0));

  const vesselExt = vessel as TestimonialPDFData['vessel'] & { imo?: string | null; flag?: string | null };

  const W = A4_RECEIPT_PT.w;
  const H = A4_RECEIPT_PT.h;
  const page = pdfDoc.addPage([W, H]);

  const NAVY = rgb(0.06, 0.14, 0.26);
  const ACCENT = rgb(0.12, 0.45, 0.95);
  const INK = rgb(0.1, 0.1, 0.12);
  const MUTED = rgb(0.42, 0.45, 0.52);
  const LINE = rgb(0.86, 0.88, 0.92);
  const WHITE = rgb(1, 1, 1);

  const M = 50;
  const headerH = 88;
  const COL_GAP = 20;

  const docId = receiptData.documentId || testimonial.id;
  const refCode = testimonial.testimonial_code || receiptData.sjCode || 'N/A';

  const generatedAt = receiptData.generatedAt
    ? format(new Date(receiptData.generatedAt), 'dd MMM yyyy HH:mm:ss')
    : format(new Date(), 'dd MMM yyyy HH:mm:ss');

  const safeInt = (n: unknown) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  };

  const t = (text: string, x: number, y: number, size: number, bold = false, color = INK) => {
    page.drawText(String(text ?? ''), {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  const wrapText = (text: string, maxWidth: number, size: number) => {
    if (!text) return ['N/A'];
    const words = String(text).split(' ');
    const lines: string[] = [];
    let current = '';

    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const textWidth = (text: string, size: number, bold = false) =>
    (bold ? fontBold : font).widthOfTextAtSize(String(text ?? ''), size);

  await drawSeaJourneyReceiptHeader(pdfDoc, page, {
    pageWidth: W,
    pageHeight: H,
    font,
    fontBold,
    documentTypeLine: labels.documentTypeLine,
    margin: M,
    headerH,
  });

  const panelTopY = H - headerH - 30;
  const codeDisplay = refCode.startsWith('SJ-') ? refCode : `SJ-${refCode}`;
  const panelBottomY = await drawSeaJourneyVerificationPanel(pdfDoc, page, {
    x: M,
    y: panelTopY,
    width: W - 2 * M,
    code: codeDisplay,
    codeType: 'sj',
    font,
    fontBold,
    ribbonLabel: 'Verified Sea Service Record',
  });

  let y = panelBottomY - 25;

  const colW = (W - 2 * M - COL_GAP) / 2;
  const labelW = 130;
  const valueW = colW - labelW - 12;

  const addRow = (label: string, value: string | number | null | undefined, col: 'left' | 'right' = 'left') => {
    const x = col === 'left' ? M : M + colW + COL_GAP;
    const valueStr = value !== null && value !== undefined ? String(value) : 'N/A';

    t(label, x, y, 8.5, true, MUTED);

    const valueX = x + labelW;
    const lines = wrapText(valueStr, valueW, 9.5);
    lines.forEach((line, i) => {
      t(line, valueX, y - i * 11.5, 9.5, false, INK);
    });

    y -= Math.max(11.5, lines.length * 11.5) + 5;
  };

  const addSection = (title: string) => {
    page.drawLine({
      start: { x: M, y: y + 3 },
      end: { x: W - M, y: y + 3 },
      thickness: 0.5,
      color: LINE,
    });
    y -= 12;
    t(title, M, y, 10.5, true, INK);
    y -= 18;
  };

  addSection('Document Information');
  addRow('Document ID', docId, 'left');
  addRow('Generated', generatedAt, 'left');
  y -= 10;

  addSection('Seafarer Information');
  addRow('Name', fullName || 'N/A', 'left');
  addRow('Date of Birth', dateOfBirth || 'N/A', 'left');
  addRow('Position', safe(userProfile.position) || 'N/A', 'left');
  addRow('Email', userProfile.email || 'N/A', 'left');
  y -= 10;

  addSection('Vessel Information');
  addRow('Vessel Name', safe(vessel.name) || 'N/A', 'left');
  addRow('Vessel Type', formatVesselTypeForDisplay(vessel.type, 'N/A') || 'N/A', 'left');
  addRow('Flag State', safe(vesselExt.flag) || safe(vessel.flag_state) || 'N/A', 'left');
  addRow('IMO / Official Number', safe(vesselExt.imo) || safe(vessel.officialNumber) || 'N/A', 'left');
  addRow('Gross Tonnage', vessel.gross_tonnage?.toString() || 'N/A', 'left');
  y -= 10;

  addSection('Sea Service Summary');
  addRow(
    'Date Range',
    `${formatDateLocal(testimonial.start_date, 'DD/MM/YYYY')} – ${formatDateLocal(testimonial.end_date, 'DD/MM/YYYY')}`,
    'left',
  );
  addRow('Total Days', safeInt(testimonial.total_days ?? 0), 'left');
  addRow('At Sea Days', safeInt(testimonial.at_sea_days), 'left');
  addRow('Standby Days', safeInt(displayStandbyDays), 'left');
  addRow('Yard Days', safeInt(testimonial.yard_days), 'left');
  addRow('Leave Days', safeInt(testimonial.leave_days ?? 0), 'left');
  y -= 12;

  t(
    'Figures shown are generated from the approved SeaJourney record and are provided for reference only.',
    M,
    y,
    8,
    false,
    MUTED,
  );
  y -= 30;

  const footerY = 30;
  page.drawLine({
    start: { x: M, y: footerY + 20 },
    end: { x: W - M, y: footerY + 20 },
    thickness: 1,
    color: LINE,
  });
  t(labels.supportingFooterLine, M, footerY, 8, false, MUTED);
  t(`Reference: ${refCode}`, W - M - textWidth(`Reference: ${refCode}`, 8, true), footerY, 8, true, MUTED);
}

/**
 * AMSA 771 — Near Coastal Sea Service Record (Australia).
 * Fills applicant (full name, date of birth, phone, seafarer’s number / discharge book when set), vessel/operational (including business name), and period totals onto the official PDF template. Does not write vessel phone, supervisor contact fields, or captain email — optional captain signature image is still embedded when available.
 * Does not write at-sea / standby / yard day breakdowns on the form — only total days for the period plus vessel particulars.
 *
 * EDIT COORDINATES HERE: AMSA 771 — all `top` values are points from the TOP of the page (same convention as MCA overlays).
 * Pass { debug: true } in options to draw red crosshairs for alignment (off by default).
 * Admins: Dashboard → PDF coordinate picker — upload a template and click to copy { x, top }. Dev: `/dev/amsa-pdf-align` when enabled.
 * When `receiptData` is set (same as MCA testimonial downloads), appends a SeaJourney verification / receipt page after the AMSA form.
 */
export async function generateAmsa771Testimonial(
  data: TestimonialPDFData,
  output: TestimonialPDFOutput = 'download',
  options?: TestimonialPDFOptions,
): Promise<Blob | void> {
  const debug = options?.debug === true;

  const { testimonial, userProfile, vessel, captainProfile, companyDetails } = data;

  const API_BASE_URL =
    typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
  const templateUrl = `${API_BASE_URL}${AMSA_771_FORM_PUBLIC_PATH}`;

  const res = await fetch(templateUrl);
  if (!res.ok) {
    throw new Error(`AMSA 771 template could not be loaded (${res.status}).`);
  }
  const templateBytes = await res.arrayBuffer();

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(templateBytes);
  } catch {
    throw new Error('AMSA 771 template PDF could not be parsed.');
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const red = rgb(1, 0, 0);

  const pages = pdfDoc.getPages();
  if (pages.length < 1) throw new Error('AMSA 771 template has no pages.');
  const page = pages[0];
  const { width: pw, height: ph } = page.getSize();

  const winAnsiSafe = (s: string) => String(s ?? '').replace(/\r\n|\r|\n|\t/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const safe = (v?: string | null) => winAnsiSafe(v ?? '');

  const Y = (_top: number) => ph - _top;

  const drawText = (
    text: string,
    x: number,
    top: number,
    opts?: { size?: number; bold?: boolean; maxW?: number },
  ) => {
    const sanitized = winAnsiSafe(text);
    if (!sanitized) return;
    const size = opts?.size ?? 9;
    const f = opts?.bold ? fontBold : font;
    const px = x;
    const py = Y(top);
    const maxW = opts?.maxW;

    if (maxW) {
      const words = sanitized.split(' ');
      let line = '';
      let y = py;
      for (const word of words) {
        const test = line + (line ? ' ' : '') + word;
        if (f.widthOfTextAtSize(test, size) > maxW && line) {
          page.drawText(line, { x: px, y, size, font: f, color: black });
          line = word;
          y -= size + 1.5;
        } else {
          line = test;
        }
      }
      if (line) page.drawText(line, { x: px, y, size, font: f, color: black });
      return;
    }
    page.drawText(sanitized, { x: px, y: py, size, font: f, color: black });
  };

  const debugMark = (label: string, x: number, top: number) => {
    if (!debug) return;
    const px = x;
    const py = Y(top);
    page.drawLine({ start: { x: px - 5, y: py }, end: { x: px + 5, y: py }, thickness: 0.6, color: red });
    page.drawLine({ start: { x: px, y: py - 5 }, end: { x: px, y: py + 5 }, thickness: 0.6, color: red });
    page.drawText(label, { x: px + 6, y: py + 2, size: 5.5, font, color: red });
  };

  const fullName = safe(
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() || userProfile.username || '',
  );
  const dob = formatDateDdMmYyyyForPdf(getDateOfBirthRawFromUserProfile(userProfile));
  const applicantPhone = safe(userProfile.mobile || userProfile.telephone || '');
  const seafarerNumber = safe(userProfile.dischargeBookNumber || '');
  const crewPosition = safe(userProfile.position || '');

  const vesselName = safe(vessel.name);
  const officialNo = safe(vessel.officialNumber);
  const lenM = vessel.length_m != null ? String(vessel.length_m) : '';

  const periodFrom = formatDateDdMmYyyyForPdf(testimonial.start_date);
  const periodTo = formatDateDdMmYyyyForPdf(testimonial.end_date);
  // AMSA form placement currently labeled "total days" in code, but this box should show sea days.
  const totalDays = String(testimonial.at_sea_days);

  const businessName = safe(companyDetails?.name);
  const sjCode = safe(testimonial.testimonial_code);

  // --- Tune positions to match the printed form (points from top, x from left). ---
  const C = {
    applicant: {
      /** Single full name (first + last, or username); wraps if long */
      fullName: { x: 70, top: 158.8, size: 9 },
      dob: { x: 390, top: 159.2, size: 9 },
      phone: { x: 70, top: 195.7, size: 9 },
      /** Seafarer’s number — from profile discharge book; tune in /dev/amsa-pdf-align */
      seafarerNumber: { x: 393.8, top: 195.7, size: 9 },
      /** Crew member rank / position — from profile */
      position: { x: 310, top: 243.8, size: 9 },
    },
    vessel: {
      /** Operating / business name (management company) */
      businessName: { x: 70, top: 245, size: 9, maxW: 420 },
      vesselName: { x: 70, top: 280.5, size: 9 },
      officialNo: { x: 310, top: 279.3, size: 9 },
      lengthM: { x: 70, top: 384.2, size: 9 },
      periodFrom: { x: 70, top: 314.5, size: 9 },
      periodTo: { x: 226.7, top: 314.9, size: 9 },
      totalDays: { x: 390, top: 312.9, size: 9 },
      /** Sea service reference — one overlay per printed box; tune in /dev/amsa-pdf-align */
      amsaModeOfOperation: { x: 70, top: 348, size: 9 },
      amsaTypeOfOperation: { x: 225.9, top: 348, size: 9 },
      amsaDutiesPerformed: { x: 398.6, top: 348, size: 9 },
      amsaPropulsion: { x: 181.9, top: 383.9, size: 9 },
    },
    footer: {
      verification: { x: 72, top: 780, size: 7 },
    },
    signature: { x: 61.3, top: 505.2, w: 120, h: 36 },
  } as const;

  const drawField = (key: string, text: string, spec: { x: number; top: number; size?: number; maxW?: number }) => {
    debugMark(key, spec.x, spec.top);
    drawText(text, spec.x, spec.top, { size: spec.size, maxW: spec.maxW });
  };

  drawField('applicant.fullName', fullName, C.applicant.fullName);
  if (dob) drawField('applicant.dob', dob, C.applicant.dob);
  if (applicantPhone) drawField('applicant.phone', applicantPhone, C.applicant.phone);
  if (seafarerNumber) drawField('applicant.seafarerNumber', seafarerNumber, C.applicant.seafarerNumber);
  if (crewPosition) drawField('applicant.position', crewPosition, C.applicant.position);

  if (businessName) drawField('vessel.businessName', businessName, C.vessel.businessName);
  drawField('vessel.name', vesselName, C.vessel.vesselName);
  drawField('vessel.official', officialNo, C.vessel.officialNo);
  drawField('vessel.length', lenM, C.vessel.lengthM);
  drawField('vessel.from', periodFrom, C.vessel.periodFrom);
  drawField('vessel.to', periodTo, C.vessel.periodTo);
  drawField('vessel.totalDays', totalDays, C.vessel.totalDays);

  const amsaParts = formatAmsaReferencePartsForPdf(data.amsaReference ?? null);
  if (amsaParts) {
    drawField('vessel.amsaModeOfOperation', amsaParts.modeOfOperation, C.vessel.amsaModeOfOperation);
    drawField('vessel.amsaTypeOfOperation', amsaParts.typeOfOperation, C.vessel.amsaTypeOfOperation);
    drawField('vessel.amsaDutiesPerformed', amsaParts.dutiesPerformed, C.vessel.amsaDutiesPerformed);
    drawField('vessel.amsaPropulsion', amsaParts.propulsion, C.vessel.amsaPropulsion);
  }

  if (sjCode) {
    debugMark('footer.sj', C.footer.verification.x, C.footer.verification.top);
    drawText(`SeaJourney ref: ${sjCode}`, C.footer.verification.x, C.footer.verification.top, { size: C.footer.verification.size });
  }

  const sig = testimonial.captain_signature || captainProfile?.signature || null;
  if (sig) {
    debugMark('captain.sig', C.signature.x, C.signature.top);
    try {
      const fmt = sig.toLowerCase().includes('jpeg') || sig.toLowerCase().includes('jpg') ? 'jpg' : 'png';
      const imgBytes = await fetch(sig).then((r) => r.arrayBuffer());
      const img = fmt === 'jpg' ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
      const px = C.signature.x;
      const bw = C.signature.w;
      const bh = C.signature.h;
      const scale = Math.min(bw / img.width, bh / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const bottomLeftY = ph - C.signature.top - h;
      page.drawImage(img, { x: px, y: bottomLeftY, width: w, height: h });
    } catch {
      // ignore bad signature image
    }
  }

  if (data.receiptData) {
    await appendSeaJourneyTestimonialReceiptPage(pdfDoc, data, font, fontBold, {
      documentTypeLine: 'Type: AMSA 771 (Near Coastal Sea Service)',
      supportingFooterLine: 'SeaJourney • Supporting document (not part of the official AMSA form)',
    });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

  const cleanFilename = (name: string) =>
    String(name || '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const crewLabel = cleanFilename(fullName || userProfile.username || 'Crew');
  const vesselLabel = cleanFilename(vessel.name || 'Vessel');
  const filename = `AMSA-771 ${crewLabel} ${vesselLabel}.pdf`;

  if (output === 'blob') {
    return blob;
  }
  const url = URL.createObjectURL(blob);
  if (output === 'newtab') {
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Data for one Proof of Service entry (one vessel + period). Multiple entries = multiple boxes on the PDF. */
export interface ProofOfServicePDFData {
  vesselName: string;
  vesselType: string | null;
  vesselImo: string | null;
  crewName: string;
  crewPosition: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  atSeaDays: number;
  standbyDays: number;
  yardDays: number;
  leaveDays: number;
  generatedByName: string;
  generatedByEmail: string | null;
  notes: string | null;
  /** Verification code from DB (present when entry was loaded from proof_of_service). */
  verificationCode?: string | null;
}

/** Single entry or array of entries (one box per entry; same vessel twice = two boxes). */
export type ProofOfServicePDFInput = ProofOfServicePDFData | ProofOfServicePDFData[];

export type ProofOfServicePDFOutput = 'download' | 'newtab' | 'blob';

/** One-page reference PDF for vessel managers — not an official SeaJourney form. */
export interface SeaServiceBreakdownPDFInput {
  vesselName: string;
  vesselType: string | null;
  vesselImo: string | null;
  crewName: string;
  crewPosition: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  /** Days with logged state "underway" (filled range). */
  underwayDays: number;
  atAnchorDays: number;
  inPortDays: number;
  /** Qualifying standby (already capped when passed from Documents). */
  standbyDays: number;
  yardDays: number;
  dataSourceLabel: string;
  calculationNote: string;
  generatedByName: string;
  generatedByEmail: string | null;
  standbyPeriods?: Array<{ passageStartDate: string; passageEndDate: string; standbyDays: number }>;
}

export type SeaServiceBreakdownPDFOutput = 'download' | 'newtab' | 'blob';

export interface NavWatchApplicationPDFData {
  application: {
    id: string;
    start_date: string;
    end_date: string;
    watchkeeping_hours?: number | null;
    navigation_duties?: string | null;
    additional_notes?: string | null;
    captain_name: string | null;
    captain_email: string | null;
    created_at: string;
  };
  userProfile: {
    firstName?: string;
    lastName?: string;
    username: string;
    email: string;
    dateOfBirth?: string | null;
    sex?: 'male' | 'female' | null;
    position?: string | null;
    dischargeBookNumber?: string | null;
  };
  vessel: {
    name: string;
    type: string | null;
    officialNumber?: string | null;
    flag_state?: string | null;
    length_m?: number | null;
    gross_tonnage?: number | null;
    call_sign?: string | null;
  };
  captainProfile?: {
    firstName?: string;
    lastName?: string;
    position?: string | null;
    email?: string;
    signature?: string | null;
  } | null;
}

export type MCACertificateType = 'navigational' | 'engine_room' | 'electro_technical';

export interface MCAReceiptData {
  documentId?: string; // Application ID or Testimonial ID
  sjCode?: string | null; // SJ-XXXXXXX code (testimonial_code)
  documentType: 'nav_watch' | 'oow' | 'testimonial';
  generatedAt: string; // ISO date string
  generatedBy?: {
    userId?: string;
    email?: string;
  };
}

export interface MCAWatchRatingApplicationData {
  // Receipt/Verification data (optional)
  receiptData?: MCAReceiptData;
  
  // Personal Details
  personalDetails: {
    title?: string; // Mr/Mrs/Miss/etc
    surname: string;
    forenames: string;
    dateOfBirth: string; // DD/MM/YYYY format
    placeOfBirth?: string;
    countryOfBirth?: string;
    nationality?: string;
    address: {
      line1: string;
      line2?: string;
      district?: string;
      townCity: string;
      countyState?: string;
      postCode: string;
      country: string;
    };
    telephone?: string;
    mobile?: string;
    email: string;

    // Optional: applicant signature as dataURL (PNG/JPEG)
    signatureDataUrl?: string | null;

    // Optional: countersigner details (for Electro-technical certificates)
    counterSign?: {
      name?: string;
      addressLine1?: string;
      addressLine2?: string;
      townCity?: string;
      countyState?: string;
      postCode?: string;
      country?: string;
      telephone?: string;
      occupation?: string;
      capacityKnownApplicant?: string;
      signatureDataUrl?: string | null;
      date?: string; // DD/MM/YYYY
    } | null;

    // Optional: checklist ticks for page 3 (Nav/Engine checklist)
    checklistNavEngine?: {
      attestedPassport?: boolean;
      payment?: boolean;
      dischargeBookOrCd?: boolean;
      seaServiceTestimonials?: boolean;
      passportPhoto?: boolean;
      stcwBasicTraining?: boolean;
      securityAwareness?: boolean; // STCW A-VI/6
      profInSurvivalCraft?: boolean; // STCW A-VI/2-1
      medical?: boolean;
      watchRatingTrainingRecordBook?: boolean;
      mntb?: boolean; // if relevant
    } | null;

    // Optional: checklist ticks for page 4 (ETR checklist)
    checklistETR?: {
      attestedPassport?: boolean;
      payment?: boolean;
      dischargeBookOrCd?: boolean;
      seaServiceTestimonials?: boolean;
      passportPhoto?: boolean;
      stcwBasicTraining?: boolean;
      securityAwareness?: boolean; // STCW A-VI/6
      electroTechnicalTraining?: boolean;
      medical?: boolean;
      electroTechnicalRecordBook?: boolean;
    } | null;
  };
  
  // Certificate Type
  certificateType: MCACertificateType;
  
  // Sea Service Records
  seaServiceRecords: Array<{
    vesselName: string;
    flag: string;
    imoNumber?: string;
    grossTonnage?: number;
    kilowatts?: number;
    length?: number; // in metres
    capacity?: string; // Position/rank
    fromDate: string; // DD/MM/YYYY
    toDate: string; // DD/MM/YYYY
    totalDays: number;
    daysAtSea: number;
  }>;
  
  // User profile for additional data
  userProfile: {
    firstName?: string;
    lastName?: string;
    username: string;
    email: string;
    dateOfBirth?: string | null;
    position?: string | null;
    dischargeBookNumber?: string | null;
  };
}

export interface PassageLogExportData {
  passages: Array<{
    id: string;
    vessel_id: string;
    vessel_name: string;
    departure_port: string;
    departure_country?: string | null;
    arrival_port: string;
    arrival_country?: string | null;
    start_time: string;
    end_time: string;
    distance_nm?: number | null;
    engine_hours?: number | null;
    passage_type?: string | null;
    weather_summary?: string | null;
    sea_state?: string | null;
    notes?: string | null;
  }>;
  userProfile: {
    firstName?: string;
    lastName?: string;
    username: string;
    email: string;
  };
  filterInfo?: {
    vesselName?: string;
    startDate?: Date;
    endDate?: Date;
  };
}

export type PassageLogPDFOutput = 'download' | 'newtab';

/* ========================================================================== */
/*                                  HELPERS                                   */
/* ========================================================================== */

type RGB = [number, number, number];

function safeText(value: any, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  return str.length > 0 ? str : fallback;
}

function truncate(value: any, max = 160, fallback = '—'): string {
  const str = safeText(value, fallback);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/** Format vessel type for display: "passenger-yacht" → "Passenger Yacht", "motor-yacht" → "Motor Yacht", etc. */
function formatVesselTypeForDisplay(type: string | null | undefined, fallback = '—'): string {
  if (type === null || type === undefined) return fallback;
  const trimmed = String(type).trim();
  if (!trimmed) return fallback;
  return trimmed
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Parse a yyyy-MM-dd date safely as a "date-only".
 * Using noon avoids DST edge cases where midnight can shift the date.
 * Accepts ISO timestamps from Supabase (e.g. …T00:00:00.000Z) via yyyy-MM-dd prefix.
 */
function parseDateOnly(dateStr: string): Date {
  const raw = String(dateStr).trim();
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    d = parse(raw.slice(0, 10), 'yyyy-MM-dd', new Date());
  } else {
    d = parseISO(raw);
  }
  if (!isValid(d)) {
    d = parse('1970-01-01', 'yyyy-MM-dd', new Date());
  }
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Raw DOB from user profile (camelCase or snake_case from API/DB). */
function getDateOfBirthRawFromUserProfile(userProfile: {
  dateOfBirth?: string | Date | number | null;
  date_of_birth?: string | Date | number | null;
}): string | null {
  const v = userProfile.dateOfBirth ?? userProfile.date_of_birth;
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (!isValid(v)) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const d = new Date(v);
    if (!isValid(d)) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  return s || null;
}

/** dd/MM/yyyy for pdf-lib overlays (AMSA, MCA, etc.); handles yyyy-MM-dd and ISO. */
function formatDateDdMmYyyyForPdf(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  try {
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      d = parse(raw.slice(0, 10), 'yyyy-MM-dd', new Date());
    } else {
      d = parseISO(raw);
    }
    if (!isValid(d) || Number.isNaN(d.getTime())) return '';
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '';
  }
}

function getPageCount(doc: jsPDF): number {
  return doc.getNumberOfPages();
}

/**
 * Adds a new page if we don't have enough space left.
 */
function ensureSpace(
  doc: jsPDF,
  currentY: number,
  requiredMm: number,
  topYOnNewPage = 20,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY > pageHeight - requiredMm) {
    doc.addPage();
    return topYOnNewPage;
  }
  return currentY;
}

/**
 * Load PNG logo image for PDF from public folder (cached + CORS-safe)
 */
const __logoCache = new Map<string, string>();
const __logoDimensionsCache = new Map<string, { width: number; height: number }>();

function loadLogoImage(logoPath: string): Promise<string> {
  const cached = __logoCache.get(logoPath);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');

        __logoCache.set(logoPath, dataURL);
        __logoDimensionsCache.set(logoPath, {
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
        resolve(dataURL);
      } catch (error) {
        reject(new Error(`Failed to convert image to data URL: ${error}`));
      }
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load logo from ${logoPath}. Make sure it exists in /public.`));
    };
    
    const absoluteSrc =
      logoPath.startsWith('http')
        ? logoPath
        : `${window.location.origin}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;

    img.src = absoluteSrc;
    
    if (img.complete) {
      img.onload(new Event('load') as any);
    }
  });
}

/** Load logo and return data URL plus natural dimensions (for aspect-ratio–correct scaling in PDF). */
function loadLogoImageWithDimensions(
  logoPath: string
): Promise<{ dataURL: string; width: number; height: number }> {
  return loadLogoImage(logoPath).then((dataURL) => {
    const dims = __logoDimensionsCache.get(logoPath);
    if (dims) return { dataURL, ...dims };
    return { dataURL, width: 1, height: 1 };
  });
}

/* ========================================================================== */
/*                          SEA SERVICE TESTIMONIAL                           */
/* ========================================================================== */

export async function generateTestimonialPDF(
  data: TestimonialPDFData,
  pdfFormat: TestimonialPDFFormat = 'mca',
  output: TestimonialPDFOutput = 'download',
  options?: TestimonialPDFOptions,
) {
  const debug = options?.debug ?? false;
  const positions: Record<string, { x?: number; y?: number; w?: number; h?: number }> = {};

  // Legacy stored value `pya` (removed from product copy) maps to MCA layout
  const resolvedPdfFormat: TestimonialPDFFormat =
    (pdfFormat as string) === 'pya' ? 'mca' : pdfFormat;

  const { testimonial, userProfile, vessel, captainProfile } = data;

  const fullName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;

  if (resolvedPdfFormat === 'amsa') {
    return generateAmsa771Testimonial(data, output, options);
  }

  const doc = new jsPDF();

  const startDate = format(parseDateOnly(testimonial.start_date), 'dd MMMM yyyy');
  const endDate = format(parseDateOnly(testimonial.end_date), 'dd MMMM yyyy');
  const generatedDate = format(new Date(), 'dd MMMM yyyy');
  
  // Use approved_at from approved_testimonials table if available, otherwise fall back to signoff_used_at
  const approvedDate =
    testimonial.status === 'approved' && testimonial.approved_at
      ? format(new Date(testimonial.approved_at), 'dd MMMM yyyy')
      : testimonial.status === 'approved' && testimonial.signoff_used_at
    ? format(new Date(testimonial.signoff_used_at), 'dd MMMM yyyy')
    : null;

  const dobRawSj = getDateOfBirthRawFromUserProfile(userProfile);
  const dateOfBirth =
    dobRawSj && formatDateDdMmYyyyForPdf(dobRawSj)
      ? format(parseDateOnly(dobRawSj), 'dd MMMM yyyy')
      : null;

  // Color scheme based on format
  const isMCATemplate = resolvedPdfFormat === 'mca';
  const textDark: RGB = [20, 20, 20];
  const textGray: RGB = [80, 80, 80];
  const primaryBlue: RGB = isMCATemplate ? [0, 0, 0] : [0, 29, 55];
  const borderColor: RGB = [180, 180, 180];
  const headerColor: RGB = isMCATemplate ? [240, 240, 240] : [0, 29, 55];
  const sectionBg: RGB = [248, 249, 250];
  const accentBlue: RGB = isMCATemplate ? [0, 0, 0] : [0, 51, 102];

  const setFillColor = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  if (debug) {
    positions.pageWidth = { x: pageWidth };
    positions.pageHeight = { y: pageHeight };
  }

  let currentY = 20;
  if (debug) positions.contentStartY = { y: currentY };

  // ===== Header =====
  if (isMCATemplate) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    setTextColor(textDark);
    doc.text('SEA SERVICE TESTIMONIAL', pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;

    setDrawColor(borderColor);
    doc.setLineWidth(0.5);
    doc.line(14, currentY, pageWidth - 14, currentY);
    currentY += 12;
  } else {
  const headerHeight = 50;
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  setDrawColor([0, 0, 0]);
  doc.setLineWidth(0.5);
  doc.line(0, headerHeight, pageWidth, headerHeight);

    let headerY = 12;

  try {
      const { dataURL: logoData, width: imgW, height: imgH } = await loadLogoImageWithDimensions('/logo-seajourney.png');
      const targetH = 9.5;
      const aspect = imgW / imgH;
      const logoH = targetH;
      const logoW = aspect * targetH;
      const logoX = (pageWidth - logoW) / 2;
      doc.addImage(logoData, 'PNG', logoX, headerY, logoW, logoH);
      headerY += logoH + 8;
  } catch (error) {
    console.error('Failed to load logo image:', error);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
      doc.text('SeaJourney', pageWidth / 2, headerY, { align: 'center' });
      headerY += 8;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
    doc.text('SEA SERVICE TESTIMONIAL', pageWidth / 2, headerY, { align: 'center' });

    headerY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 220, 220);
    doc.text('Official Certificate of Service', pageWidth / 2, headerY, { align: 'center' });
  
  setTextColor(textDark);
  currentY = headerHeight + 20;
  if (debug) {
    positions.headerHeight = { h: headerHeight };
    positions.afterHeaderY = { y: currentY };
  }
  }

  const sectionHeaderHeight = 8;
  if (debug) positions.sectionHeaderHeight = { h: sectionHeaderHeight };

  // ===== Part 1 – Seafarer's Details =====
  doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
  doc.text("PART 1 – SEAFARER'S DETAILS", 18, currentY + 2);
    
    setDrawColor(primaryBlue);
    doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
    
  currentY += sectionHeaderHeight + 4;
  if (debug) positions.part1HeaderY = { x: 18, y: currentY };

    doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('This is to certify that:', 18, currentY);
  currentY += 6;

  const personalRows: string[][] = [
    ['Name', safeText(fullName, 'Not provided')],
    ['Email address', safeText(userProfile.email, 'Not provided')],
  ];
  if (dateOfBirth) personalRows.push(['Date of birth', dateOfBirth]);
  if (userProfile.dischargeBookNumber) {
    personalRows.push(['Discharge Book Number', safeText(userProfile.dischargeBookNumber)]);
  } else {
    personalRows.push(['Discharge Book Number', '________________']);
  }

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    head: [['Field', 'Details']],
    body: personalRows,
    styles: {
      fontSize: 10,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      textColor: textDark,
    },
    headStyles: {
      fillColor: [235, 237, 240],
      textColor: primaryBlue,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50, textColor: textDark },
      1: { cellWidth: 'auto', textColor: textDark },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;
  if (debug) positions.afterPersonalTableY = { y: currentY };

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  
  const userPosition = safeText(userProfile.position, '');
  if (userPosition) {
    // Calculate width of "has served as: " to position the bold position text right after it
    doc.text('has served as: ', 18, currentY);
    const prefixWidth = doc.getTextWidth('has served as: ');
    
    // Position text in bold, same color
    doc.setFont('helvetica', 'bold');
    doc.text(userPosition, 18 + prefixWidth, currentY);
  } else {
    doc.text('has served as: ', 18, currentY);
    doc.setFontSize(9);
    setTextColor(textGray);
    const prefixWidth = doc.getTextWidth('has served as: ');
    doc.text('Position not specified', 18 + prefixWidth, currentY);
  }
  currentY += 6;
  if (debug) positions.hasServedAsY = { x: 18, y: currentY };

  // ===== Part 2 – Service =====
  currentY = ensureSpace(doc, currentY, 60);
  if (debug) positions.beforePart2Y = { y: currentY };
  
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('PART 2 – SERVICE', 18, currentY + 2);
  
  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
  
  currentY += sectionHeaderHeight + 4;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  setTextColor(accentBlue);
  doc.text('ON BOARD:', 18, currentY);
  currentY += 6;

  const vesselRows: string[][] = [['Vessel name', safeText(vessel.name, 'Not specified')]];

  const flagState = vessel.flag || vessel.flag_state;
  if (flagState) vesselRows.push(['Flag', safeText(flagState)]);
  if (vessel.officialNumber) vesselRows.push(['Official No.', safeText(vessel.officialNumber)]);

  if (vessel.type) {
    vesselRows.push(['Type (M/Y, S/Y, other)', safeText(formatVesselTypeForDisplay(vessel.type))]);
  }

  if (vessel.length_m) vesselRows.push(['Length-metres', `${vessel.length_m.toFixed(2)} m`]);
  if (vessel.gross_tonnage) vesselRows.push(['GT', `${vessel.gross_tonnage.toFixed(2)}`]);

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    head: [['Field', 'Details']],
    body: vesselRows,
    styles: { fontSize: 10, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, textColor: textDark },
    headStyles: {
      fillColor: [235, 237, 240],
      textColor: primaryBlue,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60, textColor: textDark },
      1: { cellWidth: 'auto', textColor: textDark },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;
  if (debug) positions.afterVesselTableY = { y: currentY };

  const serviceDateRows: string[][] = [
    ['From: (i.e. onboard yacht service)', startDate],
    ['Until: (cannot leave blank or testimonial is not valid)', endDate],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: serviceDateRows,
    styles: { fontSize: 10, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, textColor: textDark },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 100, textColor: textDark },
      1: { cellWidth: 'auto', textColor: textDark },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;
  if (debug) positions.afterServiceDatesY = { y: currentY };

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('The above service includes:', 18, currentY);
  currentY += 4;

  const serviceBreakdownRows: string[][] = [
    [
      'Actual Days at Sea:',
      `${testimonial.at_sea_days} days`,
      '(proceeding to sea and in transit with main propelling engines running for at least 4h within a 24h period)',
    ],
    [
      'Stand-by Service:',
      `${testimonial.standby_days} days`,
      '(SHOULD NOT EXCEED DAYS AT SEA - time immediately following a voyage, waiting for owner, uniformed/ready to depart Max. 14 consecutive days without leaving port)',
    ],
    ['Shipyard Service:', `${testimonial.yard_days} days`, '(max. 90 days per application)'],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    head: [['Service Type', 'Days', 'Notes']],
    body: serviceBreakdownRows,
    styles: { fontSize: 9, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, textColor: textDark },
    headStyles: {
      fillColor: [235, 237, 240],
      textColor: primaryBlue,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80, textColor: textDark },
      1: { cellWidth: 25, halign: 'center', fontStyle: 'bold', textColor: primaryBlue },
      2: { cellWidth: 'auto', fontSize: 8, textColor: textGray },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;
  currentY = ensureSpace(doc, currentY, 60);
  if (debug) positions.afterServiceBreakdownY = { y: currentY };

    doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text(`Days of leave of absence: ${testimonial.leave_days} days`, 18, currentY);
  currentY += 5;

  const cruisingRows: string[][] = [
    ['Areas cruised, rotation', '________________'],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: cruisingRows,
    styles: { fontSize: 10, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, textColor: textDark },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80, textColor: textDark },
      1: { cellWidth: 'auto', textColor: textDark },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;
  if (debug) positions.afterCruisingTableY = { y: currentY };

  // ===== Captain Comments Section =====
  currentY = ensureSpace(doc, currentY, 100);
  currentY += 6;
  
  // Comments header
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('Comments on the following:', 18, currentY);
  currentY += 8;

  // Prepare comments data for table
  const commentsRows: string[][] = [
    [
      'Conduct',
      safeText(testimonial.captain_comment_conduct) || '_______________________________',
    ],
    [
      'Ability',
      safeText(testimonial.captain_comment_ability) || '_______________________________',
    ],
    [
      'General Comments',
      safeText(testimonial.captain_comment_general) || '_______________________________',
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    head: [['Category', 'Comments']],
    body: commentsRows,
    styles: { fontSize: 9, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, textColor: textDark },
    headStyles: {
      fillColor: [235, 237, 240],
      textColor: primaryBlue,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50, textColor: textDark },
      1: { cellWidth: 'auto', textColor: textDark },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;
  if (debug) positions.afterCommentsTableY = { y: currentY };

  // ===== Company Details Section =====
  currentY = ensureSpace(doc, currentY, 80);
  
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('COMPANY DETAILS', 18, currentY + 2);

  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);

  currentY += sectionHeaderHeight + 4;

  const companyRows: string[][] = [];
  
  if (data.companyDetails?.name) {
    companyRows.push(['Company Name', safeText(data.companyDetails.name)]);
  } else {
    companyRows.push(['Company Name', '________________']);
  }
  
  if (data.companyDetails?.address) {
    companyRows.push(['Address', safeText(data.companyDetails.address)]);
  } else {
    companyRows.push(['Address', '________________']);
  }
  
  if (data.companyDetails?.contactDetails) {
    companyRows.push(['Contact Details', safeText(data.companyDetails.contactDetails)]);
  } else {
    companyRows.push(['Contact Details', '________________']);
  }

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    head: [['Field', 'Details']],
    body: companyRows,
    styles: {
      fontSize: 10,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      textColor: textDark,
    },
    headStyles: {
      fillColor: [235, 237, 240],
      textColor: primaryBlue,
        fontStyle: 'bold',
      fontSize: 10,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50, textColor: textDark },
      1: { cellWidth: 'auto', textColor: textDark },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
    });

  currentY = (doc as any).lastAutoTable.finalY + 6;
  if (debug) positions.afterCompanyTableY = { y: currentY };
  
  // ===== Part 3 – Declaration =====
  // Force Part 3 to start on page 3
  const currentPageCount = doc.getNumberOfPages();
  const targetPage = 3;
  
  // Add pages until we reach page 3
  // If we're on page 1, we need 2 more pages (pages 2 and 3)
  // If we're on page 2, we need 1 more page (page 3)
  // If we're already on page 3 or beyond, check if we need a new page based on current position
  if (currentPageCount < targetPage) {
    const pagesNeeded = targetPage - currentPageCount;
    for (let i = 0; i < pagesNeeded; i++) {
    doc.addPage();
    }
    currentY = 20; // Start at top of page 3
  } else if (currentPageCount === targetPage) {
    // We're on page 3, but might be mid-page - check if we have enough space
    const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY > pageHeight - 120) {
      // Not enough space, add a new page
      doc.addPage();
      currentY = 20;
    }
    // Otherwise, continue on current page
  } else {
    // We're beyond page 3, add a new page to start Part 3 fresh
    doc.addPage();
    currentY = 20;
  }
  
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('PART 3 – DECLARATION BY MASTER / COMPANY REPRESENTATIVE', 18, currentY + 2);
  
  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
  
  currentY += sectionHeaderHeight + 4;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);

  const declarationText =
    'I hereby certify that the details of service stated above are, to the best of my ' +
    "knowledge and belief, a true and accurate record of this seafarer's onboard service, " +
    'based on vessel records and official log information. This testimonial is issued to ' +
    'support applications for sea service verification by recognised bodies (e.g. ' +
    'Nautilus International) and, where applicable, submission to the Maritime and Coastguard Agency (MCA).';

  const declarationLines = doc.splitTextToSize(declarationText, pageWidth - 36);
  doc.text(declarationLines, 18, currentY);
  currentY += declarationLines.length * 5 + 6;

  // Signatory details - Redesigned
  currentY += 6;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('Signatory Details', 18, currentY);
  currentY += 8;
  if (debug) positions.signatoryDetailsLabelY = { x: 18, y: currentY };

  // Signatory details box
  const signatoryBoxHeight = 20;
  const signatoryBoxWidth = pageWidth - 36;
  
  // Draw signatory details box
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);
  doc.rect(18, currentY, signatoryBoxWidth, signatoryBoxHeight);
  if (debug) {
    positions.signatoryBox = { x: 18, y: currentY, w: signatoryBoxWidth, h: signatoryBoxHeight };
  }

  const padding = 3;
  let signatoryY = currentY + padding + 3;
  if (debug) {
    positions.signatoryNameY = { x: 20, y: signatoryY };
    positions.signatoryPositionY = { y: signatoryY + 4 };
    positions.signatoryEmailY = { y: signatoryY + 8 };
  }

  let captainName = testimonial.captain_name;
  if (!captainName && captainProfile) {
    const profileName = `${captainProfile.firstName || ''} ${captainProfile.lastName || ''}`.trim();
    if (profileName) captainName = profileName;
    }
  captainName = captainName || '_______________________________';

  const captainPosition =
    (testimonial as any).captain_position || captainProfile?.position || null;

  const captainEmail = captainProfile?.email || testimonial.captain_email || null;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  
  doc.text(`Name: ${truncate(captainName, 60, '_______________________________')}`, 20, signatoryY);
  signatoryY += 4;
  doc.text(`Position: ${truncate(captainPosition, 60, '_______________________________')}`, 20, signatoryY);
  signatoryY += 4;
  doc.text(`Email: ${truncate(captainEmail, 70, '_______________________________')}`, 20, signatoryY);

  currentY += signatoryBoxHeight + 10;
  
  // Horizontal alignment: Signature, Date, Ship's Stamp
  const sectionStartY = currentY;
  const sectionHeight = 25; // Height for all three sections
  const sectionWidth = (pageWidth - 36 - 8) / 3; // Divide available width into 3 equal sections (with 4mm gaps)
  const gap = 4; // Gap between sections
  if (debug) {
    positions.sectionStartY = { y: sectionStartY };
    positions.sectionWidth = { w: sectionWidth };
  }

  // Section 1: Signature (left)
  const signatureX = 18;
  const signatureY = sectionStartY;
  if (debug) positions.signatureLabel = { x: signatureX, y: signatureY };
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('Signature', signatureX, signatureY);
  
  // Signature - add signature image if available
  // Priority: testimonial.captain_signature (saved at approval) > captainProfile.signature (legacy/fallback)
  const captainSignature = testimonial.captain_signature || captainProfile?.signature || null;
  
  console.log('[PDF GENERATION] Checking for captain signature:', {
    hasTestimonialSignature: !!testimonial.captain_signature,
    hasCaptainProfileSignature: !!captainProfile?.signature,
    usingSignature: captainSignature ? 'testimonial' : captainProfile?.signature ? 'profile' : 'none',
    signatureLength: captainSignature?.length || 0,
    signaturePreview: captainSignature?.substring(0, 50)
  });
  
  const signatureBoxY = signatureY + 4;
  const signatureBoxHeight = 12;
  if (debug) positions.signatureBox = { x: signatureX, y: signatureBoxY, w: sectionWidth - 2, h: signatureBoxHeight };

  if (captainSignature) {
    try {
      console.log('[PDF GENERATION] Adding signature image to PDF');
      
      // Detect image format from data URL
      let imageFormat: 'PNG' | 'JPEG' | 'JPG' = 'PNG';
      
      if (captainSignature.includes('data:image/jpeg') || captainSignature.includes('data:image/jpg')) {
        imageFormat = 'JPEG';
      } else if (captainSignature.includes('data:image/png')) {
        imageFormat = 'PNG';
  }
      
      console.log('[PDF GENERATION] Detected image format:', imageFormat);
      
      // Add signature image (scaled to fit box)
      doc.addImage(captainSignature, imageFormat, signatureX, signatureBoxY, sectionWidth - 2, signatureBoxHeight);
      console.log('[PDF GENERATION] Signature image added successfully');
    } catch (error) {
      console.error('[PDF GENERATION] Error adding signature image to PDF:', error);
      console.error('[PDF GENERATION] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      // Fall back to signature line if image fails
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);
      doc.rect(signatureX, signatureBoxY, sectionWidth - 2, signatureBoxHeight);
      doc.line(signatureX + 2, signatureBoxY + signatureBoxHeight / 2, signatureX + sectionWidth - 4, signatureBoxY + signatureBoxHeight / 2);
    }
  } else {
    console.log('[PDF GENERATION] No signature available, using signature line');
    // Signature box (if no signature image)
    setDrawColor(borderColor);
    doc.setLineWidth(0.5);
    doc.rect(signatureX, signatureBoxY, sectionWidth - 2, signatureBoxHeight);
    doc.line(signatureX + 2, signatureBoxY + signatureBoxHeight / 2, signatureX + sectionWidth - 4, signatureBoxY + signatureBoxHeight / 2);
  }
  
  doc.setFontSize(7);
  setTextColor(textGray);
  doc.text('Master / Company Representative', signatureX, signatureBoxY + signatureBoxHeight + 3);

  // Section 2: Date (middle)
  const dateX = signatureX + sectionWidth + gap;
  const dateY = sectionStartY;
  if (debug) {
    positions.dateLabel = { x: dateX, y: dateY };
    positions.dateValueY = { y: dateY + 6 };
  }
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('Approved Date', dateX, dateY);

  const dateTextY = dateY + 6;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  
  if (approvedDate) {
    doc.setFont('helvetica', 'bold');
    doc.text(approvedDate, dateX, dateTextY);
  } else {
    // Draw a line for date entry
    doc.line(dateX, dateTextY, dateX + sectionWidth - 2, dateTextY);
  }

  // Section 3: Ship's Stamp (right)
  const stampX = dateX + sectionWidth + gap;
  const stampY = sectionStartY;
  if (debug) positions.stampLabel = { x: stampX, y: stampY };
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text("Ship's Stamp", stampX, stampY);

  // Ship's stamp - render the stored vessel stamp image if available, otherwise leave the
  // labelled space blank so a physical stamp can be applied to printed copies.
  const stampBoxY = stampY + 4;
  const stampBoxHeight = 18; // Square-ish slot for a typical round/oval ship's stamp
  const stampBoxWidth = sectionWidth - 2;
  if (debug) positions.stampBox = { x: stampX, y: stampBoxY, w: stampBoxWidth, h: stampBoxHeight };

  const vesselStamp = vessel.stamp || null;
  let stampSectionEnd: number;
  if (vesselStamp) {
    try {
      let stampFormat: 'PNG' | 'JPEG' = 'PNG';
      if (vesselStamp.includes('data:image/jpeg') || vesselStamp.includes('data:image/jpg')) {
        stampFormat = 'JPEG';
      }
      doc.addImage(vesselStamp, stampFormat, stampX, stampBoxY, stampBoxWidth, stampBoxHeight);
      stampSectionEnd = stampBoxY + stampBoxHeight + 3;
    } catch (error) {
      console.error('[PDF GENERATION] Error adding ship\'s stamp image to PDF:', error);
      stampSectionEnd = stampY + 4;
    }
  } else {
    stampSectionEnd = stampY + 4;
  }

  // Calculate final Y position based on the tallest section (signature with box)
  const signatureSectionEnd = signatureBoxY + signatureBoxHeight + 6; // Box + text below
  const dateSectionEnd = dateTextY + 4; // Text + spacing
  currentY = Math.max(signatureSectionEnd, dateSectionEnd, stampSectionEnd);

  // ===== Part 4 – Official Verification (optional) =====
  if (testimonial.official_body || testimonial.official_reference) {
    currentY = ensureSpace(doc, currentY + 8, 70);
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text('PART 4 – OFFICIAL VERIFICATION (NAUTILUS / OTHER)', 18, currentY + 2);
    
    setDrawColor(primaryBlue);
    doc.setLineWidth(0.5);
    doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
    
    currentY += sectionHeaderHeight + 4;

    const verificationRows: string[][] = [];
    if (testimonial.official_body) {
      verificationRows.push(['Verifying organisation:', safeText(testimonial.official_body)]);
    }
    if (testimonial.official_reference) {
      verificationRows.push(['Verification reference:', safeText(testimonial.official_reference)]);
    }

    autoTable(doc, {
      startY: currentY,
      theme: 'plain',
      body: verificationRows,
      styles: { fontSize: 10, cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, textColor: textDark },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60, textColor: textDark },
        1: { cellWidth: 'auto', textColor: textDark },
      },
      margin: { left: 18, right: 18 },
      tableLineColor: borderColor,
      tableLineWidth: 0.5,
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ===== Footer on all pages: Document ID + Reference Code + Generated Date + Page X of Y =====
  const totalPages = getPageCount(doc);
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setTextColor(textGray);

    const y = pageHeight - 8;
    const ySecondLine = y - 4;
    
    // First line: Document ID (left), Verification link (center), Page number (right)
    doc.text(`Document ID: ${testimonial.id}`, 14, y, { align: 'left' });
    doc.text('www.seajourney.co.uk/verify', pageWidth / 2, y, { align: 'center' });
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - 14, y, { align: 'right' });

    // Second line: Reference Code (left), Generated date (right) - on all pages
    if (testimonial.testimonial_code) {
      doc.text(`Reference Code: ${testimonial.testimonial_code}`, 14, ySecondLine, { align: 'left' });
    }
    doc.text(`Generated: ${generatedDate}`, pageWidth - 14, ySecondLine, { align: 'right' });
  }

  // ===== Filename =====
  const formatDateForFilename = (dateStr: string): string => {
    const date = parseDateOnly(dateStr);
    const day = date.getDate();
    const month = format(date, 'MMM');

    const getOrdinal = (n: number): string => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return `${getOrdinal(day)} ${month}`;
  };

  const cleanName = (name: string): string =>
    String(name || '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const startDateFilename = formatDateForFilename(testimonial.start_date);
  const endDateFilename = formatDateForFilename(testimonial.end_date);

  const crewName = cleanName(fullName);
  const vesselName = cleanName(vessel.name || 'UnknownVessel');
    const formatName = resolvedPdfFormat.toUpperCase();

  const filename = `${startDateFilename} - ${endDateFilename} ${crewName} ${vesselName} testimonial ${formatName}.pdf`;

  if (debug) {
    console.log('[Testimonial PDF] Layout positions (x, y, w, h in mm):', JSON.stringify(positions, null, 2));
  }

  // ===== Output modes =====
  if (output === 'blob') {
    return doc.output('blob');
  }
  if (output === 'newtab') {
  doc.output('dataurlnewwindow');
    return;
  }

  doc.save(filename);
}

/* ========================================================================== */
/*                            SEA TIME REPORT PDF                             */
/* ========================================================================== */

export async function generateSeaTimeTestimonial(data: SeaTimeReportDataType) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { userProfile, serviceRecords, vesselDetails, totalDays, totalSeaDays, totalStandbyDays } =
    data;

  const fullName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;

  const generatedDate = format(new Date(), 'dd MMM yyyy');

  const textDark: RGB = [20, 20, 20];
  const textGray: RGB = [80, 80, 80];
  const primaryBlue: RGB = [0, 29, 55];
  const borderColor: RGB = [180, 180, 180];
  const headerColor: RGB = [0, 29, 55];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const setFillColor = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  let currentY = 20;

  // ===== HEADER =====
  const headerHeight = 50;
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  setDrawColor([0, 0, 0]);
  doc.setLineWidth(0.5);
  doc.line(0, headerHeight, pageWidth, headerHeight);

  let headerY = 12;

  try {
    const { dataURL: logoData, width: imgW, height: imgH } = await loadLogoImageWithDimensions('/logo-seajourney.png');
    const targetH = 9.5;
    const aspect = imgW / imgH;
    const logoH = targetH;
    const logoW = aspect * targetH;
    const logoX = (pageWidth - logoW) / 2;
    doc.addImage(logoData, 'PNG', logoX, headerY, logoW, logoH);
    headerY += logoH + 8;
  } catch (error) {
    console.error('Failed to load logo image:', error);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('SeaJourney', pageWidth / 2, headerY, { align: 'center' });
    headerY += 8;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SEA TIME SUMMARY REPORT', pageWidth / 2, headerY, { align: 'center' });

  headerY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 220, 220);
  doc.text('Overview of logged sea service for use as supporting documentation', pageWidth / 2, headerY, { align: 'center' });

  setTextColor(textDark);
  currentY = headerHeight + 20;

  // ===== Seafarer Information =====
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('SEAFARER INFORMATION', 18, currentY + 2);
  
  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
  
  currentY += 12;

  const seafarerRows = [
    ['Full Name:', safeText(fullName, 'Not provided')],
    ['Email Address:', safeText(userProfile.email, 'Not provided')],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: seafarerRows,
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      textColor: textDark,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55 },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // ===== Vessel Information =====
  if (vesselDetails) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text('PRIMARY VESSEL INFORMATION', 18, currentY + 2);
    
    setDrawColor(primaryBlue);
    doc.setLineWidth(0.5);
    doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
    
    currentY += 12;

    const vesselRows: string[][] = [
      ['Vessel Name:', safeText(vesselDetails.name, 'Not specified')],
      ['Vessel Type:', safeText(formatVesselTypeForDisplay(vesselDetails.type), 'Not specified')],
    ];

    if (vesselDetails.officialNumber) {
      vesselRows.push(['Official Number:', safeText(vesselDetails.officialNumber)]);
    }

    autoTable(doc, {
      startY: currentY,
      theme: 'plain',
      body: vesselRows,
      styles: {
        fontSize: 9,
        cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
        textColor: textDark,
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto' },
      },
      margin: { left: 18, right: 18 },
      tableLineColor: borderColor,
      tableLineWidth: 0.2,
    });

    currentY = (doc as any).lastAutoTable.finalY + 12;
  }

  // ===== Summary Statistics =====
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('SEA TIME SUMMARY', 18, currentY + 2);
  
  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
  
  currentY += 12;

  const summaryRows: string[][] = [
    ['Total Days Logged:', `${totalDays} days`],
    ['Total Sea Days (Underway):', `${totalSeaDays} days`],
    ['Total Standby Days (port / anchor):', `${totalStandbyDays} days`],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: summaryRows,
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      textColor: textDark,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // ===== Service Records by Vessel (grouped) =====
  if (serviceRecords && serviceRecords.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text('SERVICE RECORDS BY VESSEL', 18, currentY + 2);
    
    setDrawColor(primaryBlue);
    doc.setLineWidth(0.5);
    doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
    
    currentY += 12;

    const vesselGroups = serviceRecords.reduce((acc, record) => {
      const vesselName = record.vesselName || 'Unknown Vessel';
      if (!acc[vesselName]) acc[vesselName] = [];
      acc[vesselName].push(record);
      return acc;
    }, {} as Record<string, typeof serviceRecords>);

    Object.entries(vesselGroups).forEach(([vesselName, records]) => {
      currentY = ensureSpace(doc, currentY, 60, 20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      setTextColor(primaryBlue);
      doc.text(`Vessel: ${truncate(vesselName, 70, 'Unknown Vessel')}`, 18, currentY);
      currentY += 6;

      // Get the overall date range from all periods
      const allStartDates = records.map(r => r.start_date).sort();
      const allEndDates = records.map(r => r.end_date).sort();
      const start =
        allStartDates[0] ? format(parseDateOnly(allStartDates[0]), 'dd MMM yyyy') : 'N/A';
      const end =
        allEndDates[allEndDates.length - 1]
          ? format(parseDateOnly(allEndDates[allEndDates.length - 1]), 'dd MMM yyyy')
          : 'N/A';
      
      // Sum up total days from all periods for this vessel
      const totalDays = records.reduce((sum, record) => sum + record.totalDays, 0);
      const totalAtSeaDays = records.reduce((sum, record) => sum + (record.at_sea_days || 0), 0);
      const totalStandbyDays = records.reduce((sum, record) => sum + (record.standby_days || 0), 0);

      const vesselSummaryRows: string[][] = [
        ['Period:', `${start} to ${end}`],
        ['Total Days:', `${totalDays} days`],
        ['At Sea Days:', `${totalAtSeaDays} days`],
        ['Standby Days:', `${totalStandbyDays} days`],
      ];

      autoTable(doc, {
        startY: currentY,
        theme: 'plain',
        body: vesselSummaryRows,
        styles: { fontSize: 8.5, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: textDark },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 'auto' },
        },
        margin: { left: 18, right: 18 },
        tableLineColor: borderColor,
        tableLineWidth: 0.2,
      });

      currentY = (doc as any).lastAutoTable.finalY + 6;
    });
  }

  // ===== Footer =====
  const pageCount = getPageCount(doc);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    const footerHeight = 18;
    const footerStartY = pageHeight - footerHeight;

    setFillColor(headerColor);
    doc.rect(0, footerStartY, pageWidth, footerHeight, 'F');

    const footerY = footerStartY + 6;

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    setTextColor([255, 255, 255]);
    doc.text('www.seajourney.co.uk', 14, footerY);
    doc.text('www.seajourney.co.uk/verify', 14, footerY + 4);

    doc.setFont('helvetica', 'normal');
    setTextColor([220, 220, 220]);
    doc.text(
      'Electronic sea time summary – not a substitute for signed testimonials where formally required.',
      pageWidth / 2,
      footerY,
      { align: 'center' },
    );

    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, footerY, { align: 'right' });
  }

  doc.output('dataurlnewwindow');
}

/* ========================================================================== */
/*                         PROOF OF SERVICE PDF                               */
/* ========================================================================== */

export async function generateProofOfServicePDF(
  data: ProofOfServicePDFInput,
  output: ProofOfServicePDFOutput = 'download'
) {
  const entries: ProofOfServicePDFData[] = Array.isArray(data) ? data : [data];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  const colors = {
    navy: [15, 23, 42] as [number, number, number],
    blue: [37, 99, 235] as [number, number, number],
    purple: [126, 34, 206] as [number, number, number],
    text: [28, 28, 30] as [number, number, number],
    muted: [107, 114, 128] as [number, number, number],
    border: [226, 232, 240] as [number, number, number],
    softBg: [248, 250, 252] as [number, number, number],
    lightBlue: [239, 246, 255] as [number, number, number],
    lightPurple: [245, 243, 255] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    successBg: [240, 253, 244] as [number, number, number],
    successText: [22, 101, 52] as [number, number, number],
  };

  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const safe = (s: string | null | undefined) => (s && String(s).trim()) || '—';

  const drawRoundedRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fillColor?: [number, number, number],
    drawColor?: [number, number, number]
  ) => {
    if (fillColor) setFill(fillColor);
    if (drawColor) setDraw(drawColor);
    doc.setLineWidth(0.25);

    const hasRoundedRect = typeof (doc as unknown as { roundedRect?: unknown }).roundedRect === 'function';
    if (hasRoundedRect) {
      (doc as unknown as {
        roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void;
      }).roundedRect(x, y, w, h, 2.5, 2.5, fillColor ? 'FD' : 'S');
    } else {
      doc.rect(x, y, w, h, fillColor ? 'FD' : 'S');
    }
  };

  const drawSectionLabel = (label: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(colors.muted);
    doc.text(label.toUpperCase(), x, y);
  };

  const drawField = (
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
    valueColor: [number, number, number] = colors.text
  ) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(colors.muted);
    doc.text(label, x, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(valueColor);

    const lines = doc.splitTextToSize(value, width);
    doc.text(lines, x, y + 4.5);

    return y + 4.5 + lines.length * 4.2;
  };

  const drawMetricCard = (
    label: string,
    value: string,
    x: number,
    y: number,
    w: number,
    bg: [number, number, number],
    valueColor: [number, number, number]
  ) => {
    drawRoundedRect(x, y, w, 17, bg, colors.border);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(colors.muted);
    doc.text(label, x + 3, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setText(valueColor);
    doc.text(value, x + 3, y + 12);
  };

  const drawHeader = async (title: string, subtitle: string) => {
    const headerHeight = 34;
    setFill(colors.navy);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    try {
      const { dataURL: logoData, width: imgW, height: imgH } = await loadLogoImageWithDimensions('/logo-seajourney.png');
      const targetH = 8;
      const aspect = imgW / imgH;
      const logoH = targetH;
      const logoW = aspect * targetH;
      const logoX = margin;
      const logoY = (headerHeight - logoH) / 2;
      doc.addImage(logoData, 'PNG', logoX, logoY, logoW, logoH);
    } catch {}

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(255, 255, 255);
    doc.text(title, pageWidth - margin, 14, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.text(subtitle, pageWidth - margin, 20, { align: 'right' });
  };

  const drawFooter = (
    pageNumber: number,
    totalPages: number,
    generatedByName?: string,
    generatedByEmail?: string,
    leftText?: string
  ) => {
    const footerY = pageHeight - 10;
    setDraw(colors.border);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(colors.muted);
    const left =
      leftText !== undefined
        ? leftText
        : `Generated by ${safe(generatedByName)}${generatedByEmail ? ` (${generatedByEmail})` : ''}`;
    doc.text(left, margin, footerY);
    doc.text(`SeaJourney • Page ${pageNumber} of ${totalPages}`, pageWidth - margin, footerY, {
      align: 'right',
    });
  };

  const drawSummaryPage = async () => {
    const first = entries[0];
    const totalDays = entries.reduce((sum, e) => sum + (e.totalDays || 0), 0);
    const totalAtSea = entries.reduce((sum, e) => sum + (e.atSeaDays || 0), 0);
    const totalStandby = entries.reduce((sum, e) => sum + (e.standbyDays || 0), 0);
    const totalYard = entries.reduce((sum, e) => sum + (e.yardDays || 0), 0);
    const totalAtAnchor = entries.reduce((sum, e) => sum + (e.leaveDays || 0), 0);

    await drawHeader('Proof of Service', 'Crew service summary');

    let y = 46;

    drawRoundedRect(margin, y, contentWidth, 32, colors.white, colors.border);
    drawSectionLabel('Crew member summary', margin + 4, y + 6);

    let sy = y + 12;
    sy = drawField('Name', safe(first.crewName), margin + 4, sy, 80);
    drawField('Position', safe(first.crewPosition), margin + 100, y + 12, 80);
    drawField('Entries included', String(entries.length), margin + 4, sy + 4, 80);
    drawField('Generated', format(new Date(), 'dd MMM yyyy'), margin + 100, y + 21, 80);

    y += 42;

    drawSectionLabel('Combined totals', margin, y);
    y += 3;

    const gap = 4;
    const metricW = (contentWidth - gap * 4) / 5;
    drawMetricCard('Total days', String(totalDays), margin, y, metricW, colors.softBg, colors.navy);
    drawMetricCard('At sea', String(totalAtSea), margin + (metricW + gap) * 1, y, metricW, colors.lightBlue, colors.blue);
    drawMetricCard('Standby', String(totalStandby), margin + (metricW + gap) * 2, y, metricW, colors.lightPurple, colors.purple);
    drawMetricCard('Yard', String(totalYard), margin + (metricW + gap) * 3, y, metricW, colors.softBg, colors.text);
    drawMetricCard('At anchor', String(totalAtAnchor), margin + (metricW + gap) * 4, y, metricW, colors.softBg, colors.text);

    y += 28;

    drawRoundedRect(margin, y, contentWidth, 28, colors.softBg, colors.border);
    drawSectionLabel('Document purpose', margin + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(colors.text);
    doc.text(
      doc.splitTextToSize(
        'This document contains individual proof of service records for the crew member listed above. Each following page represents one vessel entry and its associated service period.',
        contentWidth - 8
      ),
      margin + 4,
      y + 13
    );
  };

  const drawEntryPage = async (entry: ProofOfServicePDFData, pageNumber: number, totalPages: number) => {
    await drawHeader('Proof of Service Record', 'Individual vessel service entry');

    const displayCode = entry.verificationCode
      ? entry.verificationCode.startsWith('POS-')
        ? entry.verificationCode
        : `POS-${entry.verificationCode.replace(/^POS-/, '').substring(0, 8)}`
      : 'Not assigned';

    const periodStr = `${format(parse(entry.startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')} – ${format(
      parse(entry.endDate, 'yyyy-MM-dd', new Date()),
      'dd MMM yyyy'
    )}`;

    let y = 42;
    const gap = 6;
    const halfW = (contentWidth - gap) / 2;

    drawRoundedRect(margin, y, halfW, 40, colors.white, colors.border);
    drawSectionLabel('Vessel details', margin + 4, y + 6);
    let ly = y + 12;
    ly = drawField('Vessel name', safe(entry.vesselName), margin + 4, ly, halfW - 8);
    ly = drawField('Vessel type', safe(entry.vesselType), margin + 4, ly + 2, halfW - 8);
    drawField('IMO / Official No.', safe(entry.vesselImo), margin + 4, ly + 2, halfW - 8);

    drawRoundedRect(margin + halfW + gap, y, halfW, 40, colors.white, colors.border);
    drawSectionLabel('Crew & service period', margin + halfW + gap + 4, y + 6);
    let ry = y + 12;
    ry = drawField('Crew name', safe(entry.crewName), margin + halfW + gap + 4, ry, halfW - 8);
    ry = drawField('Position', safe(entry.crewPosition), margin + halfW + gap + 4, ry + 2, halfW - 8);
    drawField('Service period', periodStr, margin + halfW + gap + 4, ry + 2, halfW - 8);

    y += 48;

    drawSectionLabel('Sea time breakdown', margin, y);
    y += 3;

    const metricGap = 4;
    const metricW = (contentWidth - metricGap * 4) / 5;

    drawMetricCard('Total days', String(entry.totalDays), margin, y, metricW, colors.softBg, colors.navy);
    drawMetricCard('At sea', String(entry.atSeaDays), margin + (metricW + metricGap) * 1, y, metricW, colors.lightBlue, colors.blue);
    drawMetricCard('Standby', String(entry.standbyDays), margin + (metricW + metricGap) * 2, y, metricW, colors.lightPurple, colors.purple);
    drawMetricCard('Yard', String(entry.yardDays), margin + (metricW + metricGap) * 3, y, metricW, colors.softBg, colors.text);
    drawMetricCard('At anchor', String(entry.leaveDays), margin + (metricW + metricGap) * 4, y, metricW, colors.softBg, colors.text);

    y += 24;

    // ========== SeaJourney-branded verification panel ==========
    const ribbonH = 7;
    const accentH = 0.8;
    const bodyH = 32;
    const panelH = ribbonH + accentH + bodyH;
    const panelX = margin;
    const panelY = y;
    const panelW = contentWidth;

    const cream: [number, number, number] = [250, 252, 255];
    const accent: [number, number, number] = [31, 115, 242];
    const accentSoft: [number, number, number] = [158, 204, 255];

    // Body card (cream fill, navy border) drawn first so ribbon sits on top
    drawRoundedRect(panelX, panelY, panelW, panelH, cream, colors.navy);

    // Navy ribbon
    setFill(colors.navy);
    doc.rect(panelX, panelY, panelW, ribbonH, 'F');
    // Accent stripe
    setFill(accent);
    doc.rect(panelX, panelY + ribbonH, panelW, accentH, 'F');

    // Ribbon left: brand mark + label
    setFill(accent);
    doc.circle(panelX + 5.5, panelY + ribbonH / 2, 1.3, 'F');
    setFill(colors.white);
    doc.circle(panelX + 5.5, panelY + ribbonH / 2, 0.55, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('VERIFIED SEA SERVICE RECORD', panelX + 9, panelY + ribbonH / 2 + 0.8);

    // Ribbon right: tagline + wordmark
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const brand = 'SeaJourney';
    const brandWidth = doc.getTextWidth(brand);
    const brandX = panelX + panelW - 5 - brandWidth;
    doc.text(brand, brandX, panelY + ribbonH / 2 + 1);
    setFill(accentSoft);
    doc.circle(brandX - 2, panelY + ribbonH / 2 + 0.1, 0.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(accentSoft[0], accentSoft[1], accentSoft[2]);
    const tag = 'Authenticated by';
    const tagWidth = doc.getTextWidth(tag);
    doc.text(tag, brandX - 4 - tagWidth, panelY + ribbonH / 2 + 0.8);

    // ----- Body content -----
    const bodyTop = panelY + ribbonH + accentH;
    const bodyInnerPad = 6;
    const rightColW = 48;
    const leftColW = panelW - rightColW;
    const dividerX = panelX + leftColW;

    // Vertical hairline divider
    setDraw(colors.border);
    doc.setLineWidth(0.2);
    doc.line(dividerX, bodyTop + 4, dividerX, bodyTop + bodyH - 4);

    // Left column: label + code + underline + url
    const lx = panelX + bodyInnerPad;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(colors.muted);
    doc.text('AUTHENTICATION CODE', lx, bodyTop + 7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    setText(colors.navy);
    doc.text(displayCode, lx, bodyTop + 17);
    const codeTextWidth = Math.min(doc.getTextWidth(displayCode), leftColW - bodyInnerPad * 2);

    // Accent underline under code
    setFill(accent);
    doc.rect(lx, bodyTop + 19, codeTextWidth, 0.7, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(colors.text);
    doc.text('Verify at www.seajourney.co.uk/verify', lx, bodyTop + 26);

    // Right column: QR card
    let qrPlaced = false;
    try {
      const qrDataUrl =
        displayCode && displayCode !== 'Not assigned'
          ? await generateVerificationQRDataUrl(displayCode, 'pos', 360)
          : null;
      if (qrDataUrl) {
        const qrSize = 20;
        const qrPad = 2;
        const qrCardW = qrSize + qrPad * 2;
        const qrCardH = qrSize + qrPad * 2;
        const qrCardX = dividerX + (rightColW - qrCardW) / 2;
        const qrCardY = bodyTop + (bodyH - qrCardH) / 2 - 1.5;

        drawRoundedRect(qrCardX, qrCardY, qrCardW, qrCardH, colors.white, colors.navy);
        // accent top stripe on QR card
        setFill(accent);
        doc.rect(qrCardX, qrCardY, qrCardW, 0.6, 'F');

        doc.addImage(qrDataUrl, 'PNG', qrCardX + qrPad, qrCardY + qrPad, qrSize, qrSize);
        qrPlaced = true;

        // "SCAN TO VERIFY" label beneath
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        setText(colors.muted);
        doc.text('SCAN TO VERIFY', dividerX + rightColW / 2, qrCardY + qrCardH + 3, { align: 'center' });
      }
    } catch {
      // Best-effort QR — fall through to fallback below.
    }
    if (!qrPlaced) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setText(colors.muted);
      doc.text('Verify online', dividerX + rightColW / 2, bodyTop + bodyH / 2, { align: 'center' });
    }

    y += panelH;

    drawFooter(pageNumber, totalPages, entry.generatedByName, entry.generatedByEmail);
  };

  const totalPages = 1 + entries.length;

  await drawSummaryPage();
  drawFooter(1, totalPages, undefined, undefined, 'www.seajourney.co.uk/verify');

  for (let i = 0; i < entries.length; i++) {
    doc.addPage();
    await drawEntryPage(entries[i], i + 2, totalPages);
  }

  const first = entries[0];
  const filename =
    entries.length === 1
      ? `Proof of Service ${safe(first.vesselName)} ${first.startDate} to ${first.endDate}.pdf`
      : `Proof of Service ${safe(first.crewName)} ${entries.length} entries.pdf`;

  if (output === 'blob') return doc.output('blob');
  if (output === 'newtab') {
    doc.output('dataurlnewwindow');
    return;
  }
  doc.save(filename);
}

/* ========================================================================== */
/*                    SEA SERVICE BREAKDOWN (REFERENCE PDF)                    */
/* ========================================================================== */

export async function generateSeaServiceBreakdownPDF(
  data: SeaServiceBreakdownPDFInput,
  output: SeaServiceBreakdownPDFOutput = 'download',
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  const colors = {
    navy: [15, 23, 42] as [number, number, number],
    blue: [37, 99, 235] as [number, number, number],
    purple: [126, 34, 206] as [number, number, number],
    text: [28, 28, 30] as [number, number, number],
    muted: [107, 114, 128] as [number, number, number],
    border: [226, 232, 240] as [number, number, number],
    softBg: [248, 250, 252] as [number, number, number],
    lightBlue: [239, 246, 255] as [number, number, number],
    lightPurple: [245, 243, 255] as [number, number, number],
    warnBg: [254, 252, 232] as [number, number, number],
    warnBorder: [250, 204, 21] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };

  const setText = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const safe = (s: string | null | undefined) => (s && String(s).trim()) || '—';

  const drawRoundedRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fillColor?: [number, number, number],
    drawColor?: [number, number, number],
  ) => {
    if (fillColor) setFill(fillColor);
    if (drawColor) setDraw(drawColor);
    doc.setLineWidth(0.25);
    const hasRoundedRect = typeof (doc as unknown as { roundedRect?: unknown }).roundedRect === 'function';
    if (hasRoundedRect) {
      (doc as unknown as {
        roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void;
      }).roundedRect(x, y, w, h, 2.5, 2.5, fillColor ? 'FD' : 'S');
    } else {
      doc.rect(x, y, w, h, fillColor ? 'FD' : 'S');
    }
  };

  const drawSectionLabel = (label: string, x: number, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(colors.muted);
    doc.text(label.toUpperCase(), x, y);
  };

  const drawField = (label: string, value: string, x: number, y: number, width: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(colors.muted);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(colors.text);
    const lines = doc.splitTextToSize(value, width);
    doc.text(lines, x, y + 4.5);
    return y + 4.5 + lines.length * 4.2;
  };

  setFill(colors.navy);
  doc.rect(0, 0, pageWidth, 34, 'F');
  try {
    const { dataURL: logoData, width: imgW, height: imgH } = await loadLogoImageWithDimensions('/logo-seajourney.png');
    const targetH = 8;
    const aspect = imgW / imgH;
    const logoW = aspect * targetH;
    doc.addImage(logoData, 'PNG', margin, (34 - targetH) / 2, logoW, targetH);
  } catch {
    /* optional logo */
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('Sea Service Breakdown', pageWidth - margin, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text('Reference only — not an official form', pageWidth - margin, 20, { align: 'right' });

  let y = 42;

  drawRoundedRect(margin, y, contentWidth, 22, colors.warnBg, colors.warnBorder);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(colors.text);
  const disclaimer =
    'This PDF is a numeric summary from SeaJourney for the period and data source shown below. It is not a testimonial, proof of service, or government form. Use it only to help complete other paperwork manually; verify figures against your own records where required.';
  doc.text(doc.splitTextToSize(disclaimer, contentWidth - 8), margin + 4, y + 7);
  y += 28;

  const gap = 6;
  const halfW = (contentWidth - gap) / 2;
  drawRoundedRect(margin, y, halfW, 40, colors.white, colors.border);
  drawSectionLabel('Vessel', margin + 4, y + 6);
  let ly = y + 12;
  ly = drawField('Name', safe(data.vesselName), margin + 4, ly, halfW - 8);
  ly = drawField('Type', safe(data.vesselType), margin + 4, ly + 2, halfW - 8);
  drawField('IMO / Official No.', safe(data.vesselImo), margin + 4, ly + 2, halfW - 8);

  drawRoundedRect(margin + halfW + gap, y, halfW, 40, colors.white, colors.border);
  drawSectionLabel('Crew & period', margin + halfW + gap + 4, y + 6);
  const periodStr = `${format(parse(data.startDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')} – ${format(
    parse(data.endDate, 'yyyy-MM-dd', new Date()),
    'dd MMM yyyy',
  )}`;
  let ry = y + 12;
  ry = drawField('Crew name', safe(data.crewName), margin + halfW + gap + 4, ry, halfW - 8);
  ry = drawField('Position', safe(data.crewPosition), margin + halfW + gap + 4, ry + 2, halfW - 8);
  drawField('Period', periodStr, margin + halfW + gap + 4, ry + 2, halfW - 8);
  y += 48;

  drawRoundedRect(margin, y, contentWidth, 28, colors.softBg, colors.border);
  drawSectionLabel('Data source & method', margin + 4, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(colors.navy);
  doc.text(safe(data.dataSourceLabel), margin + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(colors.text);
  doc.text(doc.splitTextToSize(data.calculationNote, contentWidth - 8), margin + 4, y + 19);
  y += 34;

  drawSectionLabel('Day counts (use for manual forms)', margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(colors.muted);
  const breakdownNoteLines = doc.splitTextToSize(
    'Logged daily states across the period (missing dates carry forward the last known state). On-leave days are not listed below; they are included only in the total calendar length. Sea service total is underway plus qualifying standby — the same combination as the SeaJourney crew breakdown.',
    contentWidth,
  );
  doc.text(breakdownNoteLines, margin, y);
  y += breakdownNoteLines.length * 3.6 + 2;

  const seaServiceTotal = data.underwayDays + data.standbyDays;
  const breakdownRows: [string, string][] = [
    ['Total calendar days in period', String(data.totalDays)],
    ['Underway', String(data.underwayDays)],
    ['Standby (qualifying days)', String(data.standbyDays)],
    ['Sea service total (underway + standby)', String(seaServiceTotal)],
    ['At anchor', String(data.atAnchorDays)],
    ['In port', String(data.inPortDays)],
    ['In yard', String(data.yardDays)],
  ];

  const daysValueColW = 36;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    head: [['Metric', 'Days']],
    body: breakdownRows,
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: contentWidth - daysValueColW },
      1: { cellWidth: daysValueColW, halign: 'right', fontStyle: 'bold' },
    },
    theme: 'striped',
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  if (data.standbyPeriods && data.standbyPeriods.length > 0) {
    drawSectionLabel('Standby periods (detail)', margin, y);
    y += 4;
    const standbyDaysColW = 36;
    const standbyDatePairW = (contentWidth - standbyDaysColW) / 2;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: [['Passage start', 'Passage end', 'Standby days']],
      body: data.standbyPeriods.map((p) => [
        format(parse(p.passageStartDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy'),
        format(parse(p.passageEndDate, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy'),
        String(p.standbyDays),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: standbyDatePairW },
        1: { cellWidth: standbyDatePairW },
        2: { cellWidth: standbyDaysColW, halign: 'right' },
      },
      theme: 'striped',
    });
  }

  const footerY = pageHeight - 10;
  setDraw(colors.border);
  doc.setLineWidth(0.2);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setText(colors.muted);
  doc.text(
    `Generated ${format(new Date(), 'dd MMM yyyy')} by ${safe(data.generatedByName)}${data.generatedByEmail ? ` (${data.generatedByEmail})` : ''}`,
    margin,
    footerY,
  );
  doc.text('SeaJourney • Reference breakdown', pageWidth - margin, footerY, { align: 'right' });

  const crewSlug = safe(data.crewName).replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 40);
  const filename = `Sea-service-breakdown-${crewSlug}-${data.startDate}-to-${data.endDate}.pdf`;

  if (output === 'blob') return doc.output('blob');
  if (output === 'newtab') {
    doc.output('dataurlnewwindow');
    return;
  }
  doc.save(filename);
}

/* ========================================================================== */
/*                          PASSAGE LOG BOOK EXPORT                           */
/* ========================================================================== */

export async function generatePassageLogPDF(
  data: PassageLogExportData,
  options?: { output?: PassageLogPDFOutput; filename?: string },
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const { passages, userProfile, filterInfo } = data;

  const fullName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;

  const generatedDate = format(new Date(), 'dd MMM yyyy');
  const generatedDateFilename = format(new Date(), 'yyyy-MM-dd');

  const textDark: RGB = [28, 28, 28];
  const textMuted: RGB = [82, 82, 82];
  const borderColor: RGB = [226, 226, 226];
  const headerBg: RGB = [15, 23, 42];
  const sectionBg: RGB = [248, 250, 252];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const setFillColor = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

  const totalPassages = passages.length;
  const totalDistance =
    totalPassages > 0 ? passages.reduce((sum, p) => sum + (p.distance_nm || 0), 0) : 0;

  // ===== HEADER (compact, professional) =====
  const headerHeight = 22;
  setFillColor(headerBg);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  let headerY = 7;

  try {
    const logoData = await loadLogoImage('/seajourney_logo_white.png');
    const logoHeight = 10;
    const logoWidth = (55 / 15) * logoHeight;
    doc.addImage(logoData, 'PNG', 14, 5, logoWidth, logoHeight);
  } catch (error) {
    console.warn('Could not load logo:', error);
  }

  setTextColor([255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Passage Log Extract', 54, headerY + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setTextColor([220, 220, 220]);
  doc.text('Sea service supporting document', 54, headerY + 6);

  doc.setFontSize(8);
  doc.text(`Generated ${generatedDate}`, pageWidth - 14, headerY + 2, { align: 'right' });
  doc.text(`${totalPassages} passage${totalPassages !== 1 ? 's' : ''}`, pageWidth - 14, headerY + 6, { align: 'right' });
  if (totalPassages > 0) {
    doc.text(`${totalDistance.toFixed(0)} NM total`, pageWidth - 14, headerY + 10, { align: 'right' });
  }

  let currentY = headerHeight + 10;

  // ===== REPORT & SEAFARER INFO (card-style) =====
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Report details', 14, currentY);
  currentY += 6;

  const infoRows: string[][] = [
    ['Seafarer', safeText(fullName, 'Not provided')],
    ['Email', safeText(userProfile.email, 'Not provided')],
  ];

  if (filterInfo) {
    if (filterInfo.vesselName) infoRows.push(['Vessel', safeText(filterInfo.vesselName)]);
    if (filterInfo.startDate) infoRows.push(['From', format(filterInfo.startDate, 'dd MMM yyyy')]);
    if (filterInfo.endDate) infoRows.push(['To', format(filterInfo.endDate, 'dd MMM yyyy')]);
  }

  if (totalPassages > 0) {
    const avgDistance = totalDistance / totalPassages;
    infoRows.push(['Passages', totalPassages.toString()]);
    infoRows.push(['Distance (NM)', totalDistance.toFixed(1)]);
    infoRows.push(['Average (NM)', avgDistance.toFixed(1)]);
  }

  const infoTableStartY = currentY;
  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: infoRows,
    styles: {
      fontSize: 9,
      cellPadding: { top: 3, right: 8, bottom: 3, left: 8 },
      textColor: textDark,
      fillColor: sectionBg,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42, textColor: textMuted },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.25,
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ===== PASSAGE RECORDS TABLE =====
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(textDark);
  doc.text('Passage records', 14, currentY);
  currentY += 5;

  if (passages.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    setTextColor(textMuted);
    doc.text('No passages found for the selected filters.', 14, currentY + 4);
    const defaultName = `Passage-Log-Extract - ${fullName.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim() || 'Export'} - ${generatedDateFilename}.pdf`;
    const filename = options?.filename ?? defaultName;
    if (options?.output === 'newtab') {
      doc.output('dataurlnewwindow');
      return;
    }
    doc.save(filename);
    return;
  }

  const tableBody = passages.map((p) => {
    const depDateObj = new Date(p.start_time);
    const arrDateObj = new Date(p.end_time);

    const depDate = format(depDateObj, 'dd MMM yyyy');
    const depTime = format(depDateObj, 'HH:mm');
    const arrDate = format(arrDateObj, 'dd MMM yyyy');
    const arrTime = format(arrDateObj, 'HH:mm');

    const durationHours = differenceInHours(arrDateObj, depDateObj);
    const days = Math.floor(durationHours / 24);
    const hours = durationHours % 24;
    const duration =
      durationHours <= 0 ? '—' : days > 0 ? `${days}d ${hours}h` : `${hours}h`;

    const fromPort = `${safeText(p.departure_port, '—')}${p.departure_country ? `, ${p.departure_country}` : ''}`;
    const toPort = `${safeText(p.arrival_port, '—')}${p.arrival_country ? `, ${p.arrival_country}` : ''}`;

    const vesselCell = safeText(p.vessel_name, 'Unknown vessel');
    const distance = p.distance_nm && p.distance_nm > 0 ? p.distance_nm.toFixed(1) : '—';

    const typeLabel = p.passage_type ? p.passage_type.replace(/_/g, ' ') : '—';

    const weatherInfo = [p.weather_summary || '', p.sea_state || '', p.notes || '']
      .filter((s) => !!s && s.trim().length > 0)
      .join(' | ');

    return [
      truncate(vesselCell, 40, 'Unknown vessel'),
      truncate(fromPort, 55, '—'),
      truncate(toPort, 55, '—'),
      `${depDate}\n${depTime}`,
      `${arrDate}\n${arrTime}`,
      duration,
      distance,
      truncate(typeLabel, 20, '—'),
      truncate(weatherInfo || '—', 180, '—'),
    ];
  });

  const colWidths = {
    vessel: 28,
    from: 38,
    to: 38,
    dep: 26,
    arr: 26,
    duration: 18,
    distance: 18,
    type: 20,
    remarks: 57,
  };

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        'Vessel',
        'From (port / country)',
        'To (port / country)',
        'Departure\n(date / time)',
        'Arrival\n(date / time)',
        'Duration',
        'Distance\n(NM)',
        'Type',
        'Weather / sea state / remarks',
      ],
    ],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: headerBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      halign: 'left',
      valign: 'middle',
    },
    styles: {
      fontSize: 8,
      textColor: textDark,
      cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 },
      halign: 'left',
      valign: 'top',
      lineColor: borderColor,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles: {
      0: { cellWidth: colWidths.vessel },
      1: { cellWidth: colWidths.from },
      2: { cellWidth: colWidths.to },
      3: { cellWidth: colWidths.dep },
      4: { cellWidth: colWidths.arr },
      5: { cellWidth: colWidths.duration, halign: 'center' },
      6: { cellWidth: colWidths.distance, halign: 'right' },
      7: { cellWidth: colWidths.type },
      8: { cellWidth: colWidths.remarks },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
    showHead: 'everyPage',
    didDrawPage: (dataHook) => {
      const footerHeight = 12;
      const footerStartY = pageHeight - footerHeight;

      setFillColor(headerBg);
      doc.rect(0, footerStartY, pageWidth, footerHeight, 'F');

      const footerY = footerStartY + 4;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      setTextColor([200, 200, 210]);
      doc.text('SeaJourney — Passage Log Extract', 14, footerY);
      doc.text(
        'Supporting document for sea service verification. Use with signed testimonials where required.',
        pageWidth / 2,
        footerY,
        { align: 'center' },
      );

      const totalPagesNow = getPageCount(doc);
      doc.text(`Page ${dataHook.pageNumber} of ${totalPagesNow}`, pageWidth - 14, footerY, {
        align: 'right',
      });
    },
  });

  const lastY = (doc as any).lastAutoTable.finalY;
  if (lastY < pageHeight - 22) {
    doc.setFontSize(7);
    setTextColor(textMuted);
    doc.text(
      'This is an electronic extract of your passage records. For formal verification, signed testimonials or other evidence may be required.',
      14,
      lastY + 5,
      { maxWidth: pageWidth - 28 },
    );
  }

  const defaultName = `Passage-Log-Extract - ${fullName.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim() || 'Export'} - ${generatedDateFilename}.pdf`;
  const filename = options?.filename ?? defaultName;

  if (options?.output === 'newtab') {
    doc.output('dataurlnewwindow');
    return;
  }
  doc.save(filename);
}

/* ========================================================================== */
/*                        NAV WATCH APPLICATION PDF                           */
/* ========================================================================== */

export async function generateNavWatchApplicationPDF(
  data: NavWatchApplicationPDFData,
  output: TestimonialPDFOutput = 'download',
) {
  const doc = new jsPDF();
  const { application, userProfile, vessel, captainProfile } = data;

  const fullName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;

  const startDate = format(parseDateOnly(application.start_date), 'dd MMMM yyyy');
  const endDate = format(parseDateOnly(application.end_date), 'dd MMMM yyyy');
  const generatedDate = format(new Date(), 'dd MMMM yyyy');
  const dobRawNav = getDateOfBirthRawFromUserProfile(userProfile as { dateOfBirth?: string | null; date_of_birth?: string | null });
  const dateOfBirth =
    dobRawNav && formatDateDdMmYyyyForPdf(dobRawNav) ? format(parseDateOnly(dobRawNav), 'dd MMMM yyyy') : null;
  const sex = userProfile.sex ? (userProfile.sex === 'male' ? 'Male' : 'Female') : null;

  // Color scheme
  const textDark: RGB = [20, 20, 20];
  const textGray: RGB = [80, 80, 80];
  const primaryBlue: RGB = [0, 29, 55];
  const borderColor: RGB = [180, 180, 180];
  const headerColor: RGB = [0, 29, 55];
  const sectionBg: RGB = [248, 249, 250];

  const setFillColor = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // Helper function to add new page if needed
  const ensureSpace = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Header
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  setTextColor([255, 255, 255]);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Navigation Watch Application', margin, 25);

  yPos = 50;

  // Applicant Information Section
  setTextColor(textDark);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Applicant Information', margin, yPos);
  yPos += 8;

  setDrawColor(borderColor);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);

  const applicantInfo = [
    ['Full Name:', fullName],
    ['Date of Birth:', dateOfBirth || '—'],
    ['Sex:', sex || '—'],
    ['Position:', userProfile.position || '—'],
    ['Discharge Book Number:', userProfile.dischargeBookNumber || '—'],
    ['Email:', userProfile.email || '—'],
  ];

  applicantInfo.forEach(([label, value]) => {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(safeText(value), margin + 60, yPos);
    yPos += 6;
  });

  yPos += 4;

  // Vessel Information Section
  ensureSpace(30);
  setTextColor(textDark);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Vessel Information', margin, yPos);
  yPos += 8;

  setDrawColor(borderColor);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const vesselInfo = [
    ['Vessel Name:', vessel.name],
    ['Vessel Type:', formatVesselTypeForDisplay(vessel.type)],
    ['Official Number:', vessel.officialNumber || '—'],
    ['Flag State:', vessel.flag || vessel.flag_state || '—'],
    ['Gross Tonnage:', vessel.gross_tonnage ? `${vessel.gross_tonnage} GT` : '—'],
    ['Call Sign:', vessel.call_sign || '—'],
  ];

  vesselInfo.forEach(([label, value]) => {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(safeText(value), margin + 60, yPos);
    yPos += 6;
  });

  yPos += 4;

  // Watchkeeping Period Section
  ensureSpace(30);
  setTextColor(textDark);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Watchkeeping Period', margin, yPos);
  yPos += 8;

  setDrawColor(borderColor);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const start = parseDateOnly(application.start_date);
  const end = parseDateOnly(application.end_date);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const periodInfo = [
    ['Start Date:', startDate],
    ['End Date:', endDate],
    ['Total Days:', `${totalDays} days`],
    ['Watchkeeping Hours:', application.watchkeeping_hours ? `${application.watchkeeping_hours} hours` : '—'],
  ];

  periodInfo.forEach(([label, value]) => {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(safeText(value), margin + 60, yPos);
    yPos += 6;
  });

  yPos += 4;

  // Navigation Duties Section
  if (application.navigation_duties) {
    ensureSpace(40);
    setTextColor(textDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Navigation Duties Performed', margin, yPos);
    yPos += 8;

    setDrawColor(borderColor);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    setTextColor(textDark);

    const dutiesLines = doc.splitTextToSize(safeText(application.navigation_duties), contentWidth - 20);
    dutiesLines.forEach((line: string) => {
      ensureSpace(8);
      doc.text(line, margin + 10, yPos);
      yPos += 6;
    });

    yPos += 4;
  }

  // Additional Notes Section
  if (application.additional_notes) {
    ensureSpace(40);
    setTextColor(textDark);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Additional Notes', margin, yPos);
    yPos += 8;

    setDrawColor(borderColor);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    setTextColor(textDark);

    const notesLines = doc.splitTextToSize(safeText(application.additional_notes), contentWidth - 20);
    notesLines.forEach((line: string) => {
      ensureSpace(8);
      doc.text(line, margin + 10, yPos);
      yPos += 6;
    });

    yPos += 4;
  }

  // Captain Signature Section
  ensureSpace(50);
  yPos = pageHeight - 80;

  setDrawColor(borderColor);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('Captain Certification', margin, yPos);
  yPos += 8;

  doc.setFont('helvetica', 'normal');
  doc.text('I certify that the above information is accurate and that the applicant has performed', margin, yPos);
  yPos += 6;
  doc.text('navigation watchkeeping duties as stated during the period indicated.', margin, yPos);
  yPos += 12;

  // Captain signature line
  doc.setFont('helvetica', 'normal');
  doc.text('Captain Name:', margin, yPos);
  doc.text(safeText(application.captain_name || (captainProfile ? `${captainProfile?.firstName || ''} ${captainProfile?.lastName || ''}`.trim() : '—')), margin + 50, yPos);
  yPos += 8;

  doc.text('Date:', margin, yPos);
  doc.text(generatedDate, margin + 50, yPos);
  yPos += 12;

  // Captain signature image if available
  if (captainProfile?.signature) {
    try {
      const signatureImg = new Image();
      signatureImg.src = captainProfile.signature;
      await new Promise((resolve) => {
        signatureImg.onload = resolve;
        signatureImg.onerror = resolve; // Continue even if image fails
      });

      if (signatureImg.complete && signatureImg.naturalWidth > 0) {
        const sigWidth = 60;
        const sigHeight = (signatureImg.naturalHeight / signatureImg.naturalWidth) * sigWidth;
        doc.addImage(
          captainProfile.signature,
          'PNG',
          margin,
          yPos,
          sigWidth,
          Math.min(sigHeight, 30)
        );
        yPos += Math.min(sigHeight, 30) + 6;
      }
    } catch (error) {
      console.error('Error adding signature image:', error);
    }
  } else {
    // Signature line
    setDrawColor(borderColor);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, margin + 80, yPos);
    yPos += 8;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    setTextColor(textGray);
    doc.text('Signature', margin, yPos);
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setTextColor(textGray);
    const y = pageHeight - 8;
    doc.text(`Document ID: ${application.id}`, margin, y, { align: 'left' });
    doc.text('www.seajourney.co.uk', pageWidth / 2, y, { align: 'center' });
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, y, { align: 'right' });
  }

  // Filename
  const formatDateForFilename = (dateStr: string): string => {
    const date = parseDateOnly(dateStr);
    const day = date.getDate();
    const month = format(date, 'MMM');
    const getOrdinal = (n: number): string => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    return `${getOrdinal(day)} ${month}`;
  };

  const cleanName = (name: string): string =>
    String(name || '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const startDateFilename = formatDateForFilename(application.start_date);
  const endDateFilename = formatDateForFilename(application.end_date);
  const crewName = cleanName(fullName);
  const vesselName = cleanName(vessel.name || 'UnknownVessel');
  const filename = `${startDateFilename} - ${endDateFilename} ${crewName} ${vesselName} Nav Watch Application.pdf`;

  // Output modes
  if (output === 'blob') {
    return doc.output('blob');
  }
  if (output === 'newtab') {
    doc.output('dataurlnewwindow');
    return;
  }

  doc.save(filename);
}

/* ========================================================================== */
/*                    MCA WATCH RATING CERTIFICATE FORM                      */
/*                    (MSF 4371 REV 08/25)                                   */
/*                    Fills the official MCA PDF form                        */
/* ========================================================================== */


export interface MCAWatchRatingApplicationData {
  personalDetails: {
    title?: string;
    surname: string;
    forenames: string;
    dateOfBirth: string; // DD/MM/YYYY
    placeOfBirth?: string;
    countryOfBirth?: string;
    nationality?: string;
    address: {
      line1: string;
      line2?: string;
      district?: string;
      townCity: string;
      countyState?: string;
      postCode: string;
      country: string;
    };
    telephone?: string;
    mobile?: string;
    email: string;

    // Optional: applicant signature as dataURL (PNG/JPEG)
    signatureDataUrl?: string | null;

    // Optional: countersigner details (usually not required for most cases)
    counterSign?: {
      name?: string;
      addressLine1?: string;
      addressLine2?: string;
      townCity?: string;
      countyState?: string;
      postCode?: string;
      country?: string;
      telephone?: string;
      occupation?: string;
      capacityKnownApplicant?: string;
      signatureDataUrl?: string | null;
      date?: string; // DD/MM/YYYY
    } | null;

    // Optional: checklist ticks for page 3 (Nav/Engine checklist)
    checklistNavEngine?: {
      attestedPassport?: boolean;
      payment?: boolean;
      dischargeBookOrCd?: boolean;
      seaServiceTestimonials?: boolean;
      passportPhoto?: boolean;
      stcwBasicTraining?: boolean;
      securityAwareness?: boolean; // STCW A-VI/6
      profInSurvivalCraft?: boolean; // STCW A-VI/2-1
      medical?: boolean;
      watchRatingTrainingRecordBook?: boolean;
      mntb?: boolean; // if relevant
    } | null;

    // Optional: checklist ticks for page 4 (ETR checklist)
    checklistETR?: {
      attestedPassport?: boolean;
      payment?: boolean;
      dischargeBookOrCd?: boolean;
      seaServiceTestimonials?: boolean;
      passportPhoto?: boolean;
      stcwBasicTraining?: boolean;
      securityAwareness?: boolean; // STCW A-VI/6
      electroTechnicalTraining?: boolean;
      medical?: boolean;
      electroTechnicalRecordBook?: boolean;
    } | null;
  };

  certificateType: MCACertificateType; // you said navigational
  seaServiceRecords: Array<{
    vesselName: string;
    flag: string;
    imoNumber?: string;
    grossTonnage?: number;
    kilowatts?: number;
    length?: number; // metres
    capacity?: string;
    fromDate: string; // DD/MM/YYYY
    toDate: string; // DD/MM/YYYY
    totalDays: number;
    daysAtSea: number;
  }>;
  paymentRegion?: 'uk' | 'eu' | 'row'; // Section 8: Payment region selection
}

/**
 * Generates an MCA MSF 4371 Rev 08/25 application PDF by using the official MCA PDF as template,
 * then writing into pages 1–6 with pdf-lib (overlay).
 *
 * ✅ No Unicode ticks (✓) -> uses vector ticks to avoid WinAnsi errors
 * ✅ Page 1: personal + certificate tick
 * ✅ Page 2: sea service table
 * ✅ Page 3: optional checklist ticks (Nav/Engine)
 * ✅ Page 5: declaration date + print name (+ optional signature)
 * ✅ Page 6: payment tick based on address country
 */


export async function generateMCAWatchRatingForm_NAV_WRC(
  data: MCAWatchRatingApplicationData,
  output: TestimonialPDFOutput = 'download',
  opts?: { debug?: boolean } // ✅ set true to draw crosshairs + labels
) {
  const { personalDetails, certificateType, seaServiceRecords } = data;

  const API_BASE_URL =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

  // MUST return the real MSF 4371 PDF bytes (8 pages in original doc, but you’re using 6 relevant pages)
  const MCA_FORM_API_URL = `${API_BASE_URL}/api/mca-form/fetch`;

  const res = await fetch(MCA_FORM_API_URL);
  if (!res.ok) throw new Error(`Failed to fetch MCA form: ${res.status} ${res.statusText}`);

  const templateBytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(templateBytes);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  if (pages.length < 6) throw new Error(`Template PDF has ${pages.length} pages; expected at least 6.`);

  const black = rgb(0, 0, 0);
  const red = rgb(1, 0, 0);

  const safe = (v?: string | null, fallback = '') => (v ?? '').trim() || fallback;

  // ----------------------------
  // ✅ BASE SIZES (points)
  // ----------------------------
  // A4 portrait (page 1,3,4,5,6)
  const A4_PORTRAIT = { w: 595.28, h: 841.89 };
  // A4 landscape (your page 2 in the template)
  const A4_LANDSCAPE = { w: 841.89, h: 595.28 };

  // ----------------------------
  // ✅ COORDS IN *BASE* POINTS FROM TOP
  // (These MUST be based on A4 points-from-top, NOT screenshot pixels)
  // ----------------------------
  const COORDS_BASE = {
    p1: {
      // Title (Mr/Mrs/Miss) - adjusted significantly
      title: { x: 200, top: 265 },
      // Surname - usually directly below title
      surname: { x: 200, top: 280 },
      // Forenames - below surname
      forenames: { x: 200, top: 300 },
      // Date of Birth - below forenames
      dob: { x: 200, top: 320 },
      // Place and Country of Birth - combined field
      placeCountryBirth: { x: 200, top: 335, maxW: 400 },
      // Nationality - below place of birth
      nationality: { x: 200, top: 355 },

      // Address fields - typically start lower on the form
      addrLine1: { x: 150, top: 395, maxW: 380 },
      addrLine2: { x: 150, top: 415, maxW: 380 },
      district: { x: 150, top: 435, maxW: 180 },
      townCity: { x: 150, top: 455, maxW: 180 },
      countyState: { x: 150, top: 475, maxW: 180 },
      postCode: { x: 150, top: 495, maxW: 180 },
      country: { x: 150, top: 512, maxW: 180 },

      // Contact details - below address
      telephone: { x: 150, top: 535, maxW: 200 },
      mobile: { x: 400, top: 535, maxW: 200 },
      email: { x: 150, top: 555, maxW: 380 },

      // Certificate type checkboxes - typically on the right side of page 1
      certNav: { x: 380, top: 635 },
      certEngine: { x: 380, top: 665 },
      certEtr: { x: 380, top: 692 },
    },

    p2: {
      // Sea service table - landscape page, table typically starts lower
      tableTop: 215,
      rowH: 17, // Row spacing (used as default if rowPositions not specified)
      maxRows: 17,
      fontSize: 7.5,
      // Optional: Individual row positions (from top) - if specified, overrides tableTop + i * rowH
      // Uncomment and adjust these if rows don't align properly with the PDF template
      rowPositions: [215, 230, 245, 260, 273, 288, 303, 318, 332, 346, 360, 375, 388, 402, 417, 432, 447],
      cols: (pageW: number) => ({
        vessel: pageW * 0.04,      // Vessel name column
        flag: pageW * 0.18,        // Flag state
        imo: pageW * 0.26,         // IMO number
        gt: pageW * 0.36,          // Gross tonnage
        kw: pageW * 0.43,          // Kilowatts
        len: pageW * 0.5,         // Length
        cap: pageW * 0.56,         // Capacity
        from: pageW * 0.67,        // From date
        to: pageW * 0.74,          // To date
        days: pageW * 0.813,       // Total days
        seaDays: pageW * 0.89,     // Days at sea
      }),
    },

    p3: {
      // Checklist ticks - typically on the right side
      tickX: 533,
      rowsTop: {
        attestedPassport: 160,
        payment: 173,
        dischargeBookOrCd: 195,
        seaServiceTestimonials: 220,
        passportPhoto: 243,
        stcwBasicTraining: 270,
        securityAwareness: 295,
        profInSurvivalCraft: 325,
        medical: 347,
        watchRatingTrainingRecordBook: 395,
      },
    },

    p4: {
      // ETR Checklist ticks - similar layout to page 3
      tickX: 533,
      rowsTop: {
        attestedPassport: 160,
        payment: 173,
        dischargeBookOrCd: 194,
        seaServiceTestimonials: 220,
        passportPhoto: 240,
        stcwBasicTraining: 260,
        securityAwareness: 280,
        electroTechnicalTraining: 300,
        medical: 320,
        electroTechnicalRecordBook: 340,
      },
    },

    p5: {
      // Declaration section - signature box typically in upper portion
      signatureBox: { x: 110, top: 150, w: 190, h: 70 },
      date: { x: 90, top: 250 },
      printName: { x: 120, top: 285 },

      // Countersign section - typically lower on the page
      csName: { x: 125, top: 465, maxW: 420 },
      csAddr1: { x: 125, top: 480, maxW: 420 },
      csAddr2: { x: 125, top: 497, maxW: 420 },
      csTown: { x: 125, top: 515, maxW: 200 },
      csCounty: { x: 125, top: 532, maxW: 200 },
      csPost: { x: 125, top: 550, maxW: 200 },
      csCountry: { x: 370, top: 550, maxW: 200 },
      csTel: { x: 125, top: 568, maxW: 200 },
      csOcc: { x: 375, top: 568, maxW: 200 },
      csCapacity: { x: 250, top: 587, maxW: 330 },

      csSigLine: { x: 110, top: 680 },
      csDateLine: { x: 340, top: 680 },
    },

    p6: {

      // Payment section - checkboxes for UK/EU/ROW
      tickUK: { x: 263, top: 283 },
      tickEU: { x: 359, top: 328 },
      tickROW: { x: 330, top: 375 },
    },
  };

  // ----------------------------
  // ✅ Scaling helpers
  // ----------------------------
  const getScale = (page: any, base: { w: number; h: number }) => {
    const { width, height } = page.getSize();
    return { sx: width / base.w, sy: height / base.h, width, height };
  };

  // convert base-x to page-x
  const X = (page: any, base: { w: number; h: number }, x: number) => {
    const { sx } = getScale(page, base);
    return x * sx;
  };

  // convert base-top(from top) to page-y (pdf bottom-left)
  const Y = (page: any, base: { w: number; h: number }, topFromTop: number) => {
    const { sy, height } = getScale(page, base);
    return height - topFromTop * sy;
  };

  const W = (page: any, base: { w: number; h: number }, w: number) => {
    const { sx } = getScale(page, base);
    return w * sx;
  };

  const wrapText = (text: string, f: any, size: number, maxWidth: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const width = f.widthOfTextAtSize(test, size);
      if (width <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  };

  const drawText = (
    page: any,
    base: { w: number; h: number },
    text: string,
    x: number,
    top: number,
    opts?: { size?: number; maxW?: number; bold?: boolean }
  ) => {
    const t = (text ?? '').toString().trim();
    if (!t) return;

    const size = opts?.size ?? 9;
    const useFont = opts?.bold ? fontBold : font;

    const px = X(page, base, x);
    const py = Y(page, base, top);

    if (opts?.maxW && opts.maxW > 10) {
      const maxW = W(page, base, opts.maxW);
      const lines = wrapText(t, useFont, size, maxW);
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: px,
          y: py - i * (size + 2),
          size,
          font: useFont,
          color: black,
        });
      });
      return;
    }

    page.drawText(t, { x: px, y: py, size, font: useFont, color: black });
  };

  // ✅ Vector tick (no unicode ✓)
  const drawTick = (page: any, base: { w: number; h: number }, x: number, top: number, size = 10) => {
    const px = X(page, base, x);
    const py = Y(page, base, top);

    page.drawLine({
      start: { x: px + 0.5, y: py - 1.5 },
      end: { x: px + 3.5, y: py - 4.0 },
      thickness: 1.2,
      color: black,
    });
    page.drawLine({
      start: { x: px + 3.2, y: py - 4.0 },
      end: { x: px + size, y: py + 2.0 },
      thickness: 1.2,
      color: black,
    });
  };

  const debugMark = (page: any, base: { w: number; h: number }, label: string, x: number, top: number) => {
    if (!opts?.debug) return;
    const px = X(page, base, x);
    const py = Y(page, base, top);

    page.drawLine({ start: { x: px - 6, y: py }, end: { x: px + 6, y: py }, thickness: 0.8, color: red });
    page.drawLine({ start: { x: px, y: py - 6 }, end: { x: px, y: py + 6 }, thickness: 0.8, color: red });
    page.drawText(label, { x: px + 8, y: py + 2, size: 6, font, color: red });
  };

  const detectImageFormat = (dataUrl: string): 'png' | 'jpg' => {
    const lower = dataUrl.toLowerCase();
    if (lower.includes('image/jpeg') || lower.includes('image/jpg')) return 'jpg';
    return 'png';
  };

  const drawSignatureDataUrl = async (
    page: any,
    base: { w: number; h: number },
    dataUrl: string,
    x: number,
    top: number,
    boxW: number,
    boxH: number
  ) => {
    try {
      const fmt = detectImageFormat(dataUrl);
      const imgBytes = await fetch(dataUrl).then(r => r.arrayBuffer());
      const img = fmt === 'jpg' ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);

      const px = X(page, base, x);
      const pyTop = Y(page, base, top);

      const bw = W(page, base, boxW);
      const bh = W(page, base, boxH); // close enough; if you want perfect, use sy for height

      const scale = Math.min(bw / img.width, bh / img.height);
      const w = img.width * scale;
      const h = img.height * scale;

      page.drawImage(img, {
        x: px,
        y: pyTop - bh + (bh - h) / 2,
        width: w,
        height: h,
      });
    } catch (e) {
      console.warn('Could not draw signature image:', e);
    }
  };

  // ----------------------------
  // PAGE 1 (A4 portrait)
  // ----------------------------
  const page1 = pages[0];
  const baseP = A4_PORTRAIT;

  const fullName = `${safe(personalDetails.forenames)} ${safe(personalDetails.surname)}`.trim();
  const pob = [safe(personalDetails.placeOfBirth), safe(personalDetails.countryOfBirth)].filter(Boolean).join(', ');

  // Debug marks (help you tune coords quickly)
  // Enable debug mode by passing opts: { debug: true } to see red crosshairs at each field position
  if (opts?.debug) {
    Object.entries(COORDS_BASE.p1).forEach(([k, v]: any) => {
      if (v?.x != null && v?.top != null) debugMark(page1, baseP, `p1.${k}`, v.x, v.top);
    });
  }

  drawText(page1, baseP, safe(personalDetails.title), COORDS_BASE.p1.title.x, COORDS_BASE.p1.title.top);
  drawText(page1, baseP, safe(personalDetails.surname), COORDS_BASE.p1.surname.x, COORDS_BASE.p1.surname.top);
  drawText(page1, baseP, safe(personalDetails.forenames), COORDS_BASE.p1.forenames.x, COORDS_BASE.p1.forenames.top);
  drawText(page1, baseP, safe(personalDetails.dateOfBirth), COORDS_BASE.p1.dob.x, COORDS_BASE.p1.dob.top);
  drawText(page1, baseP, pob, COORDS_BASE.p1.placeCountryBirth.x, COORDS_BASE.p1.placeCountryBirth.top, {
    maxW: COORDS_BASE.p1.placeCountryBirth.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.nationality), COORDS_BASE.p1.nationality.x, COORDS_BASE.p1.nationality.top);

  drawText(page1, baseP, safe(personalDetails.address.line1), COORDS_BASE.p1.addrLine1.x, COORDS_BASE.p1.addrLine1.top, {
    maxW: COORDS_BASE.p1.addrLine1.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.address.line2), COORDS_BASE.p1.addrLine2.x, COORDS_BASE.p1.addrLine2.top, {
    maxW: COORDS_BASE.p1.addrLine2.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.address.district), COORDS_BASE.p1.district.x, COORDS_BASE.p1.district.top, {
    maxW: COORDS_BASE.p1.district.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.address.townCity), COORDS_BASE.p1.townCity.x, COORDS_BASE.p1.townCity.top, {
    maxW: COORDS_BASE.p1.townCity.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.address.countyState), COORDS_BASE.p1.countyState.x, COORDS_BASE.p1.countyState.top, {
    maxW: COORDS_BASE.p1.countyState.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.address.postCode), COORDS_BASE.p1.postCode.x, COORDS_BASE.p1.postCode.top, {
    maxW: COORDS_BASE.p1.postCode.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.address.country), COORDS_BASE.p1.country.x, COORDS_BASE.p1.country.top, {
    maxW: COORDS_BASE.p1.country.maxW,
  });

  drawText(page1, baseP, safe(personalDetails.telephone), COORDS_BASE.p1.telephone.x, COORDS_BASE.p1.telephone.top, {
    maxW: COORDS_BASE.p1.telephone.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.mobile), COORDS_BASE.p1.mobile.x, COORDS_BASE.p1.mobile.top, {
    maxW: COORDS_BASE.p1.mobile.maxW,
  });
  drawText(page1, baseP, safe(personalDetails.email), COORDS_BASE.p1.email.x, COORDS_BASE.p1.email.top, {
    maxW: COORDS_BASE.p1.email.maxW,
  });

  if (certificateType === 'navigational') drawTick(page1, baseP, COORDS_BASE.p1.certNav.x, COORDS_BASE.p1.certNav.top, 10);
  if (certificateType === 'engine_room') drawTick(page1, baseP, COORDS_BASE.p1.certEngine.x, COORDS_BASE.p1.certEngine.top, 10);
  if (certificateType === 'electro_technical') drawTick(page1, baseP, COORDS_BASE.p1.certEtr.x, COORDS_BASE.p1.certEtr.top, 10);

  // ----------------------------
  // PAGE 2 (A4 landscape)
  // ----------------------------
  const page2 = pages[1];
  const baseL = A4_LANDSCAPE;
  const { width: p2w } = page2.getSize();

  const col = COORDS_BASE.p2.cols(p2w);
  const rowCount = Math.min(seaServiceRecords.length, COORDS_BASE.p2.maxRows);

  // Get row positions - use individual positions if specified, otherwise calculate from tableTop + rowH
  const getRowTop = (index: number): number => {
    const rowPositions = (COORDS_BASE.p2 as any).rowPositions;
    if (rowPositions && Array.isArray(rowPositions) && rowPositions[index] != null) {
      return rowPositions[index];
    }
    return COORDS_BASE.p2.tableTop + index * COORDS_BASE.p2.rowH;
  };

  // Format days as "X months and Y days" according to MCA requirements
  // Calendar months and days, with odd days reckoned at 30 days to the month
  // Example: from 3 January to 5 March = 2 months and 2 days
  const formatLengthOfVoyage = (fromDateStr: string, toDateStr: string): string => {
    try {
      // Parse dates (format: DD/MM/YYYY)
      const parseDate = (dateStr: string): Date => {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day);
      };

      const fromDate = parseDate(fromDateStr);
      const toDate = parseDate(toDateStr);

      // Calculate calendar months and days
      let months = 0;
      let days = 0;

      // Start from the fromDate and add calendar months until we exceed toDate
      let currentDate = new Date(fromDate);
      
      // Add full calendar months (e.g., Jan 3 -> Feb 3 -> Mar 3)
      while (true) {
        const nextMonth = new Date(currentDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        
        if (nextMonth <= toDate) {
          months++;
          currentDate = nextMonth;
        } else {
          break;
        }
      }

      // Calculate remaining days from currentDate to toDate
      days = Math.max(0, Math.floor((toDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Convert odd days >= 30 to months (as per MCA requirement: "Odd days should be added together and reckoned at 30 days to the month")
      if (days >= 30) {
        const additionalMonths = Math.floor(days / 30);
        months += additionalMonths;
        days = days % 30;
      }

      // Format the result
      if (months === 0 && days === 0) {
        return '0 days';
      } else if (months === 0) {
        return `${days} ${days === 1 ? 'day' : 'days'}`;
      } else if (days === 0) {
        return `${months} ${months === 1 ? 'month' : 'months'}`;
      } else {
        return `${months} ${months === 1 ? 'month' : 'months'} and ${days} ${days === 1 ? 'day' : 'days'}`;
      }
    } catch (error) {
      // Fallback to empty string if date parsing fails
      console.warn('Error formatting length of voyage:', error);
      return '';
    }
  };

  // Calculate totals across all records
  const calculateTotals = () => {
    let totalMonths = 0;
    let totalDays = 0;
    let totalDaysAtSea = 0;

    for (const r of seaServiceRecords.slice(0, rowCount)) {
      try {
        // Parse dates to calculate months and days
        const parseDate = (dateStr: string): Date => {
          const [day, month, year] = dateStr.split('/').map(Number);
          return new Date(year, month - 1, day);
        };

        const fromDate = parseDate(r.fromDate);
        const toDate = parseDate(r.toDate);

        // Calculate calendar months and days for this record
        let months = 0;
        let days = 0;
        let currentDate = new Date(fromDate);

        // Add full calendar months
        while (true) {
          const nextMonth = new Date(currentDate);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          if (nextMonth <= toDate) {
            months++;
            currentDate = nextMonth;
          } else {
            break;
          }
        }

        // Calculate remaining days
        days = Math.max(0, Math.floor((toDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)));

        // Add to totals
        totalMonths += months;
        totalDays += days;
        totalDaysAtSea += r.daysAtSea ?? 0;
      } catch (error) {
        console.warn('Error calculating totals for record:', error);
      }
    }

    // Convert odd days >= 30 to months
    if (totalDays >= 30) {
      const additionalMonths = Math.floor(totalDays / 30);
      totalMonths += additionalMonths;
      totalDays = totalDays % 30;
    }

    return { totalMonths, totalDays, totalDaysAtSea };
  };

  // Draw data rows
  for (let i = 0; i < rowCount; i++) {
    const r = seaServiceRecords[i];
    const top = getRowTop(i);
    const fs = COORDS_BASE.p2.fontSize;

    drawText(page2, baseL, safe(r.vesselName), col.vessel, top, { size: fs, maxW: (col.flag - col.vessel) - 6 });
    drawText(page2, baseL, safe(r.flag), col.flag, top, { size: fs, maxW: (col.imo - col.flag) - 4 });
    drawText(page2, baseL, safe(r.imoNumber), col.imo, top, { size: fs, maxW: (col.gt - col.imo) - 4 });
    drawText(page2, baseL, r.grossTonnage != null ? String(r.grossTonnage) : '', col.gt, top, { size: fs });
    drawText(page2, baseL, r.kilowatts != null ? String(r.kilowatts) : '', col.kw, top, { size: fs });
    drawText(page2, baseL, r.length != null ? String(r.length) : '', col.len, top, { size: fs });
    drawText(page2, baseL, safe(r.capacity), col.cap, top, { size: fs, maxW: (col.from - col.cap) - 6 });
    drawText(page2, baseL, safe(r.fromDate), col.from, top, { size: fs });
    drawText(page2, baseL, safe(r.toDate), col.to, top, { size: fs });
    // Format as "X months and Y days" according to MCA requirements - use smaller font to fit
    const lengthOfVoyage = formatLengthOfVoyage(r.fromDate, r.toDate);
    drawText(page2, baseL, lengthOfVoyage, col.days, top, { size: fs * 0.7, maxW: (col.seaDays - col.days) - 4 });
    drawText(page2, baseL, String(r.daysAtSea ?? ''), col.seaDays, top, { size: fs });
  }

  // Draw total row at the bottom
  const { totalMonths, totalDays, totalDaysAtSea } = calculateTotals();
  // Move down by one row: rowCount is the number of data rows (indices 0 to rowCount-1)
  // getRowTop(rowCount) gives the position for the next row after the last data row
  // To move it down further, you can:
  // - Use getRowTop(rowCount + 1) for the next row position
  // - Or add COORDS_BASE.p2.rowH to move down by one row height
  // - Or manually specify a position value
  const totalRowTop = getRowTop(rowCount) + COORDS_BASE.p2.rowH; // Move down by one row height
  const fs = COORDS_BASE.p2.fontSize;
  
  // Format total length of voyage
  let totalLengthOfVoyage = '';
  if (totalMonths === 0 && totalDays === 0) {
    totalLengthOfVoyage = '0 days';
  } else if (totalMonths === 0) {
    totalLengthOfVoyage = `${totalDays} ${totalDays === 1 ? 'day' : 'days'}`;
  } else if (totalDays === 0) {
    totalLengthOfVoyage = `${totalMonths} ${totalMonths === 1 ? 'month' : 'months'}`;
  } else {
    totalLengthOfVoyage = `${totalMonths} ${totalMonths === 1 ? 'month' : 'months'} and ${totalDays} ${totalDays === 1 ? 'day' : 'days'}`;
  }

  // Draw "TOTAL" label (bold) and totals
  drawText(page2, baseL, totalLengthOfVoyage, col.days, totalRowTop, { size: fs * 0.7, bold: true, maxW: (col.seaDays - col.days) - 4 });
  drawText(page2, baseL, String(totalDaysAtSea), col.seaDays, totalRowTop, { size: fs, bold: true });

  // Debug marks for page 2 (sea service table) - after content
  if (opts?.debug) {
    // Debug marks for column headers
    Object.entries(col).forEach(([k, v]: any) => {
      if (typeof v === 'number') {
        debugMark(page2, baseL, `p2.col.${k}`, v, COORDS_BASE.p2.tableTop);
      }
    });
    // Debug marks for all rows (up to maxRows)
    for (let i = 0; i < COORDS_BASE.p2.maxRows; i++) {
      const top = getRowTop(i);
      // Mark all columns for each row to help with positioning
      Object.entries(col).forEach(([k, v]: any) => {
        if (typeof v === 'number') {
          debugMark(page2, baseL, `p2.row${i}.${k}`, v, top);
        }
      });
    }
  }

  // ----------------------------
  // PAGE 3 (A4 portrait) checklist - Only for Navigational and Engine Room
  // ----------------------------
  // Only show Page 3 checklist for navigational and engine_room certificates
  if (certificateType === 'navigational' || certificateType === 'engine_room') {
  const page3 = pages[2];
  const cl = personalDetails.checklistNavEngine || null;

  if (cl) {
      const x = COORDS_BASE.p3.tickX;
      if (cl.attestedPassport) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.attestedPassport, 9);
      if (cl.payment) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.payment, 9);
      if (cl.dischargeBookOrCd) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.dischargeBookOrCd, 9);
      if (cl.seaServiceTestimonials) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.seaServiceTestimonials, 9);
      if (cl.passportPhoto) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.passportPhoto, 9);
      if (cl.stcwBasicTraining) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.stcwBasicTraining, 9);
      if (cl.securityAwareness) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.securityAwareness, 9);
      if (cl.profInSurvivalCraft) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.profInSurvivalCraft, 9);
      if (cl.medical) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.medical, 9);
      if (cl.watchRatingTrainingRecordBook) drawTick(page3, baseP, x, COORDS_BASE.p3.rowsTop.watchRatingTrainingRecordBook, 9);
    }

  // Debug marks for page 3 (checklist) - after content
  if (opts?.debug) {
    const tickX = COORDS_BASE.p3.tickX;
    Object.entries(COORDS_BASE.p3.rowsTop).forEach(([k, top]: any) => {
      if (typeof top === 'number') {
        debugMark(page3, baseP, `p3.${k}`, tickX, top);
      }
    });
  }
  }

  // ----------------------------
  // PAGE 4 (A4 portrait) ETR checklist - Only for Electro-technical
  // ----------------------------
  // Only show Page 4 checklist for electro_technical certificates
  if (certificateType === 'electro_technical') {
    const page4 = pages[3];
    const etrCl = personalDetails.checklistETR || null;

    if (etrCl) {
      const x = COORDS_BASE.p4.tickX;
      if (etrCl.attestedPassport) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.attestedPassport, 9);
      if (etrCl.payment) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.payment, 9);
      if (etrCl.dischargeBookOrCd) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.dischargeBookOrCd, 9);
      if (etrCl.seaServiceTestimonials) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.seaServiceTestimonials, 9);
      if (etrCl.passportPhoto) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.passportPhoto, 9);
      if (etrCl.stcwBasicTraining) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.stcwBasicTraining, 9);
      if (etrCl.securityAwareness) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.securityAwareness, 9);
      if (etrCl.electroTechnicalTraining) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.electroTechnicalTraining, 9);
      if (etrCl.medical) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.medical, 9);
      if (etrCl.electroTechnicalRecordBook) drawTick(page4, baseP, x, COORDS_BASE.p4.rowsTop.electroTechnicalRecordBook, 9);
    }

    // Debug marks for page 4 (ETR checklist) - after content
    if (opts?.debug) {
      const tickX = COORDS_BASE.p4.tickX;
      Object.entries(COORDS_BASE.p4.rowsTop).forEach(([k, top]: any) => {
        if (typeof top === 'number') {
          debugMark(page4, baseP, `p4.${k}`, tickX, top);
        }
      });
    }
  }

  // ----------------------------
  // PAGE 5 (A4 portrait) declaration + optional countersign
  // ----------------------------
  const page5 = pages[4];

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = String(today.getFullYear());
  const todayStr = `${dd}/${mm}/${yyyy}`;

  drawText(page5, baseP, todayStr, COORDS_BASE.p5.date.x, COORDS_BASE.p5.date.top, { size: 9, bold: true });
  drawText(page5, baseP, fullName, COORDS_BASE.p5.printName.x, COORDS_BASE.p5.printName.top, { size: 9 });

  if (personalDetails.signatureDataUrl) {
    await drawSignatureDataUrl(
      page5,
      baseP,
      personalDetails.signatureDataUrl,
      COORDS_BASE.p5.signatureBox.x,
      COORDS_BASE.p5.signatureBox.top,
      COORDS_BASE.p5.signatureBox.w,
      COORDS_BASE.p5.signatureBox.h
    );
  }

  // Countersign section - Available for all certificate types when provided
  const cs = personalDetails.counterSign || null;
  if (cs) {
    drawText(page5, baseP, safe(cs.name), COORDS_BASE.p5.csName.x, COORDS_BASE.p5.csName.top, { size: 8.5, maxW: COORDS_BASE.p5.csName.maxW });
    drawText(page5, baseP, safe(cs.addressLine1), COORDS_BASE.p5.csAddr1.x, COORDS_BASE.p5.csAddr1.top, { size: 8.5, maxW: COORDS_BASE.p5.csAddr1.maxW });
    drawText(page5, baseP, safe(cs.addressLine2), COORDS_BASE.p5.csAddr2.x, COORDS_BASE.p5.csAddr2.top, { size: 8.5, maxW: COORDS_BASE.p5.csAddr2.maxW });
    drawText(page5, baseP, safe(cs.townCity), COORDS_BASE.p5.csTown.x, COORDS_BASE.p5.csTown.top, { size: 8.5, maxW: COORDS_BASE.p5.csTown.maxW });
    drawText(page5, baseP, safe(cs.countyState), COORDS_BASE.p5.csCounty.x, COORDS_BASE.p5.csCounty.top, { size: 8.5, maxW: COORDS_BASE.p5.csCounty.maxW });
    drawText(page5, baseP, safe(cs.postCode), COORDS_BASE.p5.csPost.x, COORDS_BASE.p5.csPost.top, { size: 8.5, maxW: COORDS_BASE.p5.csPost.maxW });
    drawText(page5, baseP, safe(cs.country), COORDS_BASE.p5.csCountry.x, COORDS_BASE.p5.csCountry.top, { size: 8.5, maxW: COORDS_BASE.p5.csCountry.maxW });
    drawText(page5, baseP, safe(cs.telephone), COORDS_BASE.p5.csTel.x, COORDS_BASE.p5.csTel.top, { size: 8.5, maxW: COORDS_BASE.p5.csTel.maxW });
    drawText(page5, baseP, safe(cs.occupation), COORDS_BASE.p5.csOcc.x, COORDS_BASE.p5.csOcc.top, { size: 8.5, maxW: COORDS_BASE.p5.csOcc.maxW });
    drawText(page5, baseP, safe(cs.capacityKnownApplicant), COORDS_BASE.p5.csCapacity.x, COORDS_BASE.p5.csCapacity.top, { size: 8.5, maxW: COORDS_BASE.p5.csCapacity.maxW });

    if (cs.signatureDataUrl) {
      await drawSignatureDataUrl(page5, baseP, cs.signatureDataUrl, COORDS_BASE.p5.csSigLine.x, COORDS_BASE.p5.csSigLine.top, 180, 25);
    }
    if (cs.date) {
      drawText(page5, baseP, cs.date, COORDS_BASE.p5.csDateLine.x, COORDS_BASE.p5.csDateLine.top, { size: 8.5 });
    }
  }

  // Debug marks for page 5 (declaration and countersign) - after content
  if (opts?.debug) {
    Object.entries(COORDS_BASE.p5).forEach(([k, v]: any) => {
      if (v?.x != null && v?.top != null) {
        debugMark(page5, baseP, `p5.${k}`, v.x, v.top);
      }
    });
  }

  // ----------------------------
  // PAGE 6 (A4 portrait) payment tick
  // ----------------------------
  const page6 = pages[5];

  // Use paymentRegion if provided, otherwise auto-detect from address country
  if (data.paymentRegion) {
    if (data.paymentRegion === 'uk') {
      drawTick(page6, baseP, COORDS_BASE.p6.tickUK.x, COORDS_BASE.p6.tickUK.top, 10);
    } else if (data.paymentRegion === 'eu') {
      drawTick(page6, baseP, COORDS_BASE.p6.tickEU.x, COORDS_BASE.p6.tickEU.top, 10);
    } else {
      drawTick(page6, baseP, COORDS_BASE.p6.tickROW.x, COORDS_BASE.p6.tickROW.top, 10);
    }
  } else {
    // Fallback to auto-detection if paymentRegion not provided
  const country = safe(personalDetails.address.country).toLowerCase();
    const isUK = ['uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'great britain', 'gb']
      .some(k => country === k || country.includes(k));

  const euCountries = [
    'austria','belgium','bulgaria','croatia','cyprus','czech','czech republic','denmark','estonia','finland','france',
    'germany','greece','hungary','ireland','italy','latvia','lithuania','luxembourg','malta','netherlands','poland',
    'portugal','romania','slovakia','slovenia','spain','sweden'
  ];
  const isEU = !isUK && euCountries.some(c => country === c || country.includes(c));

    if (isUK) drawTick(page6, baseP, COORDS_BASE.p6.tickUK.x, COORDS_BASE.p6.tickUK.top, 10);
    else if (isEU) drawTick(page6, baseP, COORDS_BASE.p6.tickEU.x, COORDS_BASE.p6.tickEU.top, 10);
    else drawTick(page6, baseP, COORDS_BASE.p6.tickROW.x, COORDS_BASE.p6.tickROW.top, 10);
  }

  // Debug marks for page 6 (payment ticks) - after content
  if (opts?.debug) {
    debugMark(page6, baseP, 'p6.tickUK', COORDS_BASE.p6.tickUK.x, COORDS_BASE.p6.tickUK.top);
    debugMark(page6, baseP, 'p6.tickEU', COORDS_BASE.p6.tickEU.x, COORDS_BASE.p6.tickEU.top);
    debugMark(page6, baseP, 'p6.tickROW', COORDS_BASE.p6.tickROW.x, COORDS_BASE.p6.tickROW.top);
  }

  // ----------------------------
  // Add SeaJourney Receipt/Verification Page
  // ----------------------------
  if (data.receiptData) {
    const receiptPage = pdfDoc.addPage([A4_PORTRAIT.w, A4_PORTRAIT.h]);
    const receiptBase = A4_PORTRAIT;
    
    let yPos = receiptBase.h - 50; // Start from top
    
    // Header
    drawText(receiptPage, receiptBase, 'SeaJourney Document Verification & Summary', 50, yPos, { size: 18, bold: true });
    
    yPos -= 30;
    
    // Draw a line
    receiptPage.drawLine({
      start: { x: X(receiptPage, receiptBase, 50), y: Y(receiptPage, receiptBase, yPos) },
      end: { x: X(receiptPage, receiptBase, receiptBase.w - 50), y: Y(receiptPage, receiptBase, yPos) },
      thickness: 1,
      color: black,
    });
    
    yPos -= 25;
    
    // Document Information Section
    drawText(receiptPage, receiptBase, 'Document Information', 50, yPos, { size: 14, bold: true });
    
    yPos -= 20;
    
    const docInfo = [
      ['Document Type:', data.receiptData.documentType === 'nav_watch' ? 'MCA Watch Rating Certificate Application (MSF 4371)' : 
                          data.receiptData.documentType === 'oow' ? 'MCA Officer of the Watch Application (MSF 4274)' :
                          'MCA Testimonial'],
      ['Document ID:', data.receiptData.documentId || 'N/A'],
      ['SeaJourney Code:', data.receiptData.sjCode || 'N/A'],
      ['Generated:', format(new Date(data.receiptData.generatedAt), 'dd MMMM yyyy HH:mm:ss')],
    ];
    
    docInfo.forEach(([label, value]) => {
      drawText(receiptPage, receiptBase, label, 60, yPos, { size: 10, bold: true });
      drawText(receiptPage, receiptBase, value, 200, yPos, { size: 10 });
      yPos -= 18;
    });
    
    yPos -= 10;
    
    // Personal Details Summary
    drawText(receiptPage, receiptBase, 'Applicant Summary', 50, yPos, { size: 14, bold: true });
    
    yPos -= 20;
    
    const applicantInfo = [
      ['Name:', `${personalDetails.forenames} ${personalDetails.surname}`],
      ['Date of Birth:', personalDetails.dateOfBirth],
      ['Nationality:', personalDetails.nationality || 'N/A'],
      ['Email:', personalDetails.email],
      ['Certificate Type:', certificateType === 'navigational' ? 'Navigational Watch Rating (II/4)' :
                              certificateType === 'engine_room' ? 'Engine Room Watch Rating (III/4)' :
                              'Electro-Technical Watch Rating (III/7)'],
    ];
    
    applicantInfo.forEach(([label, value]) => {
      drawText(receiptPage, receiptBase, label, 60, yPos, { size: 10, bold: true });
      drawText(receiptPage, receiptBase, value || 'N/A', 200, yPos, { size: 10 });
      yPos -= 18;
    });
    
    yPos -= 10;
    
    // Sea Service Summary
    drawText(receiptPage, receiptBase, 'Sea Service Summary', 50, yPos, { size: 14, bold: true });
    
    yPos -= 20;
    
    const totalVessels = seaServiceRecords.length;
    const totalDays = seaServiceRecords.reduce((sum, r) => sum + r.totalDays, 0);
    const totalDaysAtSea = seaServiceRecords.reduce((sum, r) => sum + r.daysAtSea, 0);
    
    const seaServiceInfo = [
      ['Total Vessels:', String(totalVessels)],
      ['Total Days:', String(totalDays)],
      ['Days at Sea:', String(totalDaysAtSea)],
    ];
    
    seaServiceInfo.forEach(([label, value]) => {
      drawText(receiptPage, receiptBase, label, 60, yPos, { size: 10, bold: true });
      drawText(receiptPage, receiptBase, value, 200, yPos, { size: 10 });
      yPos -= 18;
    });
    
    yPos -= 15;
    
    // Vessel List (if space allows)
    if (totalVessels > 0 && yPos > 200) {
      drawText(receiptPage, receiptBase, 'Vessels Included:', 50, yPos, { size: 12, bold: true });
      
      yPos -= 18;
      
      const maxVessels = Math.floor((yPos - 100) / 15);
      seaServiceRecords.slice(0, maxVessels).forEach((record) => {
        const vesselLine = `${record.vesselName} (${record.fromDate} - ${record.toDate}, ${record.daysAtSea} days at sea)`;
        drawText(receiptPage, receiptBase, vesselLine, 60, yPos, { size: 9 });
        yPos -= 15;
      });
      
      if (totalVessels > maxVessels) {
        drawText(receiptPage, receiptBase, `...and ${totalVessels - maxVessels} more vessel(s)`, 60, yPos, { size: 9 });
      }
    }
    
    // Footer with verification info
    const verificationUrl = data.receiptData.documentId 
      ? `www.seajourney.co.uk/verify/${data.receiptData.documentId}`
      : 'www.seajourney.co.uk';
    
    drawText(receiptPage, receiptBase, 'Verification:', 50, 80, { size: 10, bold: true });
    drawText(receiptPage, receiptBase, `This document can be verified at ${verificationUrl}`, 50, 65, { size: 9 });
    
    if (data.receiptData.sjCode) {
      drawText(receiptPage, receiptBase, `Reference Code: ${data.receiptData.sjCode}`, 50, 50, { size: 9 });
    }
    
    drawText(receiptPage, receiptBase, 'This page is generated by SeaJourney for verification purposes only.', 50, 30, { size: 8 });
  }

  // ----------------------------
  // Save / output
  // ----------------------------
  const finalBytes = await pdfDoc.save();
  const pdfArray = new Uint8Array(finalBytes);

  if (output === 'blob') return new Blob([pdfArray], { type: 'application/pdf' }) as any;

  if (output === 'newtab') {
    const blob = new Blob([pdfArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return;
  }

  const blob = new Blob([pdfArray], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const cleanName = (name: string) =>
    String(name || '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const surname = cleanName(personalDetails.surname);
  const filename = `MSF4371_NavWRC_${surname}_${yyyy}${mm}${dd}.pdf`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}



// Export alias for backward compatibility
export const generateMCAWatchRatingForm = generateMCAWatchRatingForm_NAV_WRC;

/* ========================================================================== */
/*                    MCA OOW CERTIFICATE FORM (MSF 4274)                      */
/*                    (MSF 4274 REV 01/26)                                     */
/*                    Application For an Oral Examination Leading To         */
/*                    The Issue of A Certificate Of Competency                 */
/* ========================================================================== */

export type OOWCertificateType = 
  | 'ii3_oow_lt500gt_d' 
  | 'ii3_oow_lt500gt_nc'
  | 'ii1_oow_unlimited'
  | 'ii2_cm_lt3000gt_nc'
  | 'ii2_cm_lt3000gt_unlimited'
  | 'ii2_cm_unlimited_nc'
  | 'ii2_cm_unlimited_unlimited'
  | 'ii3_master_lt500gt_d'
  | 'ii3_master_lt500gt_nc'
  | 'ii2_master_lt3000gt_specified'
  | 'ii2_master_lt3000gt_unlimited'
  | 'ii2_master_unlimited_nc'
  | 'ii2_master_unlimited_unlimited';

export interface MCAOOWApplicationData {
  // Section 1: What are you applying for?
  certificateType: OOWCertificateType;
  
  // Section 2: Personal Details
  personalDetails: {
    title?: string;
    surname: string;
    forenames: string;
    dateOfBirth: string; // DD/MM/YYYY
    sex?: 'male' | 'female';
    placeOfBirth?: string;
    countryOfBirth?: string;
    nationality?: string;
  };
  
  // Section 3: Return Delivery Address
  returnAddress?: {
    line1: string;
    line2?: string;
    townCity: string;
    countyState?: string;
    postCode: string;
    country: string;
  };
  
  // Section 4: Home Address and Contact Details
  homeAddress: {
    line1: string;
    line2?: string;
    townCity: string;
    countyState?: string;
    postCode: string;
    country: string;
    email: string;
    telephone?: string;
  };
  
  // Section 5: Certificates Held or Required CoC
  existingCoC?: {
    hasCoC: boolean;
    certificateNumber?: string;
    expiryDate?: string; // DD/MM/YYYY
    countryOfIssue?: string;
  };
  
  existingGMDSS?: {
    hasGMDSS: boolean;
    certificateNumber?: string;
    issueDate?: string; // DD/MM/YYYY
    endorsementExpiryDate?: string; // DD/MM/YYYY
    countryOfIssue?: string;
    requiresNewGMDSS?: boolean;
  };
  
  // SMarT Funding
  smartFunding?: {
    isSmartFunded: boolean;
    sponsoringCompanyEmail?: string;
  };
  
  // Section 6: Sea Service
  seaServiceRecords: Array<{
    vesselName: string;
    imoNumber?: string;
    type?: string; // Tanker, Cargo, Passenger, Ro-Ro, Supply, Tug, Drilling, Survey, Stand-by, Yacht, etc
    grossTonnage?: number;
    voyage?: string; // U = Unlimited, NC = Near Coastal Area
    rankCapacity: string;
    fromDate: string; // DD/MM/YYYY
    toDate: string; // DD/MM/YYYY
    months: number;
    days: number;
  }>;
  
  // Section 7: Supporting Evidence (checklist)
  supportingEvidence?: {
    // Documents required for NOE
    attestedPassport?: boolean;
    payment?: boolean;
    dischargeBookOrCd?: boolean;
    seaServiceTestimonials?: boolean;
    passportPhoto?: boolean;
    stcwBasicTraining?: boolean;
    securityAwareness?: boolean;
    profInSurvivalCraft?: boolean;
    medical?: boolean;
    // Additional documents for OOW
    ukSignalsCertificate?: boolean;
    narasNaestOperational?: boolean;
    advancedFireFighting?: boolean;
    medicalFirstAid?: boolean;
    efficientDeckHand?: boolean;
    helmOperational?: boolean;
    gmdssGoc?: boolean;
    // Foundation Degree / HNC
    foundationDegreeCertificate?: boolean;
    hncCourseCompletion?: boolean;
    sqaSafetyPaper?: boolean;
  };
  
  // Section 8: Payment
  payment?: {
    method?: 'cheque' | 'postal_order' | 'card' | 'bank_transfer';
    amount?: number;
  };
  
  // Section 10: Declaration
  declaration?: {
    signatureDataUrl?: string | null;
    date?: string; // DD/MM/YYYY
    printName?: string;
  };
  
  // Section 11: Counter Declaration
  counterDeclaration?: {
    name?: string;
    addressLine1?: string;
    addressLine2?: string;
    townCity?: string;
    countyState?: string;
    postCode?: string;
    country?: string;
    telephone?: string;
    email?: string;
    relationship?: string;
    signatureDataUrl?: string | null;
    date?: string; // DD/MM/YYYY
  };
}

/**
 * Generates an MCA MSF 4274 Rev 01/26 OOW application PDF by using the official MCA PDF as template,
 * then writing into pages with pdf-lib (overlay).
 */
export async function generateMCAOOWForm_MSF_4274(
  data: MCAOOWApplicationData,
  output: TestimonialPDFOutput = 'download',
  opts?: { debug?: boolean }
) {
  const API_BASE_URL =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

  // Fetch the MSF 4274 PDF template
  const MCA_FORM_API_URL = `${API_BASE_URL}/api/mca-form/oow-4274`;

  const res = await fetch(MCA_FORM_API_URL);
  if (!res.ok) throw new Error(`Failed to fetch MCA OOW form: ${res.status} ${res.statusText}`);

  const templateBytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(templateBytes);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  if (pages.length < 12) throw new Error(`Template PDF has ${pages.length} pages; expected at least 12.`);

  const black = rgb(0, 0, 0);
  const red = rgb(1, 0, 0);

  const safe = (v?: string | null, fallback = '') => (v ?? '').trim() || fallback;

  // A4 portrait pages
  const A4_PORTRAIT = { w: 595.28, h: 841.89 };

  // ----------------------------
  // ✅ Scaling helpers (same as MSF 4371)
  // ----------------------------
  const getScale = (page: any, base: { w: number; h: number }) => {
    const { width, height } = page.getSize();
    return { sx: width / base.w, sy: height / base.h, width, height };
  };

  const X = (page: any, base: { w: number; h: number }, x: number) => {
    const { sx } = getScale(page, base);
    return x * sx;
  };

  const Y = (page: any, base: { w: number; h: number }, topFromTop: number) => {
    const { sy, height } = getScale(page, base);
    return height - topFromTop * sy;
  };

  const W = (page: any, base: { w: number; h: number }, w: number) => {
    const { sx } = getScale(page, base);
    return w * sx;
  };

  const wrapText = (text: string, f: any, size: number, maxWidth: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const width = f.widthOfTextAtSize(test, size);
      if (width <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  };

  const drawText = (
    page: any,
    base: { w: number; h: number },
    text: string,
    x: number,
    top: number,
    opts?: { size?: number; maxW?: number; bold?: boolean }
  ) => {
    const t = (text ?? '').toString().trim();
    if (!t) return;

    const size = opts?.size ?? 10;
    const useFont = opts?.bold ? fontBold : font;

    const px = X(page, base, x);
    const py = Y(page, base, top);

    if (opts?.maxW && opts.maxW > 10) {
      const maxW = W(page, base, opts.maxW);
      const lines = wrapText(t, useFont, size, maxW);
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: px,
          y: py - i * (size + 2),
          size,
          font: useFont,
          color: black,
        });
      });
      return;
    }

    page.drawText(t, { x: px, y: py, size, font: useFont, color: black });
  };

  // ✅ Vector tick (no unicode ✓) - same as MSF 4371
  const drawTick = (page: any, base: { w: number; h: number }, x: number, top: number, size = 10) => {
    const px = X(page, base, x);
    const py = Y(page, base, top);

    page.drawLine({
      start: { x: px + 0.5, y: py - 1.5 },
      end: { x: px + 3.5, y: py - 4.0 },
      thickness: 1.2,
      color: black,
    });
    page.drawLine({
      start: { x: px + 3.2, y: py - 4.0 },
      end: { x: px + size, y: py + 2.0 },
      thickness: 1.2,
      color: black,
    });
  };

  // ----------------------------
  // ✅ COORDS IN *BASE* POINTS FROM TOP
  // (These MUST be based on A4 points-from-top, NOT screenshot pixels)
  // Based on MSF 4274 Rev 01/26 structure
  // NOTE: These coordinates are estimates and may need adjustment based on actual PDF
  // ----------------------------
  const COORDS_BASE = {
    p1: {
      // Section 1: Certificate Type checkboxes (Page 1)
      certTypes: {
        ii3_oow_lt500gt_d: { x: 495, top: 200 },
        ii3_oow_lt500gt_nc: { x: 495, top: 218 },
        ii1_oow_unlimited: { x: 495, top: 236 },
        ii2_cm_lt3000gt_nc: { x: 495, top: 254 },
        ii2_cm_lt3000gt_unlimited: { x: 495, top: 272 },
        ii2_cm_unlimited_nc: { x: 495, top: 290 },
        ii2_cm_unlimited_unlimited: { x: 495, top: 308 },
        ii3_master_lt500gt_d: { x: 495, top: 326 },
        ii3_master_lt500gt_nc: { x: 495, top: 344 },
        ii2_master_lt3000gt_specified: { x: 495, top: 362 },
        ii2_master_lt3000gt_unlimited: { x: 495, top: 380 },
        ii2_master_unlimited_nc: { x: 495, top: 398 },
        ii2_master_unlimited_unlimited: { x: 495, top: 416 },
      },
      // Section 2: Personal Details (Page 1)
      title: { x: 165, top: 470 },
      surname: { x: 165, top: 488 },
      forenames: { x: 165, top: 506 },
      dob: { x: 165, top: 524 },
      sex: { x: 165, top: 542 },
      placeOfBirth: { x: 165, top: 560 },
      countryOfBirth: { x: 165, top: 578 },
      nationality: { x: 165, top: 596 },
    },
    p2: {
      // Section 3: Return Delivery Address (Page 2)
      returnAddrLine1: { x: 165, top: 200, maxW: 380 },
      returnAddrLine2: { x: 165, top: 218, maxW: 380 },
      returnTownCity: { x: 165, top: 236, maxW: 200 },
      returnCountyState: { x: 165, top: 254, maxW: 200 },
      returnPostCode: { x: 165, top: 272, maxW: 200 },
      returnCountry: { x: 165, top: 290, maxW: 200 },
      // Section 4: Home Address and Contact (Page 2)
      homeAddrLine1: { x: 165, top: 380, maxW: 380 },
      homeAddrLine2: { x: 165, top: 398, maxW: 380 },
      homeTownCity: { x: 165, top: 416, maxW: 200 },
      homeCountyState: { x: 165, top: 434, maxW: 200 },
      homePostCode: { x: 165, top: 452, maxW: 200 },
      homeCountry: { x: 165, top: 470, maxW: 200 },
      email: { x: 165, top: 488, maxW: 380 },
      telephone: { x: 165, top: 506, maxW: 200 },
    },
    p3: {
      // Section 5: Certificates (Page 3)
      hasCoC: { x: 495, top: 200 },
      cocNumber: { x: 165, top: 218, maxW: 300 },
      cocExpiry: { x: 165, top: 236, maxW: 150 },
      cocCountry: { x: 330, top: 236, maxW: 200 },
      hasGMDSS: { x: 495, top: 290 },
      gmdssNumber: { x: 165, top: 308, maxW: 300 },
      gmdssIssueDate: { x: 165, top: 326, maxW: 150 },
      gmdssExpiry: { x: 330, top: 326, maxW: 150 },
      gmdssCountry: { x: 165, top: 344, maxW: 200 },
      requiresNewGMDSS: { x: 495, top: 362 },
      // SMarT Funding
      isSmartFunded: { x: 495, top: 440 },
      smartEmail: { x: 165, top: 458, maxW: 380 },
    },
    p4: {
      // Section 6: Sea Service Table (Page 4) - Landscape
      tableTop: 150,
      rowH: 14,
      maxRows: 20,
      fontSize: 7,
      cols: (pageW: number) => ({
        vessel: pageW * 0.05,
        imo: pageW * 0.15,
        type: pageW * 0.22,
        gt: pageW * 0.30,
        voyage: pageW * 0.36,
        rank: pageW * 0.45,
        from: pageW * 0.58,
        to: pageW * 0.68,
        months: pageW * 0.78,
        days: pageW * 0.85,
      }),
    },
    p10: {
      // Section 10: Declaration (Page 10)
      signatureBox: { x: 105, top: 200, w: 190, h: 70 },
      date: { x: 105, top: 290 },
      printName: { x: 135, top: 315 },
    },
  };

  // ----------------------------
  // ✅ PAGE 1: Certificate Type & Personal Details
  // ----------------------------
  const page1 = pages[0];
  const baseP = A4_PORTRAIT;

  // Section 1: Certificate Type checkbox
  const certTypeCoords: Record<string, { x: number; top: number }> = COORDS_BASE.p1.certTypes;
  if (certTypeCoords[data.certificateType]) {
    const coord = certTypeCoords[data.certificateType];
    drawTick(page1, baseP, coord.x, coord.top, 8);
  }

  // Section 2: Personal Details
  const pd = data.personalDetails;
  if (pd.title) drawText(page1, baseP, safe(pd.title), COORDS_BASE.p1.title.x, COORDS_BASE.p1.title.top);
  drawText(page1, baseP, safe(pd.surname), COORDS_BASE.p1.surname.x, COORDS_BASE.p1.surname.top);
  drawText(page1, baseP, safe(pd.forenames), COORDS_BASE.p1.forenames.x, COORDS_BASE.p1.forenames.top);
  drawText(page1, baseP, safe(pd.dateOfBirth), COORDS_BASE.p1.dob.x, COORDS_BASE.p1.dob.top);
  if (pd.sex) drawText(page1, baseP, safe(pd.sex), COORDS_BASE.p1.sex.x, COORDS_BASE.p1.sex.top);
  if (pd.placeOfBirth) drawText(page1, baseP, safe(pd.placeOfBirth), COORDS_BASE.p1.placeOfBirth.x, COORDS_BASE.p1.placeOfBirth.top);
  if (pd.countryOfBirth) drawText(page1, baseP, safe(pd.countryOfBirth), COORDS_BASE.p1.countryOfBirth.x, COORDS_BASE.p1.countryOfBirth.top);
  if (pd.nationality) drawText(page1, baseP, safe(pd.nationality), COORDS_BASE.p1.nationality.x, COORDS_BASE.p1.nationality.top);

  // ----------------------------
  // ✅ PAGE 2: Return Address & Home Address
  // ----------------------------
  const page2 = pages[1];

  // Section 3: Return Delivery Address
  if (data.returnAddress) {
    const ra = data.returnAddress;
    drawText(page2, baseP, safe(ra.line1), COORDS_BASE.p2.returnAddrLine1.x, COORDS_BASE.p2.returnAddrLine1.top, { maxW: COORDS_BASE.p2.returnAddrLine1.maxW });
    if (ra.line2) drawText(page2, baseP, safe(ra.line2), COORDS_BASE.p2.returnAddrLine2.x, COORDS_BASE.p2.returnAddrLine2.top, { maxW: COORDS_BASE.p2.returnAddrLine2.maxW });
    drawText(page2, baseP, safe(ra.townCity), COORDS_BASE.p2.returnTownCity.x, COORDS_BASE.p2.returnTownCity.top, { maxW: COORDS_BASE.p2.returnTownCity.maxW });
    if (ra.countyState) drawText(page2, baseP, safe(ra.countyState), COORDS_BASE.p2.returnCountyState.x, COORDS_BASE.p2.returnCountyState.top, { maxW: COORDS_BASE.p2.returnCountyState.maxW });
    drawText(page2, baseP, safe(ra.postCode), COORDS_BASE.p2.returnPostCode.x, COORDS_BASE.p2.returnPostCode.top, { maxW: COORDS_BASE.p2.returnPostCode.maxW });
    drawText(page2, baseP, safe(ra.country), COORDS_BASE.p2.returnCountry.x, COORDS_BASE.p2.returnCountry.top, { maxW: COORDS_BASE.p2.returnCountry.maxW });
  }

  // Section 4: Home Address and Contact
  const ha = data.homeAddress;
  drawText(page2, baseP, safe(ha.line1), COORDS_BASE.p2.homeAddrLine1.x, COORDS_BASE.p2.homeAddrLine1.top, { maxW: COORDS_BASE.p2.homeAddrLine1.maxW });
  if (ha.line2) drawText(page2, baseP, safe(ha.line2), COORDS_BASE.p2.homeAddrLine2.x, COORDS_BASE.p2.homeAddrLine2.top, { maxW: COORDS_BASE.p2.homeAddrLine2.maxW });
  drawText(page2, baseP, safe(ha.townCity), COORDS_BASE.p2.homeTownCity.x, COORDS_BASE.p2.homeTownCity.top, { maxW: COORDS_BASE.p2.homeTownCity.maxW });
  if (ha.countyState) drawText(page2, baseP, safe(ha.countyState), COORDS_BASE.p2.homeCountyState.x, COORDS_BASE.p2.homeCountyState.top, { maxW: COORDS_BASE.p2.homeCountyState.maxW });
  drawText(page2, baseP, safe(ha.postCode), COORDS_BASE.p2.homePostCode.x, COORDS_BASE.p2.homePostCode.top, { maxW: COORDS_BASE.p2.homePostCode.maxW });
  drawText(page2, baseP, safe(ha.country), COORDS_BASE.p2.homeCountry.x, COORDS_BASE.p2.homeCountry.top, { maxW: COORDS_BASE.p2.homeCountry.maxW });
  drawText(page2, baseP, safe(ha.email), COORDS_BASE.p2.email.x, COORDS_BASE.p2.email.top, { maxW: COORDS_BASE.p2.email.maxW });
  if (ha.telephone) drawText(page2, baseP, safe(ha.telephone), COORDS_BASE.p2.telephone.x, COORDS_BASE.p2.telephone.top, { maxW: COORDS_BASE.p2.telephone.maxW });

  // ----------------------------
  // ✅ PAGE 3: Certificates
  // ----------------------------
  const page3 = pages[2];

  // Existing CoC
  if (data.existingCoC) {
    const coc = data.existingCoC;
    if (coc.hasCoC) {
      drawTick(page3, baseP, COORDS_BASE.p3.hasCoC.x, COORDS_BASE.p3.hasCoC.top, 8);
      if (coc.certificateNumber) drawText(page3, baseP, safe(coc.certificateNumber), COORDS_BASE.p3.cocNumber.x, COORDS_BASE.p3.cocNumber.top, { maxW: COORDS_BASE.p3.cocNumber.maxW });
      if (coc.expiryDate) drawText(page3, baseP, safe(coc.expiryDate), COORDS_BASE.p3.cocExpiry.x, COORDS_BASE.p3.cocExpiry.top, { maxW: COORDS_BASE.p3.cocExpiry.maxW });
      if (coc.countryOfIssue) drawText(page3, baseP, safe(coc.countryOfIssue), COORDS_BASE.p3.cocCountry.x, COORDS_BASE.p3.cocCountry.top, { maxW: COORDS_BASE.p3.cocCountry.maxW });
    }
  }

  // Existing GMDSS
  if (data.existingGMDSS) {
    const gmdss = data.existingGMDSS;
    if (gmdss.hasGMDSS) {
      drawTick(page3, baseP, COORDS_BASE.p3.hasGMDSS.x, COORDS_BASE.p3.hasGMDSS.top, 8);
      if (gmdss.certificateNumber) drawText(page3, baseP, safe(gmdss.certificateNumber), COORDS_BASE.p3.gmdssNumber.x, COORDS_BASE.p3.gmdssNumber.top, { maxW: COORDS_BASE.p3.gmdssNumber.maxW });
      if (gmdss.issueDate) drawText(page3, baseP, safe(gmdss.issueDate), COORDS_BASE.p3.gmdssIssueDate.x, COORDS_BASE.p3.gmdssIssueDate.top, { maxW: COORDS_BASE.p3.gmdssIssueDate.maxW });
      if (gmdss.endorsementExpiryDate) drawText(page3, baseP, safe(gmdss.endorsementExpiryDate), COORDS_BASE.p3.gmdssExpiry.x, COORDS_BASE.p3.gmdssExpiry.top, { maxW: COORDS_BASE.p3.gmdssExpiry.maxW });
      if (gmdss.countryOfIssue) drawText(page3, baseP, safe(gmdss.countryOfIssue), COORDS_BASE.p3.gmdssCountry.x, COORDS_BASE.p3.gmdssCountry.top, { maxW: COORDS_BASE.p3.gmdssCountry.maxW });
      if (gmdss.requiresNewGMDSS) {
        drawTick(page3, baseP, COORDS_BASE.p3.requiresNewGMDSS.x, COORDS_BASE.p3.requiresNewGMDSS.top, 8);
      }
    }
  }

  // SMarT Funding
  if (data.smartFunding) {
    const smart = data.smartFunding;
    if (smart.isSmartFunded) {
      drawTick(page3, baseP, COORDS_BASE.p3.isSmartFunded.x, COORDS_BASE.p3.isSmartFunded.top, 8);
      if (smart.sponsoringCompanyEmail) drawText(page3, baseP, safe(smart.sponsoringCompanyEmail), COORDS_BASE.p3.smartEmail.x, COORDS_BASE.p3.smartEmail.top, { maxW: COORDS_BASE.p3.smartEmail.maxW });
    }
  }

  // ----------------------------
  // ✅ PAGE 4: Sea Service Table (Landscape)
  // ----------------------------
  const page4 = pages[3];
  const baseL = { w: 841.89, h: 595.28 }; // A4 Landscape

  if (data.seaServiceRecords && data.seaServiceRecords.length > 0) {
    const tableTop = COORDS_BASE.p4.tableTop;
    const rowH = COORDS_BASE.p4.rowH;
    const fontSize = COORDS_BASE.p4.fontSize;
    const cols = COORDS_BASE.p4.cols(page4.getSize().width);

    data.seaServiceRecords.slice(0, COORDS_BASE.p4.maxRows).forEach((record, idx) => {
      const top = tableTop + (idx * rowH);
      
      drawText(page4, baseL, safe(record.vesselName), cols.vessel, top, { size: fontSize, maxW: cols.imo - cols.vessel - 5 });
      if (record.imoNumber) drawText(page4, baseL, safe(record.imoNumber), cols.imo, top, { size: fontSize, maxW: cols.type - cols.imo - 5 });
      if (record.type) drawText(page4, baseL, safe(record.type), cols.type, top, { size: fontSize, maxW: cols.gt - cols.type - 5 });
      if (record.grossTonnage) drawText(page4, baseL, String(record.grossTonnage), cols.gt, top, { size: fontSize, maxW: cols.voyage - cols.gt - 5 });
      if (record.voyage) drawText(page4, baseL, safe(record.voyage), cols.voyage, top, { size: fontSize, maxW: cols.rank - cols.voyage - 5 });
      drawText(page4, baseL, safe(record.rankCapacity), cols.rank, top, { size: fontSize, maxW: cols.from - cols.rank - 5 });
      drawText(page4, baseL, safe(record.fromDate), cols.from, top, { size: fontSize, maxW: cols.to - cols.from - 5 });
      drawText(page4, baseL, safe(record.toDate), cols.to, top, { size: fontSize, maxW: cols.months - cols.to - 5 });
      drawText(page4, baseL, String(record.months), cols.months, top, { size: fontSize, maxW: cols.days - cols.months - 5 });
      drawText(page4, baseL, String(record.days), cols.days, top, { size: fontSize, maxW: 50 });
    });
  }

  // ----------------------------
  // ✅ PAGE 10: Declaration
  // ----------------------------
  if (pages.length > 9 && data.declaration) {
    const page10 = pages[9];
    const decl = data.declaration;

    // Signature image
    if (decl.signatureDataUrl) {
      try {
        const detectImageFormat = (dataUrl: string): 'png' | 'jpg' => {
          const lower = dataUrl.toLowerCase();
          if (lower.includes('image/jpeg') || lower.includes('image/jpg')) return 'jpg';
          return 'png';
        };
        
        const fmt = detectImageFormat(decl.signatureDataUrl);
        const imgBytes = await fetch(decl.signatureDataUrl).then(r => r.arrayBuffer());
        const sigImage = fmt === 'jpg' ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
        
        const sigBox = COORDS_BASE.p10.signatureBox;
        const sigX = X(page10, baseP, sigBox.x);
        const sigY = Y(page10, baseP, sigBox.top);
        const sigW = W(page10, baseP, sigBox.w);
        const sigH = W(page10, baseP, sigBox.h);
        
        const scale = Math.min(sigW / sigImage.width, sigH / sigImage.height);
        const w = sigImage.width * scale;
        const h = sigImage.height * scale;
        
        page10.drawImage(sigImage, {
          x: sigX,
          y: sigY - sigH + (sigH - h) / 2,
          width: w,
          height: h,
        });
      } catch (e) {
        console.warn('[OOW] Could not embed signature image:', e);
      }
    }

    // Date and print name
    if (decl.date) drawText(page10, baseP, safe(decl.date), COORDS_BASE.p10.date.x, COORDS_BASE.p10.date.top);
    if (decl.printName) drawText(page10, baseP, safe(decl.printName), COORDS_BASE.p10.printName.x, COORDS_BASE.p10.printName.top);
  }

  // Generate filename
  const timestamp = format(new Date(), 'yyyy-MM-dd_HHmmss');
  const filename = `MCA_OOW_Application_MSF_4274_${timestamp}.pdf`;

  // Save PDF
  const pdfBytes = await pdfDoc.save();
  const pdfArray = new Uint8Array(pdfBytes);

  if (output === 'blob') {
    return new Blob([pdfArray], { type: 'application/pdf' });
  }

  const blob = new Blob([pdfArray], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  if (output === 'newtab') {
    window.open(url, '_blank');
    return;
  }

  // Download
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Legacy function - keeping for backward compatibility but redirecting to new implementation
export async function generateMCAWatchRatingFormLegacy(
  data: MCAWatchRatingApplicationData,
  output: TestimonialPDFOutput = 'download',
) {
  const doc = new jsPDF();
  const { personalDetails, certificateType, seaServiceRecords, userProfile } = data;

  const textDark: RGB = [0, 0, 0];
  const textGray: RGB = [80, 80, 80];
  const borderColor: RGB = [0, 0, 0];

  const setFillColor = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let yPos = margin;

  // Helper to add new page
  const ensureSpace = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Header - MCA Logo Area and Form Title
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('MSF 4371 REV 08/25', pageWidth - margin, yPos, { align: 'right' });
  yPos += 6;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Maritime & Coastguard Agency', margin, yPos);
  yPos += 8;

  doc.setFontSize(14);
  doc.text('APPLICATION FOR MCA-ISSUED WATCH RATING CERTIFICATE', margin, yPos);
  yPos += 6;
  doc.text('Navigational, Engine Room or Electro-technical', margin, yPos);
  yPos += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  setTextColor(textGray);
  doc.text('IMPORTANT – BEFORE completing this form please ensure you have read MSN 1862 Amendment 1,', margin, yPos);
  yPos += 4;
  doc.text('MSN 1863 Amendment 1 and the guidance notes on pages 7 to 8 of this form.', margin, yPos);
  yPos += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('Please email your application and scanned supporting documents to:', margin, yPos);
  yPos += 5;
  doc.text('deck@mcga.gov.uk for Navigational Watch Ratings', margin + 10, yPos);
  yPos += 5;
  doc.text('OR', margin + 10, yPos);
  yPos += 5;
  doc.text('engineering@mcga.gov.uk for Engine Room Watch/Electrotechnical Ratings', margin + 10, yPos);
  yPos += 10;

  // Section 1: Personal Details
  ensureSpace(80);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('1 PERSONAL DETAILS', margin, yPos);
  yPos += 8;

  // Personal Details Table
  const rowHeight = 6;
  const col1Width = 50;
  const col2Width = 60;
  const col3Width = 30;
  const col4Width = 50;

  // Draw table borders
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);

  // Title row
  doc.line(margin, yPos, margin + col1Width + col2Width + col3Width + col4Width, yPos);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Title Mr/Mrs/Miss etc', margin + 2, yPos - 2);
  doc.text('Sex Male/Female', margin + col1Width + col2Width + col3Width + 2, yPos - 2);
  yPos += rowHeight;

  // Title and Sex fields
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(personalDetails.title || ''), margin + 2, yPos - 2);
  doc.text('', margin + col1Width + col2Width + col3Width + 2, yPos - 2); // Sex field
  yPos += rowHeight + 2;

  // Surname
  doc.setFont('helvetica', 'bold');
  doc.text('Surname/Family name', margin + 2, yPos - 2);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(personalDetails.surname), margin + col1Width + 2, yPos - 2);
  yPos += rowHeight;

  // Forenames
  doc.setFont('helvetica', 'bold');
  doc.text('Forename(s) in full', margin + 2, yPos - 2);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(personalDetails.forenames), margin + col1Width + 2, yPos - 2);
  yPos += rowHeight;

  // Date of Birth
  doc.setFont('helvetica', 'bold');
  doc.text('Date of Birth', margin + 2, yPos - 2);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(personalDetails.dateOfBirth), margin + col1Width + 2, yPos - 2);
  yPos += rowHeight;

  // Place and Country of Birth
  doc.setFont('helvetica', 'bold');
  doc.text('Place and Country of Birth', margin + 2, yPos - 2);
  doc.setFont('helvetica', 'normal');
  const placeOfBirth = [personalDetails.placeOfBirth, personalDetails.countryOfBirth].filter(Boolean).join(', ') || '—';
  doc.text(safeText(placeOfBirth), margin + col1Width + 2, yPos - 2);
  yPos += rowHeight;

  // Nationality
  doc.setFont('helvetica', 'bold');
  doc.text('Nationality', margin + 2, yPos - 2);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(personalDetails.nationality || ''), margin + col1Width + 2, yPos - 2);
  yPos += rowHeight + 4;

  // Return Address Section
  doc.setFont('helvetica', 'bold');
  doc.text('Return Address', margin + 2, yPos - 2);
  yPos += rowHeight;

  const addressLines = [
    personalDetails.address.line1,
    personalDetails.address.line2,
    personalDetails.address.district,
    personalDetails.address.townCity,
    personalDetails.address.countyState,
    personalDetails.address.postCode,
    personalDetails.address.country,
  ].filter(Boolean);

  doc.setFont('helvetica', 'normal');
  addressLines.forEach((line) => {
    doc.text(safeText(line), margin + 2, yPos - 2);
    yPos += rowHeight;
  });

  yPos += 2;

  // Telephone and Mobile
  doc.setFont('helvetica', 'bold');
  doc.text('Telephone No', margin + 2, yPos - 2);
  doc.text('Mobile No.', margin + col1Width + col2Width + 2, yPos - 2);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(personalDetails.telephone || ''), margin + col1Width + 2, yPos - 2);
  doc.text(safeText(personalDetails.mobile || ''), margin + col1Width + col2Width + col3Width + 2, yPos - 2);
  yPos += rowHeight;

  // Email Address
  doc.setFont('helvetica', 'bold');
  doc.text('Email Address', margin + 2, yPos - 2);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(personalDetails.email), margin + col1Width + 2, yPos - 2);
  yPos += 12;

  // Section 2: Certificate Applied For
  ensureSpace(30);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('2 CERTIFICATE APPLIED FOR', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Capacity:', margin, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('Please tick (✓)', margin + 40, yPos);
  yPos += 6;

  const certificateOptions = [
    { value: 'navigational', label: 'Navigational Watch Rating Certificate II/4' },
    { value: 'engine_room', label: 'Engine Room Watch Rating Certificate III/4' },
    { value: 'electro_technical', label: 'Electro-technical Rating III/7' },
  ];

  certificateOptions.forEach((option) => {
    doc.text(certificateType === option.value ? '✓' : '☐', margin + 2, yPos - 2);
    doc.text(option.label, margin + 10, yPos - 2);
    yPos += 6;
  });

  yPos += 8;

  // Section 3: Seagoing Service
  ensureSpace(100);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('3 SEAGOING SERVICE', margin, yPos);
  yPos += 6;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  setTextColor(textGray);
  const serviceInstructions = [
    'ALL RELEVANT SEA-GOING SERVICE MUST BE LISTED. For all sea service that is declared below, you must submit',
    'TWO forms of evidence. Discharge Book entries or Certificates of Discharge are one form and Sea Service',
    'Testimonials are the other; testimonials must be countersigned by the Master of the vessel. The 6 months sea',
    'service must be within the last 5 years and in the department relevant to the certificate you are applying for',
    '(deck or engine). If you are applying for a Navigational Watch Rating Certificate and an Engine Room Watch',
    'Rating Certificate, you must demonstrate 6 months sea service in each department (deck and engine).',
  ];

  serviceInstructions.forEach((line) => {
    ensureSpace(6);
    doc.text(line, margin, yPos, { maxWidth: pageWidth - (margin * 2) });
    yPos += 4;
  });

  yPos += 4;

  // Sea Service Table Header
  ensureSpace(120);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  
  // Draw table header
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);
  const tableStartY2 = yPos;
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 5;

  // Table headers (compact to fit)
  const headers = [
    { text: 'Vessel Name', x: margin + 2, width: 30 },
    { text: 'Flag', x: margin + 35, width: 15 },
    { text: 'IMO', x: margin + 52, width: 20 },
    { text: 'GT', x: margin + 74, width: 15 },
    { text: 'kW', x: margin + 91, width: 15 },
    { text: 'Length', x: margin + 108, width: 15 },
    { text: 'Capacity', x: margin + 125, width: 20 },
    { text: 'From', x: margin + 147, width: 20 },
    { text: 'To', x: margin + 169, width: 20 },
    { text: 'Days', x: margin + 191, width: 15 },
    { text: 'Days Sea', x: margin + 208, width: 15 },
  ];

  headers.forEach((header) => {
    doc.text(header.text, header.x, yPos - 2);
  });
  yPos += 2;
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 4;

  // Sea Service Records Rows
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  
  seaServiceRecords.forEach((record, index) => {
    ensureSpace(8);
    const rowY = yPos;
    
    // Vessel details (truncate if needed)
    doc.text(truncate(record.vesselName, 25), margin + 2, rowY - 2);
    doc.text(truncate(record.flag, 10), margin + 35, rowY - 2);
    doc.text(truncate(record.imoNumber || '', 10), margin + 52, rowY - 2);
    doc.text(record.grossTonnage ? String(record.grossTonnage) : '—', margin + 74, rowY - 2);
    doc.text(record.kilowatts ? String(record.kilowatts) : '—', margin + 91, rowY - 2);
    doc.text(record.length ? `${record.length}m` : '—', margin + 108, rowY - 2);
    doc.text(truncate(record.capacity || '', 15), margin + 125, rowY - 2);
    doc.text(truncate(record.fromDate, 8), margin + 147, rowY - 2);
    doc.text(truncate(record.toDate, 8), margin + 169, rowY - 2);
    doc.text(String(record.totalDays), margin + 191, rowY - 2);
    doc.text(String(record.daysAtSea), margin + 208, rowY - 2);
    
    yPos += 6;
    
    // Draw row separator
    if (index < seaServiceRecords.length - 1) {
      doc.setLineWidth(0.2);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 2;
    }
  });

  // Draw bottom border
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Section 6: Declaration
  ensureSpace(60);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('6 DECLARATION', margin, yPos);
  yPos += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('(The maximum penalty for a false declaration is £5000)', margin, yPos);
  yPos += 6;

  const declarationText = [
    'I declare that the information I have given is, to the best of my knowledge, true and complete. I also declare',
    'that the documents submitted are genuine, given and signed by the persons whose names appear on them.',
    'I consent to any processing of the data contained in this application by the MCA (including any processing',
    'necessary to establish the authenticity and validity of the issued certificate). Please refer to our privacy',
    'statement in Section 2 of the guidance notes which explains how we use the personal information we collect',
    'from you.',
  ];

  declarationText.forEach((line) => {
    ensureSpace(6);
    doc.text(line, margin, yPos, { maxWidth: pageWidth - (margin * 2) });
    yPos += 5;
  });

  yPos += 8;

  // Signature box
  setDrawColor(borderColor);
  doc.setLineWidth(1);
  doc.rect(margin, yPos, 80, 25);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  setTextColor(textGray);
  doc.text('Important: Your signature will be transferred to your certificate', margin + 2, yPos + 5);
  doc.text('so please keep within the border', margin + 2, yPos + 10);
  yPos += 30;

  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('Date', margin, yPos);
  doc.text('Print name', margin + 60, yPos);
  yPos += 6;
  doc.line(margin, yPos, margin + 50, yPos); // Date line
  doc.line(margin + 60, yPos, pageWidth - margin, yPos); // Name line
  yPos += 12;

  // Section 7: Counter Signature
  ensureSpace(80);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('7 COUNTER SIGNATURE', margin, yPos);
  yPos += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const counterSigFields = [
    ['Name', ''],
    ['Address', ''],
    ['', ''],
    ['Town / City', 'County/State'],
    ['Post Code/Zip', 'Country'],
    ['Telephone No', 'Occupation'],
    ['Capacity in which you know the applicant:', ''],
  ];

  counterSigFields.forEach(([label1, label2]) => {
    ensureSpace(6);
    if (label1) doc.text(label1, margin, yPos - 2);
    if (label2) doc.text(label2, margin + 80, yPos - 2);
    doc.line(margin, yPos, margin + 70, yPos);
    if (label2) doc.line(margin + 80, yPos, pageWidth - margin, yPos);
    yPos += 6;
  });

  yPos += 4;

  const counterSigText = [
    'I declare that the information given is, to the best of my knowledge, true and complete. I also declare',
    'that the documents submitted are, to the best of my knowledge, genuine and relate to the person(s) whose',
    'names appear on them. I confirm that the photographs submitted bear a true current likeness of the applicant.',
  ];

  counterSigText.forEach((line) => {
    ensureSpace(6);
    doc.text(line, margin, yPos, { maxWidth: pageWidth - (margin * 2) });
    yPos += 5;
  });

  yPos += 6;
  doc.text('Signature', margin, yPos);
  doc.text('Date', margin + 60, yPos);
  yPos += 6;
  doc.line(margin, yPos, margin + 50, yPos); // Signature line
  doc.line(margin + 60, yPos, margin + 90, yPos); // Date line

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setTextColor(textGray);
    const footerY = pageHeight - 8;
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
  }

  // Filename
  const cleanName = (name: string): string =>
    String(name || '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const surname = cleanName(personalDetails.surname);
  const certType = certificateType === 'navigational' ? 'Nav' : certificateType === 'engine_room' ? 'Engine' : 'ETR';
  const filename = `MCA_Watch_Rating_Application_${certType}_${surname}_${format(new Date(), 'yyyyMMdd')}.pdf`;

  // Output modes
  if (output === 'blob') {
    return doc.output('blob');
  }
  if (output === 'newtab') {
    doc.output('dataurlnewwindow');
    return;
  }

  doc.save(filename);
}

/* ========================================================================== */
/*                    MCA TESTIMONIAL PDF GENERATORS                          */
/* ========================================================================== */
/*
 * Debug is off unless you pass { debug: true }: crosshairs + labels at each field for tuning.
 *
 * To edit coordinates:
 *   - Deckhand: search for "EDIT COORDINATES HERE: MCA Deckhand" in this file → COORDS object.
 *   - Officer:  search for "EDIT COORDINATES HERE: MCA Officer"  in this file → COORDS object.
 * Units: PDF points (x = from left, top = from top of page). To show position crosshairs, pass { debug: true }.
 */

/**
 * Generate MCA Deckhand Testimonial PDF
 * Fills out the MCA Deckhand Testimonial form with testimonial data
 */
export async function generateMCADeckhandTestimonial(
  data: TestimonialPDFData,
  output: TestimonialPDFOutput = 'download',
  opts?: { debug?: boolean }
) {
  // Debug: pass { debug: true } to draw red crosshairs + labels at each field position (default off)
  const debug = opts?.debug === true;
  opts = { ...opts, debug };

  const { testimonial, userProfile, vessel, captainProfile, companyDetails } = data;

  const API_BASE_URL =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

  const MCA_FORM_API_URL = `${API_BASE_URL}/api/mca-form/testimonial-deckhand`;

  const res = await fetch(MCA_FORM_API_URL);
  if (!res.ok) {
    let msg = `MCA Deckhand Testimonial form: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.hint) msg = body.hint;
      else if (body?.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }

  const templateBytes = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      const body = JSON.parse(new TextDecoder().decode(templateBytes));
      throw new Error(body?.error || body?.hint || 'MCA form template returned an error.');
    } catch (e: any) {
      if (e?.message?.startsWith('MCA ')) throw e;
      throw new Error('MCA form template is not available. Please add MSN_1858-Deckhand-Testimonial.pdf to public/forms/.');
    }
  }

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(templateBytes);
  } catch (e) {
    throw new Error('The MCA Deckhand Testimonial template PDF could not be loaded. Ensure MSN_1858-Deckhand-Testimonial.pdf in public/forms/ is a valid PDF.');
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  if (pages.length < 1) throw new Error(`Template PDF has ${pages.length} pages; expected at least 1.`);

  const black = rgb(0, 0, 0);
  const red = rgb(1, 0, 0);

  const safe = (v?: string | null, fallback = '') => (v ?? '').trim() || fallback;
  const formatDateLocal = (dateStr: string | null | undefined, fmt: 'DD/MM/YYYY' | 'DD MMMM YYYY' = 'DD/MM/YYYY') => {
    if (dateStr == null || dateStr === '') return '';
    const raw = String(dateStr).trim();
    try {
      let d: Date;
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        d = parse(raw.slice(0, 10), 'yyyy-MM-dd', new Date());
      } else {
        d = parseISO(raw);
      }
      if (!isValid(d) || Number.isNaN(d.getTime())) return '';
      return fmt === 'DD/MM/YYYY' ? format(d, 'dd/MM/yyyy') : format(d, 'dd MMMM yyyy');
    } catch {
      return '';
    }
  };

  // A4 portrait
  const A4_PORTRAIT = { w: 595.28, h: 841.89 };

  // WinAnsi cannot encode newlines/tabs (0x000a etc); replace with space before drawing
  const winAnsiSafe = (s: string) => String(s ?? '').replace(/\r\n|\r|\n|\t/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Helper functions (similar to Nav Watch generator)
  const X = (page: any, base: { w: number; h: number }, x: number) => x;
  const Y = (page: any, base: { w: number; h: number }, top: number) => base.h - top;
  const W = (page: any, base: { w: number; h: number }, w: number) => w;

  const drawText = (
    page: any,
    base: { w: number; h: number },
    text: string,
    x: number,
    top: number,
    opts?: { maxW?: number; size?: number; font?: PDFFont; bold?: boolean }
  ) => {
    const sanitized = winAnsiSafe(text);
    if (!sanitized) return;
    const px = X(page, base, x);
    const py = Y(page, base, top);
    const size = opts?.size || 10;
    const useFont = opts?.font || (opts?.bold ? fontBold : font);
    const maxW = opts?.maxW;

    if (maxW) {
      const words = sanitized.split(' ');
      let line = '';
      let y = py;
      words.forEach((word) => {
        const testLine = line + (line ? ' ' : '') + word;
        const testWidth = useFont.widthOfTextAtSize(testLine, size);
        if (testWidth > maxW && line) {
          page.drawText(line, { x: px, y, size, font: useFont, color: black });
          line = word;
          y -= size + 2;
        } else {
          line = testLine;
        }
      });
      if (line) {
        page.drawText(line, { x: px, y, size, font: useFont, color: black });
      }
      return;
    }

    page.drawText(sanitized, { x: px, y: py, size, font: useFont, color: black });
  };

  const debugMark = (page: any, base: { w: number; h: number }, label: string, x: number, top: number) => {
    if (!opts?.debug) return;
    const px = X(page, base, x);
    const py = Y(page, base, top);
    page.drawLine({ start: { x: px - 6, y: py }, end: { x: px + 6, y: py }, thickness: 0.8, color: red });
    page.drawLine({ start: { x: px, y: py - 6 }, end: { x: px, y: py + 6 }, thickness: 0.8, color: red });
    page.drawText(label, { x: px + 8, y: py + 2, size: 6, font, color: red });
  };

  const drawSignatureDataUrl = async (
    page: any,
    base: { w: number; h: number },
    dataUrl: string | null,
    x: number,
    top: number,
    boxW: number,
    boxH: number
  ) => {
    if (!dataUrl) return;
    try {
      const fmt = dataUrl.toLowerCase().includes('image/jpeg') || dataUrl.toLowerCase().includes('image/jpg') ? 'jpg' : 'png';
      const imgBytes = await fetch(dataUrl).then(r => r.arrayBuffer());
      const img = fmt === 'jpg' ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);

      const px = X(page, base, x);
      const pyTop = Y(page, base, top);
      const bw = W(page, base, boxW);
      const bh = W(page, base, boxH);

      const scale = Math.min(bw / img.width, bh / img.height);
      const w = img.width * scale;
      const h = img.height * scale;

      page.drawImage(img, {
        x: px,
        y: pyTop - bh + (bh - h) / 2,
        width: w,
        height: h,
      });
    } catch (e) {
      console.warn('Could not draw signature image:', e);
    }
  };

  // ─── EDIT COORDINATES HERE: MCA Deckhand Testimonial (MSN_1858-Deckhand-Testimonial.pdf) ───
  // Coordinates are in PDF points (1/72 inch). x = distance from left edge; top = distance from TOP of page.
  // With debug on, red crosshairs + labels show each position. Adjust values below to match your template.
  const COORDS = {
    // Page 1 - Company and Personal Details
    companyName: { x: 190, top: 185 },
    companyAddress: { x: 190, top: 200 },
    contactTel: { x: 250, top: 267 },
    contactEmail: { x: 250, top: 287 },
    
    // Personal Details
    fullName: { x: 275, top: 340 },
    dateOfBirth: { x: 275, top: 360 },
    dischargeBook: { x: 275, top: 380 },
    
    // Vessel Details
    vesselName: { x: 190, top: 415 },
    vesselType: { x: 190, top: 435 },
    imoNumber: { x: 455, top: 415 },
    grossTonnage: { x: 455, top: 435 },
    dateJoining: { x: 235, top: 453 },
    dateDischarge: { x: 455, top: 453 },
    
    // Service Days
    actualSeagoingDays: { x: 240, top: 505 },
    standbyDays: { x: 240, top: 517 },
    yardDays: { x: 240, top: 531 },
    
    // Comments (Page 2)
    conduct: { x: 140, top: 80, page: 2 },
    ability: { x: 140, top: 120, page: 2 },
    generalComments: { x: 140, top: 160, page: 2 },
    watchDays: { x: 240, top: 700, page: 1 }, // Watch days count on page 2
    
    // Standby Service Table A (Page 2)
    standbyTableTitle: { x: 25, top: 393, page: 2 },
    standbyTableStartY: { top: 340, page: 2 },
    standbyTableRowHeight: 14.5,
    standbyTableCol1: { x: 60 }, // Passage start date
    standbyTableCol2: { x: 170 }, // Passage end date
    standbyTableCol3: { x: 320 }, // Standby days
    standbyTableCol4: { x: 390 }, // Master signature
    standbyTableTotal: { x: 280, top: 525, page: 2 }, // Total row position
    
    // Master Details (Page 3)
    masterName: { x: 165, top: 575, page: 2 },
    masterPosition: { x: 165, top: 605, page: 2 },
    masterCoC: { x: 165, top: 632, page: 2 },
    masterIssuingAdmin: { x: 165, top: 658, page: 2 },
    masterSignature: { x: 165, top: 695, w: 150, h: 50, page: 2 },
    masterDate: { x: 165, top: 720, page: 2 },
  };

  const page1 = pages[0];
  const page2 = pages.length > 1 ? pages[1] : null;
  const page3 = pages.length > 2 ? pages[2] : null;
  const base = A4_PORTRAIT;

  // Debug marks
  if (opts?.debug) {
    Object.entries(COORDS).forEach(([k, v]: any) => {
      if (v?.x != null && v?.top != null) {
        const targetPage = v.page === 2 ? page2 : v.page === 3 ? page3 : page1;
        if (targetPage) {
          debugMark(targetPage, base, `deckhand.${k}`, v.x, v.top);
        }
      }
    });
  }

  const fullName = `${safe(userProfile.firstName)} ${safe(userProfile.lastName)}`.trim() || safe(userProfile.username);
  const dateOfBirth = formatDateDdMmYyyyForPdf(getDateOfBirthRawFromUserProfile(userProfile));
  const dateJoining = formatDateLocal(testimonial.start_date, 'DD/MM/YYYY');
  const dateDischarge = formatDateLocal(testimonial.end_date, 'DD/MM/YYYY');
  const upDeck = userProfile as TestimonialPDFData['userProfile'] & { discharge_book_number?: string | null };

  // Company Details
  drawText(page1, base, safe(companyDetails?.name), COORDS.companyName.x, COORDS.companyName.top);
  const addressLines = (companyDetails?.address ?? '').split(/\r\n|\r|\n/).map((l: string) => l.trim()).filter(Boolean);
  const addressLineHeight = 12;
  addressLines.forEach((line: string, i: number) => {
    drawText(page1, base, line, COORDS.companyAddress.x, COORDS.companyAddress.top + i * addressLineHeight, { size: 10 });
  });
  // Contact details parsing (assuming format like "Tel: xxx Email: yyy")
  const contactDetails = safe(companyDetails?.contactDetails);
  const telMatch = contactDetails.match(/Tel[:\s]+([^\s]+)/i);
  const emailMatch = contactDetails.match(/Email[:\s]+([^\s]+)/i);
  if (telMatch) drawText(page1, base, telMatch[1], COORDS.contactTel.x, COORDS.contactTel.top);
  if (emailMatch) drawText(page1, base, emailMatch[1], COORDS.contactEmail.x, COORDS.contactEmail.top);

  // Personal Details
  drawText(page1, base, fullName, COORDS.fullName.x, COORDS.fullName.top);
  drawText(page1, base, dateOfBirth, COORDS.dateOfBirth.x, COORDS.dateOfBirth.top);
  drawText(page1, base, safe(userProfile.dischargeBookNumber ?? upDeck.discharge_book_number), COORDS.dischargeBook.x, COORDS.dischargeBook.top);

  // Vessel Details
  drawText(page1, base, safe(vessel.name), COORDS.vesselName.x, COORDS.vesselName.top);
  drawText(page1, base, safe(formatVesselTypeForDisplay(vessel.type, '')), COORDS.vesselType.x, COORDS.vesselType.top);
  drawText(page1, base, safe(vessel.officialNumber), COORDS.imoNumber.x, COORDS.imoNumber.top);
  drawText(page1, base, vessel.gross_tonnage?.toString() || '', COORDS.grossTonnage.x, COORDS.grossTonnage.top);
  drawText(page1, base, dateJoining, COORDS.dateJoining.x, COORDS.dateJoining.top);
  drawText(page1, base, dateDischarge, COORDS.dateDischarge.x, COORDS.dateDischarge.top);

  // Service days: use stored standby_days so page 1 matches crew UI / DB (period rows are illustrative detail)
  const displayStandbyDays = Math.round(Number(testimonial.standby_days ?? 0));
  drawText(page1, base, testimonial.at_sea_days.toString(), COORDS.actualSeagoingDays.x, COORDS.actualSeagoingDays.top);
  drawText(page1, base, displayStandbyDays.toString(), COORDS.standbyDays.x, COORDS.standbyDays.top);
  drawText(page1, base, testimonial.yard_days.toString(), COORDS.yardDays.x, COORDS.yardDays.top);

  // Comments (Page 2)
  if (page2) {
    drawText(page2, base, safe(testimonial.captain_comment_conduct), COORDS.conduct.x, COORDS.conduct.top, { maxW: 400 });
    drawText(page2, base, safe(testimonial.captain_comment_ability), COORDS.ability.x, COORDS.ability.top, { maxW: 400 });
    drawText(page2, base, safe(testimonial.captain_comment_general), COORDS.generalComments.x, COORDS.generalComments.top, { maxW: 400 });
    
    // Watch Days - calculate from date range if watch dates are available
    // Only display if watch days > 0
    const watchDays = (testimonial as any).watch_days ?? 0;
    if (watchDays > 0) {
      drawText(page2, base, watchDays.toString(), COORDS.watchDays.x, COORDS.watchDays.top);
    }
    
    // Table A: Standby Service (if standby periods are available)
    // Rows are filled top-to-bottom: first row at tableStartY, next at tableStartY + rowHeight, etc.
    if (data.standbyPeriods && data.standbyPeriods.length > 0) {
      const tableStartY = COORDS.standbyTableStartY.top;
      const rowHeight = COORDS.standbyTableRowHeight;
      const totalRowTop = COORDS.standbyTableTotal.top;
      
      const totalStandbyDays = displayStandbyDays;
      
      // Convert total days to months and days (assuming 30 days per month)
      const months = Math.floor(totalStandbyDays / 30);
      const days = totalStandbyDays % 30;
      const totalText = months > 0 
        ? `${months} ${months === 1 ? 'month' : 'months'} and ${days} ${days === 1 ? 'day' : 'days'}`
        : `${days} ${days === 1 ? 'day' : 'days'}`;
      
      // Table rows: oldest at top, most recent at bottom (sorted by passage start date ascending).
      const signatureDataUrl = testimonial.captain_signature || captainProfile?.signature;
      const periodsOldestFirst = [...data.standbyPeriods].sort((a, b) => {
        const dateA = new Date(a.passageStartDate).getTime();
        const dateB = new Date(b.passageStartDate).getTime();
        return dateA - dateB;
      });
      for (let index = 0; index < periodsOldestFirst.length; index++) {
        const period = periodsOldestFirst[index];
        const currentY = tableStartY + index * rowHeight;
        if (currentY >= totalRowTop - 5) break; // Stop before overlapping the total row
        
        const passageStart = formatDateLocal(period.passageStartDate, 'DD/MM/YYYY');
        const passageEnd = formatDateLocal(period.passageEndDate, 'DD/MM/YYYY');
        const standbyDays = period.standbyDays.toString();
        
        drawText(page2, base, passageStart, COORDS.standbyTableCol1.x, currentY, { size: 9 });
        drawText(page2, base, passageEnd, COORDS.standbyTableCol2.x, currentY, { size: 9 });
        drawText(page2, base, standbyDays, COORDS.standbyTableCol3.x, currentY, { size: 9 });
        
        if (signatureDataUrl) {
          try {
            await drawSignatureDataUrl(page2, base, signatureDataUrl, COORDS.standbyTableCol4.x, currentY, 60, 15);
          } catch (e) {
            console.warn('Could not draw signature in standby table:', e);
          }
        }
      }
      
      // Add total row at fixed coordinates - display as months and days
      drawText(page2, base, totalText, COORDS.standbyTableTotal.x, COORDS.standbyTableTotal.top, { size: 9, bold: true });
    }
  }

  // Master Details (Page 3)
  if (page3) {
    const masterName = captainProfile 
      ? `${safe(captainProfile.firstName)} ${safe(captainProfile.lastName)}`.trim()
      : safe(testimonial.captain_name);
    drawText(page3, base, masterName, COORDS.masterName.x, COORDS.masterName.top);
    drawText(page3, base, safe(testimonial.captain_position || captainProfile?.position), COORDS.masterPosition.x, COORDS.masterPosition.top);
    // CoC number and issuing admin would need to be added to captainProfile or testimonial
    drawText(page3, base, '', COORDS.masterCoC.x, COORDS.masterCoC.top);
    drawText(page3, base, '', COORDS.masterIssuingAdmin.x, COORDS.masterIssuingAdmin.top);
    
    // Signature
    const signatureDataUrl = testimonial.captain_signature || captainProfile?.signature;
    if (signatureDataUrl) {
      await drawSignatureDataUrl(page3, base, signatureDataUrl, COORDS.masterSignature.x, COORDS.masterSignature.top, COORDS.masterSignature.w, COORDS.masterSignature.h);
    }
    
    // Date
    const approvedDate = testimonial.approved_at || testimonial.signoff_used_at;
    if (approvedDate) {
      drawText(page3, base, formatDateLocal(approvedDate, 'DD/MM/YYYY'), COORDS.masterDate.x, COORDS.masterDate.top);
    }
  }

  if (data.receiptData) {
    const page = pdfDoc.addPage([A4_PORTRAIT.w, A4_PORTRAIT.h]);
    const { w: W, h: H } = A4_PORTRAIT;
  
    // Brand styling
    const NAVY = rgb(0.06, 0.14, 0.26);
    const ACCENT = rgb(0.12, 0.45, 0.95);
    const INK = rgb(0.10, 0.10, 0.12);
    const MUTED = rgb(0.42, 0.45, 0.52);
    const LINE = rgb(0.86, 0.88, 0.92);
    const WHITE = rgb(1, 1, 1);
  
    const M = 50; // margins
    const headerH = 88;
    const COL_GAP = 20; // gap between columns
  
    // ===== Data =====
    const docId = data.receiptData.documentId || testimonial.id;
    const refCode = testimonial.testimonial_code || data.receiptData.sjCode || 'N/A';
  
    const generatedAt = data.receiptData.generatedAt
      ? format(new Date(data.receiptData.generatedAt), 'dd MMM yyyy HH:mm:ss')
      : format(new Date(), 'dd MMM yyyy HH:mm:ss');
  
    const safeInt = (n: any) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    };
  
    // ===== Helpers =====
    const t = (
      text: string,
      x: number,
      y: number,
      size: number,
      bold = false,
      color = INK,
    ) => {
      page.drawText(String(text ?? ''), {
        x,
        y,
        size,
        font: bold ? fontBold : font,
        color,
      });
    };
  
    const wrapText = (text: string, maxWidth: number, size: number) => {
      if (!text) return ['N/A'];
      const words = String(text).split(' ');
      const lines: string[] = [];
      let current = '';
  
      for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) {
          current = test;
        } else {
          if (current) lines.push(current);
            current = w;
          }
        }
      if (current) lines.push(current);
      return lines;
    };
  
    const textWidth = (text: string, size: number, bold = false) =>
      (bold ? fontBold : font).widthOfTextAtSize(String(text ?? ''), size);
  
    // ===== Branded Header =====
    await drawSeaJourneyReceiptHeader(pdfDoc, page, {
      pageWidth: W,
      pageHeight: H,
      font,
      fontBold,
      documentTypeLine: 'MCA Testimonial',
      margin: M,
      headerH,
    });

    // ===== Authentication Code Display =====
    const codeDisplay = refCode.startsWith('SJ-') ? refCode : `SJ-${refCode}`;
    const panelTopY = H - headerH - 30;
    const panelBottomY = await drawSeaJourneyVerificationPanel(pdfDoc, page, {
      x: M,
      y: panelTopY,
      width: W - 2 * M,
      code: codeDisplay,
      codeType: 'sj',
      font,
      fontBold,
      ribbonLabel: 'Verified Sea Service Record',
    });

    let y = panelBottomY - 25;
  
    // ===== Content - Professional Two Column Layout =====
    const colW = (W - 2 * M - COL_GAP) / 2;
    const labelW = 130; // fixed width for labels
    const valueW = colW - labelW - 12; // remaining width for values
  
    const addRow = (label: string, value: string | number | null | undefined, col: 'left' | 'right' = 'left') => {
      const x = col === 'left' ? M : M + colW + COL_GAP;
      const valueStr = value !== null && value !== undefined ? String(value) : 'N/A';
      
      // Label on left (professional styling)
      t(label, x, y, 8.5, true, MUTED);
      
      // Value on right (within same column)
      const valueX = x + labelW;
      const lines = wrapText(valueStr, valueW, 9.5);
      lines.forEach((line, i) => {
        t(line, valueX, y - i * 11.5, 9.5, false, INK);
      });
      
      y -= Math.max(11.5, lines.length * 11.5) + 5; // consistent spacing
    };
  
    const addSection = (title: string) => {
      // Section divider
      page.drawLine({
        start: { x: M, y: y + 3 },
        end: { x: W - M, y: y + 3 },
        thickness: 0.5,
        color: LINE,
      });
      y -= 12; // More spacing below the line
      t(title, M, y, 10.5, true, INK);
      y -= 18;
    };
  
    // Document Information
    addSection('Document Information');
    addRow('Document ID', docId, 'left');
    addRow('Generated', generatedAt, 'left');
    y -= 10;
  
    // Seafarer Information (left column)
    addSection('Seafarer Information');
    addRow('Name', fullName || 'N/A', 'left');
    addRow('Date of Birth', dateOfBirth || 'N/A', 'left');
    addRow('Position', safe(userProfile.position) || 'N/A', 'left');
    addRow('Email', userProfile.email || 'N/A', 'left');
    y -= 10;
  
    // Vessel Information (left column)
    addSection('Vessel Information');
    addRow('Vessel Name', safe(vessel.name) || 'N/A', 'left');
    addRow('Vessel Type', formatVesselTypeForDisplay(vessel.type, 'N/A') || 'N/A', 'left');
    addRow('Flag State', safe(vessel.flag || vessel.flag_state) || 'N/A', 'left');
    addRow('IMO / Official Number', safe(vessel.imo) || safe(vessel.officialNumber) || 'N/A', 'left');
    addRow('Gross Tonnage', vessel.gross_tonnage?.toString() || 'N/A', 'left');
    y -= 10;
  
    // Sea Service Summary (all on left)
    addSection('Sea Service Summary');
    addRow('Date Range', `${formatDateLocal(testimonial.start_date, 'DD/MM/YYYY')} – ${formatDateLocal(testimonial.end_date, 'DD/MM/YYYY')}`, 'left');
    addRow('Total Days', safeInt(testimonial.total_days ?? 0), 'left');
    addRow('At Sea Days', safeInt(testimonial.at_sea_days), 'left');
    addRow('Standby Days', safeInt(displayStandbyDays), 'left');
    addRow('Yard Days', safeInt(testimonial.yard_days), 'left');
    addRow('Leave Days', safeInt(testimonial.leave_days ?? 0), 'left');
    y -= 12;
  
    // Disclaimer
    t(
      'Figures shown are generated from the approved SeaJourney record and are provided for reference only.',
      M,
      y,
      8,
      false,
      MUTED,
    );
    y -= 30;
  
    // ===== Footer at Bottom =====
    const footerY = 30;
    page.drawLine({
      start: { x: M, y: footerY + 20 },
      end: { x: W - M, y: footerY + 20 },
      thickness: 1,
      color: LINE,
    });
    t('SeaJourney • Supporting document (not part of the MCA form)', M, footerY, 8, false, MUTED);
    t(`Reference: ${refCode}`, W - M - textWidth(`Reference: ${refCode}`, 8, true), footerY, 8, true, MUTED);
  }
  
  
  
  

  const pdfBytes = await pdfDoc.save();

  // Output modes
  if (output === 'blob') {
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }
  if (output === 'newtab') {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return;
  }

  // Download
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MCA_Deckhand_Testimonial_${fullName.replace(/\s+/g, '_')}_${formatDateLocal(testimonial.start_date, 'DD/MM/YYYY')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate MCA Officer Testimonial PDF
 * Fills out the MCA Officer Testimonial form with testimonial data
 */
export async function generateMCAOfficerTestimonial(
  data: TestimonialPDFData,
  output: TestimonialPDFOutput = 'download',
  opts?: { debug?: boolean }
) {
  // Debug: pass { debug: true } to draw red crosshairs + labels at each field position (default off)
  const debug = opts?.debug === true;
  opts = { ...opts, debug };

  const { testimonial, userProfile, vessel, captainProfile, companyDetails } = data;

  const API_BASE_URL =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

  const MCA_FORM_API_URL = `${API_BASE_URL}/api/mca-form/testimonial-officer`;

  const res = await fetch(MCA_FORM_API_URL);
  if (!res.ok) {
    let msg = `MCA Officer Testimonial form: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.hint) msg = body.hint;
      else if (body?.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }

  const templateBytes = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      const body = JSON.parse(new TextDecoder().decode(templateBytes));
      throw new Error(body?.error || body?.hint || 'MCA form template returned an error.');
    } catch (e: any) {
      if (e?.message?.startsWith('MCA ')) throw e;
      throw new Error('MCA form template is not available. Please add MSN_1858-Officer-Testimonial.pdf to public/forms/.');
    }
  }

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(templateBytes);
  } catch (e) {
    throw new Error('The MCA Officer Testimonial template PDF could not be loaded. Ensure MSN_1858-Officer-Testimonial.pdf in public/forms/ is a valid PDF.');
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  if (pages.length < 1) throw new Error(`Template PDF has ${pages.length} pages; expected at least 1.`);

  const black = rgb(0, 0, 0);
  const red = rgb(1, 0, 0);

  const safe = (v?: string | null, fallback = '') => (v ?? '').trim() || fallback;
  const formatDateLocal = (dateStr: string | null | undefined, fmt: 'DD/MM/YYYY' | 'DD MMMM YYYY' = 'DD/MM/YYYY') => {
    if (dateStr == null || dateStr === '') return '';
    const raw = String(dateStr).trim();
    try {
      let d: Date;
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        d = parse(raw.slice(0, 10), 'yyyy-MM-dd', new Date());
      } else {
        d = parseISO(raw);
      }
      if (!isValid(d) || Number.isNaN(d.getTime())) return '';
      return fmt === 'DD/MM/YYYY' ? format(d, 'dd/MM/yyyy') : format(d, 'dd MMMM yyyy');
    } catch {
      return '';
    }
  };

  // A4 portrait
  const A4_PORTRAIT = { w: 595.28, h: 841.89 };

  // WinAnsi cannot encode newlines/tabs; replace with space before drawing
  const winAnsiSafe = (s: string) => String(s ?? '').replace(/\r\n|\r|\n|\t/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Helper functions (same as deckhand)
  const X = (page: any, base: { w: number; h: number }, x: number) => x;
  const Y = (page: any, base: { w: number; h: number }, top: number) => base.h - top;
  const W = (page: any, base: { w: number; h: number }, w: number) => w;

  const drawText = (
    page: any,
    base: { w: number; h: number },
    text: string,
    x: number,
    top: number,
    opts?: { maxW?: number; size?: number; font?: PDFFont; bold?: boolean }
  ) => {
    const sanitized = winAnsiSafe(text);
    if (!sanitized) return;
    const px = X(page, base, x);
    const py = Y(page, base, top);
    const size = opts?.size || 10;
    const useFont = opts?.font || (opts?.bold ? fontBold : font);
    const maxW = opts?.maxW;

    if (maxW) {
      const words = sanitized.split(' ');
      let line = '';
      let y = py;
      words.forEach((word) => {
        const testLine = line + (line ? ' ' : '') + word;
        const testWidth = useFont.widthOfTextAtSize(testLine, size);
        if (testWidth > maxW && line) {
          page.drawText(line, { x: px, y, size, font: useFont, color: black });
          line = word;
          y -= size + 2;
        } else {
          line = testLine;
        }
      });
      if (line) {
        page.drawText(line, { x: px, y, size, font: useFont, color: black });
      }
      return;
    }

    page.drawText(sanitized, { x: px, y: py, size, font: useFont, color: black });
  };

  const debugMark = (page: any, base: { w: number; h: number }, label: string, x: number, top: number) => {
    if (!opts?.debug) return;
    const px = X(page, base, x);
    const py = Y(page, base, top);
    page.drawLine({ start: { x: px - 6, y: py }, end: { x: px + 6, y: py }, thickness: 0.8, color: red });
    page.drawLine({ start: { x: px, y: py - 6 }, end: { x: px, y: py + 6 }, thickness: 0.8, color: red });
    page.drawText(label, { x: px + 8, y: py + 2, size: 6, font, color: red });
  };

  const drawSignatureDataUrl = async (
    page: any,
    base: { w: number; h: number },
    dataUrl: string | null,
    x: number,
    top: number,
    boxW: number,
    boxH: number
  ) => {
    if (!dataUrl) return;
    try {
      const fmt = dataUrl.toLowerCase().includes('image/jpeg') || dataUrl.toLowerCase().includes('image/jpg') ? 'jpg' : 'png';
      const imgBytes = await fetch(dataUrl).then(r => r.arrayBuffer());
      const img = fmt === 'jpg' ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);

      const px = X(page, base, x);
      const pyTop = Y(page, base, top);
      const bw = W(page, base, boxW);
      const bh = W(page, base, boxH);

      const scale = Math.min(bw / img.width, bh / img.height);
      const w = img.width * scale;
      const h = img.height * scale;

      page.drawImage(img, {
        x: px,
        y: pyTop - bh + (bh - h) / 2,
        width: w,
        height: h,
      });
    } catch (e) {
      console.warn('Could not draw signature image:', e);
    }
  };

  // ─── EDIT COORDINATES HERE: MCA Officer Testimonial (MSN_1858-Officer-Testimonial.pdf) ───
  // Copied from deckhand coordinates; officer has extra "capacity" field.
  const COORDS = {
    // Page 1 - Company and Personal Details
    companyName: { x: 190, top: 160 },
    companyAddress: { x: 190, top: 173 },
    contactTel: { x: 250, top: 243 },
    contactEmail: { x: 250, top: 263 },
    
    // Personal Details
    fullName: { x: 275, top: 305 },
    dateOfBirth: { x: 275, top: 325 },
    capacity: { x: 275, top: 345 }, // Officer only: Master/Chief Mate/OOW
    dischargeBook: { x: 275, top: 365 },
    
    // Vessel Details
    vesselName: { x: 190, top: 403 },
    vesselType: { x: 190, top: 422 },
    imoNumber: { x: 455, top: 403 },
    grossTonnage: { x: 455, top: 422 },
    dateJoining: { x: 230, top: 440 },
    dateDischarge: { x: 455, top: 440 },
    
    // Service Days
    actualSeagoingDays: { x: 240, top: 493 },
    standbyDays: { x: 240, top: 505 },
    yardDays: { x: 240, top: 518 },
    
    // Comments (Page 2)
    conduct: { x: 140, top: 80, page: 2 },
    ability: { x: 140, top: 120, page: 2 },
    generalComments: { x: 140, top: 160, page: 2 },
    watchDays: { x: 240, top: 690, page: 1 },
    
    // Standby Service Table A (Page 2) — match deckhand layout
    standbyTableTitle: { x: 25, top: 393, page: 2 },
    standbyTableStartY: { top: 364, page: 2 },
    standbyTableRowHeight: 14.5,
    standbyTableCol1: { x: 60 },
    standbyTableCol2: { x: 170 },
    standbyTableCol3: { x: 320 },
    standbyTableCol4: { x: 390 },
    standbyTableTotal: { x: 280, top: 535, page: 2 },
    
    // Master Details (Page 3)
    masterName: { x: 165, top: 575, page: 2 },
    masterPosition: { x: 165, top: 605, page: 2 },
    masterCoC: { x: 165, top: 632, page: 2 },
    masterIssuingAdmin: { x: 165, top: 658, page: 2 },
    masterSignature: { x: 165, top: 695, w: 150, h: 50, page: 2 },
    masterDate: { x: 165, top: 720, page: 2 },
  };

  const page1 = pages[0];
  const page2 = pages.length > 1 ? pages[1] : null;
  const page3 = pages.length > 2 ? pages[2] : null;
  const base = A4_PORTRAIT;

  // Debug marks
  if (opts?.debug) {
    Object.entries(COORDS).forEach(([k, v]: any) => {
      if (v?.x != null && v?.top != null) {
        const targetPage = v.page === 2 ? page2 : v.page === 3 ? page3 : page1;
        if (targetPage) {
          debugMark(targetPage, base, `officer.${k}`, v.x, v.top);
        }
      }
    });
  }

  const fullName = `${safe(userProfile.firstName)} ${safe(userProfile.lastName)}`.trim() || safe(userProfile.username);
  const dateOfBirth = formatDateDdMmYyyyForPdf(getDateOfBirthRawFromUserProfile(userProfile));
  const dateJoining = formatDateLocal(testimonial.start_date, 'DD/MM/YYYY');
  const dateDischarge = formatDateLocal(testimonial.end_date, 'DD/MM/YYYY');
  const upOff = userProfile as TestimonialPDFData['userProfile'] & { discharge_book_number?: string | null };
  
  // Determine capacity from position
  const position = safe(userProfile.position).toLowerCase();
  let capacity = '';
  if (position.includes('master') || position.includes('captain')) capacity = 'Master';
  else if (position.includes('chief mate') || position.includes('chief officer') || position.includes('first mate')) capacity = 'Chief Mate';
  else if (position.includes('oow') || position.includes('officer of the watch') || position.includes('watch')) capacity = 'OOW';
  else capacity = safe(userProfile.position);

  // Company Details
  drawText(page1, base, safe(companyDetails?.name), COORDS.companyName.x, COORDS.companyName.top);
  const addressLines = (companyDetails?.address ?? '').split(/\r\n|\r|\n/).map((l: string) => l.trim()).filter(Boolean);
  const addressLineHeight = 12;
  addressLines.forEach((line: string, i: number) => {
    drawText(page1, base, line, COORDS.companyAddress.x, COORDS.companyAddress.top + i * addressLineHeight, { size: 10 });
  });
  const contactDetails = safe(companyDetails?.contactDetails);
  const telMatch = contactDetails.match(/Tel[:\s]+([^\s]+)/i);
  const emailMatch = contactDetails.match(/Email[:\s]+([^\s]+)/i);
  if (telMatch) drawText(page1, base, telMatch[1], COORDS.contactTel.x, COORDS.contactTel.top);
  if (emailMatch) drawText(page1, base, emailMatch[1], COORDS.contactEmail.x, COORDS.contactEmail.top);

  // Personal Details
  drawText(page1, base, fullName, COORDS.fullName.x, COORDS.fullName.top);
  drawText(page1, base, dateOfBirth, COORDS.dateOfBirth.x, COORDS.dateOfBirth.top);
  drawText(page1, base, capacity, COORDS.capacity.x, COORDS.capacity.top);
  drawText(page1, base, safe(userProfile.dischargeBookNumber ?? upOff.discharge_book_number), COORDS.dischargeBook.x, COORDS.dischargeBook.top);

  // Vessel Details
  drawText(page1, base, safe(vessel.name), COORDS.vesselName.x, COORDS.vesselName.top);
  drawText(page1, base, safe(formatVesselTypeForDisplay(vessel.type, '')), COORDS.vesselType.x, COORDS.vesselType.top);
  drawText(page1, base, safe(vessel.officialNumber), COORDS.imoNumber.x, COORDS.imoNumber.top);
  drawText(page1, base, vessel.gross_tonnage?.toString() || '', COORDS.grossTonnage.x, COORDS.grossTonnage.top);
  drawText(page1, base, dateJoining, COORDS.dateJoining.x, COORDS.dateJoining.top);
  drawText(page1, base, dateDischarge, COORDS.dateDischarge.x, COORDS.dateDischarge.top);

  // Service days: use stored standby_days so page 1 matches crew UI / DB (period rows are illustrative detail)
  const displayStandbyDays = Math.round(Number(testimonial.standby_days ?? 0));
  drawText(page1, base, testimonial.at_sea_days.toString(), COORDS.actualSeagoingDays.x, COORDS.actualSeagoingDays.top);
  drawText(page1, base, displayStandbyDays.toString(), COORDS.standbyDays.x, COORDS.standbyDays.top);
  drawText(page1, base, testimonial.yard_days.toString(), COORDS.yardDays.x, COORDS.yardDays.top);

  // Comments (Page 2)
  if (page2) {
    drawText(page2, base, safe(testimonial.captain_comment_conduct), COORDS.conduct.x, COORDS.conduct.top, { maxW: 400 });
    drawText(page2, base, safe(testimonial.captain_comment_ability), COORDS.ability.x, COORDS.ability.top, { maxW: 400 });
    drawText(page2, base, safe(testimonial.captain_comment_general), COORDS.generalComments.x, COORDS.generalComments.top, { maxW: 400 });
    
    // Watch Days - calculate from date range if watch dates are available
    // Only display if watch days > 0
    const watchDays = (testimonial as any).watch_days ?? 0;
    if (watchDays > 0) {
      drawText(page2, base, watchDays.toString(), COORDS.watchDays.x, COORDS.watchDays.top);
    }
    
    // Table A: Standby Service (if standby periods are available)
    // Rows are filled top-to-bottom: first row at tableStartY, next at tableStartY + rowHeight, etc.
    if (data.standbyPeriods && data.standbyPeriods.length > 0) {
      const tableStartY = COORDS.standbyTableStartY.top;
      const rowHeight = COORDS.standbyTableRowHeight;
      const totalRowTop = COORDS.standbyTableTotal.top;
      
      const totalStandbyDays = displayStandbyDays;
      
      // Convert total days to months and days (assuming 30 days per month)
      const months = Math.floor(totalStandbyDays / 30);
      const days = totalStandbyDays % 30;
      const totalText = months > 0 
        ? `${months} ${months === 1 ? 'month' : 'months'} and ${days} ${days === 1 ? 'day' : 'days'}`
        : `${days} ${days === 1 ? 'day' : 'days'}`;
      
      // Table rows: oldest at top, most recent at bottom (sorted by passage start date ascending).
      const signatureDataUrl = testimonial.captain_signature || captainProfile?.signature;
      const periodsOldestFirst = [...data.standbyPeriods].sort((a, b) => {
        const dateA = new Date(a.passageStartDate).getTime();
        const dateB = new Date(b.passageStartDate).getTime();
        return dateA - dateB;
      });
      for (let index = 0; index < periodsOldestFirst.length; index++) {
        const period = periodsOldestFirst[index];
        const currentY = tableStartY + index * rowHeight;
        if (currentY >= totalRowTop - 5) break; // Stop before overlapping the total row
        
        const passageStart = formatDateLocal(period.passageStartDate, 'DD/MM/YYYY');
        const passageEnd = formatDateLocal(period.passageEndDate, 'DD/MM/YYYY');
        const standbyDays = period.standbyDays.toString();
        
        drawText(page2, base, passageStart, COORDS.standbyTableCol1.x, currentY, { size: 9 });
        drawText(page2, base, passageEnd, COORDS.standbyTableCol2.x, currentY, { size: 9 });
        drawText(page2, base, standbyDays, COORDS.standbyTableCol3.x, currentY, { size: 9 });
        
        if (signatureDataUrl) {
          try {
            await drawSignatureDataUrl(page2, base, signatureDataUrl, COORDS.standbyTableCol4.x, currentY, 60, 15);
          } catch (e) {
            console.warn('Could not draw signature in standby table:', e);
          }
        }
      }
      
      // Add total row at fixed coordinates - display as months and days
      drawText(page2, base, totalText, COORDS.standbyTableTotal.x, COORDS.standbyTableTotal.top, { size: 9, bold: true });
    }
  }

  // Master Details (Page 3)
  if (page3) {
    const masterName = captainProfile 
      ? `${safe(captainProfile.firstName)} ${safe(captainProfile.lastName)}`.trim()
      : safe(testimonial.captain_name);
    drawText(page3, base, masterName, COORDS.masterName.x, COORDS.masterName.top);
    drawText(page3, base, safe(testimonial.captain_position || captainProfile?.position), COORDS.masterPosition.x, COORDS.masterPosition.top);
    // CoC number and issuing admin would need to be added to captainProfile or testimonial
    drawText(page3, base, '', COORDS.masterCoC.x, COORDS.masterCoC.top);
    drawText(page3, base, '', COORDS.masterIssuingAdmin.x, COORDS.masterIssuingAdmin.top);
    
    // Signature
    const signatureDataUrl = testimonial.captain_signature || captainProfile?.signature;
    if (signatureDataUrl) {
      await drawSignatureDataUrl(page3, base, signatureDataUrl, COORDS.masterSignature.x, COORDS.masterSignature.top, COORDS.masterSignature.w, COORDS.masterSignature.h);
    }
    
    // Date
    const approvedDate = testimonial.approved_at || testimonial.signoff_used_at;
    if (approvedDate) {
      drawText(page3, base, formatDateLocal(approvedDate, 'DD/MM/YYYY'), COORDS.masterDate.x, COORDS.masterDate.top);
    }
  }

  // Add SeaJourney Receipt/Verification Page
  if (data.receiptData) {
    const page = pdfDoc.addPage([A4_PORTRAIT.w, A4_PORTRAIT.h]);
    const { w: W, h: H } = A4_PORTRAIT;
  
    // Brand styling
    const NAVY = rgb(0.06, 0.14, 0.26);
    const ACCENT = rgb(0.12, 0.45, 0.95);
    const INK = rgb(0.10, 0.10, 0.12);
    const MUTED = rgb(0.42, 0.45, 0.52);
    const LINE = rgb(0.86, 0.88, 0.92);
    const WHITE = rgb(1, 1, 1);
  
    const M = 50; // margins
    const headerH = 88;
    const COL_GAP = 20; // gap between columns
  
    // ===== Data =====
    const docId = data.receiptData.documentId || testimonial.id;
    const refCode = testimonial.testimonial_code || data.receiptData.sjCode || 'N/A';
  
    const generatedAt = data.receiptData.generatedAt
      ? format(new Date(data.receiptData.generatedAt), 'dd MMM yyyy HH:mm:ss')
      : format(new Date(), 'dd MMM yyyy HH:mm:ss');
  
    const safeInt = (n: any) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    };
  
    // ===== Helpers =====
    const t = (
      text: string,
      x: number,
      y: number,
      size: number,
      bold = false,
      color = INK,
    ) => {
      page.drawText(String(text ?? ''), {
        x,
        y,
        size,
        font: bold ? fontBold : font,
        color,
      });
    };
  
    const wrapText = (text: string, maxWidth: number, size: number) => {
      if (!text) return ['N/A'];
      const words = String(text).split(' ');
      const lines: string[] = [];
      let current = '';
  
      for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) {
          current = test;
        } else {
          if (current) lines.push(current);
            current = w;
          }
        }
      if (current) lines.push(current);
      return lines;
    };
  
    const textWidth = (text: string, size: number, bold = false) =>
      (bold ? fontBold : font).widthOfTextAtSize(String(text ?? ''), size);
  
    // ===== Branded Header =====
    await drawSeaJourneyReceiptHeader(pdfDoc, page, {
      pageWidth: W,
      pageHeight: H,
      font,
      fontBold,
      documentTypeLine: 'MCA Testimonial',
      margin: M,
      headerH,
    });

    // ===== Authentication Code Display =====
    const codeDisplay = refCode.startsWith('SJ-') ? refCode : `SJ-${refCode}`;
    const panelTopY = H - headerH - 30;
    const panelBottomY = await drawSeaJourneyVerificationPanel(pdfDoc, page, {
      x: M,
      y: panelTopY,
      width: W - 2 * M,
      code: codeDisplay,
      codeType: 'sj',
      font,
      fontBold,
      ribbonLabel: 'Verified Sea Service Record',
    });

    let y = panelBottomY - 25;
  
    // ===== Content - Professional Two Column Layout =====
    const colW = (W - 2 * M - COL_GAP) / 2;
    const labelW = 130; // fixed width for labels
    const valueW = colW - labelW - 12; // remaining width for values
  
    const addRow = (label: string, value: string | number | null | undefined, col: 'left' | 'right' = 'left') => {
      const x = col === 'left' ? M : M + colW + COL_GAP;
      const valueStr = value !== null && value !== undefined ? String(value) : 'N/A';
      
      // Label on left (professional styling)
      t(label, x, y, 8.5, true, MUTED);
      
      // Value on right (within same column)
      const valueX = x + labelW;
      const lines = wrapText(valueStr, valueW, 9.5);
      lines.forEach((line, i) => {
        t(line, valueX, y - i * 11.5, 9.5, false, INK);
      });
      
      y -= Math.max(11.5, lines.length * 11.5) + 5; // consistent spacing
    };
  
    const addSection = (title: string) => {
      // Section divider
      page.drawLine({
        start: { x: M, y: y + 3 },
        end: { x: W - M, y: y + 3 },
        thickness: 0.5,
        color: LINE,
      });
      y -= 12; // More spacing below the line
      t(title, M, y, 10.5, true, INK);
      y -= 18;
    };
  
    // Document Information
    addSection('Document Information');
    addRow('Document ID', docId, 'left');
    addRow('Generated', generatedAt, 'left');
    y -= 10;
  
    // Seafarer Information (left column)
    addSection('Seafarer Information');
    addRow('Name', fullName || 'N/A', 'left');
    addRow('Date of Birth', dateOfBirth || 'N/A', 'left');
    addRow('Position', safe(userProfile.position) || 'N/A', 'left');
    addRow('Email', userProfile.email || 'N/A', 'left');
    y -= 10;
  
    // Vessel Information (left column)
    addSection('Vessel Information');
    addRow('Vessel Name', safe(vessel.name) || 'N/A', 'left');
    addRow('Vessel Type', formatVesselTypeForDisplay(vessel.type, 'N/A') || 'N/A', 'left');
    addRow('Flag State', safe(vessel.flag || vessel.flag_state) || 'N/A', 'left');
    addRow('IMO / Official Number', safe(vessel.imo) || safe(vessel.officialNumber) || 'N/A', 'left');
    addRow('Gross Tonnage', vessel.gross_tonnage?.toString() || 'N/A', 'left');
    y -= 10;
  
    // Sea Service Summary (all on left)
    addSection('Sea Service Summary');
    addRow('Date Range', `${formatDateLocal(testimonial.start_date, 'DD/MM/YYYY')} – ${formatDateLocal(testimonial.end_date, 'DD/MM/YYYY')}`, 'left');
    addRow('Total Days', safeInt(testimonial.total_days ?? 0), 'left');
    addRow('At Sea Days', safeInt(testimonial.at_sea_days), 'left');
    addRow('Standby Days', safeInt(displayStandbyDays), 'left');
    addRow('Yard Days', safeInt(testimonial.yard_days), 'left');
    addRow('Leave Days', safeInt(testimonial.leave_days ?? 0), 'left');
    y -= 12;
  
    // Disclaimer
    t(
      'Figures shown are generated from the approved SeaJourney record and are provided for reference only.',
      M,
      y,
      8,
      false,
      MUTED,
    );
    y -= 30;
  
    // ===== Footer at Bottom =====
    const footerY = 30;
    page.drawLine({
      start: { x: M, y: footerY + 20 },
      end: { x: W - M, y: footerY + 20 },
      thickness: 1,
      color: LINE,
    });
    t('SeaJourney • Supporting document (not part of the MCA form)', M, footerY, 8, false, MUTED);
    t(`Reference: ${refCode}`, W - M - textWidth(`Reference: ${refCode}`, 8, true), footerY, 8, true, MUTED);
  }
  
  
  

  const pdfBytes = await pdfDoc.save();

  // Output modes
  if (output === 'blob') {
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }
  if (output === 'newtab') {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return;
  }

  // Download
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MCA_Officer_Testimonial_${fullName.replace(/\s+/g, '_')}_${formatDateLocal(testimonial.start_date, 'DD/MM/YYYY')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
