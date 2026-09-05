import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/applications/auth';
import { assertCareerProgressAccess } from '@/lib/applications/career-access.server';
import { evaluateMilestoneWithDependencies } from '@/lib/applications/load-milestone-progress';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/career/milestones/[id]/progress
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;
    const { id } = await params;

    const access = await assertCareerProgressAccess(auth.userId);
    if ('error' in access) return access.error;

    const { data: milestone } = await supabaseAdmin
      .from('career_milestones')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!milestone || milestone.status !== 'published') {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    const result = await evaluateMilestoneWithDependencies(auth.userId, id);
    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[career/milestones/:id/progress GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/career/milestones/[id]/progress
 * Body: { requirementId, completed: boolean }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;
    const { id: milestoneId } = await params;
    const body = await req.json();

    const access = await assertCareerProgressAccess(auth.userId);
    if ('error' in access) return access.error;

    const requirementId =
      typeof body.requirementId === 'string' ? body.requirementId : '';
    if (!requirementId) {
      return NextResponse.json(
        { error: 'requirementId is required' },
        { status: 400 },
      );
    }

    const { data: reqRow } = await supabaseAdmin
      .from('milestone_requirements')
      .select('id, requirement_type, milestone_id')
      .eq('id', requirementId)
      .eq('milestone_id', milestoneId)
      .maybeSingle();

    if (
      !reqRow ||
      (reqRow.requirement_type !== 'manual_checklist' &&
        reqRow.requirement_type !== 'external_link')
    ) {
      return NextResponse.json(
        { error: 'Only manual checklist / external link items can be toggled' },
        { status: 400 },
      );
    }

    const { data: existing } = await supabaseAdmin
      .from('crew_milestone_progress')
      .select('completed_manual_ids, achieved_at')
      .eq('user_id', auth.userId)
      .eq('milestone_id', milestoneId)
      .maybeSingle();

    const current = new Set<string>(
      (existing?.completed_manual_ids as string[] | null) || [],
    );
    const completed = body.completed !== false;
    if (completed) current.add(requirementId);
    else current.delete(requirementId);

    await supabaseAdmin.from('crew_milestone_progress').upsert(
      {
        user_id: auth.userId,
        milestone_id: milestoneId,
        completed_manual_ids: Array.from(current),
        achieved_at: existing?.achieved_at ?? null,
      },
      { onConflict: 'user_id,milestone_id' },
    );

    const result = await evaluateMilestoneWithDependencies(auth.userId, milestoneId);
    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[career/milestones/:id/progress PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
