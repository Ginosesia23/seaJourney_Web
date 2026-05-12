import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';

/**
 * Max active crew members for a vessel manager account, from subscription tier.
 * Unknown `vessel_*` tiers (e.g. new Stripe price metadata) default to the same limit as
 * `vessel_lite` so misnamed tiers do not block crew access entirely.
 */
export function getVesselManagerCrewLimit(profileRow: unknown): number {
  if (!profileRow || !hasActiveSubscription(profileRow)) {
    return 0;
  }

  const tier = String(
    (profileRow as { subscription_tier?: string; subscriptionTier?: string }).subscription_tier ||
      (profileRow as { subscriptionTier?: string }).subscriptionTier ||
      '',
  )
    .toLowerCase()
    .trim();

  switch (tier) {
    case 'vessel_lite':
      return 15;
    case 'vessel_basic':
      return 30;
    case 'vessel_pro':
    case 'vessel_fleet':
      return Number.POSITIVE_INFINITY;
    default:
      if (tier.startsWith('vessel_')) {
        return 15;
      }
      return 0;
  }
}
