import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import { replayAisDay } from '@/lib/ais/replay-ais-day';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function requireAdmin(userId: string) {
  const { data: actor } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (!actor || actor.role !== 'admin') return null;
  return actor;
}

/**
 * GET /api/admin/ais-wrong-state-reports/[id]/replay
 * Re-run AIS day detection for a wrong-state report (samples + aggregate reason).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;
  if (!(await requireAdmin(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const resolveSamples = req.nextUrl.searchParams.get('resolveSamples') !== '0';

  const { data: report, error } = await supabaseAdmin
    .from('ais_state_reports')
    .select(
      'id, account_type, vessel_id, subject_user_id, log_date, detected_state, suggested_state, detection_snapshot, ais_nav_status, ais_speed_kn, notes, status',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    // Column may not exist yet if SQL migration not applied — retry without it
    if (error.message?.includes('detection_snapshot')) {
      const { data: reportFallback, error: err2 } = await supabaseAdmin
        .from('ais_state_reports')
        .select(
          'id, account_type, vessel_id, subject_user_id, log_date, detected_state, suggested_state, ais_nav_status, ais_speed_kn, notes, status',
        )
        .eq('id', id)
        .maybeSingle();
      if (err2 || !reportFallback) {
        return NextResponse.json(
          { error: err2?.message || 'Report not found' },
          { status: err2 ? 500 : 404 },
        );
      }
      try {
        const replay = await replayAisDay({
          accountType: reportFallback.account_type === 'crew' ? 'crew' : 'vessel',
          vesselId: reportFallback.vessel_id,
          subjectUserId: reportFallback.subject_user_id,
          logDate: reportFallback.log_date,
          resolveSamples,
        });
        return NextResponse.json({
          report: {
            id: reportFallback.id,
            accountType: reportFallback.account_type,
            logDate: reportFallback.log_date,
            detectedState: reportFallback.detected_state,
            suggestedState: reportFallback.suggested_state,
            aisNavStatus: reportFallback.ais_nav_status,
            aisSpeedKn:
              reportFallback.ais_speed_kn != null
                ? Number(reportFallback.ais_speed_kn)
                : null,
            notes: reportFallback.notes,
            status: reportFallback.status,
            detectionSnapshot: null,
          },
          replay,
        });
      } catch (err) {
        console.error('[admin ais-wrong-state replay]', err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Replay failed' },
          { status: 500 },
        );
      }
    }
    console.error('[admin ais-wrong-state replay]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  try {
    const replay = await replayAisDay({
      accountType: report.account_type === 'crew' ? 'crew' : 'vessel',
      vesselId: report.vessel_id,
      subjectUserId: report.subject_user_id,
      logDate: report.log_date,
      resolveSamples,
    });

    return NextResponse.json({
      report: {
        id: report.id,
        accountType: report.account_type,
        logDate: report.log_date,
        detectedState: report.detected_state,
        suggestedState: report.suggested_state,
        aisNavStatus: report.ais_nav_status,
        aisSpeedKn: report.ais_speed_kn != null ? Number(report.ais_speed_kn) : null,
        notes: report.notes,
        status: report.status,
        detectionSnapshot: report.detection_snapshot ?? null,
      },
      replay,
    });
  } catch (err) {
    console.error('[admin ais-wrong-state replay]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Replay failed' },
      { status: 500 },
    );
  }
}
