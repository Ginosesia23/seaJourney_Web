/**
 * Free-trial lengths for new subscriptions created via Stripe Checkout.
 * Crew vs vessel are inferred from STRIPE_SUBSCRIPTION_PRODUCT_ID vs STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID.
 *
 * Optional env overrides (integers, days):
 * - STRIPE_CREW_TRIAL_DAYS (default 7)
 * - STRIPE_VESSEL_TRIAL_DAYS (default 30, ~one month)
 */

export const DEFAULT_CREW_TRIAL_DAYS = 7;
export const DEFAULT_VESSEL_TRIAL_DAYS = 30;

/** Marketing copy for plan cards; align with defaults / STRIPE_*_TRIAL_DAYS if you change lengths */
export const CREW_TRIAL_DISPLAY_LABEL = '7-day free trial';
export const VESSEL_TRIAL_DISPLAY_LABEL = '1-month free trial';

function normalizeStripeProductId(raw: string | undefined): string | null {
  const t = raw?.trim().replace(/[;,\s]+$/, '');
  return t || null;
}

function parseTrialDays(value: string | undefined, fallback: number): number {
  const n = parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 730);
}

/**
 * Returns trial length in days for Checkout `subscription_data.trial_period_days`, or undefined if the
 * product is not one of the configured crew/vessel subscription products (no trial applied).
 */
export function getSubscriptionTrialPeriodDaysForProduct(
  productId: string,
): number | undefined {
  const crewProductId = normalizeStripeProductId(
    process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID,
  );
  const vesselProductId = normalizeStripeProductId(
    process.env.STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID,
  );

  const crewDays = parseTrialDays(
    process.env.STRIPE_CREW_TRIAL_DAYS,
    DEFAULT_CREW_TRIAL_DAYS,
  );
  const vesselDays = parseTrialDays(
    process.env.STRIPE_VESSEL_TRIAL_DAYS,
    DEFAULT_VESSEL_TRIAL_DAYS,
  );

  if (vesselProductId && productId === vesselProductId) return vesselDays;
  if (crewProductId && productId === crewProductId) return crewDays;
  return undefined;
}
