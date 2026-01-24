import { NextResponse } from 'next/server';

/**
 * API route to fetch the MCA Watch Rating Certificate form PDF
 * This is done server-side to avoid CORS issues
 */
export async function GET() {
  const MCA_FORM_URL = 'https://assets.publishing.service.gov.uk/media/689dbe1b07f2cc15c9357248/Watch_Rating_MSF_4371_Rev_0825.pdf';

  try {
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
        'Content-Disposition': 'inline; filename="MCA_Watch_Rating_Form.pdf"',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error('[API /api/mca-form/fetch] Error fetching MCA form:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch MCA form PDF',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
