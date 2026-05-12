/**
 * POST  /api/document-templates
 *   Create a new custom template for a vessel. Multipart form:
 *     - file        : the original PDF or image
 *     - vesselId    : target vessel
 *     - name        : template name (required)
 *     - description : optional
 *     - fields      : JSON-stringified TemplateField[]
 *
 * GET   /api/document-templates?vesselId=...
 *   List templates for a vessel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  TEMPLATE_BUCKET,
  buildTemplateFilePath,
  mapTemplateRow,
  type TemplateField,
  type VesselDocumentTemplateRow,
} from '@/lib/vessel-document-templates';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB for saved templates
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

/** Minimal bearer-token auth. Returns the caller's user row or a 401 response. */
async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.slice(7);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, role, active_vessel_id')
    .eq('id', user.id)
    .maybeSingle();
  return { user, profile };
}

/** Only vessel managers of the target vessel (or admins) can write templates. */
async function canWriteForVessel(
  profile: { role: string; active_vessel_id: string | null } | null,
  vesselId: string,
): Promise<boolean> {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (profile.role === 'vessel' && profile.active_vessel_id === vesselId) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if ('error' in auth) return auth.error;
    const { user, profile } = auth;

    const form = await request.formData();
    const file = form.get('file') as File | null;
    const vesselId = form.get('vesselId') as string | null;
    const name = (form.get('name') as string | null)?.trim();
    const description = (form.get('description') as string | null)?.trim() || null;
    const fieldsRaw = form.get('fields') as string | null;

    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });
    if (!vesselId) return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Accepted: PDF, PNG, JPEG, WebP.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        },
        { status: 400 },
      );
    }

    let fields: TemplateField[] = [];
    if (fieldsRaw) {
      try {
        const parsed = JSON.parse(fieldsRaw);
        if (Array.isArray(parsed)) fields = parsed as TemplateField[];
      } catch {
        return NextResponse.json({ error: 'Invalid fields JSON' }, { status: 400 });
      }
    }

    if (!(await canWriteForVessel(profile as any, vesselId))) {
      return NextResponse.json(
        { error: 'You do not have permission to save templates for this vessel.' },
        { status: 403 },
      );
    }

    // Insert the row first so we have a stable id for the storage path.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('vessel_document_templates')
      .insert({
        vessel_id: vesselId,
        name,
        description,
        file_type: file.type,
        file_path: 'pending', // patched after upload
        original_filename: file.name || null,
        fields,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (insertError || !inserted) {
      console.error('[document-templates POST] insert failed', insertError);
      return NextResponse.json(
        { error: insertError?.message ?? 'Failed to create template' },
        { status: 500 },
      );
    }

    const filePath = buildTemplateFilePath(
      vesselId,
      inserted.id,
      file.name || `template.${file.type === 'application/pdf' ? 'pdf' : 'bin'}`,
    );

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from(TEMPLATE_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      // Roll back the insert so we don't leave orphaned rows with file_path='pending'.
      await supabaseAdmin.from('vessel_document_templates').delete().eq('id', inserted.id);
      console.error('[document-templates POST] upload failed', uploadError);
      return NextResponse.json(
        { error: uploadError.message ?? 'Failed to store template file' },
        { status: 500 },
      );
    }

    const { data: patched, error: patchError } = await supabaseAdmin
      .from('vessel_document_templates')
      .update({ file_path: filePath })
      .eq('id', inserted.id)
      .select('*')
      .single();

    if (patchError || !patched) {
      console.error('[document-templates POST] patch failed', patchError);
      return NextResponse.json(
        { error: patchError?.message ?? 'Failed to finalize template' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      template: mapTemplateRow(patched as VesselDocumentTemplateRow),
    });
  } catch (err) {
    console.error('[document-templates POST] unexpected', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if ('error' in auth) return auth.error;
    const { user, profile } = auth;

    const { searchParams } = new URL(request.url);
    const vesselId = searchParams.get('vesselId');
    if (!vesselId) {
      return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
    }

    // Read access: admins, vessel managers of that vessel, or crew assigned
    // to that vessel. We re-check here rather than relying purely on RLS so
    // we can return a clean 403 and avoid the "empty array" false positive.
    const isAdmin = (profile as any)?.role === 'admin';
    const isVesselManager =
      (profile as any)?.role === 'vessel' &&
      (profile as any)?.active_vessel_id === vesselId;
    let hasAccess = isAdmin || isVesselManager;
    if (!hasAccess) {
      const { data: assignment } = await supabaseAdmin
        .from('vessel_assignments')
        .select('id')
        .eq('user_id', user.id)
        .eq('vessel_id', vesselId)
        .maybeSingle();
      hasAccess = !!assignment;
    }
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'You do not have access to this vessel.' },
        { status: 403 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('vessel_document_templates')
      .select('*')
      .eq('vessel_id', vesselId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      templates: (data ?? []).map((row) =>
        mapTemplateRow(row as VesselDocumentTemplateRow),
      ),
    });
  } catch (err) {
    console.error('[document-templates GET] unexpected', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
