import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { syncCrewStateFromAis } from '@/lib/ais/sync-crew-state-from-ais';
import { hasCrewAisLiveTrackingTier } from '@/supabase/database/subscription-helpers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Bearer-token authenticate the caller, and require them to be a paid crew
 * (Premium / Professional) user. Admins are also allowed.
 */
async function authenticateCrew(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const token = authHeader.slice(7);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, ais_live_tracking_enabled, ais_live_last_sync_at, ais_live_last_sync_error',
    )
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return {
      error: NextResponse.json({ error: 'User profile not found' }, { status: 404 }),
    };
  }

  if (!hasCrewAisLiveTrackingTier(profile)) {
    return {
      error: NextResponse.json(
        {
          error:
            'Live AIS tracking requires Crew Premium or Professional. Upgrade to enable.',
        },
        { status: 402 },
      ),
    };
  }

  return { userId: user.id, profile };
}

type ActiveAssignment = {
  vesselId: string;
  vesselName: string | null;
  mmsi: string | null;
  imo: string | null;
  startDate: string | null;
  endDate: string | null;
};

/**
 * Resolve the crew user's currently-active vessel from `vessel_assignments`
 * (source of truth), falling back to `users.active_vessel_id` if no active row.
 */
async function resolveActiveVessel(
  userId: string,
): Promise<ActiveAssignment | null> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: assignments } = await supabaseAdmin
    .from('vessel_assignments')
    .select('vessel_id, start_date, end_date')
    .eq('user_id', userId)
    .or(`end_date.is.null,end_date.gte.${todayIso}`)
    .order('start_date', { ascending: false })
    .limit(1);

  const row = assignments?.[0];
  if (row?.vessel_id) {
    const { data: v } = await supabaseAdmin
      .from('vessels')
      .select('id, name, mmsi, imo')
      .eq('id', row.vessel_id as string)
      .maybeSingle();
    return {
      vesselId: row.vessel_id as string,
      vesselName: (v?.name as string) ?? null,
      mmsi: (v?.mmsi as string) ?? null,
      imo: (v?.imo as string) ?? null,
      startDate: (row.start_date as string) ?? null,
      endDate: (row.end_date as string) ?? null,
    };
  }

  // Fallback to `users.active_vessel_id` (may be stale).
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('active_vessel_id')
    .eq('id', userId)
    .maybeSingle();

  const activeVesselId = userRow?.active_vessel_id as string | null | undefined;
  if (!activeVesselId) return null;

  const { data: v } = await supabaseAdmin
    .from('vessels')
    .select('id, name, mmsi, imo')
    .eq('id', activeVesselId)
    .maybeSingle();
  if (!v) return null;
  return {
    vesselId: v.id as string,
    vesselName: (v.name as string) ?? null,
    mmsi: (v.mmsi as string) ?? null,
    imo: (v.imo as string) ?? null,
    startDate: null,
    endDate: null,
  };
}

async function loadTodaySampleSummary(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: samples } = await supabaseAdmin
    .from('crew_ais_state_samples')
    .select('id, state, sampled_at, nav_status, speed_kn')
    .eq('user_id', userId)
    .eq('sample_date', today)
    .order('sampled_at', { ascending: true });
  return { today, samples: samples ?? [] };
}

/** GET /api/ais/crew-tracking – return crew's tracking status + today's samples. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateCrew(req);
    if ('error' in auth) return auth.error;

    const activeVessel = await resolveActiveVessel(auth.userId);
    const { today, samples } = await loadTodaySampleSummary(auth.userId);

    // Latest resolved daily state (what the analyzer decided) — sourced from
    // the daily_state_log row so the UI can show the same verdict that gets
    // saved to the calendar.
    let todayDailyState: string | null = null;
    let todayNotes: string | null = null;
    if (activeVessel) {
      const { data: log } = await supabaseAdmin
        .from('daily_state_logs')
        .select('state, notes')
        .eq('user_id', auth.userId)
        .eq('vessel_id', activeVessel.vesselId)
        .eq('date', today)
        .maybeSingle();
      todayDailyState = (log?.state as string) ?? null;
      todayNotes = (log?.notes as string) ?? null;
    }

    return NextResponse.json({
      enabled: !!auth.profile.ais_live_tracking_enabled,
      lastSyncAt: auth.profile.ais_live_last_sync_at ?? null,
      lastError: auth.profile.ais_live_last_sync_error ?? null,
      activeVessel,
      today,
      todayDailyState,
      todayNotes,
      samples: samples.map((s: any) => ({
        id: s.id,
        state: s.state,
        sampledAt: s.sampled_at,
        navStatus: s.nav_status ?? null,
        speedKn: s.speed_kn ?? null,
      })),
    });
  } catch (err) {
    console.error('[CREW AIS TRACKING GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/** PATCH /api/ais/crew-tracking { enabled: boolean, logDate?: string } */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateCrew(req);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const enabled = body.enabled as boolean | undefined;
    const logDate = body.logDate as string | undefined;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled (boolean) is required' },
        { status: 400 },
      );
    }

    const activeVessel = await resolveActiveVessel(auth.userId);
    if (enabled) {
      if (!activeVessel) {
        return NextResponse.json(
          {
            error:
              'Add an active vessel assignment on Current Service before enabling live AIS tracking.',
          },
          { status: 400 },
        );
      }
      if (!activeVessel.mmsi && !activeVessel.imo) {
        return NextResponse.json(
          {
            error:
              'Your active vessel needs an MMSI or IMO on file for AIS tracking to work. Ask your captain/vessel manager to add it.',
          },
          { status: 400 },
        );
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        ais_live_tracking_enabled: enabled,
        // Clear stale error when disabling.
        ...(enabled ? {} : { ais_live_last_sync_error: null }),
      })
      .eq('id', auth.userId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to update AIS tracking' },
        { status: 500 },
      );
    }

    let syncResult = null;
    if (enabled && activeVessel) {
      syncResult = await syncCrewStateFromAis(
        {
          userId: auth.userId,
          vesselId: activeVessel.vesselId,
          mmsi: activeVessel.mmsi,
          imo: activeVessel.imo,
        },
        { logDate },
      );
    }

    return NextResponse.json({
      enabled,
      activeVessel,
      sync: syncResult,
    });
  } catch (err) {
    console.error('[CREW AIS TRACKING PATCH]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/** POST /api/ais/crew-tracking { logDate?: string } – manual sync. */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateCrew(req);
    if ('error' in auth) return auth.error;

    if (!auth.profile.ais_live_tracking_enabled) {
      return NextResponse.json(
        { error: 'Enable live AIS tracking before running a manual sync.' },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const logDate = body.logDate as string | undefined;

    const activeVessel = await resolveActiveVessel(auth.userId);
    if (!activeVessel) {
      return NextResponse.json(
        { error: 'No active vessel assignment found.' },
        { status: 400 },
      );
    }

    const result = await syncCrewStateFromAis(
      {
        userId: auth.userId,
        vesselId: activeVessel.vesselId,
        mmsi: activeVessel.mmsi,
        imo: activeVessel.imo,
      },
      { logDate },
    );

    return NextResponse.json({ sync: result });
  } catch (err) {
    console.error('[CREW AIS TRACKING POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
