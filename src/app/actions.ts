'use server';

import { createSupabaseServerClient } from '@/supabase/server';
import type { SeaServiceRecord, UserProfile, Vessel, StateLog, PassageLog } from '@/lib/types';
import { isWithinInterval, startOfDay, endOfDay, parse, differenceInDays, format, eachDayOfInterval } from 'date-fns';
import { stripe } from '@/lib/stripe';
import { pickCanonicalStripeSubscription } from '@/lib/stripe-subscription-helpers';
import { resumeStripeSubscriptionForUser } from '@/lib/resume-stripe-subscription-for-user';
import type { Stripe } from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { getVesselCalculationCategory, isAllDaysExceptLeaveCountAsSea } from '@/lib/vessel-calculation-categories';
import { getSubscriptionTrialPeriodDaysForProduct } from '@/lib/stripe-checkout-trials';
import {
  buildTierPricingMapFromStripePrices,
  FALLBACK_TIER_PRICING_GBP,
} from '@/lib/subscription-tier-pricing';

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

/**
 * Admin revenue helper: monthly GBP by subscription_tier from live Stripe prices
 * (crew + vessel products). Falls back to FALLBACK_TIER_PRICING_GBP on failure.
 */
export async function getSubscriptionTierPricingMap(): Promise<Record<string, number>> {
  try {
    const results = await Promise.allSettled([
      getStripeProducts(false),
      getStripeProducts(true),
    ]);

    const prices = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      console.error(
        `[STRIPE] Failed to fetch ${index === 0 ? 'crew' : 'vessel'} prices:`,
        result.reason,
      );
      return [];
    });

    if (prices.length === 0) {
      return { ...FALLBACK_TIER_PRICING_GBP };
    }

    return buildTierPricingMapFromStripePrices(prices);
  } catch (error) {
    console.error('[STRIPE] Failed to build tier pricing map, using fallbacks:', error);
    return { ...FALLBACK_TIER_PRICING_GBP };
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
  /** Passage logbook rows included for Master Doc (and any future combined exports). */
  passageLogs?: PassageLog[];
  /** Inclusive export window (YYYY-MM-DD) when known. */
  exportPeriod?: { from: string; to: string };
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
    startDate: userProfileData.start_date || null,
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
    // Optional vessel scope (used by Master Doc: vessel + full date continuum)
    if (vesselId) {
      logsQuery = logsQuery.eq('vessel_id', vesselId);
    }
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
  } else if (vesselId) {
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
      .from('nav_watch_logs')
      .select('start_time')
      .eq('user_id', userId);
    
    if (filterType === 'vessel' && vesselId) {
      watchQuery = watchQuery.eq('vessel_id', vesselId);
    } else if (filterType === 'date_range' && dateRange) {
      const startDateStr = dateRange.from.toISOString().split('T')[0];
      const endDateStr = dateRange.to.toISOString().split('T')[0];
      watchQuery = watchQuery.gte('start_time', `${startDateStr}T00:00:00`)
                             .lte('start_time', `${endDateStr}T23:59:59`);
      if (vesselId) {
        watchQuery = watchQuery.eq('vessel_id', vesselId);
      }
    }
    
    const { data: watchLogs } = await watchQuery;
    
    if (watchLogs) {
      watchLogs.forEach(log => {
        const dateStr = format(new Date(log.start_time), 'yyyy-MM-dd');
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
          vesselId: vesselId || '',
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
    let vesselDetailsEmpty: Vessel | undefined;
    if (vesselId) {
      const { data: v } = await supabaseAdmin.from('vessels').select('*').eq('id', vesselId).maybeSingle();
      if (v) vesselDetailsEmpty = mapVesselRow(v);
    }
    const passageLogsEmpty = await fetchPassageLogsForExport({
      userId,
      role: userProfile.role,
      filterType: vesselId ? 'vessel' : filterType,
      vesselId,
      dateRange:
        filterType === 'date_range' && dateRange
          ? dateRange
          : undefined,
    });
    return {
      userProfile,
      serviceRecords: [],
      vesselDetails: vesselDetailsEmpty,
      totalDays: 0,
      totalSeaDays: 0,
      totalStandbyDays: 0,
      stateLogs: stateLogsForExport,
      watchDates: Array.from(watchDates),
      passageLogs: passageLogsEmpty,
      exportPeriod:
        filterType === 'date_range' && dateRange
          ? {
              from: format(startOfDay(dateRange.from), 'yyyy-MM-dd'),
              to: format(
                startOfDay(dateRange.to > new Date() ? new Date() : dateRange.to),
                'yyyy-MM-dd',
              ),
            }
          : undefined,
    };
  }

  // Fetch vessels to get vessel names - use admin client for server actions
  const vesselIds = [...new Set(stateLogs.map(log => log.vesselId).filter(Boolean))];
  const { data: vesselsData, error: vesselsError } = vesselIds.length
    ? await supabaseAdmin
        .from('vessels')
        .select('*')
        .in('id', vesselIds)
    : { data: [] as any[], error: null };

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

  // Get vessel details when a vessel is in scope
  let vesselDetails: Vessel | undefined;
  if (vesselId) {
    const vessel = vesselsMap.get(vesselId) || (await supabaseAdmin.from('vessels').select('*').eq('id', vesselId).maybeSingle()).data;
    if (vessel) {
      vesselDetails = mapVesselRow(vessel);
      if (!vesselsMap.has(vesselId)) vesselsMap.set(vesselId, vessel);
    }
  } else if (filterType === 'vessel' && vesselId) {
    const vessel = vesselsMap.get(vesselId);
    if (vessel) {
      vesselDetails = mapVesselRow(vessel);
    }
  }

  const passageLogs = await fetchPassageLogsForExport({
    userId,
    role: userProfile.role,
    filterType: vesselId ? 'vessel' : filterType,
    vesselId,
    dateRange: filterType === 'date_range' && dateRange ? dateRange : undefined,
  });

  let exportPeriod: { from: string; to: string } | undefined;
  if (filterType === 'date_range' && dateRange) {
    const today = startOfDay(new Date());
    const rangeEnd = dateRange.to > today ? today : dateRange.to;
    exportPeriod = {
      from: format(startOfDay(dateRange.from), 'yyyy-MM-dd'),
      to: format(startOfDay(rangeEnd), 'yyyy-MM-dd'),
    };
  } else if (stateLogsForExport.length > 0) {
    exportPeriod = exportPeriodFromLogs(stateLogsForExport);
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
    passageLogs,
    exportPeriod,
  };
}

function exportPeriodFromLogs(
  logs: StateLog[],
): { from: string; to: string } | undefined {
  if (!logs.length) return undefined;
  const dates = logs.map((l) => l.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

function mapVesselRow(vessel: Record<string, any>): Vessel {
  return {
    id: vessel.id,
    name: vessel.name || 'Unknown Vessel',
    type: vessel.type || '',
    officialNumber: vessel.official_number || vessel.imo || undefined,
    imo: vessel.imo || undefined,
    length_m: vessel.length_m ?? null,
    beam: vessel.beam ?? null,
    draft: vessel.draft ?? null,
    gross_tonnage: vessel.gross_tonnage ?? null,
    number_of_crew: vessel.number_of_crew ?? null,
    build_year: vessel.build_year ?? null,
    flag: vessel.flag ?? vessel.flag_state ?? null,
    call_sign: vessel.call_sign ?? null,
    mmsi: vessel.mmsi ?? null,
    description: vessel.description ?? null,
    management_company: vessel.management_company ?? null,
    company_address: vessel.company_address ?? null,
    company_contact: vessel.company_contact ?? null,
    aisTrackingEnabled: vessel.ais_tracking_enabled ?? false,
    aisLastSyncAt: vessel.ais_last_sync_at ?? null,
    aisLastNavStatus: vessel.ais_last_nav_status ?? null,
    aisLastSpeed: vessel.ais_last_speed ?? null,
    aisLastPositionAt: vessel.ais_last_position_at ?? null,
  };
}

function transformPassageRow(row: Record<string, any>): PassageLog {
  return {
    id: row.id,
    crew_id: row.crew_id,
    vessel_id: row.vessel_id,
    start_time: row.start_time,
    end_time: row.end_time,
    departure_port: row.departure_port,
    departure_country: row.departure_country,
    arrival_port: row.arrival_port,
    arrival_country: row.arrival_country,
    departure_lat: row.departure_lat,
    departure_lon: row.departure_lon,
    arrival_lat: row.arrival_lat,
    arrival_lon: row.arrival_lon,
    distance_nm: row.distance_nm,
    engine_hours: row.engine_hours,
    avg_speed_knots: row.avg_speed_knots,
    passage_type: row.passage_type,
    weather_summary: row.weather_summary,
    sea_state: row.sea_state,
    notes: row.notes,
    source: row.source,
    ais_fingerprint: row.ais_fingerprint ?? null,
    track_data: row.track_data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function fetchPassageLogsForExport(opts: {
  userId: string;
  role: string;
  filterType: 'vessel' | 'date_range';
  vesselId?: string;
  dateRange?: { from: Date; to: Date };
}): Promise<PassageLog[]> {
  const { userId, role, filterType, vesselId, dateRange } = opts;
  let query = supabaseAdmin.from('passage_logs').select('*');

  if (filterType === 'vessel' && vesselId) {
    query = query.eq('vessel_id', vesselId);
    // Crew: only their own passages on that vessel. Vessel accounts: all on vessel.
    if (String(role).toLowerCase() !== 'vessel' && String(role).toLowerCase() !== 'admin') {
      query = query.eq('crew_id', userId);
    }
  } else {
    query = query.eq('crew_id', userId);
  }

  if (dateRange) {
    const startIso = startOfDay(dateRange.from).toISOString();
    const endIso = endOfDay(
      dateRange.to > new Date() ? new Date() : dateRange.to,
    ).toISOString();
    // Overlap: passage starts before range end AND ends after range start
    query = query.lte('start_time', endIso).gte('end_time', startIso);
  }

  const { data, error } = await query.order('start_time', { ascending: true });
  if (error) {
    console.warn('[generateSeaTimeReportData] passage logs fetch failed', error);
    return [];
  }
  return (data || []).map(transformPassageRow);
}

/**
 * Master Doc: full vessel history from vessel/account start through today —
 * daily states, service periods, and passage logbook (with track points).
 */
export async function generateMasterDocReportData(
  userId: string,
  vesselId: string,
): Promise<SeaTimeReportData> {
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, role, start_date')
    .eq('id', userId)
    .maybeSingle();

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('id, created_at, vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  if (!vessel) {
    throw new Error('Vessel not found');
  }

  const role = String(profile?.role || '').toLowerCase();
  const isVesselAccount =
    role === 'vessel' || role === 'admin' || vessel.vessel_manager_id === userId;
  const candidates: string[] = [];

  if (profile?.start_date && isVesselAccount) {
    candidates.push(String(profile.start_date).slice(0, 10));
  }

  const { data: assignments } = await supabaseAdmin
    .from('vessel_assignments')
    .select('start_date')
    .eq('vessel_id', vesselId)
    .eq('user_id', userId)
    .order('start_date', { ascending: true })
    .limit(1);
  if (assignments?.[0]?.start_date) {
    candidates.push(String(assignments[0].start_date).slice(0, 10));
  }

  if (isVesselAccount) {
    const { data: anyAssign } = await supabaseAdmin
      .from('vessel_assignments')
      .select('start_date')
      .eq('vessel_id', vesselId)
      .order('start_date', { ascending: true })
      .limit(1);
    if (anyAssign?.[0]?.start_date) {
      candidates.push(String(anyAssign[0].start_date).slice(0, 10));
    }
  }

  let logsQuery = supabaseAdmin
    .from('daily_state_logs')
    .select('date')
    .eq('vessel_id', vesselId)
    .order('date', { ascending: true })
    .limit(1);
  if (!isVesselAccount) {
    logsQuery = logsQuery.eq('user_id', userId);
  }
  const { data: earliestLogs } = await logsQuery;
  if (earliestLogs?.[0]?.date) {
    candidates.push(String(earliestLogs[0].date).slice(0, 10));
  }

  if (vessel.created_at) {
    candidates.push(String(vessel.created_at).slice(0, 10));
  }

  const sorted = candidates
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const fromStr = sorted[0] || format(new Date(), 'yyyy-MM-dd');
  const to = startOfDay(new Date());
  const from = startOfDay(parse(fromStr, 'yyyy-MM-dd', new Date()));

  return generateSeaTimeReportData(userId, 'date_range', vesselId, { from, to });
}
