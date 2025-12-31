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
    captain_position?: string | null;  // Captain's position saved at approval time
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
    dateOfBirth?: string | null;
    position?: string | null;
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
  } | null;
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
  const { testimonial, userProfile, vessel, captainProfile } = data;

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

  // Format date of birth if available
  const dateOfBirth = userProfile.dateOfBirth
    ? format(parse(userProfile.dateOfBirth, 'yyyy-MM-dd', new Date()), 'dd MMMM yyyy')
    : null;

  // Professional color scheme
  const textDark: [number, number, number] = [20, 20, 20];
  const textGray: [number, number, number] = [80, 80, 80];
  const primaryBlue: [number, number, number] = [0, 29, 55]; // SeaJourney blue
  const borderColor: [number, number, number] = [180, 180, 180];
  const headerColor: [number, number, number] = [0, 29, 55]; // #001d37
  const sectionBg: [number, number, number] = [248, 249, 250]; // Light gray background for sections
  const accentBlue: [number, number, number] = [0, 51, 102]; // Darker blue for accents

  const setFillColor = (c: [number, number, number]) =>
    doc.setFillColor(c[0], c[1], c[2]);
  const setTextColor = (c: [number, number, number]) =>
    doc.setTextColor(c[0], c[1], c[2]);
  const setDrawColor = (c: [number, number, number]) =>
    doc.setDrawColor(c[0], c[1], c[2]);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ===== Professional Header with SeaJourney branding =====
  const headerHeight = 50;
  setFillColor(headerColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // Add subtle border at bottom of header
  setDrawColor([0, 0, 0]);
  doc.setLineWidth(0.5);
  doc.line(0, headerHeight, pageWidth, headerHeight);

  let currentY = 12;
  
  // Load and add PNG logo to PDF
  try {
    const logoPath = '/seajourney_logo_white.png';
    const logoDataURL = await loadLogoImage(logoPath);
    
    const logoWidth = 55;
    const logoHeight = 15;
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

  // Main Title - Official document style
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SEA SERVICE TESTIMONIAL', pageWidth / 2, currentY, {
    align: 'center',
  });
  
  // Document type subtitle
  currentY += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 220, 220);
  doc.text('Official Certificate of Service', pageWidth / 2, currentY, {
    align: 'center',
  });
  
  // Reset text color for content
  setTextColor(textDark);
  currentY = headerHeight + 20;

  // ===== Part 1 - Seafarer's Details =====
  // Section header with background
  const sectionHeaderHeight = 8;
  setFillColor(sectionBg);
  doc.rect(14, currentY - 4, pageWidth - 28, sectionHeaderHeight, 'F');
  
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('PART 1 – SEAFARER\'S DETAILS', 18, currentY + 2);
  
  // Underline
  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
  
  currentY += sectionHeaderHeight + 4;

  // ===== Personal Details Section =====
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('This is to certify that:', 18, currentY);
  currentY += 6;

  // Personal details table
  const personalRows: string[][] = [
    ['Name', fullName],
    ['Email address', userProfile.email || 'Not provided'],
  ];
  
  if (dateOfBirth) {
    personalRows.push(['Date of birth', dateOfBirth]);
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
      0: {
        fontStyle: 'bold',
        cellWidth: 50,
        textColor: textDark,
      },
      1: { 
        cellWidth: 'auto',
        textColor: textDark,
      },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // Role section - show actual position if available
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('has served as:', 18, currentY);
  currentY += 4;
  
  const userPosition = userProfile.position || '';
  
  // Show only the actual position if available with better styling
  if (userPosition) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text(userPosition, 18, currentY);
  } else {
    doc.setFontSize(9);
    setTextColor(textGray);
    doc.text('Position not specified', 18, currentY);
  }
  currentY += 6;

  // ===== Part 2 - Service =====
  // Section header with background
  setFillColor(sectionBg);
  doc.rect(14, currentY - 4, pageWidth - 28, sectionHeaderHeight, 'F');
  
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('PART 2 – SERVICE', 18, currentY + 2);
  
  // Underline
  setDrawColor(primaryBlue);
  doc.setLineWidth(0.5);
  doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
  
  currentY += sectionHeaderHeight + 4;

  // ===== ON BOARD Section =====
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  setTextColor(accentBlue);
  doc.text('ON BOARD:', 18, currentY);
  currentY += 6;

  // Vessel details table
  const vesselRows: string[][] = [
    ['Vessel name', vessel.name || 'Not specified'],
  ];

  if (vessel.flag_state) {
    vesselRows.push(['Flag', vessel.flag_state]);
  }
  if (vessel.officialNumber) {
    vesselRows.push(['Official No.', vessel.officialNumber]);
  }
  if (vessel.type) {
    const vesselTypeLabel = vessel.type === 'motor-yacht' ? 'M/Y' : 
                           vessel.type === 'sailing-yacht' ? 'S/Y' : 
                           vessel.type || 'Other';
    vesselRows.push(['Type (M/Y, S/Y, other)', vesselTypeLabel]);
  }
  if (vessel.length_m) {
    vesselRows.push(['Length-metres', `${vessel.length_m.toFixed(2)} m`]);
  }
  if (vessel.gross_tonnage) {
    vesselRows.push(['GT', `${vessel.gross_tonnage.toFixed(2)}`]);
  }
  // Main engines KW - not available in current data, leave blank
  vesselRows.push(['Main engines KW', '________________']);

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    head: [['Field', 'Details']],
    body: vesselRows,
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
      0: {
        fontStyle: 'bold',
        cellWidth: 60,
        textColor: textDark,
      },
      1: { 
        cellWidth: 'auto',
        textColor: textDark,
      },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // ===== Service Dates =====
  const serviceDateRows: string[][] = [
    ['From: (i.e. onboard yacht service)', startDate],
    ['Until: (cannot leave blank or testimonial is not valid)', endDate],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: serviceDateRows,
    styles: {
      fontSize: 10,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      textColor: textDark,
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 100,
        textColor: textDark,
      },
      1: { 
        cellWidth: 'auto',
        textColor: textDark,
      },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // ===== Service Breakdown (Days) =====
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text('The above service includes:', 18, currentY);
  currentY += 4;

  const serviceBreakdownRows: string[][] = [
    [
      'Actual Days at Sea:',
      `${testimonial.at_sea_days} days`,
      '(proceeding to sea and in transit with main propelling engines running for at least 4h within a 24h period)'
    ],
    [
      'Stand-by Service:',
      `${testimonial.standby_days} days`,
      '(SHOULD NOT EXCEED DAYS AT SEA - time immediately following a voyage, waiting for owner, uniformed/ready to depart Max. 14 consecutive days without leaving port)'
    ],
    [
      'Shipyard Service:',
      `${testimonial.yard_days} days`,
      '(max. 90 days per application)'
    ],
    [
      'Watch keeping for HOLDERS of MCA OOW3000 or higher (ONLY WHILE VESSEL AT SEA AND UNDERWAY)',
      '_____ days',
      ''
    ],
    [
      'Watchkeeping or UMS duties for Engineers registered in SV Program (ONLY WHILE VESSEL AT SEA AND UNDERWAY)',
      '_____ days',
      ''
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    head: [['Service Type', 'Days', 'Notes']],
    body: serviceBreakdownRows,
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
      textColor: textDark,
    },
    headStyles: {
      fillColor: [235, 237, 240],
      textColor: primaryBlue,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 80,
        textColor: textDark,
      },
      1: { 
        cellWidth: 25,
        halign: 'center',
        fontStyle: 'bold',
        textColor: primaryBlue,
      },
      2: { 
        cellWidth: 'auto',
        fontSize: 8,
        textColor: textGray,
      },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  // Get the final Y position after autoTable
  currentY = (doc as any).lastAutoTable.finalY + 4;
  
  // Check if we need a new page
  if (currentY > pageHeight - 30) {
    doc.addPage();
    currentY = 20;
  }

  // ===== Days of Leave =====
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  setTextColor(textDark);
  doc.text(`Days of leave of absence: ${testimonial.leave_days} days`, 18, currentY);
  currentY += 5;

  // ===== Areas Cruised (if we have passage data, could add this later) =====
  const cruisingRows: string[][] = [
    ['Areas cruised, rotation', '________________'],
    ['nautical miles', '________________'],
  ];

  autoTable(doc, {
    startY: currentY,
    theme: 'plain',
    body: cruisingRows,
    styles: {
      fontSize: 10,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      textColor: textDark,
    },
    columnStyles: {
      0: {
        fontStyle: 'bold',
        cellWidth: 80,
        textColor: textDark,
      },
      1: { 
        cellWidth: 'auto',
        textColor: textDark,
      },
    },
    margin: { left: 18, right: 18 },
    tableLineColor: borderColor,
    tableLineWidth: 0.5,
  });

  // Get the final Y position after autoTable
  currentY = (doc as any).lastAutoTable.finalY + 6;
  
  // Check if we need a new page
  if (currentY > pageHeight - 30) {
    doc.addPage();
    currentY = 20;
  }

  // Check if we need a new page for Part 3
  // Part 3 needs significant space, so add a new page if we're running low
  if (currentY > pageHeight - 120) {
    doc.addPage();
    currentY = 20;
  }

  // ===== Part 3 – Declaration =====
  // Section header with background
  setFillColor(sectionBg);
  doc.rect(14, currentY - 4, pageWidth - 28, sectionHeaderHeight, 'F');
  
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setTextColor(primaryBlue);
  doc.text('PART 3 – DECLARATION BY MASTER / COMPANY REPRESENTATIVE', 18, currentY + 2);
  
  // Underline
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

  // Calculate how many lines the declaration text will take
  const declarationLines = doc.splitTextToSize(declarationText, pageWidth - 36);
  const declarationHeight = declarationLines.length * 5; // Approximate 5mm per line
  
  doc.text(declarationText, 18, currentY, {
    maxWidth: pageWidth - 36,
    align: 'left',
  });
  currentY += declarationHeight + 6; // Add spacing after declaration

  // Signatory block - no boxes, clean layout
  doc.setFontSize(10);
  setTextColor(primaryBlue);
  doc.setFont('helvetica', 'bold');
  doc.text('Signatory Details', 18, currentY);

  setTextColor(textDark);
  doc.setFont('helvetica', 'normal');

  let lineY = currentY + 5;
  // Captain name - prioritize testimonial.captain_name, then captainProfile, then blank
  let captainName = testimonial.captain_name;
  if (!captainName && captainProfile) {
    const profileName = `${captainProfile.firstName || ''} ${captainProfile.lastName || ''}`.trim();
    if (profileName) {
      captainName = profileName;
    }
  }
  if (!captainName) {
    captainName = '_______________________________';
  }
  doc.text(`Name: ${captainName}`, 18, lineY);
  lineY += 4;
  
  // Position - prioritize saved captain_position from testimonial, then captain profile, then placeholder
  const captainPosition = (testimonial as any).captain_position || captainProfile?.position || null;
  if (captainPosition) {
    // If we have a position, fill it in
    doc.text(`Position: ${captainPosition}`, 18, lineY);
  } else {
    // Otherwise show placeholder
    doc.text('Position: _______________________________', 18, lineY);
  }
  lineY += 4;
  
  // Email - prioritize captain profile email, then testimonial email, then blank
  const captainEmail = captainProfile?.email || testimonial.captain_email;
  if (captainEmail) {
    doc.text(`Email: ${captainEmail}`, 18, lineY);
    lineY += 4;
  } else {
    doc.text('Email: _______________________________', 18, lineY);
    lineY += 4;
  }
  doc.text('Company / Management: _______________________________', 18, lineY);
  lineY += 4;
  doc.text('Telephone (office): _______________________________', 18, lineY);
  lineY += 6;

  // Signature line - no box
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);
  doc.line(18, lineY, 120, lineY);
  doc.setFontSize(8);
  setTextColor(textGray);
  doc.text(
    'Signature of Master / Company Representative',
    18,
    lineY + 4,
  );
  lineY += 8;

  // Date + stamp section - no box, clean layout
  // Position it at the same starting Y as signatory details to avoid overlap
  const rightX = pageWidth - 76;
  const dateSectionY = currentY; // Start at same Y as signatory details
  
  setTextColor(primaryBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text("Date & Ship's Stamp", rightX, dateSectionY);

  setTextColor(textDark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Date:', rightX, dateSectionY + 5);
  
  // Fill in approval date if available, otherwise leave blank
  if (approvedDate) {
    doc.setFont('helvetica', 'bold');
    doc.text(approvedDate, rightX + 12, dateSectionY + 5);
  } else {
    setDrawColor(borderColor);
    doc.setLineWidth(0.5);
    doc.line(rightX + 12, dateSectionY + 5, rightX + 54, dateSectionY + 5);
  }

  doc.setFontSize(8);
  setTextColor(textGray);
  doc.setFont('helvetica', 'normal');
  doc.text('Affix ship\'s stamp below', rightX + 31, dateSectionY + 12, {
    align: 'center',
  });
  setDrawColor(borderColor);
  doc.setLineWidth(0.5);
  doc.rect(rightX + 6, dateSectionY + 14, 50, 10);

  // Update currentY to the maximum of both sections
  const dateSectionEnd = dateSectionY + 25;
  currentY = Math.max(lineY, dateSectionEnd);

  // ===== Part 4 – Official Verification =====
  if (testimonial.official_body || testimonial.official_reference) {
    if (currentY > pageHeight - 60) {
      doc.addPage();
      currentY = 20;
    }
    
    currentY += 8;
    // Section header with background
    setFillColor(sectionBg);
    doc.rect(14, currentY - 4, pageWidth - 28, sectionHeaderHeight, 'F');
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text('PART 4 – OFFICIAL VERIFICATION (PYA / NAUTILUS / OTHER)', 18, currentY + 2);
    
    // Underline
    setDrawColor(primaryBlue);
    doc.setLineWidth(0.5);
    doc.line(18, currentY + 3, pageWidth - 18, currentY + 3);
    
    currentY += sectionHeaderHeight + 4;

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
        fontSize: 10,
        cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        textColor: textDark,
      },
      columnStyles: {
        0: {
          fontStyle: 'bold',
          cellWidth: 60,
          textColor: textDark,
        },
        1: { 
          cellWidth: 'auto',
          textColor: textDark,
        },
      },
      margin: { left: 18, right: 18 },
      tableLineColor: borderColor,
      tableLineWidth: 0.5,
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ===== Footer on all pages (Document ID) + Full footer on last page =====
  // Get final page count after all content
  const pageCount = (doc as any).internal.pages.length;

  // Add document ID to all pages
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Simple footer with just document ID on all pages
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setTextColor(textGray);
    doc.text(`Document ID: ${testimonial.id}`, 14, pageHeight - 8, {
      align: 'left',
    });
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
  }
  

  // Full blue footer only on the last page
  doc.setPage(pageCount);

  const footerHeight = 30;
  const footerStartY = pageHeight - footerHeight;
  
  setFillColor(headerColor);
  doc.rect(0, footerStartY, pageWidth, footerHeight, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);

  let footerY = footerStartY + 8;

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
  doc.text(`Document ID: ${testimonial.id}`, 14, leftY);
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
  doc.text(`Page ${pageCount} of ${pageCount}`, pageWidth - 14, footerY, {
    align: 'right',
  });

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
  const pageCount = (doc as any).internal.pages.length;

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

      const totalPages = (doc as any).internal.pages.length;
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
