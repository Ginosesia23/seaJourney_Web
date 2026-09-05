/**
 * When crew (or captains) join a vessel on Vessel Professional / Fleet,
 * pause their personal plan and put them on `crew_limited` (vessel-paid access)
 * — but only after the vessel account approves plan coverage.
 * When they leave every such vessel, restore the last personal plan and email them.
 */

import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  sendPersonalPlanPausedForVesselEmail,
  sendPersonalPlanResumedAfterVesselEmail,
} from '@/lib/subscription-emails';
import {
  canonicalizeVesselTier,
  CREW_LIMITED_TIER,
  hasActiveSubscription,
  VESSEL_LINKED_TIER,
} from '@/supabase/database/subscription-helpers';
import { managerForVessel } from '@/lib/crew-vessel-feature-boost.server';
import {
  ensurePendingVesselPlanCoverageRequest,
  hasApprovedVesselPlanCoverage,
} from '@/lib/vessel-plan-coverage';
import { VESSEL_PLANS_THAT_PAUSE_CREW_BILLING } from '@/lib/vessel-crew-plan-constants';

/** Vessel plans that cover assigned crew — personal billing should pause. */
export { VESSEL_PLANS_THAT_PAUSE_CREW_BILLING };

export async function vesselRequiresPlanCoverageApproval(
  vesselId: string,
): Promise<boolean> {
  const manager = await managerForVessel(vesselId);
  return vesselPlanCoversAssignedCrew(manager);
}

const PAID_CREW_TIERS = new Set<string>([
  'standard',
  'premium',
  'pro',
  'professional',
]);

const USER_PLAN_COLS =
  'id, email, first_name, role, subscription_tier, subscription_status, stripe_subscription_id, stripe_customer_id, current_period_end, cancel_at_period_end, managed_by_vessel_id, personal_plan_paused_at, personal_plan_paused_tier, personal_plan_paused_subscription_id, personal_plan_paused_for_vessel_id';

type UserPlanRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  role: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  managed_by_vessel_id: string | null;
  personal_plan_paused_at: string | null;
  personal_plan_paused_tier: string | null;
  personal_plan_paused_subscription_id: string | null;
  personal_plan_paused_for_vessel_id: string | null;
};

export function shouldSkipStripeTierSyncWhilePaused(userRow: {
  personal_plan_paused_at?: string | null;
  personal_plan_paused_subscription_id?: string | null;
  stripe_subscription_id?: string | null;
} | null | undefined, stripeSubscriptionId?: string | null): boolean {
  if (!userRow?.personal_plan_paused_at) return false;
  const pausedSub = userRow.personal_plan_paused_subscription_id;
  if (!pausedSub) return true;
  if (!stripeSubscriptionId) return true;
  return pausedSub === stripeSubscriptionId;
}

async function vesselName(vesselId: string | null | undefined): Promise<string> {
  if (!vesselId) return 'your vessel';
  const { data } = await supabaseAdmin
    .from('vessels')
    .select('name')
    .eq('id', vesselId)
    .maybeSingle();
  return (data?.name as string | undefined)?.trim() || 'your vessel';
}

function vesselPlanCoversAssignedCrew(manager: {
  subscription_tier: string | null;
  subscription_status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
} | null): boolean {
  if (!manager || !hasActiveSubscription(manager)) return false;
  const tier = canonicalizeVesselTier(manager.subscription_tier);
  return VESSEL_PLANS_THAT_PAUSE_CREW_BILLING.has(tier);
}

async function coveringActiveAssignments(userId: string): Promise<
  Array<{ vesselId: string; coverageApproved: boolean }>
> {
  const { data: assignments, error } = await supabaseAdmin
    .from('vessel_assignments')
    .select('vessel_id')
    .eq('user_id', userId)
    .is('end_date', null);

  if (error || !assignments?.length) return [];

  const results: Array<{ vesselId: string; coverageApproved: boolean }> = [];
  for (const row of assignments) {
    const vesselId = row.vessel_id as string;
    const manager = await managerForVessel(vesselId);
    if (manager?.id === userId) continue;
    if (!vesselPlanCoversAssignedCrew(manager)) continue;
    const approved = await hasApprovedVesselPlanCoverage(userId, vesselId);
    results.push({ vesselId, coverageApproved: approved });
  }
  return results;
}

