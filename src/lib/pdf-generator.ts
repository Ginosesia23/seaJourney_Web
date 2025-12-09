import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse, differenceInHours } from 'date-fns';
import type { SeaTimeReportData } from '@/app/actions';

// Re-export the type for use in this file
type SeaTimeReportDataType = SeaTimeReportData;

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
    official_body: string | null;
    official_reference: string | null;
    notes: string | null;
    testimonial_code: string | null;
    status: 'draft' | 'pending_captain' | 'pending_official' | 'approved' | 'rejected';
    signoff_used_at: string | null;
    created_at: string;
    updated_at: string;
  };
  userProfile: {
    firstName?: string;
    lastName?: string;
    username: string;
    email: string;
  };
  vessel: {
    name: string;
    type: string | null;
    officialNumber?: string | null;
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

/**
 * Load PNG logo image for PDF from public folder
 */
function loadLogoImage(logoPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

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
        resolve(dataURL);
      } catch (error) {
        reject(new Error(`Failed to convert image to data URL: ${error}`));
      }
    };

    img.onerror = () => {
      reject(
        new Error(
          `Failed to load logo from ${logoPath}. Make sure the file exists in the public folder.`,
        ),
      );
    };

    // Set src after handlers are attached
    img.src = logoPath;

    // Handle case where image is already loaded (cached)
    if (img.complete) {
      img.onload(new Event('load') as any);
    }
  });
}

/* ========================================================================== */
/*                          SEA SERVICE TESTIMONIAL                           */
/* ========================================================================== */

