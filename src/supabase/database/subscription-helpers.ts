/**
 * Helper functions for checking subscription status
 * Handles the fact that useDoc returns raw database fields (snake_case)
 */

import { isVesselLinkedFeatureGranted } from '@/lib/vessel-linked-features';
import {
  getEffectiveCrewFeatureTier,
  type CrewVesselFeatureBoost,
} from '@/lib/crew-vessel-feature-boost';

/**
 * Tiers that don't represent a paying customer:
 *  - 'crew_limited' = crew added by a vessel via Invite Crew. Vessel pays.
 *  - 'vessel_linked' = secondary account created on the Vessel Pro plan via
 *    the Vessel Roles page (captain/officer/engineer/manager). Vessel pays.
 * These show as "active" so feature gates work, but they're £0 and should
 * be excluded from active-subscription analytics counts.
 */
export const CREW_LIMITED_TIER = 'crew_limited' as const;
export const VESSEL_LINKED_TIER = 'vessel_linked' as const;
export const VESSEL_MANAGED_FREE_TIERS = new Set<string>([CREW_LIMITED_TIER, VESSEL_LINKED_TIER]);

/**
 * Vessel tiers that unlock Premium+ management features:
 * linked role accounts, watch schedules, Form Builder, and Onboard Tracker.
 * Maps to Vessel Premium (`vessel_basic`), Professional (`vessel_pro`), and Fleet (`vessel_fleet`).
 * Vessel Standard (`vessel_lite`) is excluded.
 */
export const VESSEL_PREMIUM_PLUS_TIERS = new Set<string>([
  'vessel_basic',
  'vessel_pro',
  'vessel_fleet',
]);

/** Crew Premium and Professional tiers (paying individual crew accounts). */
export const CREW_PREMIUM_PLUS_TIERS = new Set<string>([
  'premium',
  'pro',
  'professional',
]);

/** True if this user is a secondary account created by a vessel (any role: captain / officer / engineer / manager). */
export function isVesselLinkedAccount(userProfile: any): boolean {
  if (!userProfile) return false;
  const tier = (userProfile.subscription_tier || userProfile.subscriptionTier || '').toString().toLowerCase();
  return tier === VESSEL_LINKED_TIER;
}

/** True if this user is crew invited by a vessel (Invite Crew) on the limited dashboard. */
export function isCrewLimitedAccount(userProfile: any): boolean {
  if (!userProfile) return false;
  const tier = (userProfile.subscription_tier || userProfile.subscriptionTier || '').toString().toLowerCase();
  return tier === CREW_LIMITED_TIER;
}

/** True if this user is a free vessel-managed account (crew_limited OR vessel_linked). */
export function isVesselManagedFreeTier(userProfile: any): boolean {
  if (!userProfile) return false;
  const tier = (userProfile.subscription_tier || userProfile.subscriptionTier || '').toString().toLowerCase();
  return VESSEL_MANAGED_FREE_TIERS.has(tier);
}

/** True when a crew personal plan is paused because they are on a vessel-paid assignment. */
export function isPersonalPlanPausedForVessel(userProfile: any): boolean {
  if (!userProfile) return false;
  return !!(
    userProfile.personal_plan_paused_at ||
    userProfile.personalPlanPausedAt
  );
}

/**
 * True if this account is marked as testing/QA/demo (`users.is_testing`).
 * Handles both snake_case (raw DB) and camelCase profile shapes.
 */
export function isTestingAccount(userProfile: any): boolean {
  if (!userProfile) return false;
  return userProfile.is_testing === true || userProfile.isTesting === true;
}

/** Drop testing accounts from an analytics user list. */
export function excludeTestingAccounts<T>(users: T[] | null | undefined): T[] {
  if (!users?.length) return [];
  return users.filter((u) => !isTestingAccount(u));
}

export function getSubscriptionStatus(userProfile: any): string | null {
  if (!userProfile) return null;

  // useDoc returns raw database fields, so check subscription_status first (snake_case)
  // Also check camelCase in case data is transformed somewhere
  return (userProfile as any).subscription_status || (userProfile as any).subscriptionStatus || null;
}

function parseCurrentPeriodEndMs(userProfile: any): number | null {
  const raw = userProfile?.current_period_end ?? userProfile?.currentPeriodEnd;
  if (raw == null || raw === '') return null;
  const t = new Date(raw as string | number | Date).getTime();
  return Number.isFinite(t) ? t : null;
}

function getStripeSubscriptionId(userProfile: any): string {
  return String(
    userProfile?.stripe_subscription_id || userProfile?.stripeSubscriptionId || '',
  ).trim();
}

/** True when access comes from a partner code / admin comp, not Stripe. */
export function isComplimentaryGrant(userProfile: any): boolean {
  if (!userProfile) return false;
  if (getStripeSubscriptionId(userProfile)) return false;
  const periodEndMs = parseCurrentPeriodEndMs(userProfile);
  return periodEndMs != null && hasNonFreeTier(userProfile);
}

function getTierLower(userProfile: any): string {
  return (userProfile?.subscription_tier || userProfile?.subscriptionTier || 'free')
    .toString()
    .toLowerCase()
    .trim();
}

