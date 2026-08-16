/**
 * Map Stripe subscription prices → canonical DB tier keys (monthly GBP).
 * Used by admin revenue / dashboard so totals track live Stripe prices.
 */

export const FALLBACK_TIER_PRICING_GBP: Record<string, number> = {
  free: 0,
  crew_limited: 0,
  vessel_linked: 0,
  standard: 4.99,
  premium: 9.99,
  pro: 14.99,
  professional: 14.99,
  // Kept as last-resort fallbacks only — prefer Stripe via getSubscriptionTierPricingMap
  vessel_lite: 49.99,
  vessel_basic: 79.99,
  vessel_pro: 99.99,
  vessel_fleet: 249.99,
};

export type StripePriceLike = {
  unit_amount?: number | null;
  nickname?: string | null;
  metadata?: Record<string, string> | null;
  recurring?: {
    interval?: string | null;
    interval_count?: number | null;
  } | null;
};

/** Normalize raw Stripe tier / nickname into users.subscription_tier values. */
export function canonicalizeSubscriptionTier(raw: string | null | undefined): string | null {
  const lower = (raw || '')
    .toLowerCase()
    .replace(/^(sj_|sea_journey_)/i, '')
    .replace(/[\s-]+/g, '_')
    .trim();

  if (!lower || lower === 'unknown') return null;

  const isVessel = lower.includes('vessel') || lower.includes('fleet');

  if (isVessel) {
    if (lower.includes('fleet')) return 'vessel_fleet';
    if (lower.includes('pro') && !lower.includes('premium')) return 'vessel_pro';
    if (lower.includes('premium') || lower.includes('basic')) return 'vessel_basic';
    if (lower.includes('standard') || lower.includes('lite')) return 'vessel_lite';
  }

  if (lower.includes('professional') || lower === 'pro' || lower === 'crew_pro') {
    return 'professional';
  }
  if (lower.includes('premium')) return 'premium';
  if (lower.includes('standard')) return 'standard';

  if (
    lower === 'vessel_lite' ||
    lower === 'vessel_basic' ||
    lower === 'vessel_pro' ||
    lower === 'vessel_fleet' ||
    lower === 'standard' ||
    lower === 'premium' ||
    lower === 'professional' ||
    lower === 'pro'
  ) {
    return lower === 'pro' ? 'professional' : lower;
  }

  return lower;
}

/** Convert a Stripe recurring price to monthly GBP major units. */
export function stripePriceToMonthlyGbp(price: StripePriceLike): number | null {
  if (price.unit_amount == null || !Number.isFinite(price.unit_amount)) return null;

  const amount = price.unit_amount / 100;
  const interval = price.recurring?.interval || 'month';
  const intervalCount = Math.max(1, price.recurring?.interval_count ?? 1);

  if (interval === 'year') return amount / (12 * intervalCount);
  if (interval === 'month') return amount / intervalCount;
  if (interval === 'week') return (amount * 52) / (12 * intervalCount);
  if (interval === 'day') return (amount * 365) / (12 * intervalCount);

  // One-time / unknown — treat as monthly for admin MRR display
  return amount;
}

export function buildTierPricingMapFromStripePrices(
  prices: StripePriceLike[],
  fallback: Record<string, number> = FALLBACK_TIER_PRICING_GBP,
): Record<string, number> {
  const fromStripe: Record<string, { amount: number; interval: string }> = {};

  for (const price of prices) {
    const rawTier =
      price.metadata?.tier || price.metadata?.price_tier || price.nickname || '';
    const tier = canonicalizeSubscriptionTier(rawTier);
    if (!tier) continue;

    const monthly = stripePriceToMonthlyGbp(price);
    if (monthly == null || monthly < 0) continue;

    const interval = price.recurring?.interval || 'month';
    const existing = fromStripe[tier];

    if (!existing) {
      fromStripe[tier] = { amount: monthly, interval };
      continue;
    }

    // Prefer real monthly prices over annualized yearly ones
    if (interval === 'month' && existing.interval !== 'month') {
      fromStripe[tier] = { amount: monthly, interval };
      continue;
    }
    if (existing.interval === 'month' && interval !== 'month') {
      continue;
    }
    if (monthly < existing.amount) {
      fromStripe[tier] = { amount: monthly, interval };
    }
  }

  const mapped: Record<string, number> = {};
  for (const [tier, entry] of Object.entries(fromStripe)) {
    mapped[tier] = entry.amount;
  }

  if (mapped.professional != null) mapped.pro = mapped.professional;
  if (mapped.pro != null && mapped.professional == null) {
    mapped.professional = mapped.pro;
  }

  return { ...fallback, ...mapped };
}

export function lookupTierPriceGbp(
  tierPricing: Record<string, number>,
  tier: string | null | undefined,
): number {
  const key = (tier || 'free').toLowerCase().trim();
  if (key in tierPricing) return tierPricing[key] ?? 0;
  const canonical = canonicalizeSubscriptionTier(key);
  if (canonical && canonical in tierPricing) return tierPricing[canonical] ?? 0;
  return 0;
}
