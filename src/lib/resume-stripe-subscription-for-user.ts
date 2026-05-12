import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pickCanonicalStripeSubscription } from '@/lib/stripe-subscription-helpers';
import { syncSupabaseUserFromStripeSubscription } from '@/lib/sync-user-stripe-billing';
import type Stripe from 'stripe';

const SUB_EXPAND: Stripe.SubscriptionRetrieveParams['expand'] = [
  'items.data.price.product',
];

export class ResumeSubscriptionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ResumeSubscriptionError';
    this.status = status;
  }
}

const RESUMABLE: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due'];

/**
 * Clears cancel_at_period_end in Stripe and syncs users row (webhooks can lag).
 * If DB points at an ended subscription but the customer has another active one, repoints DB and resumes that.
 */
export async function resumeStripeSubscriptionForUser(
  userId: string,
): Promise<Stripe.Subscription> {
  const { data: row, error: dbErr } = await supabaseAdmin
    .from('users')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (dbErr) {
    throw new ResumeSubscriptionError(dbErr.message, 500);
  }
  if (!row?.stripe_subscription_id) {
    throw new ResumeSubscriptionError('No subscription found for this user.', 400);
  }

  let subscriptionId = row.stripe_subscription_id;
  let sub: Stripe.Subscription | null = null;

  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: SUB_EXPAND,
    });
  } catch {
    sub = null;
  }

  const mustRepoint =
    !sub ||
    sub.status === 'canceled' ||
    sub.status === 'incomplete_expired';

  if (mustRepoint) {
    const customerId =
      row.stripe_customer_id ||
      (sub && typeof sub.customer === 'string'
        ? sub.customer
        : (sub?.customer as Stripe.Customer)?.id) ||
      null;

    if (!customerId) {
      throw new ResumeSubscriptionError(
        'Could not resolve Stripe customer for this account. Check that billing is set up, or contact support.',
        400,
      );
    }

    const { data: allSubs } = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 30,
    });

    const count = allSubs?.length ?? 0;
    if (count === 0) {
      throw new ResumeSubscriptionError(
        'Stripe has no subscriptions for this billing account. The old subscription may have been removed. Start a new subscription from the Offers page, and confirm you are using the same Stripe mode (test vs live) as this app.',
        400,
      );
    }

    const best = pickCanonicalStripeSubscription(allSubs);
    if (
      !best ||
      best.status === 'canceled' ||
      best.status === 'incomplete_expired'
    ) {
      throw new ResumeSubscriptionError(
        'Resume only applies while a subscription is still active but set to cancel at period end. Your plan has fully ended in Stripe — subscribe again from the Offers page. In the Stripe Dashboard, search by Customer ID (cus_…) from your billing profile, not the subscription ID.',
        400,
      );
    }

    subscriptionId = best.id;
    sub = await stripe.subscriptions.retrieve(best.id, { expand: SUB_EXPAND });
  }

  if (!sub || !RESUMABLE.includes(sub.status)) {
    throw new ResumeSubscriptionError(
      `Subscription cannot be resumed while status is "${sub?.status ?? 'unknown'}".`,
      400,
    );
  }

  const updated =
    sub.cancel_at_period_end === true
      ? await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: false,
        })
      : sub;

  const fresh = await stripe.subscriptions.retrieve(updated.id, {
    expand: SUB_EXPAND,
  });

  await syncSupabaseUserFromStripeSubscription(userId, fresh);

  return fresh;
}