/**
 * Stripe nicknames / metadata often store Vessel Professional as `professional`
 * (the crew key). For vessel-role accounts, map those aliases onto `vessel_*`.
 */
export function canonicalizeVesselTier(tier: string | null | undefined): string {
  const t = (tier || '')
    .toLowerCase()
    .replace(/^(sj_|sea_journey_)/, '')
    .replace(/[\s-]+/g, '_')
    .trim();

  if (!t) return 'free';
  if (
    t === 'vessel_lite' ||
    t === 'vessel_basic' ||
    t === 'vessel_pro' ||
    t === 'vessel_fleet' ||
    t === VESSEL_LINKED_TIER
  ) {
    return t;
  }
  if (t.includes('fleet')) return 'vessel_fleet';
  if (t.includes('professional') || t === 'pro' || t === 'vessel_professional') {
    return 'vessel_pro';
  }
  if (t.includes('premium') || t === 'basic' || t === 'vessel_premium') {
    return 'vessel_basic';
  }
  if (t.includes('standard') || t.includes('lite')) return 'vessel_lite';
  return t;
}

function stripeIdWasSelected(userProfile: any): boolean {
  return (
    userProfile != null &&
    (Object.prototype.hasOwnProperty.call(userProfile, 'stripe_subscription_id') ||
      Object.prototype.hasOwnProperty.call(userProfile, 'stripeSubscriptionId'))
  );
}

/** Any tier that is not plain free (includes crew_limited, standard, premium, vessel_*, etc.) */
function hasNonFreeTier(userProfile: any): boolean {
  const tier = getTierLower(userProfile);
  return !!tier && tier !== 'free';
}

/**
 * True if the user should be treated as having an active subscription for dashboard / gating.
 *
 * - Normal case: Stripe `subscription_status` synced as `active`, `trialing`, or `past_due`.
 * - Cancel at period end: Stripe remains `active` until the period ends; we also allow access when
 *   `cancel_at_period_end` is true and `current_period_end` is still in the future (paid tier).
 * - If the DB status is wrong (`canceled` / `inactive`) but the billing period has not ended yet,
 *   we still allow access so users are not locked out until the renewal date passes.
 */
export function hasActiveSubscription(userProfile: any): boolean {
  if (!userProfile) return false;

  const statusRaw = getSubscriptionStatus(userProfile);
  const status = (statusRaw || '').toLowerCase().replace(/-/g, '_');
  const periodEndMs = parseCurrentPeriodEndMs(userProfile);
  const stillInPaidPeriod = periodEndMs != null && periodEndMs > Date.now();
  const stripeId = getStripeSubscriptionId(userProfile);

  // Partner-code / admin comps have no Stripe sub. Honour current_period_end
  // even if subscription_status is still "active" after the grant lapses.
  // Only apply this when the Stripe id column was actually loaded — otherwise
  // a paying customer whose query omitted stripe_subscription_id looks like a
  // lapsed complimentary grant once current_period_end is in the past.
  if (stripeIdWasSelected(userProfile) && !stripeId && periodEndMs != null) {
    if (!stillInPaidPeriod) return false;
    return (
      status === 'active' ||
      status === 'trialing' ||
      status === 'past_due' ||
      hasNonFreeTier(userProfile)
    );
  }

  if (status === 'active' || status === 'trialing') return true;
  if (status === 'past_due') return true;

  if (!stillInPaidPeriod || !hasNonFreeTier(userProfile)) return false;

  const cancelScheduled =
    userProfile.cancel_at_period_end === true || userProfile.cancelAtPeriodEnd === true;

  // Scheduled cancellation: retain access through current_period_end
  if (cancelScheduled) return true;

  // Stale row: status already "canceled"/"inactive" while paid period not over
  if (status === 'canceled' || status === 'inactive') return true;

  return false;
}

/**
 * Dashboard access: any non-free tier with an active entitlement.
 * Includes paying crew/vessel plans and vessel-managed accounts (`crew_limited`,
 * `vessel_linked`). Excludes `free` and inactive/expired subscriptions.
 */
export function hasPaidDashboardAccess(userProfile: any): boolean {
  if (!userProfile) return false;
  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  return hasActiveSubscription(userProfile) && hasNonFreeTier(userProfile);
}

/** Paying Stripe customer — exclude partner-code comps from MRR. */
export function countsTowardPaidMrr(userProfile: any): boolean {
  if (!hasActiveSubscription(userProfile)) return false;
  if (isVesselManagedFreeTier(userProfile)) return false;
  return !!getStripeSubscriptionId(userProfile);
}

/** True when a vessel manager (or admin) has Premium, Professional, or Fleet. */
export function hasVesselPremiumPlusFeatures(userProfile: any): boolean {
  if (!userProfile) return false;

  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'vessel') return false;

  const tier = canonicalizeVesselTier(getTierLower(userProfile));
  return VESSEL_PREMIUM_PLUS_TIERS.has(tier) && hasActiveSubscription(userProfile);
}

