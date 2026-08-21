import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  canonicalizeVesselTier,
  hasActiveSubscription,
  hasAisHistoryImportTier,
  VESSEL_PREMIUM_PLUS_TIERS,
} from '@/supabase/database/subscription-helpers';

export { hasAisHistoryImportTier };

/** Vessel Premium, Professional, and Fleet may enable live AIS tracking. */
export function hasVesselAisTrackingTier(userProfile: unknown): boolean {
  if (!userProfile) return false;

  const p = userProfile as Record<string, unknown>;
  const role = (p.role || '').toString().toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'vessel') return false;

  const tier = canonicalizeVesselTier(
    (p.subscription_tier || p.subscriptionTier || 'free').toString(),
  );

  return VESSEL_PREMIUM_PLUS_TIERS.has(tier) && hasActiveSubscription(p);
}

export type VesselManagerAuth = {
  userId: string;
  profile: Record<string, unknown>;
};

export type AisHistoryAuth = VesselManagerAuth;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function authenticateBearerUser(
  request: Request,
  supabaseAdmin: SupabaseClient,
): Promise<{ auth: AisHistoryAuth } | { error: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
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
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, active_vessel_id, start_date, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, linked_account_features, managed_by_vessel_id',
    )
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return { error: NextResponse.json({ error: 'User profile not found' }, { status: 404 }) };
  }

  return { auth: { userId: user.id, profile } };
}

export async function authenticateAisHistoryUser(
  request: Request,
  supabaseAdmin: SupabaseClient,
): Promise<{ auth: AisHistoryAuth } | { error: NextResponse }> {
  const authResult = await authenticateBearerUser(request, supabaseAdmin);
  if ('error' in authResult) return authResult;

  if (!hasAisHistoryImportTier(authResult.auth.profile)) {
    return {
      error: NextResponse.json(
        {
          error:
            'AIS history import requires Premium or Professional (crew) or Vessel Premium, Professional, or Fleet.',
        },
        { status: 402 },
      ),
    };
  }

  return authResult;
}

export async function authenticateVesselManager(
  request: Request,
  supabaseAdmin: SupabaseClient,
): Promise<{ auth: VesselManagerAuth } | { error: NextResponse }> {
  const authResult = await authenticateBearerUser(request, supabaseAdmin);
  if ('error' in authResult) return authResult;

  const role = (authResult.auth.profile.role || '').toString().toLowerCase();
  if (role !== 'vessel' && role !== 'admin') {
    return {
      error: NextResponse.json(
        { error: 'Only vessel managers can manage AIS tracking' },
        { status: 403 },
      ),
    };
  }

  if (!hasVesselAisTrackingTier(authResult.auth.profile)) {
    return {
      error: NextResponse.json(
        {
          error:
            'Live AIS tracking requires Vessel Premium, Professional, or Fleet.',
        },
        { status: 402 },
      ),
    };
  }

  return authResult;
}

export type VesselAisRow = {
  id: string;
  name?: string | null;
  mmsi?: string | null;
  imo?: string | null;
  vessel_manager_id?: string | null;
  ais_tracking_enabled?: boolean | null;
  ais_last_sync_at?: string | null;
  ais_last_nav_status?: string | null;
  ais_last_speed?: number | null;
  ais_last_position_at?: string | null;
  ais_last_sync_error?: string | null;
};

export async function assertVesselManagerForVessel(
  auth: VesselManagerAuth,
  vesselId: string,
  supabaseAdmin: SupabaseClient,
): Promise<{ vessel: VesselAisRow } | { error: NextResponse }> {
  const role = (auth.profile.role || '').toString().toLowerCase();

  const { data: vessel, error } = await supabaseAdmin
    .from('vessels')
    .select(
      'id, name, mmsi, imo, vessel_manager_id, ais_tracking_enabled, ais_last_sync_at, ais_last_nav_status, ais_last_speed, ais_last_position_at, ais_last_sync_error',
    )
    .eq('id', vesselId)
    .maybeSingle();

  if (error || !vessel) {
    return { error: NextResponse.json({ error: 'Vessel not found' }, { status: 404 }) };
  }

  if (role !== 'admin') {
    const activeVesselId = auth.profile.active_vessel_id as string | null;
    const managerId = vessel.vessel_manager_id as string | null;
    const isManager = activeVesselId === vesselId || managerId === auth.userId;

    if (!isManager) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
  }

  return { vessel: vessel as VesselAisRow };
}

