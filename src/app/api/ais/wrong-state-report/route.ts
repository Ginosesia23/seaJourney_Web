import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import { computeDetectionSnapshotForDay } from '@/lib/ais/replay-ais-day';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasCrewAisLiveTrackingTier } from '@/supabase/database/subscription-helpers';
import { getCrewVesselFeatureBoost } from '@/lib/crew-vessel-feature-boost.server';
import { hasVesselAisTrackingTier } from '@/lib/vessel-ais-access';

const VALID_STATES = new Set<DailyStatus>([
  'underway',
  'at-anchor',
  'in-port',
  'on-leave',
  'in-yard',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * POST /api/ais/wrong-state-report
 * Vessel or crew Premium AIS users report today's AIS-derived state as wrong.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const vesselId = typeof body.vesselId === 'string' ? body.vesselId : '';
  const accountType = body.accountType === 'crew' ? 'crew' : body.accountType === 'vessel' ? 'vessel' : null;
  const suggestedState = typeof body.suggestedState === 'string' ? body.suggestedState : '';
  const notes =
    typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : null;
  const logDate =
    typeof body.logDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.logDate)
      ? body.logDate
      : null;
  const aisNavStatus =
    typeof body.aisNavStatus === 'string' ? body.aisNavStatus.slice(0, 200) : null;
  const aisSpeedKn =
    typeof body.aisSpeedKn === 'number' && Number.isFinite(body.aisSpeedKn)
      ? body.aisSpeedKn
      : null;

  if (!vesselId || !accountType || !logDate) {
    return NextResponse.json(
      { error: 'vesselId, accountType, and logDate are required' },
      { status: 400 },
    );
  }
  if (!VALID_STATES.has(suggestedState as DailyStatus)) {
    return NextResponse.json({ error: 'Invalid suggestedState' }, { status: 400 });
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, ais_live_tracking_enabled, active_vessel_id',
    )
    .eq('id', auth.userId)
    .maybeSingle();
  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const role = String(profile.role || '').toLowerCase();

  if (accountType === 'vessel') {
    if (role !== 'vessel' && role !== 'admin') {
      return NextResponse.json({ error: 'Vessel accounts only' }, { status: 403 });
    }
    if (role === 'vessel' && !hasVesselAisTrackingTier(profile)) {
      return NextResponse.json(
        { error: 'AIS tracking is not available on your plan' },
        { status: 403 },
      );
    }
    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('id, vessel_manager_id, ais_tracking_enabled')
      .eq('id', vesselId)
      .maybeSingle();
    if (!vessel) {
      return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });
    }
    if (role === 'vessel' && vessel.vessel_manager_id !== auth.userId) {
      return NextResponse.json({ error: 'Not your vessel' }, { status: 403 });
    }
    if (!vessel.ais_tracking_enabled) {
      return NextResponse.json(
        { error: 'AIS tracking is not enabled for this vessel' },
        { status: 400 },
      );
    }
  } else {
    if (role === 'vessel') {
      return NextResponse.json({ error: 'Crew AIS reports only' }, { status: 403 });
    }
    const vesselBoost = await getCrewVesselFeatureBoost(auth.userId);
    if (!hasCrewAisLiveTrackingTier(profile, vesselBoost)) {
      return NextResponse.json(
        { error: 'Crew AIS tracking is not available on your plan' },
        { status: 403 },
      );
    }
    if (!(profile as { ais_live_tracking_enabled?: boolean }).ais_live_tracking_enabled) {
      return NextResponse.json(
        { error: 'Enable live AIS tracking before reporting' },
        { status: 400 },
      );
    }
  }

  // Resolve detected state from the daily log for this user/vessel/date
  const { data: logRow } = await supabaseAdmin
    .from('daily_state_logs')
    .select('state')
    .eq('user_id', auth.userId)
    .eq('vessel_id', vesselId)
    .eq('date', logDate)
    .maybeSingle();

  const detectedState =
    logRow?.state && VALID_STATES.has(logRow.state as DailyStatus)
      ? (logRow.state as DailyStatus)
      : null;

  if (detectedState && detectedState === suggestedState) {
    return NextResponse.json(
      { error: 'Suggested state must differ from the current AIS state' },
      { status: 400 },
    );
  }

  let detectionSnapshot: Awaited<
    ReturnType<typeof computeDetectionSnapshotForDay>
  > | null = null;
  try {
    detectionSnapshot = await computeDetectionSnapshotForDay({
      accountType,
      vesselId,
      subjectUserId: auth.userId,
      logDate,
    });
  } catch (err) {
    console.warn('[ais wrong-state-report] snapshot failed', err);
  }

  const baseInsert = {
    reported_by_user_id: auth.userId,
    subject_user_id: auth.userId,
    vessel_id: vesselId,
    account_type: accountType,
    log_date: logDate,
    detected_state: detectedState,
    suggested_state: suggestedState,
    ais_nav_status: aisNavStatus,
    ais_speed_kn: aisSpeedKn,
    notes: notes || null,
    status: 'open' as const,
  };

  let inserted: { id: string; status: string; created_at: string } | null = null;
  let insertErr: { code?: string; message: string } | null = null;

  {
    const result = await supabaseAdmin
      .from('ais_state_reports')
      .insert({
        ...baseInsert,
        ...(detectionSnapshot ? { detection_snapshot: detectionSnapshot } : {}),
      })
      .select('id, status, created_at')
      .single();
    inserted = result.data;
    insertErr = result.error;
  }

  // Column may not exist until SQL migration is applied — retry without snapshot.
  if (insertErr?.message?.includes('detection_snapshot')) {
    const result = await supabaseAdmin
      .from('ais_state_reports')
      .insert(baseInsert)
      .select('id, status, created_at')
      .single();
    inserted = result.data;
    insertErr = result.error;
  }

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json(
        { error: 'You already have an open report for this day' },
        { status: 409 },
      );
    }
    console.error('[ais wrong-state-report]', insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ report: inserted });
}
