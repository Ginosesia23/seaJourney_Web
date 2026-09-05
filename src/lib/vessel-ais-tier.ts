import {
  canonicalizeVesselTier,
  hasActiveSubscription,
  VESSEL_PREMIUM_PLUS_TIERS,
} from '@/supabase/database/subscription-helpers';

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
