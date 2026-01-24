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
import { format, parse, differenceInHours, addDays } from 'date-fns';
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

export interface MCAWatchRatingApplicationData {
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
    margin: { left: 18, right: 18 },
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
  const dateOfBirth = userProfile.dateOfBirth
    ? format(parseDateOnly(userProfile.dateOfBirth), 'dd MMMM yyyy')
    : null;

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
    ['Vessel Type:', vessel.type || '—'],
    ['Official Number:', vessel.officialNumber || '—'],
    ['Flag State:', vessel.flag_state || '—'],
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
      rowH: 16, // Row spacing
      maxRows: 14,
      fontSize: 7.5,
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
        days: pageW * 0.82,       // Total days
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
      csName: { x: 110, top: 375, maxW: 420 },
      csAddr1: { x: 110, top: 397, maxW: 420 },
      csAddr2: { x: 110, top: 415, maxW: 420 },
      csTown: { x: 110, top: 433, maxW: 200 },
      csCounty: { x: 335, top: 433, maxW: 200 },
      csPost: { x: 110, top: 451, maxW: 200 },
      csCountry: { x: 335, top: 451, maxW: 200 },
      csTel: { x: 110, top: 469, maxW: 200 },
      csOcc: { x: 335, top: 469, maxW: 200 },
      csCapacity: { x: 215, top: 487, maxW: 330 },

      csSigLine: { x: 110, top: 540 },
      csDateLine: { x: 335, top: 540 },
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

  for (let i = 0; i < rowCount; i++) {
    const r = seaServiceRecords[i];
    const top = COORDS_BASE.p2.tableTop + i * COORDS_BASE.p2.rowH;
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
    drawText(page2, baseL, String(r.totalDays ?? ''), col.days, top, { size: fs });
    drawText(page2, baseL, String(r.daysAtSea ?? ''), col.seaDays, top, { size: fs });
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

  // ----------------------------
  // PAGE 6 (A4 portrait) payment tick
  // ----------------------------
  const page6 = pages[5];

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
