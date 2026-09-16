import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/applications/auth';
import {
  CERTIFICATES_BUCKET,
  buildCertificateFilePath,
} from '@/lib/certificates/storage';
import { assertCanViewCrewSharedData } from '@/lib/vessel-crew-access.server';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

/**
 * POST /api/certificates/upload
 * Multipart: file, optional crewUserId — stores under certificates/<ownerId>/...
 * Returns { path, fileName, contentType, size }
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

    const crewUserIdRaw = form.get('crewUserId');
    const crewUserId =
      typeof crewUserIdRaw === 'string' && crewUserIdRaw.trim()
        ? crewUserIdRaw.trim()
        : null;

    let ownerId = auth.userId;
    if (crewUserId && crewUserId !== auth.userId) {
      const access = await assertCanViewCrewSharedData(auth.userId, crewUserId);
      if ('error' in access) return access.error;
      ownerId = crewUserId;
    }

    const filePath = buildCertificateFilePath(ownerId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from(CERTIFICATES_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[certificates upload]', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    return NextResponse.json({
      path: filePath,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      ownerId,
    });
  } catch (e) {
    console.error('[certificates/upload POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
