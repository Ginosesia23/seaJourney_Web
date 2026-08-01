import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { mapRequirement, requireAdmin } from '@/lib/applications/auth';
import { APPLICATION_TEMPLATE_BUCKET } from '@/lib/applications/types';
import { TARGETABLE_LEVELS } from '@/lib/applications/career-path';

type Params = { params: Promise<{ id: string }> };

const ALLOWED_TRACKS = new Set(['deck', 'engine', 'interior', 'galley', 'any']);
const ALLOWED_LEVELS = new Set(TARGETABLE_LEVELS.map((t) => t.level));

async function loadTemplate(id: string) {
  const { data: template, error } = await supabaseAdmin
    .from('application_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !template) return null;

  const [{ data: requirements }, { data: files }] = await Promise.all([
    supabaseAdmin
      .from('application_requirements')
      .select('*')
      .eq('template_id', id)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('application_template_files')
      .select('*')
      .eq('template_id', id)
      .order('created_at', { ascending: false }),
  ]);

  return {
    ...template,
    requirements: (requirements || []).map(mapRequirement),
    files: files || [],
  };
}

/**
 * GET    /api/application-templates/[id]
 * PATCH  /api/application-templates/[id]  — update meta + replace requirements
 * DELETE /api/application-templates/[id]
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const template = await loadTemplate(id);
    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (e) {
    console.error('[application-templates/:id GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;

    const existing = await loadTemplate(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json();
    const patch: Record<string, unknown> = {};

    if (typeof body.title === 'string') patch.title = body.title.trim();
    if (typeof body.organization === 'string')
      patch.organization = body.organization.trim();
    if (typeof body.description === 'string')
      patch.description = body.description.trim() || null;
    if (typeof body.instructions === 'string')
      patch.instructions = body.instructions.trim() || null;
    if (typeof body.external_url === 'string')
      patch.external_url = body.external_url.trim() || null;
    if (typeof body.career_track === 'string' && ALLOWED_TRACKS.has(body.career_track)) {
      patch.career_track = body.career_track;
    }
    if (
      typeof body.target_level === 'string' &&
      ALLOWED_LEVELS.has(body.target_level as never)
    ) {
      patch.target_level = body.target_level;
    }
    if (
      body.status === 'draft' ||
      body.status === 'published' ||
      body.status === 'archived'
    ) {
      patch.status = body.status;
      if (body.status === 'published' && !existing.published_at) {
        patch.published_at = new Date().toISOString();
      }
    }

    if (Object.keys(patch).length) {
      if (patch.title === '' || patch.organization === '') {
        return NextResponse.json(
          { error: 'title and organization cannot be empty' },
          { status: 400 },
        );
      }
      const { error } = await supabaseAdmin
        .from('application_templates')
        .update(patch)
        .eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (Array.isArray(body.requirements)) {
      const { error: delError } = await supabaseAdmin
        .from('application_requirements')
        .delete()
        .eq('template_id', id);
      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }

      if (body.requirements.length) {
        const rows = body.requirements.map(
          (
            r: {
              title?: string;
              description?: string | null;
              requirement_type?: string;
              config?: Record<string, unknown>;
              is_required?: boolean;
              sort_order?: number;
            },
            index: number,
          ) => ({
            template_id: id,
            title: (r.title || `Requirement ${index + 1}`).trim(),
            description: r.description?.trim() || null,
            requirement_type: r.requirement_type || 'manual_checklist',
            config: r.config || {},
            is_required: r.is_required !== false,
            sort_order: typeof r.sort_order === 'number' ? r.sort_order : index,
          }),
        );
        const { error: insError } = await supabaseAdmin
          .from('application_requirements')
          .insert(rows);
        if (insError) {
          return NextResponse.json({ error: insError.message }, { status: 500 });
        }
      }
    }

    const template = await loadTemplate(id);
    return NextResponse.json({ template });
  } catch (e) {
    console.error('[application-templates/:id PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;

    const { data: files } = await supabaseAdmin
      .from('application_template_files')
      .select('file_path')
      .eq('template_id', id);

    if (files?.length) {
      await supabaseAdmin.storage
        .from(APPLICATION_TEMPLATE_BUCKET)
        .remove(files.map((f) => f.file_path));
    }

    const { error } = await supabaseAdmin
      .from('application_templates')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[application-templates/:id DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
