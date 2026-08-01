import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAuthedUserId, requireAdmin } from '@/lib/applications/auth';
import { APPLICATION_TEMPLATE_BUCKET } from '@/lib/applications/types';

type Params = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET    /api/application-templates/[id]/files/[fileId] — download (auth + published/admin)
 * DELETE /api/application-templates/[id]/files/[fileId] — admin only
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id, fileId } = await params;

    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const { data: template } = await supabaseAdmin
      .from('application_templates')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (template.status !== 'published' && actor?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: file } = await supabaseAdmin
      .from('application_template_files')
      .select('*')
      .eq('id', fileId)
      .eq('template_id', id)
      .maybeSingle();

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { data: blob, error } = await supabaseAdmin.storage
      .from(APPLICATION_TEMPLATE_BUCKET)
      .download(file.file_path);

    if (error || !blob) {
      return NextResponse.json(
        { error: error?.message || 'Download failed' },
        { status: 500 },
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': file.content_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.file_name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    console.error('[template file GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id, fileId } = await params;

    const { data: file } = await supabaseAdmin
      .from('application_template_files')
      .select('*')
      .eq('id', fileId)
      .eq('template_id', id)
      .maybeSingle();

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    await supabaseAdmin.storage
      .from(APPLICATION_TEMPLATE_BUCKET)
      .remove([file.file_path]);

    const { error } = await supabaseAdmin
      .from('application_template_files')
      .delete()
      .eq('id', fileId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[template file DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
