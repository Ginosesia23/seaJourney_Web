/**
 * Server-only vessel feature boost resolvers (service-role Supabase).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  canonicalizeVesselTier,
  hasActiveSubscription,
  VESSEL_PREMIUM_PLUS_TIERS,
} from '@/supabase/database/subscription-helpers';
import {
  vesselTierToCrewFeatureBoost,
  type CrewVesselFeatureBoost,
  type CrewVesselFeatureBoostState,
} from '@/lib/crew-vessel-feature-boost';

type ManagerRow = {
  id: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
};

function boostRank(boost: CrewVesselFeatureBoost | null): number {
  if (boost === 'professional') return 2;
  if (boost === 'premium') return 1;
  return 0;
}

export async function managerForVessel(vesselId: string): Promise<ManagerRow | null> {
  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  const managerId = (vessel?.vessel_manager_id as string | null) || null;
  if (managerId) {
    const { data } = await supabaseAdmin
      .from('users')
      .select(
        'id, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, stripe_subscription_id',
      )
      .eq('id', managerId)
      .maybeSingle();
    if (data) return data as ManagerRow;
  }

  const { data: byActive } = await supabaseAdmin
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

async function bestBoostFromAssignments(
  assignmentVesselIds: string[],
  crewUserId: string,
): Promise<CrewVesselFeatureBoostState> {
  let best: CrewVesselFeatureBoost | null = null;
  let bestVesselId: string | null = null;
  let bestManagerTier: string | null = null;

  for (const vesselId of assignmentVesselIds) {
    const manager = await managerForVessel(vesselId);
    if (manager?.id === crewUserId) continue;
    const boost = managerGrantsCrewFeatureBoost(manager);
    if (boostRank(boost) > boostRank(best)) {
      best = boost;
      bestVesselId = vesselId;
      bestManagerTier = manager?.subscription_tier ?? null;
    }
  }

  let vesselName: string | null = null;
  if (bestVesselId) {
    const { data } = await supabaseAdmin
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

/** Server: resolve best vessel feature boost for a crew user (active assignments). */
export async function resolveCrewVesselFeatureBoostForUser(
  userId: string,
): Promise<CrewVesselFeatureBoostState> {
  const { data: assignments, error } = await supabaseAdmin
    .from('vessel_assignments')
    .select('vessel_id')
    .eq('user_id', userId)
    .is('end_date', null);

  if (error || !assignments?.length) {
    return { boost: null, vesselId: null, vesselName: null, managerTier: null };
  }

  const vesselIds = assignments.map((a) => a.vessel_id as string);
  return bestBoostFromAssignments(vesselIds, userId);
}

/** Server-side: feature boost only (for subscription gates). */
export async function getCrewVesselFeatureBoost(
  userId: string,
): Promise<CrewVesselFeatureBoost | null> {
  return (await resolveCrewVesselFeatureBoostForUser(userId)).boost;
}
