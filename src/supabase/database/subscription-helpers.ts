/**
 * Helper functions for checking subscription status
 * Handles the fact that useDoc returns raw database fields (snake_case)
 */

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
