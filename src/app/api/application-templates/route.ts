import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { mapRequirement, requireAdmin } from '@/lib/applications/auth';
import { TARGETABLE_LEVELS } from '@/lib/applications/career-path';

const ALLOWED_TRACKS = new Set(['deck', 'engine', 'interior', 'galley', 'any']);
const ALLOWED_LEVELS = new Set(TARGETABLE_LEVELS.map((t) => t.level));

function parseCareerFields(body: Record<string, unknown>) {
  const career_track =
    typeof body.career_track === 'string' && ALLOWED_TRACKS.has(body.career_track)
      ? body.career_track
      : 'any';
  const target_level =
    typeof body.target_level === 'string' && ALLOWED_LEVELS.has(body.target_level as never)
      ? body.target_level
      : 'other';
  return { career_track, target_level };
}

/**
 * GET  /api/application-templates — list all templates (admin)
 * POST /api/application-templates — create draft template (admin)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const { data: templates, error } = await supabaseAdmin
      .from('application_templates')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[application-templates GET]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ids = (templates || []).map((t) => t.id);
    let requirementsByTemplate = new Map<string, ReturnType<typeof mapRequirement>[]>();
    let filesByTemplate = new Map<string, unknown[]>();

    if (ids.length) {
      const [{ data: reqs }, { data: files }] = await Promise.all([
        supabaseAdmin
          .from('application_requirements')
          .select('*')
          .in('template_id', ids)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('application_template_files')
          .select('*')
          .in('template_id', ids)
          .order('created_at', { ascending: false }),
      ]);

      for (const r of reqs || []) {
        const list = requirementsByTemplate.get(r.template_id) || [];
        list.push(mapRequirement(r));
        requirementsByTemplate.set(r.template_id, list);
      }
      for (const f of files || []) {
        const list = filesByTemplate.get(f.template_id) || [];
        list.push(f);
        filesByTemplate.set(f.template_id, list);
      }
    }

    return NextResponse.json({
      templates: (templates || []).map((t) => ({
        ...t,
        requirements: requirementsByTemplate.get(t.id) || [],
        files: filesByTemplate.get(t.id) || [],
      })),
    });
  } catch (e) {
    console.error('[application-templates GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const organization =
      typeof body.organization === 'string' ? body.organization.trim() : '';
    if (!title || !organization) {
      return NextResponse.json(
        { error: 'title and organization are required' },
        { status: 400 },
      );
    }

    const requestedStatus =
      body.status === 'published' ||
      body.status === 'archived' ||
      body.status === 'draft'
        ? body.status
        : 'draft';

    const career = parseCareerFields(body);

    const { data: template, error } = await supabaseAdmin
      .from('application_templates')
      .insert({
        title,
        organization,
        description:
          typeof body.description === 'string' ? body.description.trim() || null : null,
        instructions:
          typeof body.instructions === 'string' ? body.instructions.trim() || null : null,
        external_url:
          typeof body.external_url === 'string' ? body.external_url.trim() || null : null,
        career_track: career.career_track,
        target_level: career.target_level,
        status: requestedStatus,
        published_at:
          requestedStatus === 'published' ? new Date().toISOString() : null,
        created_by: auth.userId,
      })
      .select('*')
      .single();

    if (error || !template) {
      console.error('[application-templates POST]', error);
      return NextResponse.json(
        { error: error?.message || 'Failed to create template' },
        { status: 500 },
      );
    }

    const requirementsInput = Array.isArray(body.requirements)
      ? body.requirements
      : [];
    let requirements: ReturnType<typeof mapRequirement>[] = [];

    if (requirementsInput.length) {
      const rows = requirementsInput.map(
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
          template_id: template.id,
          title: (r.title || `Requirement ${index + 1}`).trim(),
          description: r.description?.trim() || null,
          requirement_type: r.requirement_type || 'manual_checklist',
          config: r.config || {},
          is_required: r.is_required !== false,
          sort_order: typeof r.sort_order === 'number' ? r.sort_order : index,
        }),
      );

      const { data: inserted, error: reqError } = await supabaseAdmin
        .from('application_requirements')
        .insert(rows)
        .select('*');

      if (reqError) {
        console.error('[application-templates POST requirements]', reqError);
        return NextResponse.json({ error: reqError.message }, { status: 500 });
      }
      requirements = (inserted || []).map(mapRequirement);
    }

    return NextResponse.json({
      template: { ...template, requirements, files: [] },
    });
  } catch (e) {
    console.error('[application-templates POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
