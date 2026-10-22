/**
 * Self-test: catalog prices and Stripe plan matching.
 * Run: npx tsx src/lib/subscription-tier-pricing.selftest.ts
 */

import {
  catalogMonthlyPriceLabel,
  canonicalizeSubscriptionTier,
  findMatchingStripePrice,
  overlayCatalogAndStripePrice,
} from './subscription-tier-pricing';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(catalogMonthlyPriceLabel('Crew Standard') === '£4.99', 'crew standard catalog');
assert(catalogMonthlyPriceLabel('Crew Premium') === '£9.99', 'crew premium catalog');
assert(catalogMonthlyPriceLabel('Crew Professional') === '£14.99', 'crew professional catalog');
assert(catalogMonthlyPriceLabel('Vessel Standard') === '£49.99', 'vessel standard catalog');
assert(catalogMonthlyPriceLabel('Vessel Premium') === '£79.99', 'vessel premium catalog');
assert(catalogMonthlyPriceLabel('Vessel Professional') === '£99.99', 'vessel professional catalog');
assert(catalogMonthlyPriceLabel('Vessel Fleet') === '£249.99', 'vessel fleet catalog');

assert(canonicalizeSubscriptionTier('Vessel Standard') === 'vessel_lite', 'standard → lite');
assert(canonicalizeSubscriptionTier('sj_vessel_standard') === 'vessel_lite', 'prefixed standard');
assert(canonicalizeSubscriptionTier('Vessel Premium') === 'vessel_basic', 'premium → basic');
assert(canonicalizeSubscriptionTier('Vessel Professional') === 'vessel_pro', 'professional → pro');

const prices = [
  { id: 'p_std', unit_amount: 3599, nickname: 'Vessel Standard', recurring: { interval: 'month' } },
  { id: 'p_pro', unit_amount: 13999, nickname: 'Vessel Professional', recurring: { interval: 'month' } },
];

const std = findMatchingStripePrice(prices, 'Vessel Standard');
assert(std?.id === 'p_std', 'match Vessel Standard nickname to catalog plan');
const pro = findMatchingStripePrice(prices, 'Vessel Professional');
assert(pro?.id === 'p_pro', 'match Vessel Professional nickname');

const shown = overlayCatalogAndStripePrice(
  { name: 'Vessel Standard', price: '£0.00', priceSuffix: '/ month' },
  prices,
);
assert(shown.price === '£49.99', 'advertised price stays on the landing catalog');
assert(shown.priceId === 'p_std', 'checkout still uses the Stripe price id');

console.log('subscription-tier-pricing.selftest: all scenarios passed');
