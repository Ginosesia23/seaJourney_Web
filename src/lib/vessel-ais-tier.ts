/**
 * Client-safe AIS tier predicates.
 *
 * Pure functions with no service-role Supabase imports, so client components
 * (dashboard cards) can gate on tier without pulling the server admin client
 * into the browser bundle. Server-only auth helpers live in
 * `vessel-ais-access.ts`.
 */

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
