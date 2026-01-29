import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * API route to fetch the MCA Officer Testimonial PDF template
 * This is done server-side to avoid CORS issues
 * 
 * First tries to load from local file, then falls back to UK government URL
 */
export async function GET() {
  try {
    // Try to load from local file first (if placed in public/forms/)
    const localPdfPath = path.join(process.cwd(), 'public', 'forms', 'MCA_Officer_Testimonial.pdf');
    
    if (fs.existsSync(localPdfPath)) {
      const pdfBuffer = fs.readFileSync(localPdfPath);
      return new NextResponse(pdfBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="MCA_Officer_Testimonial.pdf"',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    }

    // Fallback to UK government URL (if available)
    // TODO: Update this URL once the PDF URL is known
    const MCA_FORM_URL = 'https://assets.publishing.service.gov.uk/media/[PATH_TO_OFFICER_TESTIMONIAL].pdf';

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
        'Content-Disposition': 'inline; filename="MCA_Officer_Testimonial.pdf"',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error('[API /api/mca-form/testimonial-officer] Error fetching MCA form:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch MCA Officer Testimonial PDF',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        hint: 'Please place MCA_Officer_Testimonial.pdf in public/forms/ directory'
      },
      { status: 500 }
    );
  }
}
