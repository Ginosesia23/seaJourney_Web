import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { mapRequirement, requireUser } from '@/lib/applications/auth';
import {
  evaluateRequirements,
  progressFromEvaluations,
  sumDocumentedSea,
} from '@/lib/applications/evaluate-requirements';
import type { ApplicationRequirement } from '@/lib/applications/types';
import { generateSeaTimeReportData } from '@/app/actions';

type Params = { params: Promise<{ templateId: string }> };

async function loadProgress(userId: string, templateId: string) {
  const { data: template } = await supabaseAdmin
    .from('application_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (!template || template.status !== 'published') {
    return { error: 'Application not found', status: 404 as const };
  }

  const [
    { data: requirements },
    { data: files },
    { data: application },
    { data: profile },
    { data: certificates },
    { data: testimonials },
    { data: proof },
  ] = await Promise.all([
    supabaseAdmin
      .from('application_requirements')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('application_template_files')
      .select('id, template_id, file_name, content_type, file_size, created_at')
      .eq('template_id', templateId),
    supabaseAdmin
      .from('crew_applications')
      .select('*')
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .maybeSingle(),
    supabaseAdmin.from('users').select('*').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('certificates').select('*').eq('user_id', userId),
    supabaseAdmin.from('testimonials').select('*').eq('user_id', userId),
    supabaseAdmin
      .from('proof_of_service')
      .select('id')
      .eq('crew_user_id', userId),
  ]);

  const mappedReqs = (requirements || []).map(
    mapRequirement,
  ) as ApplicationRequirement[];

  const needsTracked = mappedReqs.some(
    (r) =>
      r.requirement_type === 'sea_time_min' &&
      (r.config?.source || 'testimonials') === 'tracked',
  );

  let trackedSea: {
    atSeaDays: number;
    totalDays: number;
    standbyDays: number;
  } | null = null;

  if (needsTracked) {
    try {
      const report = await generateSeaTimeReportData(userId, 'date_range', undefined, {
        from: new Date('1990-01-01T00:00:00Z'),
        to: new Date(),
      });
      trackedSea = {
        atSeaDays: report.totalSeaDays,
        totalDays: report.totalDays,
        standbyDays: report.totalStandbyDays,
      };
    } catch (e) {
      console.warn('[applications progress] tracked sea time failed', e);
      trackedSea = { atSeaDays: 0, totalDays: 0, standbyDays: 0 };
    }
  }

  const completedManualIds = new Set<string>(
    (application?.completed_manual_ids as string[] | null) || [],
  );

  const evaluations = evaluateRequirements(mappedReqs, {
    profile: profile as Record<string, unknown> | null,
    certificates: certificates || [],
    testimonials: testimonials || [],
    proofOfService: proof || [],
    documentedSea: sumDocumentedSea(testimonials || []),
    trackedSea,
    completedManualIds,
  });

  const progress = progressFromEvaluations(evaluations);
  const nextStatus = progress.allRequiredMet ? 'ready' : 'in_progress';

  let applicationOut = application;
  if (application && application.status !== 'withdrawn') {
    const { data: updated } = await supabaseAdmin
      .from('crew_applications')
      .update({
        progress_pct: progress.percent,
        status: nextStatus,
      })
      .eq('id', application.id)
      .select('*')
      .maybeSingle();
    applicationOut = updated || application;
  }

  return {
    template: {
      ...template,
      requirements: mappedReqs,
      files: files || [],
    },
    application: applicationOut,
    evaluations,
    progress,
    documentedSea: sumDocumentedSea(testimonials || []),
    trackedSea,
  };
}

/**
 * GET /api/applications/[templateId]/progress
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;
    const { templateId } = await params;

    const result = await loadProgress(auth.userId, templateId);
    if ('error' in result && result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[applications progress GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/applications/[templateId]/progress
 * Body: { requirementId, completed: boolean } — toggle manual / external items
 *   or { withdraw: true }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;
    const { templateId } = await params;
    const body = await req.json();

    const { data: application } = await supabaseAdmin
      .from('crew_applications')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('template_id', templateId)
      .maybeSingle();

    if (!application) {
      return NextResponse.json(
        { error: 'Start this application first' },
        { status: 404 },
      );
    }

    if (body.withdraw === true) {
      await supabaseAdmin
        .from('crew_applications')
        .update({ status: 'withdrawn', progress_pct: 0 })
        .eq('id', application.id);
      return NextResponse.json({ ok: true, withdrawn: true });
    }

    const requirementId =
      typeof body.requirementId === 'string' ? body.requirementId : '';
    if (!requirementId) {
      return NextResponse.json(
        { error: 'requirementId is required' },
        { status: 400 },
      );
    }

    const { data: reqRow } = await supabaseAdmin
      .from('application_requirements')
      .select('id, requirement_type, template_id')
      .eq('id', requirementId)
      .eq('template_id', templateId)
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

    const current = new Set<string>(
      (application.completed_manual_ids as string[] | null) || [],
    );
    const completed = body.completed !== false;
    if (completed) current.add(requirementId);
    else current.delete(requirementId);

    await supabaseAdmin
      .from('crew_applications')
      .update({ completed_manual_ids: Array.from(current) })
      .eq('id', application.id);

    const result = await loadProgress(auth.userId, templateId);
    if ('error' in result && result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('[applications progress PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
