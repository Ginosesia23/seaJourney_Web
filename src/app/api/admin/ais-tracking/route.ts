import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';

/**
 * Admin roster of who currently has AIS live tracking opted in.
 *
 * GET → { crew: [...], vessels: [...] }
 */

const CREW_PREMIUM_PLUS = new Set(['premium', 'pro', 'professional']);
const VESSEL_MANAGED_FREE = new Set(['crew_limited', 'vessel_linked']);

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) return user.id;
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

async function requireAdmin(req: NextRequest): Promise<
  | { ok: true; actorId: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const actorId = await getAuthedUserId(req);
  if (!actorId) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  const { data: actor, error } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', actorId)
    .single();
  if (error || !actor || actor.role !== 'admin') {
    return { ok: false, status: 403, body: { error: 'Forbidden' } };
  }
  return { ok: true, actorId };
}

function displayName(u: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return full || u.username || u.email || 'Unknown';
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const [
      { data: crewRows, error: crewErr },
      { data: vesselRows, error: vesselErr },
    ] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select(
          [
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'role',
            'position',
            'subscription_tier',
            'subscription_status',
            'cancel_at_period_end',
            'current_period_end',
            'active_vessel_id',
            'ais_live_tracking_enabled',
            'ais_live_last_sync_at',
            'ais_live_last_sync_error',
          ].join(', '),
        )
        .eq('ais_live_tracking_enabled', true)
        .in('role', ['crew', 'captain'])
        .order('ais_live_last_sync_at', { ascending: false, nullsFirst: false }),
      supabaseAdmin
        .from('vessels')
        .select(
          [
            'id',
            'name',
            'mmsi',
            'imo',
            'vessel_manager_id',
            'ais_tracking_enabled',
            'ais_last_sync_at',
            'ais_last_nav_status',
            'ais_last_speed',
            'ais_last_position_at',
            'ais_last_sync_error',
          ].join(', '),
        )
        .eq('ais_tracking_enabled', true)
        .order('ais_last_sync_at', { ascending: false, nullsFirst: false }),
    ]);

    if (crewErr) {
      console.error('[admin/ais-tracking] crew query', crewErr);
      return NextResponse.json(
        { error: 'Failed to load crew trackers' },
        { status: 500 },
      );
    }
    if (vesselErr) {
      console.error('[admin/ais-tracking] vessel query', vesselErr);
      return NextResponse.json(
        { error: 'Failed to load vessel trackers' },
        { status: 500 },
      );
    }

    const vesselIds = new Set<string>();
    for (const c of crewRows ?? []) {
      if (c.active_vessel_id) vesselIds.add(c.active_vessel_id);
    }
    for (const v of vesselRows ?? []) {
      vesselIds.add(v.id);
    }

    const managerIds = [
      ...new Set(
        (vesselRows ?? [])
          .map((v) => v.vessel_manager_id)
          .filter(Boolean) as string[],
      ),
    ];

    const [{ data: vesselsMeta }, { data: managers }] = await Promise.all([
      vesselIds.size > 0
        ? supabaseAdmin
            .from('vessels')
            .select('id, name, mmsi, imo')
            .in('id', [...vesselIds])
        : Promise.resolve({ data: [] as any[] }),
      managerIds.length > 0
        ? supabaseAdmin
            .from('users')
            .select(
              'id, email, username, first_name, last_name, subscription_tier, subscription_status, cancel_at_period_end, current_period_end',
            )
            .in('id', managerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const vesselById = new Map(
      (vesselsMeta ?? []).map((v: any) => [v.id as string, v]),
    );
    const managerById = new Map(
      (managers ?? []).map((m: any) => [m.id as string, m]),
    );

    const crew = (crewRows ?? []).map((u: any) => {
      const tier = String(u.subscription_tier || 'free').toLowerCase().trim();
      const subActive = hasActiveSubscription(u);
      const eligibleForCron =
        !VESSEL_MANAGED_FREE.has(tier) &&
        CREW_PREMIUM_PLUS.has(tier) &&
        subActive;
      const vessel = u.active_vessel_id
        ? vesselById.get(u.active_vessel_id)
        : null;

      return {
        id: u.id as string,
        name: displayName(u),
        email: (u.email as string | null) ?? null,
        role: u.role as string,
        position: (u.position as string | null) ?? null,
        subscriptionTier: tier,
        subscriptionStatus: (u.subscription_status as string | null) ?? null,
        subscriptionActive: subActive,
        cronEligible: eligibleForCron,
        activeVesselId: (u.active_vessel_id as string | null) ?? null,
        activeVesselName: (vessel?.name as string | null) ?? null,
        activeVesselMmsi: (vessel?.mmsi as string | null) ?? null,
        lastSyncAt: (u.ais_live_last_sync_at as string | null) ?? null,
        lastSyncError: (u.ais_live_last_sync_error as string | null) ?? null,
      };
    });

    const vessels = (vesselRows ?? []).map((v: any) => {
      const manager = v.vessel_manager_id
        ? managerById.get(v.vessel_manager_id)
        : null;
      const managerSubActive = manager
        ? hasActiveSubscription(manager)
        : false;

      return {
        id: v.id as string,
        name: (v.name as string | null) ?? 'Unnamed vessel',
        mmsi: (v.mmsi as string | null) ?? null,
        imo: (v.imo as string | null) ?? null,
        managerId: (v.vessel_manager_id as string | null) ?? null,
        managerName: manager ? displayName(manager) : null,
        managerEmail: (manager?.email as string | null) ?? null,
        managerTier: manager
          ? String(manager.subscription_tier || 'free').toLowerCase().trim()
          : null,
        managerSubscriptionActive: managerSubActive,
        lastSyncAt: (v.ais_last_sync_at as string | null) ?? null,
        lastPositionAt: (v.ais_last_position_at as string | null) ?? null,
        lastNavStatus: (v.ais_last_nav_status as string | null) ?? null,
        lastSpeedKn:
          v.ais_last_speed == null ? null : Number(v.ais_last_speed),
        lastSyncError: (v.ais_last_sync_error as string | null) ?? null,
      };
    });

    return NextResponse.json({
      crew,
      vessels,
      counts: {
        crew: crew.length,
        vessels: vessels.length,
        crewCronEligible: crew.filter((c) => c.cronEligible).length,
        crewWithErrors: crew.filter((c) => !!c.lastSyncError).length,
        vesselsWithErrors: vessels.filter((v) => !!v.lastSyncError).length,
      },
    });
  } catch (error) {
    console.error('[admin/ais-tracking] unexpected', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
