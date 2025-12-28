'use server';

import { createSupabaseServerClient } from '@/supabase/server';
import type {
  SeaServiceRecord,
  UserProfile,
  Vessel,
  StateLog,
} from '@/lib/types';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { stripe } from '@/lib/stripe';
import type { Stripe } from 'stripe';

//
// STRIPE TYPES
//

// Now: StripeProduct = Stripe.Price with product expanded
export interface StripeProduct extends Stripe.Price {
  product: Stripe.Product;
}

export interface StripePriceWithProduct extends Stripe.Price {
  product: Stripe.Product;
}

// Subscription product ID - single product with multiple price tiers

/**
 * Get all prices for the subscription product
 * Since we now have 1 product with 3 prices, we return all prices
 * (each price represents a tier: standard / premium / professional)
 * 
 * @param isVesselAccount - If true, fetches vessel product prices, otherwise crew product prices
 */
export async function getStripeProducts(isVesselAccount: boolean = false): Promise<StripeProduct[]> {
  // Determine which product ID to use and trim any whitespace/semicolons
  const productId = (isVesselAccount 
    ? process.env.STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID 
    : process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID)?.trim().replace(/[;,\s]+$/, '');
  
  const productType = isVesselAccount ? 'VESSEL' : 'CREW';
  
  console.log('========================================');
  console.log(`[STRIPE] ===== FETCHING ${productType} PRODUCTS =====`);
  console.log(`[STRIPE] Product ID:`, productId);
  console.log('[STRIPE] Timestamp:', new Date().toISOString());
  
  // Validate Stripe secret key
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    const errorMsg = '[STRIPE] ❌ ERROR: STRIPE_SECRET_KEY is not set in environment variables';
    console.error(errorMsg);
    throw new Error('Stripe secret key is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }
  
  // Validate product ID
  if (!productId) {
    const errorMsg = `[STRIPE] ❌ ERROR: STRIPE_${productType}_SUBSCRIPTION_PRODUCT_ID is not set in environment variables`;
    console.error(errorMsg);
    throw new Error(`Stripe ${productType.toLowerCase()} product ID is not configured. Please set STRIPE_${productType}_SUBSCRIPTION_PRODUCT_ID environment variable.`);
  }
  
  console.log('[STRIPE] Secret key prefix:', secretKey.slice(0, 8));
  console.log('[STRIPE] Environment:', secretKey.startsWith('sk_live_') ? 'LIVE' : secretKey.startsWith('sk_test_') ? 'SANDBOX' : 'UNKNOWN');
  console.log('[STRIPE] API Key (first 10 chars):', secretKey.slice(0, 10));
  
  // Validate Stripe client
  if (!stripe) {
    const errorMsg = '[STRIPE] ❌ ERROR: Stripe client is not initialized';
    console.error(errorMsg);
    throw new Error('Stripe client is not initialized. Please check your Stripe configuration.');
  }
  
  console.log('[STRIPE] Stripe client initialized:', !!stripe);
  console.log('========================================');

  try {
    // Fetch all active prices for the subscription product, expanding the product
    console.log('[STRIPE] Calling stripe.prices.list()...');
    console.log('[STRIPE] Request params:', {
      active: true,
      product: productId,
      limit: 100,
      expand: ['data.product'],
    });
    
    const prices = await stripe.prices.list({
      active: true,
      product: productId,
      limit: 100,
      expand: ['data.product'],
    });
    
    console.log('[STRIPE] ✅ API call successful');
    console.log('[STRIPE] Response status: OK');
    console.log('[STRIPE] Response has_more:', prices.has_more);

    console.log('[STRIPE] Total prices fetched:', prices.data.length);
    console.log('[STRIPE] Raw prices summary:', {
      count: prices.data.length,
      has_more: prices.has_more,
    });

    // Log each price with key details
    prices.data.forEach((p, index) => {
      const product = typeof p.product === 'string' ? p.product : (p.product as Stripe.Product);
      console.log(`[STRIPE] Price ${index + 1}/${prices.data.length}:`, {
        price_id: p.id,
        product_id: typeof product === 'string' ? product : product?.id,
        product_name: typeof product === 'string' ? 'N/A' : product?.name,
        amount: p.unit_amount ? `£${(p.unit_amount / 100).toFixed(2)}` : 'N/A',
        currency: p.currency,
        interval: p.recurring?.interval || 'one-time',
        active: p.active,
        nickname: p.nickname || 'none',
        metadata_tier: (p.metadata as any)?.tier || 'none',
        livemode: p.livemode,
      });
    });

    console.log(
      '[STRIPE] Detailed raw prices data:',
      JSON.stringify(
        prices.data.map((p) => ({
          id: p.id,
          product_id:
            typeof p.product === 'string'
              ? p.product
              : (p.product as Stripe.Product)?.id,
          product_name:
            typeof p.product === 'string'
              ? 'string'
              : (p.product as Stripe.Product)?.name,
          unit_amount: p.unit_amount,
          currency: p.currency,
          recurring: p.recurring,
          metadata: p.metadata,
          nickname: p.nickname,
          livemode: p.livemode,
        })),
        null,
        2,
      ),
    );

    // Filter to ensure we only return active prices on the right product
    console.log('[STRIPE] Filtering prices...');
    const filteredPrices: StripeProduct[] = prices.data.filter((price) => {
      const product = price.product as Stripe.Product;

      const isSubscriptionProduct =
        product?.id === productId ||
        (typeof price.product === 'string' &&
          price.product === productId);

      const isActive =
        isSubscriptionProduct && !!product && product.active && price.active;

      if (!isActive) {
        console.log('[STRIPE] ⚠️ Price filtered out:', {
          price_id: price.id,
          product_id: product?.id,
          product_name: product?.name,
          isSubscriptionProduct,
          product_active: product?.active,
          price_active: price.active,
          reason: !isSubscriptionProduct ? 'wrong_product' : !product?.active ? 'product_inactive' : !price.active ? 'price_inactive' : 'unknown',
        });
      }

      return isActive;
    }) as StripeProduct[];

    console.log(
      '[STRIPE] Filtered prices (subscription product only):',
      filteredPrices.length,
    );
    console.log(
      '[STRIPE] Prices before filtering:',
      prices.data.length,
      '| After filtering:',
      filteredPrices.length,
    );

    console.log(
      '[STRIPE] Final filtered prices array:',
      JSON.stringify(
        filteredPrices.map((p) => ({
          id: p.id,
          unit_amount: p.unit_amount,
          currency: p.currency,
          interval: p.recurring?.interval,
          metadata: p.metadata,
          nickname: p.nickname,
          product_id: p.product.id,
          product_name: p.product.name,
          livemode: p.livemode,
        })),
        null,
        2,
      ),
    );

    console.log('========================================');
    console.log('[STRIPE] ✅ FETCH COMPLETE');
    console.log('[STRIPE] Returning', filteredPrices.length, 'prices');
    console.log('[STRIPE] ========================================');

    return filteredPrices;
  } catch (error: any) {
    console.error('========================================');
    console.error('[STRIPE] ❌ ERROR FETCHING PRODUCTS');
    console.error(`[STRIPE] Product Type: ${productType}`);
    console.error(`[STRIPE] Product ID used: ${productId}`);
    console.error('[STRIPE] Error name:', error?.name);
    console.error('[STRIPE] Error message:', error?.message);
    console.error('[STRIPE] Error type:', error?.type);
    console.error('[STRIPE] Error code:', error?.code);
    console.error('[STRIPE] Error statusCode:', error?.statusCode);
    console.error('[STRIPE] Error requestId:', error?.requestId);
    
    // Check for common errors
    if (error?.code === 'resource_missing') {
      console.error(`[STRIPE] ⚠️ Product ID may be incorrect or not found in this Stripe account`);
      console.error(`[STRIPE] Current Product ID (${productType}):`, productId);
    }
    
    if (error?.statusCode === 401) {
      console.error('[STRIPE] ⚠️ Authentication failed - check your STRIPE_SECRET_KEY');
      console.error('[STRIPE] Key prefix:', process.env.STRIPE_SECRET_KEY?.slice(0, 10) || 'NOT SET');
    }
    
    if (error?.code === 'api_key_expired' || error?.message?.includes('Invalid API Key')) {
      console.error('[STRIPE] ⚠️ Invalid or expired API key');
    }
    
    console.error('[STRIPE] Error stack:', error?.stack);
    console.error('[STRIPE] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('[STRIPE] ========================================');
    throw error;
  }
}

export async function createCheckoutSession(
  priceId: string,
  userId: string,
  userEmail: string,
): Promise<{ sessionId: string; url: string | null }> {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL || 'http://www.seajourney.co.uk';

  const price = await stripe.prices.retrieve(priceId, {
    expand: ['product'],
  });

  const product = price.product as Stripe.Product;

  let tier = 'standard';
  if (price.metadata?.tier) {
    tier = price.metadata.tier.toLowerCase();
  } else if (product.metadata?.tier) {
    tier = product.metadata.tier.toLowerCase();
  } else if (price.metadata?.price_tier) {
    tier = price.metadata.price_tier.toLowerCase();
  } else {
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
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/offers`,

    // 👇 for checkout.session.completed handler
    metadata: {
      userId,
      priceId,
      tier,
      productId: product.id,
      productName: product.name,
    },

    // 👇 for customer.subscription.* events going forward
    subscription_data: {
      metadata: {
        userId,
        tier,
      },
    },
  });

  console.log(
    `[SERVER] Created checkout session for user ${userId} with tier: ${tier}`,
  );

  return {
    sessionId: session.id,
    url: session.url,
  };
}




/**
 * Get user's Stripe subscription by email
 */
export async function getUserStripeSubscription(
  userEmail: string,
): Promise<{
  subscription: Stripe.Subscription | null;
  customer: Stripe.Customer | null;
} | null> {
  try {
    console.log('[STRIPE] Looking up customer by email:', userEmail);

    // Find customer by email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    if (customers.data.length === 0) {
      console.log('[STRIPE] No customer found for email:', userEmail);
      return { subscription: null, customer: null };
    }

    const customer = customers.data[0];
    console.log('[STRIPE] Found customer:', customer.id);

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 1,
    });

    const subscription =
      subscriptions.data.length > 0 ? subscriptions.data[0] : null;

    console.log('[STRIPE] Subscription found:', subscription?.id);

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
// in your server action / api route that changes plan
export async function changeSubscriptionPlan(subscriptionId: string, newPriceId: string) {
  // 1) Retrieve current subscription
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  // 2) Update subscription price with prorations
  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: sub.items.data[0].id, price: newPriceId }],
    proration_behavior: 'create_prorations', // creates proration line items
    payment_behavior: 'pending_if_incomplete', // handles SCA cases safely
  });

  // 3) Immediately invoice the proration and attempt payment
  const invoice = await stripe.invoices.create({
    customer: sub.customer as string,
    subscription: subscriptionId,
    auto_advance: true, // finalize automatically
  });

  // Finalize + pay (some accounts auto-finalize; doing it explicitly is safest)
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
    console.log('[STRIPE] Cancelling subscription:', {
      subscriptionId,
      cancelImmediately,
    });

    let updatedSubscription: Stripe.Subscription;

    if (cancelImmediately) {
      // Cancel immediately
      updatedSubscription = await stripe.subscriptions.cancel(subscriptionId);
    } else {
      // Cancel at period end (default)
      updatedSubscription = await stripe.subscriptions.update(
        subscriptionId,
        {
          cancel_at_period_end: true,
        },
      );
    }

    console.log('[STRIPE] Subscription cancelled:', updatedSubscription.id);

    return updatedSubscription;
  } catch (error: any) {
    console.error('[STRIPE] Error cancelling subscription:', error);
    throw new Error(
      `Failed to cancel subscription: ${error?.message || 'Unknown error'}`,
    );
  }
}

/**
 * Resume a cancelled subscription
 */
export async function resumeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  try {
    console.log('[STRIPE] Resuming subscription:', subscriptionId);

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    console.log('[STRIPE] Subscription resumed:', subscription.id);

    return subscription;
  } catch (error: any) {
    console.error('[STRIPE] Error resuming subscription:', error);
    throw new Error(
      `Failed to resume subscription: ${error?.message || 'Unknown error'}`,
    );
  }
}

//
// EVERYTHING BELOW HERE IS YOUR EXISTING SEA-TIME REPORT LOGIC (UNCHANGED)
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
  const supabase = createSupabaseServerClient();

  // 1. Fetch user profile
  const { data: userProfileData, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !userProfileData) {
    throw new Error('User profile not found.');
  }

  const userProfile: UserProfile = {
    id: userProfileData.id,
    email: userProfileData.email,
    username: userProfileData.username,
    firstName: userProfileData.first_name,
    lastName: userProfileData.last_name,
    profilePicture: userProfileData.profile_picture,
    bio: userProfileData.bio,
    registrationDate: userProfileData.registration_date,
    role: userProfileData.role,
    subscriptionTier: userProfileData.subscription_tier,
    subscriptionStatus: userProfileData.subscription_status,
    activeVesselId: userProfileData.active_vessel_id,
  };

  // 2. Fetch all user's vessels to map names
  const { data: vesselsData, error: vesselsError } = await supabase
    .from('vessels')
    .select('*');

  if (vesselsError) {
    throw new Error('Failed to fetch vessels.');
  }

  const vesselsMap = new Map<string, Vessel>();
  (vesselsData || []).forEach((vessel) => {
    vesselsMap.set(vessel.id, {
      id: vessel.id,
      name: vessel.name,
      type: vessel.type,
      officialNumber: vessel.imo,
    });
  });

  // 3. Fetch all SeaServiceRecords and StateLogs
  let allServiceRecords: SeaServiceRecord[] = [];
  const allStateLogs = new Map<string, StateLog[]>(); // vesselId -> logs

  for (const vessel of vesselsData || []) {
    const { data: serviceData } = await supabase
      .from('daily_state_logs')
      .select('*')
      .eq('vessel_id', vessel.id);

    const { data: logsData } = await supabase
      .from('daily_state_logs')
      .select('*')
      .eq('vessel_id', vessel.id);

    (serviceData || []).forEach((service) => {
      allServiceRecords.push({
        id: service.id,
        vesselId: service.vessel_id,
        position: service.position,
        date: service.date,
        notes: service.notes,
      });
    });

    const logs = (logsData || []).map((log) => ({
      id: log.date,
      date: log.date,
      state: log.state,
    }));
    allStateLogs.set(vessel.id, logs);
  }

  // 4. Filter service records based on criteria
  let filteredServiceRecords: SeaServiceRecord[] = [];
  if (filterType === 'vessel') {
    if (!vesselId)
      throw new Error('Vessel ID is required for vessel filter.');
    filteredServiceRecords = allServiceRecords.filter(
      (service) => service.vesselId === vesselId,
    );
  } else if (filterType === 'date_range') {
    if (!dateRange || !dateRange.from || !dateRange.to)
      throw new Error('Date range is required.');

    const fromDate = startOfDay(new Date(dateRange.from));
    const toDate = endOfDay(new Date(dateRange.to));

    filteredServiceRecords = allServiceRecords.filter((service) => {
      const serviceDate = new Date(service.date);
      // Check if the service date is within the date range
      return serviceDate >= fromDate && serviceDate <= toDate;
    });
  } else {
    // If no filter, use all service records.
    filteredServiceRecords = allServiceRecords;
  }

  // 5. Process and enrich records
  let totalDays = 0;
  let totalSeaDays = 0;
  let totalStandbyDays = 0;

  const dateRangeInterval =
    dateRange?.from && dateRange.to
      ? {
          start: startOfDay(new Date(dateRange.from)),
          end: endOfDay(new Date(dateRange.to)),
        }
      : null;

  const enrichedServiceRecords = filteredServiceRecords.map(
    (service) => {
      const logs = allStateLogs.get(service.vesselId) || [];
      let serviceTotalDays = 0;

      logs.forEach((log) => {
        const dayDate = new Date(log.date);
        const serviceDate = new Date(service.date);

        // Check if the log date matches the service date
        const logDateStr = dayDate.toISOString().split('T')[0];
        const serviceDateStr =
          serviceDate.toISOString().split('T')[0];
        if (logDateStr !== serviceDateStr) {
          return;
        }

        // If filtering by date range, also check if it's within that range
        if (
          dateRangeInterval &&
          !isWithinInterval(dayDate, dateRangeInterval)
        ) {
          return;
        }

        const state = log.state;
        totalDays++;
        serviceTotalDays++;
        if (state === 'underway') totalSeaDays++;
        if (state === 'in-port' || state === 'at-anchor')
          totalStandbyDays++;
      });

      return {
        ...service,
        vesselName:
          vesselsMap.get(service.vesselId)?.name || 'Unknown Vessel',
        totalDays: serviceTotalDays,
      };
    },
  );

  // For date range reports, we might not have a single vessel detail
  const finalVesselDetails =
    filterType === 'vessel' && vesselId
      ? vesselsMap.get(vesselId)
      : undefined;

  return {
    userProfile,
    serviceRecords: enrichedServiceRecords.filter(
      (s) => s.totalDays > 0,
    ), // Only include services with days in the range
    vesselDetails: finalVesselDetails,
    totalDays,
    totalSeaDays,
    totalStandbyDays,
  };
}
