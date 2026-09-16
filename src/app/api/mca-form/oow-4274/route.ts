/**
 * API route to fetch the MCA OOW / CoC oral exam form PDF (MSF 4274).
 * Prefers the local copy under public/forms/, then falls back to GOV.UK assets.
 */
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOCAL_CANDIDATES = [
  'MSF_4274_Version_0626.pdf',
  'MSF_4274_Version_0126.pdf',
];

/** Official MSF 4274 (Version 06/26) on assets.publishing.service.gov.uk */
const MCA_FORM_URL =
  'https://assets.publishing.service.gov.uk/media/6a2a984dc39255c595b506de/MSF_4274_Version_0626.pdf';

export async function GET() {
  try {
    for (const filename of LOCAL_CANDIDATES) {
      const localPdfPath = path.join(process.cwd(), 'public', 'forms', filename);
      if (fs.existsSync(localPdfPath)) {
        const pdfBuffer = fs.readFileSync(localPdfPath);
        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="MCA_OOW_Form_MSF_4274.pdf"',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    const response = await fetch(MCA_FORM_URL, {
      headers: { 'User-Agent': 'SeaJourney/1.0' },
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
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('[API /api/mca-form/oow-4274] Error fetching MCA form:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch MCA OOW form PDF',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        hint: 'Place MSF_4274_Version_0626.pdf in public/forms/ or check GOV.UK asset URL',
      },
      { status: 500 },
    );
  }
}
