import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/applications/auth';
import { buildApplicationPackageZip } from '@/lib/applications/build-package-zip';

type Params = { params: Promise<{ templateId: string }> };

/**
 * GET /api/applications/[templateId]/package
 * Download a ZIP of materials for manual submission to the organization.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;
    const { templateId } = await params;

    const { zipBytes, filename } = await buildApplicationPackageZip(
      auth.userId,
      templateId,
    );

    // Copy into a fresh ArrayBuffer-backed Uint8Array for NextResponse BodyInit typing.
    const body = new Uint8Array(zipBytes.byteLength);
    body.set(zipBytes);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[applications package]', e);
    const message = e instanceof Error ? e.message : 'Failed to build package';
    const status =
      message.includes('not found') || message.includes('not published')
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
