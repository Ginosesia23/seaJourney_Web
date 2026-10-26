import { NextRequest, NextResponse } from 'next/server';

import { syncOnboardFromCrewDailyState } from '@/lib/crew-rotation/onboard-leave-side-effects';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { format, startOfDay } from 'date-fns';

/**
 * POST /api/crew-rotation/crew-state-sync
 *
 * Crew saved their own daily state. If today is On Leave, mark them
 * off-board on the vessel Onboard Tracker. If they come off a tracker
 * leave day, mark them back onboard.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const vesselId = typeof body.vesselId === 'string' ? body.vesselId : '';
    if (!vesselId) {
      return NextResponse.json({ error: 'Missing vesselId' }, { status: 400 });
    }

    const todayIso = format(startOfDay(new Date()), 'yyyy-MM-dd');
    const { data: log } = await supabaseAdmin
      .from('daily_state_logs')
      .select('state')
      .eq('user_id', user.id)
      .eq('vessel_id', vesselId)
      .eq('date', todayIso)
      .maybeSingle();

    if (!log?.state) {
      return NextResponse.json({ ok: true, synced: false, reason: 'no_today_log' });
    }

    const result = await syncOnboardFromCrewDailyState({
      crewUserId: user.id,
      vesselId,
      dateIso: todayIso,
      state: String(log.state),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[crew-state-sync]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
