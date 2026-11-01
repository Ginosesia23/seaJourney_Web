import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import {
  acknowledgeLogMilestone,
  parseLogMilestoneProgress,
  type LogMilestoneMetric,
} from '@/lib/log-milestones';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const METRICS: LogMilestoneMetric[] = ['sea_days', 'distance_nm', 'passages'];

function isMissingLogMilestonesColumn(error: { message?: string } | null | undefined): boolean {
  return String(error?.message || '').includes('log_milestones');
}

/**
 * POST /api/activity-rail/milestones
 * Mark a logbook milestone as seen so it does not return in the attention bar.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as {
      metric?: string;
      threshold?: number;
    };
    const metric = body.metric as LogMilestoneMetric;
    const threshold = Number(body.threshold);
    if (!METRICS.includes(metric) || !Number.isFinite(threshold) || threshold <= 0) {
      return NextResponse.json({ error: 'Invalid milestone' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('log_milestones')
      .eq('id', auth.userId)
      .maybeSingle();
    if (error) {
      if (isMissingLogMilestonesColumn(error)) {
        return NextResponse.json({
          ok: false,
          error:
            'Database is missing log_milestones. Run sql/add-log-milestones.sql in Supabase.',
        }, { status: 500 });
      }
      throw error;
    }

    const next = acknowledgeLogMilestone(
      parseLogMilestoneProgress(data?.log_milestones),
      metric,
      threshold,
    );
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ log_milestones: next })
      .eq('id', auth.userId);
    if (updateError) {
      if (isMissingLogMilestonesColumn(updateError)) {
        return NextResponse.json({
          ok: false,
          error:
            'Database is missing log_milestones. Run sql/add-log-milestones.sql in Supabase.',
        }, { status: 500 });
      }
      throw updateError;
    }

    return NextResponse.json({ ok: true, log_milestones: next });
  } catch (error) {
    console.error('[activity-rail/milestones]', error);
    return NextResponse.json(
      { error: 'Failed to save milestone' },
      { status: 500 },
    );
  }
}
