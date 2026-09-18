/**
 * Vessel AIS entitlement — why a physical vessel should be polled.
 *
 * AIS data belongs to the physical vessel (MMSI/IMO). Entitlement sources:
 *   1. Vessel-manager plan with ais_tracking_enabled
 *   2. ≥1 Premium+ crew with ais_live_tracking_enabled + active assignment
 *      + onboard/eligible for AIS sea-service
 *
 * Multiple sources share ONE adaptive schedule / Datalastic stream.
 */

import { isCrewEligibleForAisSeaService } from '@/lib/crew-rotation/onboard-leave-side-effects';
import { hasVesselAisTrackingTier } from '@/lib/vessel-ais-tier';
import {
  hasActiveSubscription,
  hasCrewAisLiveTrackingTier,
} from '@/supabase/database/subscription-helpers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type VesselAisEntitlementSource =
  | 'vessel_subscription'
  | 'premium_crew';

export type VesselAisEntitlement = {
  vesselId: string;
  shouldTrack: boolean;
  sources: VesselAisEntitlementSource[];
  /** Active Premium crew user ids that currently fund tracking (internal). */
  premiumCrewUserIds: string[];
  vesselPlanActive: boolean;
};

/**
 * Compute whether central AIS provider polling should be active for a vessel.
 * Does not mutate DB — call refreshVesselAisEntitlement to persist.
 */
export async function getVesselAisEntitlement(
  vesselId: string,
  logDate?: string,
): Promise<VesselAisEntitlement> {
  const sources: VesselAisEntitlementSource[] = [];
  const premiumCrewUserIds: string[] = [];

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('id, ais_tracking_enabled, vessel_manager_id, mmsi, imo')
    .eq('id', vesselId)
    .maybeSingle();

  if (!vessel) {
    return {
      vesselId,
      shouldTrack: false,
      sources,
      premiumCrewUserIds,
      vesselPlanActive: false,
    };
  }

  const hasIdentity = !!(vessel.mmsi || vessel.imo);
  let vesselPlanActive = false;

  if (vessel.ais_tracking_enabled && hasIdentity) {
    if (vessel.vessel_manager_id) {
      const { data: manager } = await supabaseAdmin
        .from('users')
        .select(
          'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end',
        )
        .eq('id', vessel.vessel_manager_id)
        .maybeSingle();

      if (manager && hasVesselAisTrackingTier(manager)) {
        vesselPlanActive = true;
        sources.push('vessel_subscription');
      }
    } else {
      // Flag set without manager (legacy / edge) — still honour opt-in if identity exists.
      vesselPlanActive = true;
      sources.push('vessel_subscription');
    }
  }

  if (hasIdentity) {
    const todayIso = logDate ?? new Date().toISOString().slice(0, 10);
    const { data: assignments } = await supabaseAdmin
      .from('vessel_assignments')
      .select('user_id')
      .eq('vessel_id', vesselId)
      .or(`end_date.is.null,end_date.gte.${todayIso}`);

    const userIds = [
      ...new Set(
        ((assignments ?? []) as { user_id: string }[]).map((a) => a.user_id),
      ),
    ];

    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select(
          'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, ais_live_tracking_enabled',
        )
        .in('id', userIds)
        .eq('ais_live_tracking_enabled', true);

      for (const u of users ?? []) {
        if (!hasCrewAisLiveTrackingTier(u)) continue;
        if (!hasActiveSubscription(u)) continue;

        const eligibility = await isCrewEligibleForAisSeaService(
          u.id as string,
          vesselId,
          todayIso,
        );
        if (!eligibility.eligible) continue;

        premiumCrewUserIds.push(u.id as string);
      }

      if (premiumCrewUserIds.length > 0) {
        sources.push('premium_crew');
      }
    }
  }

  return {
    vesselId,
    shouldTrack: sources.length > 0,
    sources,
    premiumCrewUserIds,
    vesselPlanActive,
  };
}

export async function shouldTrackVesselAIS(vesselId: string): Promise<boolean> {
  const entitlement = await getVesselAisEntitlement(vesselId);
  return entitlement.shouldTrack;
}

/**
 * Recompute and persist ais_provider_poll_enabled.
 * When tracking becomes newly active → mark next_ais_check_at due now.
 * When inactive → clear poll flag and next_ais_check_at (history retained).
 * Never calls Datalastic.
 */
export async function refreshVesselAisEntitlement(
  vesselId: string,
): Promise<
  VesselAisEntitlement & {
    changed: boolean;
    repaired: 'activated' | 'deactivated' | null;
  }
> {
  const entitlement = await getVesselAisEntitlement(vesselId);

  const { data: before } = await supabaseAdmin
    .from('vessels')
    .select('ais_provider_poll_enabled')
    .eq('id', vesselId)
    .maybeSingle();

  const wasActive = !!before?.ais_provider_poll_enabled;
  const nowActive = entitlement.shouldTrack;
  const changed = wasActive !== nowActive;

  await supabaseAdmin
    .from('vessels')
    .update({ ais_provider_poll_enabled: nowActive })
    .eq('id', vesselId);

  if (nowActive && !wasActive) {
    await markVesselDueForAisCheck(vesselId);
    return { ...entitlement, changed: true, repaired: 'activated' };
  }

  if (!nowActive && wasActive) {
    await clearVesselAisSchedule(vesselId);
    return { ...entitlement, changed: true, repaired: 'deactivated' };
  }

  return { ...entitlement, changed: false, repaired: null };
}

