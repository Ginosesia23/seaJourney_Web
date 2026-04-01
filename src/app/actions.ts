'use server';

import { createSupabaseServerClient } from '@/supabase/server';
import type { SeaServiceRecord, UserProfile, Vessel, StateLog } from '@/lib/types';
import { isWithinInterval, startOfDay, endOfDay, parse, differenceInDays, format, eachDayOfInterval } from 'date-fns';
import { stripe } from '@/lib/stripe';
import { pickCanonicalStripeSubscription } from '@/lib/stripe-subscription-helpers';
import { resumeStripeSubscriptionForUser } from '@/lib/resume-stripe-subscription-for-user';
import type { Stripe } from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { getVesselCalculationCategory, isAllDaysExceptLeaveCountAsSea } from '@/lib/vessel-calculation-categories';
import { getSubscriptionTrialPeriodDaysForProduct } from '@/lib/stripe-checkout-trials';

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
    console.log(`\n========================================`);
    console.log(`[STRIPE] Fetching ${productType} subscription prices`);
    console.log(`[STRIPE] Product ID: ${productId}`);
    console.log(`[STRIPE] Timestamp: ${new Date().toISOString()}`);
    console.log(`========================================\n`);

    const prices = await stripe.prices.list({
      active: true,
      product: productId,
      limit: 100,
      expand: ['data.product'],
    });

    console.log(`[STRIPE] Total prices fetched: ${prices.data.length}`);

    // Filter to ensure we only return active prices on the right product
    const filteredPrices: StripeProduct[] = prices.data.filter((price) => {
      const product = price.product as Stripe.Product;

      const isSubscriptionProduct =
        product?.id === productId ||
        (typeof price.product === 'string' && price.product === productId);

      return isSubscriptionProduct && !!product && product.active && price.active;
    }) as StripeProduct[];

    console.log(`[STRIPE] Filtered active prices: ${filteredPrices.length}\n`);

    // Print detailed information for each tier
    console.log(`========================================`);
    console.log(`[STRIPE] ${productType} SUBSCRIPTION TIER DETAILS`);
    console.log(`========================================`);
    
    filteredPrices.forEach((price, index) => {
      const product = price.product as Stripe.Product;
      const amount = price.unit_amount ? (price.unit_amount / 100).toFixed(2) : 'N/A';
      const currency = price.currency?.toUpperCase() || 'N/A';
      const interval = price.recurring?.interval || 'one-time';
      const intervalCount = price.recurring?.interval_count || 1;
      const tier = price.metadata?.tier || price.metadata?.price_tier || price.nickname || 'unknown';
      
      console.log(`\n--- Tier ${index + 1} ---`);
      console.log(`  Price ID: ${price.id}`);
      console.log(`  Tier Name: ${tier}`);
      console.log(`  Amount: ${currency} ${amount}`);
      console.log(`  Interval: ${intervalCount} ${interval}(s)`);
      console.log(`  Nickname: ${price.nickname || 'N/A'}`);
      console.log(`  Active: ${price.active ? 'Yes' : 'No'}`);
      console.log(`  Livemode: ${price.livemode ? 'Yes' : 'No'}`);
      console.log(`  Product ID: ${product?.id || 'N/A'}`);
      console.log(`  Product Name: ${product?.name || 'N/A'}`);
      console.log(`  Metadata:`, JSON.stringify(price.metadata || {}, null, 2));
      if (price.recurring) {
        console.log(`  Recurring Details:`, {
          interval: price.recurring.interval,
          interval_count: price.recurring.interval_count,
          usage_type: price.recurring.usage_type,
        });
      }
    });

    console.log(`\n========================================`);
    console.log(`[STRIPE] End of ${productType} tier details`);
    console.log(`========================================\n`);

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

  const trialPeriodDays = getSubscriptionTrialPeriodDaysForProduct(product.id);

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { userId, tier },
  };
  if (trialPeriodDays != null && trialPeriodDays > 0) {
    subscriptionData.trial_period_days = trialPeriodDays;
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
      ...(trialPeriodDays != null && trialPeriodDays > 0
        ? { trialPeriodDays: String(trialPeriodDays) }
        : {}),
    },
    subscription_data: subscriptionData,
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

    const { data: subs } = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 30,
    });

    const picked =
      subs.length > 0 ? pickCanonicalStripeSubscription(subs) : null;

    const subscription = picked
      ? await stripe.subscriptions.retrieve(picked.id, {
          expand: ['items.data.price.product'],
        })
      : null;

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

  return resumeStripeSubscriptionForUser(user.id);
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
  stateLogs?: StateLog[]; // Individual state logs for detailed export
  watchDates?: string[]; // Dates when user was on watch (as array for serialization)
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
    registrationDate: userProfileData.registration_date || userProfileData.created_at || new Date().toISOString(),
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

  let stateLogs: StateLog[] = (logsData || []).map(log => ({
    id: log.id,
    userId: log.user_id,
    vesselId: log.vessel_id,
    state: log.state,
    date: log.date || log.log_date, // Handle both column names
    isPartOfActivePassage: log.is_part_of_active_passage || false,
    notes: log.notes || undefined,
    createdAt: log.created_at,
    updatedAt: log.updated_at,
  }));

  // Fetch leave periods and exclude those dates from state logs
  let leavePeriodsQuery = supabaseAdmin
    .from('crew_leave_periods')
    .select('start_date, end_date')
    .eq('crew_user_id', userId);

  if (filterType === 'vessel' && vesselId) {
    leavePeriodsQuery = leavePeriodsQuery.eq('vessel_id', vesselId);
  }

  const { data: leavePeriodsData, error: leavePeriodsError } = await leavePeriodsQuery;

  if (!leavePeriodsError && leavePeriodsData && leavePeriodsData.length > 0) {
    // Create a set of dates that are within leave periods
    const leaveDates = new Set<string>();
    
    leavePeriodsData.forEach(period => {
      const startDate = period.start_date; // Already in YYYY-MM-DD format
      const endDate = period.end_date; // Already in YYYY-MM-DD format
      
      // Generate all dates in the leave period range
      const start = new Date(startDate);
      const end = new Date(endDate);
      let currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        leaveDates.add(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });

    // Filter out state logs that fall within leave periods
    stateLogs = stateLogs.filter(log => !leaveDates.has(log.date));
  }

  // Fetch watch logs for officers (to include watch dates in export)
  const watchDates = new Set<string>();
  const position = (userProfile.position || '').toLowerCase();
  const isOfficer = position.includes('officer') || position.includes('captain') || position.includes('engineer') || position.includes('mate');
  
  if (isOfficer) {
    let watchQuery = supabaseAdmin
      .from('watch_logs')
      .select('watch_start')
      .eq('user_id', userId);
    
    if (filterType === 'vessel' && vesselId) {
      watchQuery = watchQuery.eq('vessel_id', vesselId);
    } else if (filterType === 'date_range' && dateRange) {
      const startDateStr = dateRange.from.toISOString().split('T')[0];
      const endDateStr = dateRange.to.toISOString().split('T')[0];
      watchQuery = watchQuery.gte('watch_start', `${startDateStr}T00:00:00`)
                             .lte('watch_start', `${endDateStr}T23:59:59`);
    }
    
    const { data: watchLogs } = await watchQuery;
    
    if (watchLogs) {
      watchLogs.forEach(log => {
        const dateStr = format(new Date(log.watch_start), 'yyyy-MM-dd');
        watchDates.add(dateStr);
      });
    }
  }

  // For date_range exports: include every date in the range (cap at today), with placeholder when no state logged
  let stateLogsForExport: StateLog[] = stateLogs;
  if (filterType === 'date_range' && dateRange) {
    const today = startOfDay(new Date());
    const rangeEnd = dateRange.to > today ? today : dateRange.to;
    const allDates = eachDayOfInterval({
      start: startOfDay(dateRange.from),
      end: startOfDay(rangeEnd),
    });
    const logsByDate = new Map<string, StateLog[]>();
    stateLogs.forEach(log => {
      if (!logsByDate.has(log.date)) logsByDate.set(log.date, []);
      logsByDate.get(log.date)!.push(log);
    });
    const filled: StateLog[] = [];
    for (const day of allDates) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const existing = logsByDate.get(dateStr);
      if (existing && existing.length > 0) {
        filled.push(...existing);
      } else {
        filled.push({
          id: `fill-${dateStr}`,
          userId,
          vesselId: '',
          state: '' as StateLog['state'],
          date: dateStr,
          isPartOfActivePassage: false,
          notes: undefined,
          createdAt: '',
          updatedAt: '',
        });
      }
    }
    stateLogsForExport = filled;
  }

  if (stateLogs.length === 0) {
    return {
      userProfile,
      serviceRecords: [],
      vesselDetails: undefined,
      totalDays: 0,
      totalSeaDays: 0,
      totalStandbyDays: 0,
      stateLogs: stateLogsForExport,
      watchDates: Array.from(watchDates),
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
      // Extract part of active passage dates from logs
      const partOfActivePassageDates = new Set<string>();
      period.logs.forEach(log => {
        if (log.isPartOfActivePassage) {
          partOfActivePassageDates.add(log.date);
        }
      });
      
      const vesselType = vessel?.type ?? null;
      const category = getVesselCalculationCategory(vesselType);
      const useCommercialRules = isAllDaysExceptLeaveCountAsSea(category);

      const yardDays = period.logs.filter(log => log.state === 'in-yard').length;
      const leaveDays = period.logs.filter(log => log.state === 'on-leave').length;
      const totalDays = period.logs.length;

      let atSeaDays: number;
      let standbyDays: number;
      let yardDaysForRecord: number;

      if (useCommercialRules) {
        atSeaDays = totalDays - leaveDays;
        standbyDays = 0;
        yardDaysForRecord = 0;
      } else {
        const { totalStandbyDays, totalSeaDays } = calculateStandbyDays(
          period.logs,
          undefined,
          partOfActivePassageDates,
          {
            rangeStart: period.startDate,
            rangeEnd: period.endDate,
            vesselManagerSeaTime: userProfile.role === 'vessel',
          }
        );
        atSeaDays = totalSeaDays;
        standbyDays = totalStandbyDays;
        yardDaysForRecord = yardDays;
      }

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
        standby_days: standbyDays,
        yard_days: yardDaysForRecord,
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
    stateLogs: stateLogsForExport, // All dates in range when date_range filter; placeholders for days with no state
    watchDates: Array.from(watchDates), // Convert Set to Array for serialization
  };
}
