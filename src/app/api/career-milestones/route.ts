import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/applications/auth';
import { TARGETABLE_LEVELS } from '@/lib/applications/career-path';
import { mapMilestoneRequirement } from '@/lib/applications/milestones';

const ALLOWED_TRACKS = new Set(['deck', 'engine', 'interior', 'galley', 'any']);
const ALLOWED_LEVELS = new Set(TARGETABLE_LEVELS.map((t) => t.level));
const ALLOWED_STATUS = new Set(['draft', 'published', 'archived']);
const ALLOWED_METRICS = new Set(['atSeaDays', 'totalDays', 'standbyDays']);
const ALLOWED_SOURCES = new Set(['testimonials', 'tracked']);

function parseMilestoneFields(body: Record<string, unknown>) {
  const track =
    typeof body.track === 'string' && ALLOWED_TRACKS.has(body.track)
      ? body.track
      : 'deck';
  const level_key =
    typeof body.level_key === 'string' && ALLOWED_LEVELS.has(body.level_key as never)
      ? body.level_key
      : 'other';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const description =
    typeof body.description === 'string' ? body.description.trim() || null : null;
  const sort_order =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? body.sort_order
      : 0;
  const sea_time_metric =
    typeof body.sea_time_metric === 'string' &&
    ALLOWED_METRICS.has(body.sea_time_metric)
      ? body.sea_time_metric
      : null;
  const sea_time_min =
    typeof body.sea_time_min === 'number' && body.sea_time_min >= 0
      ? body.sea_time_min
      : null;
  const sea_time_source =
    typeof body.sea_time_source === 'string' &&
    ALLOWED_SOURCES.has(body.sea_time_source)
      ? body.sea_time_source
      : null;
  const status =
    typeof body.status === 'string' && ALLOWED_STATUS.has(body.status)
      ? body.status
      : 'draft';

  return {
    track,
    level_key,
    label,
    description,
    sort_order,
    sea_time_metric,
    sea_time_min,
    sea_time_source,
    status,
  };
}

/**
 * GET  /api/career-milestones — list milestones (admin)
 * POST /api/career-milestones — create milestone (admin)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const { data: milestones, error } = await supabaseAdmin
      .from('career_milestones')
      .select('*')
      .order('track', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[career-milestones GET]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ids = (milestones || []).map((m) => m.id);
    const requirementsByMilestone = new Map<
      string,
      ReturnType<typeof mapMilestoneRequirement>[]
    >();

    if (ids.length) {
      const { data: reqs } = await supabaseAdmin
        .from('milestone_requirements')
        .select('*')
        .in('milestone_id', ids)
        .order('sort_order', { ascending: true });

      for (const r of reqs || []) {
        const list = requirementsByMilestone.get(r.milestone_id) || [];
        list.push(mapMilestoneRequirement(r));
        requirementsByMilestone.set(r.milestone_id, list);
      }
    }

    return NextResponse.json({
      milestones: (milestones || []).map((m) => ({
        ...m,
        requirements: requirementsByMilestone.get(m.id) || [],
      })),
    });
  } catch (e) {
    console.error('[career-milestones GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const fields = parseMilestoneFields(body);
    if (!fields.label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    const { data: milestone, error } = await supabaseAdmin
      .from('career_milestones')
      .insert({
        ...fields,
        published_at:
          fields.status === 'published' ? new Date().toISOString() : null,
      })
      .select('*')
      .single();

    if (error || !milestone) {
      console.error('[career-milestones POST]', error);
      return NextResponse.json(
        { error: error?.message || 'Failed to create milestone' },
        { status: 500 },
      );
    }

    const requirementsInput = Array.isArray(body.requirements)
      ? body.requirements
      : [];
    let requirements: ReturnType<typeof mapMilestoneRequirement>[] = [];

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
          milestone_id: milestone.id,
          title: (r.title || `Requirement ${index + 1}`).trim(),
          description: r.description?.trim() || null,
          requirement_type: r.requirement_type || 'manual_checklist',
          config: r.config || {},
          is_required: r.is_required !== false,
          sort_order: typeof r.sort_order === 'number' ? r.sort_order : index,
        }),
      );

      const { data: inserted, error: reqError } = await supabaseAdmin
        .from('milestone_requirements')
        .insert(rows)
        .select('*');

      if (reqError) {
        console.error('[career-milestones POST requirements]', reqError);
        return NextResponse.json({ error: reqError.message }, { status: 500 });
      }
      requirements = (inserted || []).map(mapMilestoneRequirement);
    }

    return NextResponse.json({
      milestone: { ...milestone, requirements },
    });
  } catch (e) {
    console.error('[career-milestones POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
