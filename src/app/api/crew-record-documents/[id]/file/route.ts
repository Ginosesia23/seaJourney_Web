import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import { CREW_RECORD_DOCUMENTS_BUCKET } from '@/lib/crew-record-documents';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { assertCanViewCrewRecordDocument } from '@/lib/vessel-crew-access.server';

/**
 * GET /api/crew-record-documents/:id/file
 * Streams the stored file to crew, the uploading vessel, or an admin.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: row, error } = await supabaseAdmin
      .from('crew_record_documents')
      .select('crew_user_id, vessel_id, uploaded_by_user_id, storage_path, file_name, content_type')
      .eq('id', id)
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const access = await assertCanViewCrewRecordDocument({
      actorUserId: auth.userId,
      crewUserId: row.crew_user_id as string,
      vesselId: row.vessel_id as string,
      uploadedByUserId: row.uploaded_by_user_id as string,
    });
    if ('error' in access) return access.error;

    const { data, error: downloadError } = await supabaseAdmin.storage
      .from(CREW_RECORD_DOCUMENTS_BUCKET)
      .download(row.storage_path as string);

    if (downloadError || !data) {
      return NextResponse.json(
        { error: downloadError?.message || 'File not found' },
        { status: 404 },
      );
    }

    const fileName = String(row.file_name || 'document');
    const bytes = Buffer.from(await data.arrayBuffer());
    const contentType = String(row.content_type || 'application/octet-stream');
    const download = req.nextUrl.searchParams.get('download') === '1';

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    console.error('[crew-record-documents file GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
