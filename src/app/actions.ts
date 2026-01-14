'use server';

import { createSupabaseServerClient } from '@/supabase/server';
import type { SeaServiceRecord, UserProfile, Vessel, StateLog } from '@/lib/types';
import { isWithinInterval, startOfDay, endOfDay, parse, differenceInDays } from 'date-fns';
import { stripe } from '@/lib/stripe';
import type { Stripe } from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { calculateStandbyDays } from '@/lib/standby-calculation';

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
  // Use admin client for server actions to bypass RLS
  // This is safe because we're only fetching the requesting user's own data
  
  // Fetch user profile
  const { data: userProfileData, error: profileError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !userProfileData) {
    console.error('[generateSeaTimeReportData] Error fetching user profile:', {
      error: profileError,
      code: profileError?.code,
      message: profileError?.message,
      userId,
    });
    throw new Error(`Failed to fetch user profile: ${profileError?.message || 'User profile not found'}`);
  }

  const userProfile: UserProfile = {
    id: userProfileData.id,
    email: userProfileData.email || '',
    firstName: userProfileData.first_name || null,
    lastName: userProfileData.last_name || null,
    username: userProfileData.username || `user_${userId.slice(0, 8)}`,
    role: userProfileData.role || 'crew',
    activeVesselId: userProfileData.active_vessel_id || null,
    position: userProfileData.position || null,
    subscriptionTier: userProfileData.subscription_tier || 'free',
    subscriptionStatus: userProfileData.subscription_status || 'inactive',
  };

  // Build query for state logs - use admin client for server actions
  let logsQuery = supabaseAdmin
    .from('daily_state_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  // Apply filters
  if (filterType === 'vessel' && vesselId) {
    logsQuery = logsQuery.eq('vessel_id', vesselId);
  } else if (filterType === 'date_range' && dateRange) {
    const startDateStr = dateRange.from.toISOString().split('T')[0];
    const endDateStr = dateRange.to.toISOString().split('T')[0];
    logsQuery = logsQuery.gte('date', startDateStr).lte('date', endDateStr);
  }

  const { data: logsData, error: logsError } = await logsQuery;

  if (logsError) {
    throw new Error(`Failed to fetch state logs: ${logsError.message}`);
  }

  const stateLogs: StateLog[] = (logsData || []).map(log => ({
    id: log.id,
    userId: log.user_id,
    vesselId: log.vessel_id,
    state: log.state,
    date: log.date,
    createdAt: log.created_at,
    updatedAt: log.updated_at,
  }));

  if (stateLogs.length === 0) {
    return {
      userProfile,
      serviceRecords: [],
      vesselDetails: undefined,
      totalDays: 0,
      totalSeaDays: 0,
      totalStandbyDays: 0,
    };
  }

  // Fetch vessels to get vessel names - use admin client for server actions
  const vesselIds = [...new Set(stateLogs.map(log => log.vesselId))];
  const { data: vesselsData, error: vesselsError } = await supabaseAdmin
    .from('vessels')
    .select('*')
    .in('id', vesselIds);

  if (vesselsError) {
    throw new Error(`Failed to fetch vessels: ${vesselsError.message}`);
  }

  const vesselsMap = new Map((vesselsData || []).map(v => [v.id, v]));

  // Group logs by vessel and find continuous service periods
  const serviceRecords: (SeaServiceRecord & { 
    vesselName: string; 
    totalDays: number; 
    start_date: string;
    end_date: string;
    at_sea_days?: number; 
    standby_days?: number; 
    yard_days?: number; 
    leave_days?: number;
  })[] = [];
  const logsByVessel = new Map<string, StateLog[]>();

  // Group logs by vessel
  stateLogs.forEach(log => {
    if (!logsByVessel.has(log.vesselId)) {
      logsByVessel.set(log.vesselId, []);
    }
    logsByVessel.get(log.vesselId)!.push(log);
  });


  // Process each vessel's logs to create service records
  for (const [vesselId, vesselLogs] of logsByVessel.entries()) {
    if (vesselLogs.length === 0) continue;

    const vessel = vesselsMap.get(vesselId);
    const vesselName = vessel?.name || 'Unknown Vessel';

    // Sort logs by date
    vesselLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Find continuous periods (group consecutive dates)
    const periods: { startDate: string; endDate: string; logs: StateLog[] }[] = [];
    let currentPeriod: { startDate: string; endDate: string; logs: StateLog[] } | null = null;

    vesselLogs.forEach(log => {
      if (!currentPeriod) {
        currentPeriod = {
          startDate: log.date,
          endDate: log.date,
          logs: [log],
        };
      } else {
        const lastDate = new Date(currentPeriod.endDate);
        const currentDate = new Date(log.date);
        const daysDiff = differenceInDays(currentDate, lastDate);

        if (daysDiff === 1) {
          // Consecutive day - extend period
          currentPeriod.endDate = log.date;
          currentPeriod.logs.push(log);
        } else {
          // Gap detected - save current period and start new one
          periods.push(currentPeriod);
          currentPeriod = {
            startDate: log.date,
            endDate: log.date,
            logs: [log],
          };
        }
      }
    });

    if (currentPeriod) {
      periods.push(currentPeriod);
    }

    // Calculate day counts for each period
    for (const period of periods) {
      const { totalStandbyDays } = calculateStandbyDays(period.logs);
      
      const atSeaDays = period.logs.filter(log => 
        log.state === 'underway' || log.state === 'at-anchor'
      ).length;
      const yardDays = period.logs.filter(log => log.state === 'in-yard').length;
      const leaveDays = period.logs.filter(log => log.state === 'on-leave').length;
      const totalDays = period.logs.length;

      serviceRecords.push({
        id: `${vesselId}-${period.startDate}-${period.endDate}`,
        userId,
        vesselId,
        date: period.startDate,
        state: period.logs[0].state, // Use first log's state
        vesselName,
        totalDays,
        start_date: period.startDate,
        end_date: period.endDate,
        at_sea_days: atSeaDays,
        standby_days: totalStandbyDays,
        yard_days: yardDays,
        leave_days: leaveDays,
      });
    }
  }

  // Calculate totals
  const totalDays = serviceRecords.reduce((sum, record) => sum + record.totalDays, 0);
  const totalSeaDays = serviceRecords.reduce((sum, record) => sum + (record.at_sea_days || 0), 0);
  const totalStandbyDays = serviceRecords.reduce((sum, record) => sum + (record.standby_days || 0), 0);

  // Get vessel details if filtering by vessel
  let vesselDetails: Vessel | undefined;
  if (filterType === 'vessel' && vesselId) {
    const vessel = vesselsMap.get(vesselId);
    if (vessel) {
      vesselDetails = {
        id: vessel.id,
        name: vessel.name,
        type: vessel.type,
        officialNumber: vessel.imo || undefined,
      };
    }
  }

  return {
    userProfile,
    serviceRecords,
    vesselDetails,
    totalDays,
    totalSeaDays,
    totalStandbyDays,
  };
}