/**
 * Vessel-linked Team accounts may read AIS status for the vessel they belong to.
 * They cannot enable/disable tracking — that stays with the vessel manager.
 */
export async function assertVesselLinkedViewerForVessel(
  auth: AisHistoryAuth,
  vesselId: string,
  supabaseAdmin: SupabaseClient,
): Promise<{ vessel: VesselAisRow } | { error: NextResponse }> {
  const tier = String(
    auth.profile.subscription_tier || auth.profile.subscriptionTier || '',
  ).toLowerCase();
  if (tier !== 'vessel_linked') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const managedBy = (auth.profile.managed_by_vessel_id as string | null) || null;
  const activeVesselId = (auth.profile.active_vessel_id as string | null) || null;
  if (managedBy !== vesselId && activeVesselId !== vesselId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const { data: vessel, error } = await supabaseAdmin
    .from('vessels')
    .select(
      'id, name, mmsi, imo, vessel_manager_id, ais_tracking_enabled, ais_last_sync_at, ais_last_nav_status, ais_last_speed, ais_last_position_at, ais_last_sync_error',
    )
    .eq('id', vesselId)
    .maybeSingle();

  if (error || !vessel) {
    return { error: NextResponse.json({ error: 'Vessel not found' }, { status: 404 }) };
  }

  return { vessel: vessel as VesselAisRow };
}

/** GET AIS status: vessel managers (Premium+) or linked accounts on that vessel. */
export async function authenticateAisTrackingStatusReader(
  request: Request,
  supabaseAdmin: SupabaseClient,
  vesselId: string,
): Promise<{ vessel: VesselAisRow } | { error: NextResponse }> {
  const authResult = await authenticateBearerUser(request, supabaseAdmin);
  if ('error' in authResult) return authResult;

  const role = String(authResult.auth.profile.role || '').toLowerCase();
  const tier = String(
    authResult.auth.profile.subscription_tier ||
      authResult.auth.profile.subscriptionTier ||
      '',
  ).toLowerCase();

  if (role === 'admin' || role === 'vessel') {
    if (role === 'vessel' && !hasVesselAisTrackingTier(authResult.auth.profile)) {
      return {
        error: NextResponse.json(
          {
            error:
              'Live AIS tracking requires Vessel Premium, Professional, or Fleet.',
          },
          { status: 402 },
        ),
      };
    }
    return assertVesselManagerForVessel(authResult.auth, vesselId, supabaseAdmin);
  }

  if (tier === 'vessel_linked') {
    return assertVesselLinkedViewerForVessel(
      authResult.auth,
      vesselId,
      supabaseAdmin,
    );
  }

  return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

export async function assertAisHistoryVesselAccess(
  auth: AisHistoryAuth,
  vesselId: string,
  supabaseAdmin: SupabaseClient,
): Promise<{ vessel: VesselAisRow } | { error: NextResponse }> {
  const role = (auth.profile.role || '').toString().toLowerCase();

  const { data: vessel, error } = await supabaseAdmin
    .from('vessels')
    .select(
      'id, name, mmsi, imo, vessel_manager_id, ais_tracking_enabled, ais_last_sync_at, ais_last_nav_status, ais_last_speed, ais_last_position_at, ais_last_sync_error',
    )
    .eq('id', vesselId)
    .maybeSingle();

  if (error || !vessel) {
    return { error: NextResponse.json({ error: 'Vessel not found' }, { status: 404 }) };
  }

  if (role === 'admin') {
    return { vessel: vessel as VesselAisRow };
  }

  if (role === 'vessel') {
    const activeVesselId = auth.profile.active_vessel_id as string | null;
    const managerId = vessel.vessel_manager_id as string | null;
    const isManager = activeVesselId === vesselId || managerId === auth.userId;

    if (!isManager) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }

    return { vessel: vessel as VesselAisRow };
  }

  if (role === 'crew' || role === 'captain') {
    const { data: assignments, error: assignmentError } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('vessel_id', vesselId)
      .limit(1);

    if (assignmentError) {
      console.error('[AIS HISTORY] Assignment lookup failed:', assignmentError);
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }

    if (!assignments?.length) {
      return {
        error: NextResponse.json(
          {
            error:
              'You must be assigned to this vessel to import AIS history. Add it on Current Service or Vessel History.',
          },
          { status: 403 },
        ),
      };
    }

    return { vessel: vessel as VesselAisRow };
  }

  return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}
