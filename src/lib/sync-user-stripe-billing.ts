import type Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  extractTierFromSubscription,
  mapStripeSubscriptionStatusToDb,
} from '@/lib/stripe-subscription-helpers';

/**
 * Writes Stripe subscription fields to users (tier, status, period end, ids).
 * Use a subscription object retrieved with expand: ['items.data.price.product'] for correct tier.
 */
export async function syncSupabaseUserFromStripeSubscription(
  userId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('personal_plan_paused_at, personal_plan_paused_subscription_id')
    .eq('id', userId)
    .maybeSingle();

  if (
    existing?.personal_plan_paused_at &&
    (!existing.personal_plan_paused_subscription_id ||
      existing.personal_plan_paused_subscription_id === sub.id)
  ) {
    console.log(
      '[syncSupabaseUserFromStripeSubscription] Skipping — personal plan paused for vessel',
      { userId, subId: sub.id },
    );
    return;
  }
  const tier = extractTierFromSubscription(sub);
  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) {
    console.warn('[syncSupabaseUserFromStripeSubscription] Missing customer id', {
      userId,
      subId: sub.id,
    });
    return;
  }

  const currentPeriodEndIso = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      subscription_tier: tier,
      subscription_status: mapStripeSubscriptionStatusToDb(sub.status),
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      current_period_end: currentPeriodEndIso,
    })
    .eq('id', userId);

  if (error) {
    console.error('[syncSupabaseUserFromStripeSubscription] Update failed:', error);
    throw new Error(error.message);
  }
}
