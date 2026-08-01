import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/applications/auth';
import {
  APPLICATION_TEMPLATE_BUCKET,
  buildTemplateFilePath,
} from '@/lib/applications/types';

type Params = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * POST /api/application-templates/[id]/files — upload reference document
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;

    const { data: template } = await supabaseAdmin
      .from('application_templates')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large (max 20MB)' },
        { status: 400 },
      );
    }

    const filePath = buildTemplateFilePath(id, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from(APPLICATION_TEMPLATE_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[template files upload]', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: row, error } = await supabaseAdmin
      .from('application_template_files')
      .insert({
        template_id: id,
        file_path: filePath,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
        uploaded_by: auth.userId,
      })
      .select('*')
      .single();

    if (error || !row) {
      await supabaseAdmin.storage.from(APPLICATION_TEMPLATE_BUCKET).remove([filePath]);
      return NextResponse.json(
        { error: error?.message || 'Failed to save file row' },
        { status: 500 },
      );
    }

    return NextResponse.json({ file: row });
  } catch (e) {
    console.error('[application-templates/:id/files POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
