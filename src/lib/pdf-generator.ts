import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse } from 'date-fns';

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
    
    img.onerror = (error) => {
      reject(new Error(`Failed to load logo from ${logoPath}. Make sure the file exists in the public folder.`));
    };
    
    // Set src after handlers are attached
    img.src = logoPath;
    
    // Handle case where image is already loaded (cached)
    if (img.complete) {
      img.onload(new Event('load') as any);
    }
  });
}

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
  const approvedDate = testimonial.status === 'approved' && testimonial.signoff_used_at
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

  // ===== Header with colored background =====
  const headerHeight = 50;
  setFillColor(headerColor);
  doc.rect(0, 0, 210, headerHeight, 'F');

  let currentY = 12;
  
  // Load and add PNG logo to PDF
  // Using the logo from public folder: seajourney_logo_white.png
  try {
    const logoPath = '/seajourney_logo_white.png';
    const logoDataURL = await loadLogoImage(logoPath);
    
    // Logo size - compact and professional
    const logoWidth = 45; // Width in mm - adjust if needed
    const logoHeight = 12; // Height in mm - adjust to maintain aspect ratio of your logo
    const logoX = (210 - logoWidth) / 2; // Center horizontally
    
    doc.addImage(logoDataURL, 'PNG', logoX, currentY, logoWidth, logoHeight);
    currentY += logoHeight + 8;
  } catch (error) {
    console.error('Failed to load logo image:', error);
    // Fallback to text logo
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('SeaJourney', 105, currentY, { align: 'center' });
    currentY += 8;
  }

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Sea Service Testimonial', 105, currentY, { align: 'center' });
  currentY += 6;

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 220, 220); // Light gray
  doc.text('For submission to PYA / Nautilus / MCA', 105, currentY, { align: 'center' });
  
  // Reset text color for content
  setTextColor(textDark);
  currentY = headerHeight + 15;

  // ===== Section helper (clean, no background colors) =====
  const sectionHeader = (title: string) => {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    setTextColor(primaryBlue);
    doc.text(title, 14, currentY);
    currentY += 6;
    
    // Subtle underline
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
    doc.text(testimonial.notes, 14, currentY + 4, { maxWidth: 182, align: 'left' });

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

  doc.text(declarationText, 14, currentY + 4, { maxWidth: 182, align: 'left' });
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
    `Position: Master / Chief Officer / Manager (delete as appropriate)`,
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
  doc.text('Signature of Master / Company Representative', 18, currentY + 39);

  // Date + stamp block
  const rightBoxX = 134;
  doc.roundedRect(rightBoxX, currentY, 62, 40, 3, 3, 'S');
  setTextColor(textDark);
  doc.setFont('helvetica', 'bold');
  doc.text('Date & Ship\'s Stamp', rightBoxX + 4, currentY + 6);

  setTextColor(textDark);
  doc.setFont('helvetica', 'normal');
  doc.text('Date:', rightBoxX + 4, currentY + 15);
  doc.line(rightBoxX + 15, currentY + 15, rightBoxX + 54, currentY + 15);

  doc.setFontSize(8);
  setTextColor(textGray);
  doc.text('Affix ship\'s stamp below', rightBoxX + 31, currentY + 25, { align: 'center' });
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
      verificationRows.push(['Verification reference:', testimonial.official_reference]);
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

    // Footer with colored background
    const footerHeight = 35;
    const footerStartY = 297 - footerHeight;
    
    // Footer background
    setFillColor(headerColor);
    doc.rect(0, footerStartY, 210, footerHeight, 'F');

    // Footer content
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255); // White text on dark background

    let footerY = footerStartY + 6;

    // Top line - "For officials use only"
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FOR OFFICIALS USE ONLY', 105, footerY, { align: 'center' });
    footerY += 6;

    // Separator line
    doc.setLineWidth(0.3);
    doc.setDrawColor(100, 100, 100);
    doc.line(14, footerY, 196, footerY);
    footerY += 5;

    // Bottom section - Codes and info
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 220, 220);

    // Left side - Codes
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

    // Center - Website
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('www.seajourney.co.uk', 105, footerY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 220, 220);
    doc.text('Digital sea service testimonials', 105, footerY + 4, { align: 'center' });

    // Right side - Page info
    doc.text(`Page ${i} of ${pageCount}`, 196, footerY, { align: 'right' });
  }

  doc.output('dataurlnewwindow');
}
