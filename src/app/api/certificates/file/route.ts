import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/applications/auth';
import { CERTIFICATES_BUCKET } from '@/lib/certificates/storage';

/**
 * GET /api/certificates/file?path=userId/...
 * Streams a certificate file the caller owns (path must start with their user id).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const path = req.nextUrl.searchParams.get('path');
    if (!path || path.includes('..')) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const ownerPrefix = `${auth.userId}/`;
    if (!path.startsWith(ownerPrefix)) {
      // Allow admins to download any path
      const { data: actor } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', auth.userId)
        .maybeSingle();
      if (actor?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin.storage
      .from(CERTIFICATES_BUCKET)
      .download(path);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'File not found' },
        { status: 404 },
      );
    }

    const fileName = path.split('/').pop() || 'certificate';
    const bytes = Buffer.from(await data.arrayBuffer());
    const contentType =
      fileName.endsWith('.png')
        ? 'image/png'
        : fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')
          ? 'image/jpeg'
          : fileName.endsWith('.webp')
            ? 'image/webp'
            : 'application/pdf';

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    console.error('[certificates/file GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