/** Self-joined crew/captain — vessel must approve before they fall under the vessel plan. */
function shouldRequestVesselPlanCoverage(user: UserPlanRow): boolean {
  const role = (user.role || '').toLowerCase();
  if (role === 'vessel' || role === 'admin') return false;
  if (user.managed_by_vessel_id) return false;
  const tier = (user.subscription_tier || '').toLowerCase();
  if (tier === VESSEL_LINKED_TIER) return false;
  return role === 'crew' || role === 'captain' || !role;
}

function shouldPausePersonalPlan(user: UserPlanRow): boolean {
  const role = (user.role || '').toLowerCase();
  if (role === 'vessel' || role === 'admin') return false;
  if (user.managed_by_vessel_id) return false;
  const tier = (user.subscription_tier || '').toLowerCase();
  if (tier === VESSEL_LINKED_TIER) return false;
  if (user.personal_plan_paused_at) return true;
  if (PAID_CREW_TIERS.has(tier) && hasActiveSubscription(user)) return true;
  if (user.stripe_subscription_id && hasActiveSubscription(user) && !tier.startsWith('vessel_')) {
    return true;
  }
  return false;
}

async function pauseStripeCollection(subscriptionId: string, vesselId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: { behavior: 'void' },
    metadata: {
      paused_for_vessel_assignment: 'true',
      paused_for_vessel_id: vesselId,
    },
  });
}

async function unpauseStripeCollection(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.update(subscriptionId, {
      pause_collection: '',
      metadata: {
        paused_for_vessel_assignment: '',
        paused_for_vessel_id: '',
      },
    });
  } catch (error) {
    console.error('[crew-plan] Failed to unpause Stripe subscription', subscriptionId, error);
    return null;
  }
}

async function pausePersonalPlan(user: UserPlanRow, vesselId: string): Promise<void> {
  const pausedTier = user.personal_plan_paused_tier || user.subscription_tier || 'standard';
  const pausedSubId =
    user.personal_plan_paused_subscription_id || user.stripe_subscription_id || null;

  const alreadyPaused = !!user.personal_plan_paused_at;

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      subscription_tier: CREW_LIMITED_TIER,
      subscription_status: 'active',
      personal_plan_paused_at: user.personal_plan_paused_at || new Date().toISOString(),
      personal_plan_paused_tier: pausedTier,
      personal_plan_paused_subscription_id: pausedSubId,
      personal_plan_paused_for_vessel_id: vesselId,
    })
    .eq('id', user.id);

  if (error) {
    console.error('[crew-plan] Failed to mark personal plan paused', error);
    return;
  }

  if (pausedSubId && !alreadyPaused) {
    try {
      await pauseStripeCollection(pausedSubId, vesselId);
    } catch (err) {
      console.error('[crew-plan] Failed to pause Stripe collection', pausedSubId, err);
    }
  }

  if (alreadyPaused || !user.email) return;

  try {
    await sendPersonalPlanPausedForVesselEmail({
      toEmail: user.email,
      firstName: user.first_name,
      pausedTier,
      vesselName: await vesselName(vesselId),
    });
  } catch (error) {
    console.error('[crew-plan] Pause email failed', error);
  }
}

async function resumePersonalPlan(user: UserPlanRow): Promise<void> {
  const resumeTier = user.personal_plan_paused_tier || 'standard';
  const pausedSubId = user.personal_plan_paused_subscription_id;
  const previousVesselId = user.personal_plan_paused_for_vessel_id;

  let stripeStatus: string | null = null;
  if (pausedSubId) {
    const updated = await unpauseStripeCollection(pausedSubId);
    stripeStatus = updated?.status ?? null;
  }

  const stripeEnded =
    stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired';

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      subscription_tier: stripeEnded ? 'free' : resumeTier,
      subscription_status: stripeEnded ? 'canceled' : 'active',
      personal_plan_paused_at: null,
      personal_plan_paused_tier: null,
      personal_plan_paused_subscription_id: null,
      personal_plan_paused_for_vessel_id: null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('[crew-plan] Failed to restore personal plan', error);
    return;
  }

  if (!user.email) return;

  try {
    await sendPersonalPlanResumedAfterVesselEmail({
      toEmail: user.email,
      firstName: user.first_name,
      resumedTier: stripeEnded ? 'free' : resumeTier,
      vesselName: await vesselName(previousVesselId),
    });
  } catch (error) {
    console.error('[crew-plan] Resume email failed', error);
  }
}

