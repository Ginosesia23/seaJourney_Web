import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isVesselLinkedFeatureGranted,
  vesselLinkedOwnedVesselId,
} from '@/lib/vessel-linked-features';
import type { SchedulableCrew, WatchSchedule } from '@/lib/watch-schedule-types';
import {
  assignmentsOnWatchNow,
  parseWatchScheduleRow,
} from '@/lib/watch-schedule-now';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function canViewLinkedVesselWatch(profile: unknown): boolean {
  return (
    isVesselLinkedFeatureGranted(profile, 'watch_roster') ||
    isVesselLinkedFeatureGranted(profile, 'bridge_watch_log')
  );
}

async function loadCrewPool(vesselId: string): Promise<SchedulableCrew[]> {
  const [linkedRes, assignRes] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, role, position')
      .eq('managed_by_vessel_id', vesselId),
    supabaseAdmin
      .from('vessel_assignments')
      .select('user_id, position, onboard')
      .eq('vessel_id', vesselId)
      .is('end_date', null)
      .eq('onboard', true),
  ]);

  const seen = new Set<string>();
  const pool: SchedulableCrew[] = [];

  for (const row of linkedRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const name =
      [r.first_name, r.last_name].filter(Boolean).join(' ') ||
      String(r.email || id);
    pool.push({
      id,
      displayName: name,
      position: (r.position as string | null) ?? null,
      source: 'linked_account',
    });
  }

  const onboard = assignRes.data ?? [];
  const missingIds = onboard
    .map((a: { user_id: string }) => a.user_id)
    .filter((id) => !seen.has(id));

  if (missingIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name')
      .in('id', missingIds);
    const positionByUserId = new Map<string, string | null>();
    for (const a of onboard as { user_id: string; position?: string | null }[]) {
      positionByUserId.set(a.user_id, a.position ?? null);
    }
    for (const u of profiles ?? []) {
      const r = u as Record<string, unknown>;
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(' ') ||
        String(r.email || id);
      pool.push({
        id,
        displayName: name,
        position: positionByUserId.get(id) ?? null,
        source: 'vessel_assignment',
      });
    }
  }

  return pool;
}

/**
 * GET /api/watch-schedule
 * Vessel-scoped watch plans for a granted linked captain account.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, subscription_tier, subscription_status, active_vessel_id, managed_by_vessel_id, linked_account_features',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!canViewLinkedVesselWatch(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const vesselId = vesselLinkedOwnedVesselId(profile);
    if (!vesselId) {
      return NextResponse.json({
        vesselId: null,
        vesselName: null,
        schedules: [],
        crew: [],
        currentlyOnWatch: [],
      });
    }

    const [{ data: vessel }, { data: rows, error: schedErr }] = await Promise.all([
      supabaseAdmin.from('vessels').select('id, name').eq('id', vesselId).maybeSingle(),
      supabaseAdmin
        .from('watch_schedules')
        .select('*')
        .eq('vessel_id', vesselId)
        .order('created_at', { ascending: false }),
    ]);

    if (schedErr) throw schedErr;

    const schedules: WatchSchedule[] = (rows ?? []).map((d) =>
      parseWatchScheduleRow(d as Record<string, unknown>),
    );
    const crew = await loadCrewPool(vesselId);

    return NextResponse.json({
      vesselId,
      vesselName: (vessel as { name?: string } | null)?.name ?? 'Vessel',
      schedules,
      crew,
      currentlyOnWatch: assignmentsOnWatchNow(schedules),
    });
  } catch (err) {
    console.error('[watch-schedule GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load watch schedule' },
      { status: 500 },
    );
  }
}
