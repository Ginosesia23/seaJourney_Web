import type Stripe from 'stripe';

export function normalizeTier(raw: string | undefined | null): string {
  const t = (raw || '').toLowerCase().trim();
  return t || 'standard';
}

/**
 * Prefer price.metadata.tier, then price nickname, then subscription metadata.tier.
 * Matches webhook logic — caller should pass a subscription retrieved with
 * `expand: ['items.data.price.product']` so product IDs resolve for crew/vessel matching.
 */
export function extractTierFromSubscription(sub: Stripe.Subscription): string {
  const items = sub.items?.data ?? [];

  const crewProductId = (process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID || '').trim();
  const vesselProductId = (process.env.STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID || '').trim();

  const picked =
    items.find((it) => {
      const price = it.price as Stripe.Price;
      const prod = price.product as Stripe.Product | string;
      const prodId = typeof prod === 'string' ? prod : prod?.id;
      return prodId === vesselProductId || prodId === crewProductId;
    }) ||
    items.find((it) => (it.price as Stripe.Price)?.metadata?.tier) ||
    items[0];

  const price = picked?.price as Stripe.Price | undefined;

  const tierFromPriceMeta = price?.metadata?.tier as string | undefined;
  const tierFromNickname = price?.nickname || undefined;
  const tierFromSubMeta = (sub.metadata as Record<string, string> | undefined)?.tier;

  return normalizeTier(tierFromPriceMeta || tierFromNickname || tierFromSubMeta);
}

/**
 * Map Stripe subscription.status to our users.subscription_status column.
 */
export function mapStripeSubscriptionStatusToDb(
  stripeStatus: Stripe.Subscription.Status,
): 'active' | 'past_due' | 'canceled' | 'inactive' {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (
    stripeStatus === 'past_due' ||
    stripeStatus === 'unpaid' ||
    stripeStatus === 'incomplete'
  ) {
    return 'past_due';
  }
  if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') {
    return 'canceled';
  }
  return 'inactive';
}

/**
 * When a customer has multiple subscriptions (e.g. old canceled + new active),
 * pick the one the app should treat as current. Stripe's list(..., limit: 1)
 * is not reliable because default ordering can surface the wrong row.
 */
export function pickCanonicalStripeSubscription(
  subs: Stripe.Subscription[],
): Stripe.Subscription | null {
  if (!subs.length) return null;

  const score = (sub: Stripe.Subscription): number => {
    const st = sub.status;
    const end = sub.current_period_end || 0;
    if (st === 'active' && !sub.cancel_at_period_end) return 1_000_000_000 + end;
    if (st === 'active' && sub.cancel_at_period_end) return 900_000_000 + end;
    if (st === 'trialing') return 850_000_000 + end;
    if (st === 'past_due') return 700_000_000 + end;
    if (st === 'unpaid') return 600_000_000 + end;
    if (st === 'incomplete') return 500_000_000 + end;
    if (st === 'paused') return 400_000_000 + end;
    if (st === 'canceled') return 100_000_000 + (sub.ended_at || 0);
    if (st === 'incomplete_expired') return 50_000_000;
    return end;
  };

  return subs.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
}
