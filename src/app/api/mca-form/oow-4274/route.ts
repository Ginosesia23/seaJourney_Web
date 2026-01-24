import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * API route to fetch the MCA OOW Certificate form PDF (MSF 4274)
 * This is done server-side to avoid CORS issues
 * 
 * First tries to load from local file, then falls back to UK government URL
 */
export async function GET() {
  try {
    // Try to load from local file first (if placed in public/forms/)
    const localPdfPath = path.join(process.cwd(), 'public', 'forms', 'MSF_4274_Version_0126.pdf');
    
    if (fs.existsSync(localPdfPath)) {
      const pdfBuffer = fs.readFileSync(localPdfPath);
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="MCA_OOW_Form_MSF_4274.pdf"',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    }

    // Fallback to UK government URL
    // MSF 4274 (Revision 01/26) - Application For an Oral Examination Leading To The Issue of A Certificate Of Competency
    // The form can be found at: https://www.gov.uk/government/publications/certificate-of-competency-deck-msf-4274
    // Note: This URL needs to be updated with the actual PDF URL from the government website
    const MCA_FORM_URL = 'https://assets.publishing.service.gov.uk/media/[MSF_4274_PDF_URL]';

    const response = await fetch(MCA_FORM_URL, {
      headers: {
        'User-Agent': 'SeaJourney/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch MCA form: ${response.status} ${response.statusText}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="MCA_OOW_Form_MSF_4274.pdf"',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error('[API /api/mca-form/oow-4274] Error fetching MCA form:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch MCA OOW form PDF',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        hint: 'Please ensure MSF_4274_Version_0126.pdf is placed in public/forms/ or update the MCA_FORM_URL'
      },
      { status: 500 }
    );
  }
}