export async function reconcileCrewPersonalPlanForUser(
  userId: string,
): Promise<{ action: 'paused' | 'resumed' | 'noop' }> {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select(USER_PLAN_COLS)
    .eq('id', userId)
    .maybeSingle();

  if (error || !user) {
    if (error) console.error('[crew-plan] User lookup failed', error);
    return { action: 'noop' };
  }

  const row = user as UserPlanRow;
  const covering = await coveringActiveAssignments(userId);
  const qualifying = covering.find((c) => c.coverageApproved) || covering[0] || null;

  // Open a pending request for every Pro/Fleet assignment that is not yet approved.
  // Self-join must always notify the vessel — do not wait for a paid personal plan.
  if (shouldRequestVesselPlanCoverage(row)) {
    for (const entry of covering) {
      if (entry.coverageApproved) continue;
      try {
        await ensurePendingVesselPlanCoverageRequest({
          crewUserId: userId,
          vesselId: entry.vesselId,
        });
      } catch (err) {
        console.error('[crew-plan] Failed to open coverage request', entry.vesselId, err);
      }
    }
  }

  // Qualifying vessel exists but vessel has not approved coverage yet.
  if (qualifying && !qualifying.coverageApproved) {
    // Never keep vessel-managed billing until the vessel approves coverage.
    const tierLower = (row.subscription_tier || '').toLowerCase();
    if (row.personal_plan_paused_at || tierLower === CREW_LIMITED_TIER) {
      await resumePersonalPlan(row);
      return { action: 'resumed' };
    }

    return { action: 'noop' };
  }

  if (qualifying?.coverageApproved && shouldPausePersonalPlan(row)) {
    if (
      row.personal_plan_paused_at &&
      row.subscription_tier === CREW_LIMITED_TIER &&
      row.personal_plan_paused_for_vessel_id === qualifying.vesselId
    ) {
      return { action: 'noop' };
    }
    await pausePersonalPlan(row, qualifying.vesselId);
    return { action: 'paused' };
  }

  // No approved covering vessel — resume if currently paused.
  if (
    row.personal_plan_paused_at &&
    (!qualifying || !qualifying.coverageApproved)
  ) {
    await resumePersonalPlan(row);
    return { action: 'resumed' };
  }

  return { action: 'noop' };
}

export async function reconcileCrewPersonalPlansForVessel(
  vesselId: string,
): Promise<void> {
  const { data: assignments, error } = await supabaseAdmin
    .from('vessel_assignments')
    .select('user_id')
    .eq('vessel_id', vesselId)
    .is('end_date', null);

  if (error) {
    console.error('[crew-plan] Vessel assignment lookup failed', error);
    return;
  }

  const { data: pausedOnVessel } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('personal_plan_paused_for_vessel_id', vesselId);

  const ids = new Set<string>();
  for (const row of assignments || []) {
    if (row.user_id) ids.add(row.user_id as string);
  }
  for (const row of pausedOnVessel || []) {
    if (row.id) ids.add(row.id as string);
  }

  for (const id of ids) {
    try {
      await reconcileCrewPersonalPlanForUser(id);
    } catch (err) {
      console.error('[crew-plan] Reconcile failed for user', id, err);
    }
  }
}

export async function reconcileCrewPersonalPlansForManager(
  managerUserId: string,
): Promise<void> {
  const vesselIds = new Set<string>();

  const { data: managed } = await supabaseAdmin
    .from('vessels')
    .select('id')
    .eq('vessel_manager_id', managerUserId);

  for (const row of managed || []) {
    if (row.id) vesselIds.add(row.id as string);
  }

  const { data: manager } = await supabaseAdmin
    .from('users')
    .select('active_vessel_id, role')
    .eq('id', managerUserId)
    .maybeSingle();

  if (manager?.role === 'vessel' && manager.active_vessel_id) {
    vesselIds.add(manager.active_vessel_id as string);
  }

  for (const vesselId of vesselIds) {
    await reconcileCrewPersonalPlansForVessel(vesselId);
  }
}
