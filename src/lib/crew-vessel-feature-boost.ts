/**
 * While a crew account is on an active assignment to a vessel on Vessel Premium
 * or Professional, they inherit that vessel's crew feature level (Premium or
 * Professional). When the assignment ends they fall back to their own tier
 * (crew_limited base, or a resumed personal subscription).
 *
 * Client-safe module — no service-role Supabase imports.
 * Server resolvers live in `crew-vessel-feature-boost.server.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalizeVesselTier,
  CREW_LIMITED_TIER,
  hasActiveSubscription,
  isCrewLimitedAccount,
  isPersonalPlanPausedForVessel,
  VESSEL_PREMIUM_PLUS_TIERS,
} from '@/supabase/database/subscription-helpers';
import { CREW_LIMITED_ALLOWED_HREFS } from '@/lib/vessel-linked-features';

/** Feature level granted to crew from the vessel manager's plan. */
export type CrewVesselFeatureBoost = 'premium' | 'professional';

export type CrewVesselFeatureBoostState = {
  boost: CrewVesselFeatureBoost | null;
  vesselId: string | null;
  vesselName: string | null;
  managerTier: string | null;
};

type ManagerRow = {
  id: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
};

function getTierLower(userProfile: unknown): string {
  const p = userProfile as Record<string, unknown> | null | undefined;
  return (p?.subscription_tier || p?.subscriptionTier || 'free')
    .toString()
    .toLowerCase()
    .trim();
}

function getRoleLower(userProfile: unknown): string {
  const p = userProfile as Record<string, unknown> | null | undefined;
  return (p?.role || 'crew').toString().toLowerCase();
}

/** Map vessel manager tier → crew feature boost (null = no uplift). */
export function vesselTierToCrewFeatureBoost(
  managerTier: string | null | undefined,
): CrewVesselFeatureBoost | null {
  const tier = canonicalizeVesselTier(managerTier);
  if (tier === 'vessel_pro' || tier === 'vessel_fleet') return 'professional';
  if (tier === 'vessel_basic') return 'premium';
  return null;
}

function boostRank(boost: CrewVesselFeatureBoost | null): number {
  if (boost === 'professional') return 2;
  if (boost === 'premium') return 1;
  return 0;
}

async function managerForVesselClient(
  supabase: SupabaseClient,
  vesselId: string,
): Promise<ManagerRow | null> {
  const { data: vessel } = await supabase
    .from('vessels')
    .select('vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  const managerId = (vessel?.vessel_manager_id as string | null) || null;
  if (managerId) {
    const { data } = await supabase
      .from('users')
      .select(
        'id, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, stripe_subscription_id',
      )
      .eq('id', managerId)
      .maybeSingle();
    if (data) return data as ManagerRow;
  }

  const { data: byActive } = await supabase
    .from('users')
    .select(
      'id, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, stripe_subscription_id',
    )
    .eq('role', 'vessel')
    .eq('active_vessel_id', vesselId)
    .limit(1)
    .maybeSingle();

  return (byActive as ManagerRow | null) ?? null;
}

function managerGrantsCrewFeatureBoost(manager: ManagerRow | null): CrewVesselFeatureBoost | null {
  if (!manager || !hasActiveSubscription(manager)) return null;
  const tier = canonicalizeVesselTier(manager.subscription_tier);
  if (!VESSEL_PREMIUM_PLUS_TIERS.has(tier)) return null;
  return vesselTierToCrewFeatureBoost(tier);
}

/** Client: resolve best vessel feature boost via RLS-safe supabase client. */
export async function fetchCrewVesselFeatureBoost(
  supabase: SupabaseClient,
  userId: string,
): Promise<CrewVesselFeatureBoostState> {
  const { data: assignments, error } = await supabase
    .from('vessel_assignments')
    .select('vessel_id')
    .eq('user_id', userId)
    .is('end_date', null);

  if (error || !assignments?.length) {
    return { boost: null, vesselId: null, vesselName: null, managerTier: null };
  }

  const vesselIds = assignments.map((a) => a.vessel_id as string);
  let best: CrewVesselFeatureBoost | null = null;
  let bestVesselId: string | null = null;
  let bestManagerTier: string | null = null;

  for (const vesselId of vesselIds) {
    const manager = await managerForVesselClient(supabase, vesselId);
    if (manager?.id === userId) continue;
    const boost = managerGrantsCrewFeatureBoost(manager);
    if (boostRank(boost) > boostRank(best)) {
      best = boost;
      bestVesselId = vesselId;
      bestManagerTier = manager?.subscription_tier ?? null;
    }
  }

  let vesselName: string | null = null;
  if (bestVesselId) {
    const { data } = await supabase
      .from('vessels')
      .select('name')
      .eq('id', bestVesselId)
      .maybeSingle();
    vesselName = (data?.name as string | undefined) ?? null;
  }

  return {
    boost: best,
    vesselId: bestVesselId,
    vesselName,
    managerTier: bestManagerTier,
  };
}

/**
 * Tier used for crew/captain feature gates (nav, premium tools, APIs).
 * Own subscription applies when not crew_limited and not vessel-paused.
 */
export function getEffectiveCrewFeatureTier(
  userProfile: unknown,
  vesselBoost: CrewVesselFeatureBoost | null,
): string {
  const tier = getTierLower(userProfile);
  const role = getRoleLower(userProfile);
  if (role !== 'crew' && role !== 'captain') return tier;

  const onVesselManagedAccess =
    isCrewLimitedAccount(userProfile) || isPersonalPlanPausedForVessel(userProfile);

  if (!onVesselManagedAccess) {
    return tier;
  }

  if (vesselBoost === 'professional') return 'professional';
  if (vesselBoost === 'premium') return 'premium';
  return CREW_LIMITED_TIER;
}

/** True when the crew_limited URL allowlist still applies. */
export function isCrewLimitedNavigationRestricted(
  userProfile: unknown,
  vesselBoost: CrewVesselFeatureBoost | null,
): boolean {
  if (vesselBoost) return false;
  if (isCrewLimitedAccount(userProfile)) return true;
  if (isPersonalPlanPausedForVessel(userProfile)) return true;
  return false;
}

function hrefMatchesPath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Dashboard route guard for crew_limited / paused crew. */
export function isCrewDashboardHrefAllowed(
  pathname: string,
  userProfile: unknown,
  vesselBoost: CrewVesselFeatureBoost | null,
): boolean {
  if (!isCrewLimitedNavigationRestricted(userProfile, vesselBoost)) return true;
  return CREW_LIMITED_ALLOWED_HREFS.some((href) => hrefMatchesPath(pathname, href));
}

/** Human-readable label for subscription UI. */
export function crewVesselBoostLabel(boost: CrewVesselFeatureBoost | null): string | null {
  if (boost === 'professional') return 'Vessel Professional features';
  if (boost === 'premium') return 'Vessel Premium features';
  return null;
}
