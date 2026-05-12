/**
 * GET    /api/document-templates/[id]         — fetch a single template row
 * PATCH  /api/document-templates/[id]         — edit name / description / fields
 * DELETE /api/document-templates/[id]         — delete row + storage object
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  TEMPLATE_BUCKET,
  mapTemplateRow,
  type TemplateField,
  type VesselDocumentTemplateRow,
} from '@/lib/vessel-document-templates';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

/**
 * Check that the caller can modify a given template (used for PATCH/DELETE).
 * Rules mirror the SQL policies: creator, vessel manager, or admin.
 */
async function canMutate(
  userId: string,
  profile: { role?: string | null; active_vessel_id?: string | null } | null,
  template: { created_by: string; vessel_id: string },
): Promise<boolean> {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (template.created_by === userId) return true;
  if (profile.role === 'vessel' && profile.active_vessel_id === template.vessel_id) {
    return true;
  }
  return false;
}

/** Read access: mutation access OR being crew assigned to the vessel. */
async function canRead(
  userId: string,
  profile: { role?: string | null; active_vessel_id?: string | null } | null,
  template: { created_by: string; vessel_id: string },
): Promise<boolean> {
  if (await canMutate(userId, profile, template)) return true;
  const { data: assignment } = await supabaseAdmin
    .from('vessel_assignments')
    .select('id')
    .eq('user_id', userId)
    .eq('vessel_id', template.vessel_id)
    .maybeSingle();
  return !!assignment;
}

async function fetchTemplateOrNull(id: string) {
  const { data } = await supabaseAdmin
    .from('vessel_document_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as VesselDocumentTemplateRow | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const template = await fetchTemplateOrNull(id);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (!(await canRead(auth.user!.id, auth.profile as any, template))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ template: mapTemplateRow(template) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const template = await fetchTemplateOrNull(id);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (!(await canMutate(auth.user!.id, auth.profile as any, template))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim().length > 0) {
    patch.name = body.name.trim();
  }
  if (typeof body.description === 'string' || body.description === null) {
    patch.description = body.description || null;
  }
  if (Array.isArray(body.fields)) {
    patch.fields = body.fields as TemplateField[];
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('vessel_document_templates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Update failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    template: mapTemplateRow(data as VesselDocumentTemplateRow),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const template = await fetchTemplateOrNull(id);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (!(await canMutate(auth.user!.id, auth.profile as any, template))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Delete the storage object first — if the row survives but the file is
  // gone the template is unusable anyway, whereas the reverse leaves an
  // orphan we'd need to clean up manually.
  if (template.file_path && template.file_path !== 'pending') {
    const { error: removeError } = await supabaseAdmin.storage
      .from(TEMPLATE_BUCKET)
      .remove([template.file_path]);
    if (removeError) {
      console.warn('[document-templates DELETE] storage remove failed', removeError);
      // Continue — we still want to delete the row.
    }
  }

  const { error } = await supabaseAdmin
    .from('vessel_document_templates')
    .delete()
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