async function markVesselDueForAisCheck(vesselId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: existingStatus } = await supabaseAdmin
    .from('vessel_ais_status')
    .select('vessel_id')
    .eq('vessel_id', vesselId)
    .maybeSingle();

  if (existingStatus) {
    await supabaseAdmin
      .from('vessel_ais_status')
      .update({ next_ais_check_at: nowIso, updated_at: nowIso })
      .eq('vessel_id', vesselId);
  } else {
    await supabaseAdmin.from('vessel_ais_status').insert({
      vessel_id: vesselId,
      next_ais_check_at: nowIso,
      seajourney_state: 'at-anchor',
      provider: 'datalastic',
      fetched_at: nowIso,
      updated_at: nowIso,
    });
  }
}

/** Stop scheduled polling without deleting AIS history. */
async function clearVesselAisSchedule(vesselId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from('vessel_ais_status')
    .update({ next_ais_check_at: null, updated_at: nowIso })
    .eq('vessel_id', vesselId);
}

export type AisEntitlementReconcileResult = {
  examined: number;
  activated: number;
  deactivated: number;
  unchanged: number;
  vesselIdsRepaired: string[];
};

/**
 * Safety net: recompute entitlement for candidate vessels and repair drift.
 * Does NOT call Datalastic.
 *
 * Candidates (bounded):
 *   - currently ais_provider_poll_enabled
 *   - ais_tracking_enabled (vessel opt-in)
 *   - vessels with Premium crew ais_live_tracking_enabled on active assignment
 */
export async function reconcileVesselAisEntitlements(
  opts: { limit?: number } = {},
): Promise<AisEntitlementReconcileResult> {
  const limit = opts.limit ?? 200;
  const vesselIds = new Set<string>();

  const { data: pollOn } = await supabaseAdmin
    .from('vessels')
    .select('id')
    .eq('ais_provider_poll_enabled', true)
    .limit(limit);
  for (const v of pollOn ?? []) vesselIds.add(v.id as string);

  if (vesselIds.size < limit) {
    const { data: trackingOn } = await supabaseAdmin
      .from('vessels')
      .select('id')
      .eq('ais_tracking_enabled', true)
      .limit(limit);
    for (const v of trackingOn ?? []) {
      vesselIds.add(v.id as string);
      if (vesselIds.size >= limit) break;
    }
  }

  if (vesselIds.size < limit) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: crewUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('ais_live_tracking_enabled', true)
      .in('role', ['crew', 'captain'])
      .limit(limit);

    const crewIds = ((crewUsers ?? []) as { id: string }[]).map((u) => u.id);
    if (crewIds.length > 0) {
      const { data: assigns } = await supabaseAdmin
        .from('vessel_assignments')
        .select('vessel_id')
        .in('user_id', crewIds)
        .or(`end_date.is.null,end_date.gte.${todayIso}`)
        .limit(limit);
      for (const a of assigns ?? []) {
        vesselIds.add(a.vessel_id as string);
        if (vesselIds.size >= limit) break;
      }
    }
  }

  const result: AisEntitlementReconcileResult = {
    examined: 0,
    activated: 0,
    deactivated: 0,
    unchanged: 0,
    vesselIdsRepaired: [],
  };

  for (const id of vesselIds) {
    result.examined += 1;
    const refreshed = await refreshVesselAisEntitlement(id);
    if (refreshed.repaired === 'activated') {
      result.activated += 1;
      result.vesselIdsRepaired.push(id);
    } else if (refreshed.repaired === 'deactivated') {
      result.deactivated += 1;
      result.vesselIdsRepaired.push(id);
    } else {
      result.unchanged += 1;
    }
  }

  return result;
}

/** Refresh entitlement for every vessel this user may fund (managed or assigned). */
export async function refreshVesselAisEntitlementForUser(
  userId: string,
): Promise<string[]> {
  const vesselIds = new Set<string>();

  const { data: managed } = await supabaseAdmin
    .from('vessels')
    .select('id')
    .eq('vessel_manager_id', userId);
  for (const v of managed ?? []) vesselIds.add(v.id as string);

  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: assigned } = await supabaseAdmin
    .from('vessel_assignments')
    .select('vessel_id')
    .eq('user_id', userId)
    .or(`end_date.is.null,end_date.gte.${todayIso}`);
  for (const a of assigned ?? []) vesselIds.add(a.vessel_id as string);

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('active_vessel_id')
    .eq('id', userId)
    .maybeSingle();
  if (user?.active_vessel_id) vesselIds.add(user.active_vessel_id as string);

  for (const id of vesselIds) {
    await refreshVesselAisEntitlement(id);
  }
  return Array.from(vesselIds);
}
