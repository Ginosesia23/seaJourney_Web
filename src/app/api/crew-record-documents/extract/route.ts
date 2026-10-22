import { NextRequest, NextResponse } from 'next/server';

import { extractSeaServiceTotals } from '@/ai/sea-service-extract-flow';
import { requireUser } from '@/lib/applications/auth';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

/**
 * POST /api/crew-record-documents/extract
 * Multipart: file — AI reads sea-service dates and day counts.
 * Does not persist anything; client applies results to the form.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use PDF, PNG, JPEG, or WebP.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large (max 15MB)' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;

    const extracted = await extractSeaServiceTotals({ base64, mimeType });

    return NextResponse.json({ extracted });
  } catch (e) {
    console.error('[crew-record-documents/extract POST]', e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'Failed to read sea time from the document',
      },
      { status: 500 },
    );
  }
}
