'use server';

import { createSupabaseServerClient } from '@/supabase/server';
import type { SeaServiceRecord, UserProfile, Vessel, StateLog } from '@/lib/types';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { stripe } from '@/lib/stripe';
import type { Stripe } from 'stripe';
import { createClient } from '@supabase/supabase-js';

//
// SUPABASE ADMIN CLIENT (server-only)
//
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

//
// STRIPE TYPES
//

// StripeProduct = Stripe.Price with product expanded
export interface StripeProduct extends Stripe.Price {
  product: Stripe.Product;
}

export interface StripePriceWithProduct extends Stripe.Price {
  product: Stripe.Product;
}

/**
 * Get all prices for the subscription product
 * Since we now have 1 product with multiple prices, we return all prices
 * (each price represents a tier)
 *
 * @param isVesselAccount - If true, fetches vessel product prices, otherwise crew product prices
 */
export async function getStripeProducts(
  isVesselAccount: boolean = false,
): Promise<StripeProduct[]> {
  const productId = (
    isVesselAccount
      ? process.env.STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID
      : process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID
  )
    ?.trim()
    .replace(/[;,\s]+$/, '');

  const productType = isVesselAccount ? 'VESSEL' : 'CREW';

  // Validate product ID
  if (!productId) {
    throw new Error(
      `Stripe ${productType.toLowerCase()} product ID is not configured. Please set STRIPE_${productType}_SUBSCRIPTION_PRODUCT_ID.`,
    );
  }

  try {
    const prices = await stripe.prices.list({
      active: true,
      product: productId,
      limit: 100,
      expand: ['data.product'],
    });

    // Filter to ensure we only return active prices on the right product
    const filteredPrices: StripeProduct[] = prices.data.filter((price) => {
      const product = price.product as Stripe.Product;

      const isSubscriptionProduct =
        product?.id === productId ||
        (typeof price.product === 'string' && price.product === productId);

      return isSubscriptionProduct && !!product && product.active && price.active;
    }) as StripeProduct[];

    return filteredPrices;
  } catch (error: any) {
    console.error('[STRIPE] Error fetching prices:', error);
    throw new Error(
      `Failed to fetch prices: ${error?.message || 'Unknown error'}`,
    );
  }
}

export async function createCheckoutSession(
  priceId: string,
  userId: string,
  userEmail: string,
): Promise<{ sessionId: string; url: string | null }> {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://www.seajourney.co.uk';

  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product as Stripe.Product;

  // Derive tier
  let tier = 'standard';
  if (price.metadata?.tier) tier = price.metadata.tier.toLowerCase();
  else if (product.metadata?.tier) tier = product.metadata.tier.toLowerCase();
  else if ((price.metadata as any)?.price_tier) tier = (price.metadata as any).price_tier.toLowerCase();
  else {
    const nick = (price.nickname || '').toLowerCase();
    if (nick.includes('premium')) tier = 'premium';
    else if (nick.includes('pro')) tier = 'pro';
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    customer_email: userEmail,
    client_reference_id: userId,
    success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/offers`,
    metadata: {
      userId,
      priceId,
      tier,
      productId: product.id,
      productName: product.name,
    },
    subscription_data: {
      metadata: { userId, tier },
    },
  });

  return { sessionId: session.id, url: session.url };
}

/**
 * Get user's Stripe subscription by email
 */
export async function getUserStripeSubscription(
  userEmail: string,
): Promise<{ subscription: Stripe.Subscription | null; customer: Stripe.Customer | null } | null> {
  try {
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });

    if (customers.data.length === 0) {
      return { subscription: null, customer: null };
    }

    const customer = customers.data[0];

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 1,
    });

    const subscription = subscriptions.data.length > 0 ? subscriptions.data[0] : null;

    return { subscription, customer };
  } catch (error: any) {
    console.error('[STRIPE] Error fetching subscription:', error);
    throw new Error(
      `Failed to fetch subscription: ${error?.message || 'Unknown error'}`,
    );
  }
}

/**
 * Change subscription plan (upgrade/downgrade)
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  newPriceId: string,
) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: sub.items.data[0].id, price: newPriceId }],
    proration_behavior: 'create_prorations',
    payment_behavior: 'pending_if_incomplete',
  });

  const invoice = await stripe.invoices.create({
    customer: sub.customer as string,
    subscription: subscriptionId,
    auto_advance: true,
  });

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  const paid = await stripe.invoices.pay(finalized.id);

  return {
    subscription: updated,
    invoiceId: paid.id,
    invoiceStatus: paid.status,
    hostedInvoiceUrl: paid.hosted_invoice_url ?? null,
  };
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelImmediately: boolean = false,
): Promise<Stripe.Subscription> {
  try {
    if (cancelImmediately) {
      return await stripe.subscriptions.cancel(subscriptionId);
    }

    return await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  } catch (error: any) {
    console.error('[STRIPE] Error cancelling subscription:', error);
    throw new Error(
      `Failed to cancel subscription: ${error?.message || 'Unknown error'}`,
    );
  }
}

/**
 * Resume subscription for the currently logged-in user
 * - Reads user from Supabase cookie-based session
 * - Looks up the user's subscription id in DB (trusted)
 * - Resumes in Stripe by setting cancel_at_period_end=false
 */
export async function resumeMySubscription(): Promise<Stripe.Subscription> {
  // 1) Identify user (cookie session)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    const e: any = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }

  // 2) Load subscription id from DB (server-trusted)
  const { data: row, error } = await supabaseAdmin
    .from('users')
    .select('stripe_subscription_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const subscriptionId = row?.stripe_subscription_id;
  if (!subscriptionId) {
    const e: any = new Error('No subscription found for this user.');
    e.status = 400;
    throw e;
  }

  // 3) Resume in Stripe
  return await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

//
// EVERYTHING BELOW HERE IS YOUR EXISTING SEA-TIME REPORT LOGIC
// (Only change: make Supabase client creation consistent with "await")
//

export type SeaTimeReportData = {
  userProfile: UserProfile;
  serviceRecords: (SeaServiceRecord & {
    vesselName: string;
    totalDays: number;
  })[];
  vesselDetails?: Vessel;
  totalDays: number;
  totalSeaDays: number;
  totalStandbyDays: number;
};

export async function generateSeaTimeReportData(
  userId: string,
  filterType: 'vessel' | 'date_range',
  vesselId?: string,
  dateRange?: { from: Date; to: Date },
): Promise<SeaTimeReportData> {
  const supabase = await createSupabaseServerClient();

  // ----- your existing logic continues unchanged below -----
  // (keep the rest of your function exactly as you had it,
  // just make sure any createSupabaseServerClient() usage is awaited)
  // --------------------------------------------------------

  // ...PASTE YOUR EXISTING FUNCTION BODY HERE (unchanged)...
  throw new Error('generateSeaTimeReportData body not pasted in this snippet.');
}
