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
import { format, parse, differenceInHours } from 'date-fns';
import type { SeaTimeReportData } from '@/app/actions';

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
  };
  captainProfile?: {
    firstName?: string;
    lastName?: string;
    position?: string | null;
    email?: string;
    signature?: string | null; // Base64 encoded signature image
  } | null;
}

export type TestimonialPDFFormat = 'mca' | 'mlc' | 'pya' | 'seajourney';
export type TestimonialPDFOutput = 'download' | 'newtab' | 'blob';

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

/**
 * Parse a yyyy-MM-dd date safely as a "date-only".
 * Using noon avoids DST edge cases where midnight can shift the date.
 */
function parseDateOnly(dateStr: string): Date {
  const d = parse(dateStr, 'yyyy-MM-dd', new Date());
  d.setHours(12, 0, 0, 0);
  return d;
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

/* ========================================================================== */
/*                          SEA SERVICE TESTIMONIAL                           */
/* ========================================================================== */

export async function generateTestimonialPDF(
  data: TestimonialPDFData,
  pdfFormat: TestimonialPDFFormat = 'seajourney',
  output: TestimonialPDFOutput = 'download',
) {
  const doc = new jsPDF();
  const { testimonial, userProfile, vessel, captainProfile } = data;

  const fullName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;

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

  const dateOfBirth = userProfile.dateOfBirth
    ? format(parseDateOnly(userProfile.dateOfBirth), 'dd MMMM yyyy')
    : null;

  // Color scheme based on format
  const isMCATemplate = pdfFormat === 'mca';
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

  let currentY = 20;

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
      const logoDataURL = await loadLogoImage('/seajourney_logo_white.png');
      const logoWidth = 55;
      const logoHeight = 15;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.addImage(logoDataURL, 'PNG', logoX, headerY, logoWidth, logoHeight);
      headerY += logoHeight + 8;
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
  }

  const sectionHeaderHeight = 8;

  // ===== Part 1 – Seafarer's Details =====
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text("PART 1 – SEAFARER'S DETAILS", 18, currentY + 2);

  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);

  currentY += sectionHeaderHeight + 4;

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

  // ===== Part 2 – Service =====
  currentY = ensureSpace(doc, currentY, 60);

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

  if (vessel.flag_state) vesselRows.push(['Flag', safeText(vessel.flag_state)]);
  if (vessel.officialNumber) vesselRows.push(['Official No.', safeText(vessel.officialNumber)]);

  if (vessel.type) {
    const vesselTypeLabel =
      vessel.type === 'motor-yacht'
        ? 'M/Y'
        : vessel.type === 'sailing-yacht'
          ? 'S/Y'
          : vessel.type;
    vesselRows.push(['Type (M/Y, S/Y, other)', safeText(vesselTypeLabel)]);
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
    'support applications for sea service verification by recognised bodies (e.g. PYA, ' +
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

  // Signatory details box
  const signatoryBoxHeight = 20;
  const signatoryBoxWidth = pageWidth - 36;
  
  // Draw signatory details box
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);
  doc.rect(18, currentY, signatoryBoxWidth, signatoryBoxHeight);

  const padding = 3;
  let signatoryY = currentY + padding + 3;

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

  // Section 1: Signature (left)
  const signatureX = 18;
  const signatureY = sectionStartY;
  
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
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text("Ship's Stamp", stampX, stampY);

  // Calculate final Y position based on the tallest section (signature with box)
  const signatureSectionEnd = signatureBoxY + signatureBoxHeight + 6; // Box + text below
  const dateSectionEnd = dateTextY + 4; // Text + spacing
  const stampSectionEnd = stampY + 4; // Label only
  currentY = Math.max(signatureSectionEnd, dateSectionEnd, stampSectionEnd);

  // ===== Part 4 – Official Verification (optional) =====
  if (testimonial.official_body || testimonial.official_reference) {
    currentY = ensureSpace(doc, currentY + 8, 70);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text('PART 4 – OFFICIAL VERIFICATION (PYA / NAUTILUS / OTHER)', 18, currentY + 2);

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
  const formatName = pdfFormat.toUpperCase();

  const filename = `${startDateFilename} - ${endDateFilename} ${crewName} ${vesselName} testimonial ${formatName}.pdf`;

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

  const textDark: RGB = [30, 30, 30];
  const textGray: RGB = [100, 100, 100];
  const primaryBlue: RGB = [0, 29, 55];
  const borderColor: RGB = [200, 200, 200];
  const headerColor: RGB = [0, 29, 55];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const setFillColor = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

  // ===== HEADER =====
  const headerHeight = 35;
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  let currentY = 10;

  try {
    const logoData = await loadLogoImage('/seajourney_logo_white.png');
    doc.addImage(logoData, 'PNG', 14, currentY, 35, 8);
  } catch (error) {
    console.warn('Could not load logo:', error);
  }

  setTextColor([255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Sea Time Summary Report', pageWidth / 2, currentY + 4, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Overview of logged sea service for use as supporting documentation alongside formal testimonials.',
    pageWidth / 2,
    currentY + 10,
    { align: 'center' },
  );

  doc.setFontSize(8);
  doc.text(`Generated: ${generatedDate}`, pageWidth - 14, currentY + 4, { align: 'right' });

  currentY = headerHeight + 8;

  // ===== Seafarer Information =====
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Seafarer Information', 14, currentY);
  currentY += 4;

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
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ===== Vessel Information =====
  if (vesselDetails) {
    setTextColor(textDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Primary Vessel Information', 14, currentY);
    currentY += 4;

    const vesselRows: string[][] = [
      ['Vessel Name:', safeText(vesselDetails.name, 'Not specified')],
      ['Vessel Type:', safeText(vesselDetails.type, 'Not specified')],
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
      margin: { left: 14, right: 14 },
      tableLineColor: borderColor,
      tableLineWidth: 0.2,
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // ===== Summary Statistics =====
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Sea Time Summary', 14, currentY);
  currentY += 4;

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
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // ===== Service Records by Vessel (grouped) =====
  if (serviceRecords && serviceRecords.length > 0) {
    setTextColor(textDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Service Records by Vessel', 14, currentY);
    currentY += 6;

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
      doc.text(`Vessel: ${truncate(vesselName, 70, 'Unknown Vessel')}`, 14, currentY);
      currentY += 4;

      const dates = records.map((r) => r.date).sort();
      const start =
        dates[0] ? format(parseDateOnly(dates[0]), 'dd MMM yyyy') : 'N/A';
      const end =
        dates[dates.length - 1]
          ? format(parseDateOnly(dates[dates.length - 1]), 'dd MMM yyyy')
          : 'N/A';
      const days = records[0]?.totalDays || records.length;

      const vesselSummaryRows: string[][] = [
        ['Period:', `${start} to ${end}`],
        ['Total Days (this vessel):', `${days} days`],
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
        margin: { left: 14, right: 14 },
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
/*                          PASSAGE LOG BOOK EXPORT                           */
/* ========================================================================== */

export async function generatePassageLogPDF(data: PassageLogExportData) {
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

  const textDark: RGB = [30, 30, 30];
  const textGray: RGB = [100, 100, 100];
  const borderColor: RGB = [200, 200, 200];
  const headerColor: RGB = [0, 29, 55];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const setFillColor = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

  // ===== HEADER =====
  const headerHeight = 32;
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  let currentY = 10;

  try {
    const logoData = await loadLogoImage('/seajourney_logo_white.png');
    doc.addImage(logoData, 'PNG', 14, currentY, 35, 8);
  } catch (error) {
    console.warn('Could not load logo:', error);
  }

  setTextColor([255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Passage Log Extract', pageWidth / 2, currentY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    'For use as supporting documentation for sea service verification (e.g. MCA / PYA / Nautilus).',
    pageWidth / 2,
    currentY + 10,
    { align: 'center' },
  );

  const totalPassages = passages.length;
  const totalDistance =
    totalPassages > 0 ? passages.reduce((sum, p) => sum + (p.distance_nm || 0), 0) : 0;

  doc.setFontSize(8);
  doc.text(`Generated: ${generatedDate}`, pageWidth - 14, currentY + 4, { align: 'right' });
  doc.text(`Total passages: ${totalPassages}`, pageWidth - 14, currentY + 9, { align: 'right' });
  if (totalPassages > 0) {
    doc.text(`Total distance: ${totalDistance.toFixed(1)} NM`, pageWidth - 14, currentY + 14, {
      align: 'right',
    });
  }

  currentY = headerHeight + 6;

  // ===== INFO =====
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Report & Seafarer Information', 14, currentY);
  currentY += 4;

  const infoRows: string[][] = [
    ['Seafarer Name:', safeText(fullName, 'Not provided')],
    ['Email:', safeText(userProfile.email, 'Not provided')],
  ];

  if (filterInfo) {
    if (filterInfo.vesselName) infoRows.push(['Vessel Filter:', safeText(filterInfo.vesselName)]);
    if (filterInfo.startDate) infoRows.push(['From Date:', format(filterInfo.startDate, 'dd MMM yyyy')]);
    if (filterInfo.endDate) infoRows.push(['To Date:', format(filterInfo.endDate, 'dd MMM yyyy')]);
  }

  if (totalPassages > 0) {
    const avgDistance = totalDistance / totalPassages;
    infoRows.push(['Total Passages in Report:', totalPassages.toString()]);
    infoRows.push(['Total Distance (NM):', totalDistance.toFixed(1)]);
    infoRows.push(['Average Distance (NM):', avgDistance.toFixed(1)]);
  }

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: infoRows,
    styles: { fontSize: 9, cellPadding: { top: 1.5, right: 3, bottom: 1.5, left: 3 }, textColor: textDark },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55 },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // ===== TABLE =====
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('Passage Records (log-style extract)', 14, currentY);
  currentY += 4;

  if (passages.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    setTextColor(textGray);
    doc.text('No passages found for the selected filters.', 14, currentY + 4);
    doc.output('dataurlnewwindow');
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
      fillColor: headerColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      halign: 'left',
      valign: 'middle',
    },
    styles: {
      fontSize: 7.5,
      textColor: textDark,
      cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
      halign: 'left',
      valign: 'top',
      lineColor: [230, 230, 230],
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
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
    tableLineColor: [220, 220, 220],
    tableLineWidth: 0.2,
    showHead: 'everyPage',
    didDrawPage: (dataHook) => {
      const footerHeight = 16;
      const footerStartY = pageHeight - footerHeight;

      setFillColor(headerColor);
      doc.rect(0, footerStartY, pageWidth, footerHeight, 'F');

      const footerY = footerStartY + 5;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      setTextColor([255, 255, 255]);
      doc.text('www.seajourney.co.uk', 14, footerY);
      doc.text('www.seajourney.co.uk/verify', 14, footerY + 4);

      doc.setFont('helvetica', 'normal');
      setTextColor([220, 220, 220]);
      doc.text(
        'Electronic passage log extract – to be used in conjunction with signed sea service testimonials where required.',
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
  if (lastY < pageHeight - 24) {
    doc.setFontSize(7);
    setTextColor(textGray);
    doc.text(
      'Note: This document is an electronic extract of passage records maintained by the seafarer. ' +
        'For formal sea service verification, administrations and recognised organisations may also require ' +
        'signed testimonials, discharge books or company letters.',
      14,
      lastY + 5,
      { maxWidth: pageWidth - 28 },
    );
  }

  doc.output('dataurlnewwindow');
}