function crewFeatureTier(
  userProfile: any,
  vesselBoost?: CrewVesselFeatureBoost | null,
): string {
  if (!userProfile) return 'free';
  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'crew' || role === 'captain') {
    return getEffectiveCrewFeatureTier(userProfile, vesselBoost ?? null);
  }
  return getTierLower(userProfile);
}

/** AIS history import: Vessel Premium+ managers or Premium/Professional crew (not managed free tiers). */
export function hasAisHistoryImportTier(
  userProfile: any,
  vesselBoost?: CrewVesselFeatureBoost | null,
): boolean {
  if (!userProfile) return false;

  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (!hasActiveSubscription(userProfile)) return false;
  if (isVesselLinkedFeatureGranted(userProfile, 'ais_history')) return true;

  const tier = getTierLower(userProfile);

  if (role === 'vessel') {
    return VESSEL_PREMIUM_PLUS_TIERS.has(canonicalizeVesselTier(tier));
  }

  if (role === 'crew' || role === 'captain') {
    const tier = crewFeatureTier(userProfile, vesselBoost);
    if (tier === CREW_LIMITED_TIER) return false;
    return CREW_PREMIUM_PLUS_TIERS.has(tier);
  }

  return false;
}

/**
 * Live AIS tracking for crew on their active vessel (Premium/Professional crew or
 * captain accounts). Managed-free tiers (`crew_limited`, `vessel_linked`) do not
 * get this — they'd need to upgrade. Vessel accounts have their own dedicated
 * `hasVesselAisTrackingTier` gate.
 */
export function hasCrewAisLiveTrackingTier(
  userProfile: any,
  vesselBoost?: CrewVesselFeatureBoost | null,
): boolean {
  if (!userProfile) return false;

  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'crew' && role !== 'captain') return false;
  if (!hasActiveSubscription(userProfile)) return false;

  const tier = crewFeatureTier(userProfile, vesselBoost);
  if (tier === CREW_LIMITED_TIER) return false;
  return CREW_PREMIUM_PLUS_TIERS.has(tier);
}

/**
 * Crew Professional tier only. Used by the Passages Map (visual AIS-history
 * map of every passage across the crew's assignments).
 *
 * Rationale for gating tighter than `hasCrewAisLiveTrackingTier`: rendering
 * the map backfills Datalastic history for each vessel assignment, which is
 * more expensive than a per-day AIS history import. We only offer this to
 * the top crew tier so the Datalastic cost is bounded.
 *
 * Both `pro` and `professional` are accepted — the two slugs are treated as
 * equivalent throughout billing/offers (see `src/app/actions.ts`).
 * `crew_limited` / `vessel_linked` never qualify unless vessel Professional boost applies.
 * Admins bypass for support / debugging.
 */
export function hasProfessionalCrewTier(
  userProfile: any,
  vesselBoost?: CrewVesselFeatureBoost | null,
): boolean {
  if (!userProfile) return false;

  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'crew' && role !== 'captain') return false;
  if (!hasActiveSubscription(userProfile)) return false;

  const tier = crewFeatureTier(userProfile, vesselBoost);
  if (tier === CREW_LIMITED_TIER) return false;
  return tier === 'professional' || tier === 'pro';
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Passages Map access gate.
 *
 * Allowed:
 *   - Crew Professional (`pro` / `professional`)
 *   - Vessel Premium+ (`vessel_basic` / `vessel_pro` / `vessel_fleet`)
 *   - Admins (support / debugging)
 *
 * ⚠️  TEMPORARY: Crew Premium is currently allowed for testing.
 * Delete the TEMP block below to lock crew access back to Professional.
 * ─────────────────────────────────────────────────────────────────────
 */
export function hasPassagesMapAccess(
  userProfile: any,
  vesselBoost?: CrewVesselFeatureBoost | null,
): boolean {
  if (hasProfessionalCrewTier(userProfile, vesselBoost)) return true;
  if (hasVesselPremiumPlusFeatures(userProfile)) return true;
  if (
    hasActiveSubscription(userProfile) &&
    isVesselLinkedFeatureGranted(userProfile, 'passages_map')
  ) {
    return true;
  }

  // TEMP: allow Crew Premium in for testing. Remove this block to
  // restrict crew back to Professional-only.
  if (!userProfile) return false;
  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role !== 'crew' && role !== 'captain') return false;
  if (!hasActiveSubscription(userProfile)) return false;
  const tier = crewFeatureTier(userProfile, vesselBoost);
  if (tier === CREW_LIMITED_TIER) return false;
  return tier === 'premium';
  // END TEMP
}

/** Premium+ crew feature access (passage log, visa tracker, export, etc.). */
export function hasCrewPremiumPlusFeatures(
  userProfile: any,
  vesselBoost?: CrewVesselFeatureBoost | null,
): boolean {
  if (!userProfile) return false;
  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'crew' && role !== 'captain') return false;
  if (!hasActiveSubscription(userProfile)) return false;
  const tier = crewFeatureTier(userProfile, vesselBoost);
  if (tier === CREW_LIMITED_TIER) return false;
  return CREW_PREMIUM_PLUS_TIERS.has(tier);
}
