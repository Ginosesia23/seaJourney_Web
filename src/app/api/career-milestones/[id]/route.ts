import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/applications/auth';
import { TARGETABLE_LEVELS } from '@/lib/applications/career-path';
import { mapMilestoneRequirement } from '@/lib/applications/milestones';

type Params = { params: Promise<{ id: string }> };

const ALLOWED_TRACKS = new Set(['deck', 'engine', 'interior', 'galley', 'any']);
const ALLOWED_LEVELS = new Set(TARGETABLE_LEVELS.map((t) => t.level));
const ALLOWED_METRICS = new Set(['atSeaDays', 'totalDays', 'standbyDays']);
const ALLOWED_SOURCES = new Set(['testimonials', 'tracked']);

async function loadMilestone(id: string) {
  const { data: milestone, error } = await supabaseAdmin
    .from('career_milestones')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !milestone) return null;

  const { data: requirements } = await supabaseAdmin
    .from('milestone_requirements')
    .select('*')
    .eq('milestone_id', id)
    .order('sort_order', { ascending: true });

  return {
    ...milestone,
    requirements: (requirements || []).map(mapMilestoneRequirement),
  };
}

/**
 * GET    /api/career-milestones/[id]
 * PATCH  /api/career-milestones/[id]
 * DELETE /api/career-milestones/[id]
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;
    const milestone = await loadMilestone(id);
    if (!milestone) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ milestone });
  } catch (e) {
    console.error('[career-milestones/:id GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;

    const existing = await loadMilestone(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json();
    const patch: Record<string, unknown> = {};

    if (typeof body.track === 'string' && ALLOWED_TRACKS.has(body.track)) {
      patch.track = body.track;
    }
    if (
      typeof body.level_key === 'string' &&
      ALLOWED_LEVELS.has(body.level_key as never)
    ) {
      patch.level_key = body.level_key;
    }
    if (typeof body.label === 'string') patch.label = body.label.trim();
    if (typeof body.description === 'string') {
      patch.description = body.description.trim() || null;
    }
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
    if (
      body.sea_time_metric === null ||
      (typeof body.sea_time_metric === 'string' &&
        ALLOWED_METRICS.has(body.sea_time_metric))
    ) {
      patch.sea_time_metric = body.sea_time_metric;
    }
    if (body.sea_time_min === null || typeof body.sea_time_min === 'number') {
      patch.sea_time_min = body.sea_time_min;
    }
    if (
      body.sea_time_source === null ||
      (typeof body.sea_time_source === 'string' &&
        ALLOWED_SOURCES.has(body.sea_time_source))
    ) {
      patch.sea_time_source = body.sea_time_source;
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

    if (patch.label === '') {
      return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
    }

    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin
        .from('career_milestones')
        .update(patch)
        .eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (Array.isArray(body.requirements)) {
      const { error: delError } = await supabaseAdmin
        .from('milestone_requirements')
        .delete()
        .eq('milestone_id', id);
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
            milestone_id: id,
            title: (r.title || `Requirement ${index + 1}`).trim(),
            description: r.description?.trim() || null,
            requirement_type: r.requirement_type || 'manual_checklist',
            config: r.config || {},
            is_required: r.is_required !== false,
            sort_order: typeof r.sort_order === 'number' ? r.sort_order : index,
          }),
        );
        const { error: insError } = await supabaseAdmin
          .from('milestone_requirements')
          .insert(rows);
        if (insError) {
          return NextResponse.json({ error: insError.message }, { status: 500 });
        }
      }
    }

    const milestone = await loadMilestone(id);
    return NextResponse.json({ milestone });
  } catch (e) {
    console.error('[career-milestones/:id PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;

    const { error } = await supabaseAdmin
      .from('career_milestones')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[career-milestones/:id DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