export async function generateTestimonialPDF(data: TestimonialPDFData) {
  const doc = new jsPDF();
  const { testimonial, userProfile, vessel } = data;

  const fullName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;

  const startDate = format(
    parse(testimonial.start_date, 'yyyy-MM-dd', new Date()),
    'dd MMMM yyyy',
  );
  const endDate = format(
    parse(testimonial.end_date, 'yyyy-MM-dd', new Date()),
    'dd MMMM yyyy',
  );
  const generatedDate = format(new Date(), 'dd MMMM yyyy');

  // Get approved date - use signoff_used_at if approved, otherwise null
  const approvedDate =
    testimonial.status === 'approved' && testimonial.signoff_used_at
      ? format(new Date(testimonial.signoff_used_at), 'dd MMMM yyyy')
      : null;

  // Professional color scheme
  const textDark: [number, number, number] = [30, 30, 30];
  const textGray: [number, number, number] = [100, 100, 100];
  const primaryBlue: [number, number, number] = [46, 139, 192];
  const borderColor: [number, number, number] = [200, 200, 200];
  const headerColor: [number, number, number] = [12, 23, 33]; // #0c1721

  const setFillColor = (c: [number, number, number]) =>
    doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: [number, number, number]) =>
    doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: [number, number, number]) =>
    doc.setDrawColor(c[0], c[1], c[2]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ===== Header with colored background =====
  const headerHeight = 50;
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  let currentY = 12;

  // Load and add PNG logo to PDF
  try {
    const logoPath = '/seajourney_logo_white.png';
    const logoDataURL = await loadLogoImage(logoPath);

    const logoWidth = 45;
    const logoHeight = 12;
    const logoX = (pageWidth - logoWidth) / 2;

    doc.addImage(logoDataURL, 'PNG', logoX, currentY, logoWidth, logoHeight);
    currentY += logoHeight + 8;
  } catch (error) {
    console.error('Failed to load logo image:', error);
    // Fallback to text logo
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('SeaJourney', pageWidth / 2, currentY, { align: 'center' });
    currentY += 8;
  }

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Sea Service Testimonial', pageWidth / 2, currentY, {
    align: 'center',
  });
  currentY += 6;

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 220, 220);
  doc.text('For submission to PYA / Nautilus / MCA', pageWidth / 2, currentY, {
    align: 'center',
  });

  // Reset text color for content
  setTextColor(textDark);
  currentY = headerHeight + 15;

  // ===== Section helper =====
  const sectionHeader = (title: string) => {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text(title, 14, currentY);
    currentY += 6;

    setDrawColor(primaryBlue);
    doc.setLineWidth(0.5);
    doc.line(14, currentY - 2, 80, currentY - 2);
    currentY += 6;

    setTextColor(textDark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
  };

  // ===== Part 1 – Seafarer Details =====
  sectionHeader('Part 1 – Seafarer Details');

  const seafarerRows = [
    ['Full Name:', fullName],
    ['Email Address:', userProfile.email || 'Not provided'],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: seafarerRows,
    styles: {
      fontSize: 10,
      cellPadding: { top: 5, right: 3, bottom: 5, left: 3 },
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 60,
        textColor: textDark,
      },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.1,
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // ===== Part 2 – Vessel & Service Details =====
  sectionHeader('Part 2 – Vessel & Service Details');

  const vesselRows: string[][] = [
    ['Vessel Name:', vessel.name || 'Not specified'],
    ['Vessel Type:', vessel.type || 'Not specified'],
  ];

  if (vessel.officialNumber) {
    vesselRows.push(['Official Number:', vessel.officialNumber]);
  }

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: vesselRows,
    styles: {
      fontSize: 10,
      cellPadding: { top: 5, right: 3, bottom: 5, left: 3 },
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 70,
        textColor: textDark,
      },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.1,
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  const serviceRows: string[][] = [
    ['Service Start Date:', startDate],
    ['Service End Date:', endDate],
    ['Total Service Days on Board:', `${testimonial.total_days} days`],
    ['Actual Sea Service (days):', `${testimonial.at_sea_days} days`],
    [
      'Standby Service (in port / at anchor):',
      `${testimonial.standby_days} days`,
    ],
    ['Yard / Shipyard Service (days):', `${testimonial.yard_days} days`],
    ['Leave (days):', `${testimonial.leave_days} days`],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: serviceRows,
    styles: {
      fontSize: 10,
      cellPadding: { top: 5, right: 3, bottom: 5, left: 3 },
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 80,
        textColor: textDark,
      },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.1,
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // ===== Notes Section =====
  if (testimonial.notes) {
    sectionHeader('Additional Notes');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    setTextColor(textDark);
    doc.text(testimonial.notes, 14, currentY + 4, {
      maxWidth: pageWidth - 28,
      align: 'left',
    });

    currentY += 20;
  }

  // ===== Part 3 – Declaration =====
  currentY = Math.max(currentY, 150);
  sectionHeader('Part 3 – Declaration by Master / Company Representative');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);

  const declarationText =
    'I hereby certify that the details of service stated above are, to the best of my ' +
    "knowledge and belief, a true and accurate record of this seafarer's onboard service, " +
    'based on vessel records and official log information. This testimonial is issued to ' +
    'support applications for sea service verification by recognised bodies (e.g. PYA, ' +
    'Nautilus International) and, where applicable, submission to the Maritime and Coastguard Agency (MCA).';

  doc.text(declarationText, 14, currentY + 4, {
    maxWidth: pageWidth - 28,
    align: 'left',
  });
  currentY += 22;

  // Signatory block
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);

  // Signatory details + signature
  doc.roundedRect(14, currentY, 115, 40, 3, 3, 'S');
  doc.setFontSize(9);
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.text('Signatory Details', 18, currentY + 6);

  setTextColor(textDark);
  doc.setFont('helvetica', 'normal');

  let lineY = currentY + 13;
  doc.text(
    `Name: ${testimonial.captain_name || '_______________________________'}`,
    18,
    lineY,
  );
  lineY += 5;
  doc.text(
    'Position: Master / Chief Officer / Manager (delete as appropriate)',
    18,
    lineY,
  );
  lineY += 5;
  if (testimonial.captain_email) {
    doc.text(`Email: ${testimonial.captain_email}`, 18, lineY);
    lineY += 5;
  } else {
    doc.text('Email: _______________________________', 18, lineY);
    lineY += 5;
  }
  doc.text('Company / Management: _______________________________', 18, lineY);
  lineY += 5;
  doc.text('Telephone (office): _______________________________', 18, lineY);

  // Signature line inside the box
  doc.line(18, currentY + 35, 125, currentY + 35);
  doc.setFontSize(8);
  setTextColor(textGray);
  doc.text(
    'Signature of Master / Company Representative',
    18,
    currentY + 39,
  );

  // Date + stamp block
  const rightBoxX = pageWidth - 76; // 134 on A4
  doc.roundedRect(rightBoxX, currentY, 62, 40, 3, 3, 'S');
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.text("Date & Ship's Stamp", rightBoxX + 4, currentY + 6);

  setTextColor(textDark);
  doc.setFont('helvetica', 'normal');
  doc.text('Date:', rightBoxX + 4, currentY + 15);
  doc.line(rightBoxX + 15, currentY + 15, rightBoxX + 54, currentY + 15);

  doc.setFontSize(8);
  setTextColor(textGray);
  doc.text('Affix ship\'s stamp below', rightBoxX + 31, currentY + 25, {
    align: 'center',
  });
  doc.rect(rightBoxX + 6, currentY + 27, 50, 10);

  currentY += 48;

  // ===== Part 4 – Official Verification =====
  if (testimonial.official_body || testimonial.official_reference) {
    currentY += 6;
    sectionHeader('Part 4 – Official Verification (PYA / Nautilus / Other)');

    doc.setFontSize(10);
    setTextColor(textDark);

    const verificationRows: string[][] = [];
    if (testimonial.official_body) {
      verificationRows.push(['Verifying organisation:', testimonial.official_body]);
    }
    if (testimonial.official_reference) {
      verificationRows.push([
        'Verification reference:',
        testimonial.official_reference,
      ]);
    }

    autoTable(doc, {
      startY: currentY,
      theme: 'plain',
      body: verificationRows,
      styles: {
        fontSize: 9,
        cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
      },
      columnStyles: {
        0: {
          fontStyle: 'bold',
          cellWidth: 60,
          textColor: textDark,
        },
        1: { cellWidth: 'auto' },
      },
      margin: { left: 14, right: 14 },
      tableLineColor: borderColor,
      tableLineWidth: 0.1,
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ===== Professional Footer =====
  const pageCount = (doc as any).internal.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    const footerHeight = 35;
    const footerStartY = pageHeight - footerHeight;

    setFillColor(headerColor);
    doc.rect(0, footerStartY, pageWidth, footerHeight, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255);

    let footerY = footerStartY + 6;

    // Top line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FOR OFFICIALS USE ONLY', pageWidth / 2, footerY, {
      align: 'center',
    });
    footerY += 6;

    // Separator line
    doc.setLineWidth(0.3);
    doc.setDrawColor(100, 100, 100);
    doc.line(14, footerY, pageWidth - 14, footerY);
    footerY += 5;

    // Codes (left)
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 220, 220);

    let leftY = footerY;
    if (testimonial.testimonial_code) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`Reference Code: ${testimonial.testimonial_code}`, 14, leftY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(220, 220, 220);
      leftY += 4;
    }
    doc.text(`Document ID: ${testimonial.id.substring(0, 8)}...`, 14, leftY);
    leftY += 4;
    doc.text(`Generated: ${generatedDate}`, 14, leftY);
    if (approvedDate) {
      leftY += 4;
      doc.text(`Approved: ${approvedDate}`, 14, leftY);
    }

    // Center
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('www.seajourney.co.uk', pageWidth / 2, footerY, {
      align: 'center',
    });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 220, 220);
    doc.text('Digital sea service testimonials', pageWidth / 2, footerY + 4, {
      align: 'center',
    });

    // Right
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, footerY, {
      align: 'right',
    });
  }

  doc.output('dataurlnewwindow');
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

  const {
    userProfile,
    serviceRecords,
    vesselDetails,
    totalDays,
    totalSeaDays,
    totalStandbyDays,
  } = data;

  const fullName =
    `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() ||
    userProfile.username;

  const generatedDate = format(new Date(), 'dd MMM yyyy');

  // Professional color scheme (aligned with passage export)
  const textDark: [number, number, number] = [30, 30, 30];
  const textGray: [number, number, number] = [100, 100, 100];
  const primaryBlue: [number, number, number] = [0, 29, 55]; // #001d37
  const borderColor: [number, number, number] = [200, 200, 200];
  const headerColor: [number, number, number] = [0, 29, 55];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const setFillColor = (c: [number, number, number]) =>
    doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: [number, number, number]) =>
    doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: [number, number, number]) =>
    doc.setDrawColor(c[0], c[1], c[2]);

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
  doc.text('Sea Time Summary Report', pageWidth / 2, currentY + 4, {
    align: 'center',
  });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Overview of logged sea service for use as supporting documentation alongside formal testimonials.',
    pageWidth / 2,
    currentY + 10,
    { align: 'center' },
  );

  doc.setFontSize(8);
  doc.text(`Generated: ${generatedDate}`, pageWidth - 14, currentY + 4, {
    align: 'right',
  });

  currentY = headerHeight + 8;

  // ===== Seafarer Information =====
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Seafarer Information', 14, currentY);
  currentY += 4;

  const seafarerRows = [
    ['Full Name:', fullName],
    ['Email Address:', userProfile.email || 'Not provided'],
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
      0: {
        fontStyle: 'bold',
        cellWidth: 55,
      },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ===== Vessel Information (if available) =====
  if (vesselDetails) {
    setTextColor(textDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Primary Vessel Information', 14, currentY);
    currentY += 4;

    const vesselRows: string[][] = [
      ['Vessel Name:', vesselDetails.name || 'Not specified'],
      ['Vessel Type:', vesselDetails.type || 'Not specified'],
    ];

    if (vesselDetails.officialNumber) {
      vesselRows.push(['Official Number:', vesselDetails.officialNumber]);
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
        0: {
          fontStyle: 'bold',
          cellWidth: 60,
        },
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
      0: {
        fontStyle: 'bold',
        cellWidth: 80,
      },
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
      if (!acc[vesselName]) {
        acc[vesselName] = [];
      }
      acc[vesselName].push(record);
      return acc;
    }, {} as Record<string, typeof serviceRecords>);

    Object.entries(vesselGroups).forEach(([vesselName, records]) => {
      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 20;
      }

      // Vessel header
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      setTextColor(primaryBlue);
      doc.text(`Vessel: ${vesselName}`, 14, currentY);
      currentY += 4;

      // Date range for vessel
      const dates = records.map((r) => r.date).sort();
      const startDate =
        dates[0]
          ? format(parse(dates[0], 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')
          : 'N/A';
      const endDate =
        dates[dates.length - 1]
          ? format(
              parse(dates[dates.length - 1], 'yyyy-MM-dd', new Date()),
              'dd MMM yyyy',
            )
          : 'N/A';
      const days = records[0]?.totalDays || records.length;

      const vesselSummaryRows: string[][] = [
        ['Period:', `${startDate} to ${endDate}`],
        ['Total Days (this vessel):', `${days} days`],
      ];

      autoTable(doc, {
        startY: currentY,
        theme: 'plain',
        body: vesselSummaryRows,
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
          textColor: textDark,
        },
        columnStyles: {
          0: {
            fontStyle: 'bold',
            cellWidth: 50,
          },
          1: { cellWidth: 'auto' },
        },
        margin: { left: 14, right: 14 },
        tableLineColor: borderColor,
        tableLineWidth: 0.2,
      });

      currentY = (doc as any).lastAutoTable.finalY + 6;
    });
  }

  // ===== Footer (compact, consistent) =====
  const pageCount = (doc as any).internal.getNumberOfPages();

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

    doc.setFont('helvetica', 'normal');
    setTextColor([220, 220, 220]);
    doc.text(
      'Electronic sea time summary – not a substitute for signed testimonials where formally required.',
      pageWidth / 2,
      footerY,
      { align: 'center' },
    );

    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, footerY, {
      align: 'right',
    });
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

  // Professional color scheme
  const textDark: [number, number, number] = [30, 30, 30];
  const textGray: [number, number, number] = [100, 100, 100];
  const primaryBlue: [number, number, number] = [0, 29, 55]; // #001d37
  const borderColor: [number, number, number] = [200, 200, 200];
  const headerColor: [number, number, number] = [0, 29, 55];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const setFillColor = (c: [number, number, number]) =>
    doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: [number, number, number]) =>
    doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: [number, number, number]) =>
    doc.setDrawColor(c[0], c[1], c[2]);

  // ===== HEADER (landscape) =====
  const headerHeight = 32;
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  let currentY = 10;

  // Logo (left)
  try {
    const logoData = await loadLogoImage('/seajourney_logo_white.png');
    doc.addImage(logoData, 'PNG', 14, currentY, 35, 8);
  } catch (error) {
    console.warn('Could not load logo:', error);
  }

  // Title + subtitle (center)
  setTextColor([255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Passage Log Extract', pageWidth / 2, currentY + 4, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    'For use as supporting documentation for sea service verification (e.g. MCA / PYA / Nautilus).',
    pageWidth / 2,
    currentY + 10,
    { align: 'center' },
  );

  // Right-hand summary
  const totalPassages = passages.length;
  const totalDistance =
    totalPassages > 0
      ? passages.reduce((sum, p) => sum + (p.distance_nm || 0), 0)
      : 0;

  doc.setFontSize(8);
  doc.text(`Generated: ${generatedDate}`, pageWidth - 14, currentY + 4, {
    align: 'right',
  });
  doc.text(`Total passages: ${totalPassages}`, pageWidth - 14, currentY + 9, {
    align: 'right',
  });
  if (totalPassages > 0) {
    doc.text(
      `Total distance: ${totalDistance.toFixed(1)} NM`,
      pageWidth - 14,
      currentY + 14,
      { align: 'right' },
    );
  }

  currentY = headerHeight + 6;

  // ===== REPORT & SEAFARER INFORMATION =====
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Report & Seafarer Information', 14, currentY);
  currentY += 4;

  const infoRows: string[][] = [
    ['Seafarer Name:', fullName],
    ['Email:', userProfile.email || 'Not provided'],
  ];

  if (filterInfo) {
    if (filterInfo.vesselName) {
      infoRows.push(['Vessel Filter:', filterInfo.vesselName]);
    }
    if (filterInfo.startDate) {
      infoRows.push([
        'From Date:',
        format(filterInfo.startDate, 'dd MMM yyyy'),
      ]);
    }
    if (filterInfo.endDate) {
      infoRows.push(['To Date:', format(filterInfo.endDate, 'dd MMM yyyy')]);
    }
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
    styles: {
      fontSize: 9,
      cellPadding: { top: 1.5, right: 3, bottom: 1.5, left: 3 },
      textColor: textDark,
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 55,
      },
      1: {
        cellWidth: 'auto',
      },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: borderColor,
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // ===== PASSAGE RECORDS TABLE =====
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  setTextColor(textDark);
  doc.text('Passage Records (log-style extract)', 14, currentY);
  currentY += 4;

  if (passages.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    setTextColor(textGray);
    doc.text(
      'No passages found for the selected filters.',
      14,
      currentY + 4,
    );
    doc.output('dataurlnewwindow');
    return;
  }

  // Prepare table data
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
      durationHours <= 0
        ? '—'
        : days > 0
        ? `${days}d ${hours}h`
        : `${hours}h`;

    const fromPort = `${p.departure_port}${
      p.departure_country ? `, ${p.departure_country}` : ''
    }`;
    const toPort = `${p.arrival_port}${
      p.arrival_country ? `, ${p.arrival_country}` : ''
    }`;

    const vesselCell = p.vessel_name || 'Unknown vessel';

    const distance =
      p.distance_nm && p.distance_nm > 0
        ? p.distance_nm.toFixed(1)
        : '—';

    const typeLabel = p.passage_type
      ? p.passage_type.replace(/_/g, ' ')
      : '—';

    const weatherInfo = [
      p.weather_summary || '',
      p.sea_state || '',
      p.notes || '',
    ]
      .filter((s) => !!s && s.trim().length > 0)
      .join(' | ');

    return [
      vesselCell,
      fromPort,
      toPort,
      `${depDate}\n${depTime}`,
      `${arrDate}\n${arrTime}`,
      duration,
      distance,
      typeLabel,
      weatherInfo || '—',
    ];
  });

  // Column widths for A4 landscape
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
    alternateRowStyles: {
      fillColor: [249, 249, 249],
    },
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
      // Footer for each page
      const footerHeight = 16;
      const footerStartY = pageHeight - footerHeight;

      setFillColor(headerColor);
      doc.rect(0, footerStartY, pageWidth, footerHeight, 'F');

      const footerY = footerStartY + 5;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      setTextColor([255, 255, 255]);
      doc.text('www.seajourney.co.uk', 14, footerY);

      doc.setFont('helvetica', 'normal');
      setTextColor([220, 220, 220]);
      doc.text(
        'Electronic passage log extract – to be used in conjunction with signed sea service testimonials where required.',
        pageWidth / 2,
        footerY,
        { align: 'center' },
      );

      const totalPages = doc.internal.getNumberOfPages();
      doc.text(
        `Page ${dataHook.pageNumber} of ${totalPages}`,
        pageWidth - 14,
        footerY,
        { align: 'right' },
      );
    },
  });

  // Optional note at the bottom of the last page
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
