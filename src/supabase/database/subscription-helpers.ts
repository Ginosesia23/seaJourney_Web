/**
 * Helper functions for checking subscription status
 * Handles the fact that useDoc returns raw database fields (snake_case)
 */

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

/** True if this user is a free vessel-managed account (crew_limited OR vessel_linked). */
export function isVesselManagedFreeTier(userProfile: any): boolean {
  if (!userProfile) return false;
  const tier = (userProfile.subscription_tier || userProfile.subscriptionTier || '').toString().toLowerCase();
  return VESSEL_MANAGED_FREE_TIERS.has(tier);
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

function getTierLower(userProfile: any): string {
  return (userProfile?.subscription_tier || userProfile?.subscriptionTier || 'free')
    .toString()
    .toLowerCase()
    .trim();
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

  if (status === 'active' || status === 'trialing') return true;
  if (status === 'past_due') return true;

  const periodEndMs = parseCurrentPeriodEndMs(userProfile);
  const stillInPaidPeriod = periodEndMs != null && periodEndMs > Date.now();

  if (!stillInPaidPeriod || !hasNonFreeTier(userProfile)) return false;

  const cancelScheduled =
    userProfile.cancel_at_period_end === true || userProfile.cancelAtPeriodEnd === true;

  // Scheduled cancellation: retain access through current_period_end
  if (cancelScheduled) return true;

  // Stale row: status already "canceled"/"inactive" while paid period not over
  if (status === 'canceled' || status === 'inactive') return true;

  return false;
}

/** True when a vessel manager (or admin) has Premium, Professional, or Fleet. */
export function hasVesselPremiumPlusFeatures(userProfile: any): boolean {
  if (!userProfile) return false;

  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'vessel') return false;

  const tier = getTierLower(userProfile);
  return VESSEL_PREMIUM_PLUS_TIERS.has(tier) && hasActiveSubscription(userProfile);
}

/** AIS history import: Vessel Premium+ managers or Premium/Professional crew (not managed free tiers). */
export function hasAisHistoryImportTier(userProfile: any): boolean {
  if (!userProfile) return false;

  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (!hasActiveSubscription(userProfile)) return false;

  const tier = getTierLower(userProfile);

  if (role === 'vessel') {
    return VESSEL_PREMIUM_PLUS_TIERS.has(tier);
  }

  if (role === 'crew' || role === 'captain') {
    if (VESSEL_MANAGED_FREE_TIERS.has(tier)) return false;
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
export function hasCrewAisLiveTrackingTier(userProfile: any): boolean {
  if (!userProfile) return false;

  const role = ((userProfile as any).role || userProfile.role || '')
    .toString()
    .toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'crew' && role !== 'captain') return false;
  if (!hasActiveSubscription(userProfile)) return false;

  const tier = getTierLower(userProfile);
  if (VESSEL_MANAGED_FREE_TIERS.has(tier)) return false;
  return CREW_PREMIUM_PLUS_TIERS.has(tier);
}
