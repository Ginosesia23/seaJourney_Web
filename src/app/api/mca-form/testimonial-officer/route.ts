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
  const localPdfPath = path.join(process.cwd(), 'public', 'forms', 'MSN_1858-Officer-Testimonial.pdf');

  try {
    if (fs.existsSync(localPdfPath)) {
      const pdfBuffer = fs.readFileSync(localPdfPath);
      return new NextResponse(pdfBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="MSN_1858-Officer-Testimonial.pdf"',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
  } catch (error: any) {
    console.error('[API /api/mca-form/testimonial-officer] Error reading local form:', error);
    return NextResponse.json(
      {
        error: 'MCA Officer Testimonial template could not be read',
        hint: 'Ensure MSN_1858-Officer-Testimonial.pdf exists in public/forms/',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }

  // File missing: return 404 with clear message (no broken fallback URL)
  return NextResponse.json(
    {
      error: 'MCA Officer Testimonial template not found',
      hint: 'Place MSN_1858-Officer-Testimonial.pdf in the public/forms/ directory and restart the server.',
    },
    { status: 404 }
  );
}
