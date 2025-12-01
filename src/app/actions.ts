
'use server';

import { createSupabaseServerClient } from '@/supabase/server';
import type { SeaServiceRecord, UserProfile, Vessel, StateLog } from '@/lib/types';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { stripe } from '@/lib/stripe';
import type { Stripe } from 'stripe';

export interface StripeProduct extends Stripe.Product {
  default_price: Stripe.Price;
  features: { name: string }[];
}

export async function getStripeProducts(): Promise<StripeProduct[]> {
    const prices = await stripe.prices.list({
      active: true,
      limit: 10,
      expand: ['data.product'],
    });
  
    const products = prices.data.map(price => {
      const product = price.product as Stripe.Product;
      return {
        ...product,
        default_price: price,
      };
    }).filter(p => p.active);
  
    // Filter out products that might not have a default price or are inactive
    return products as StripeProduct[];
}

export async function createCheckoutSession(
  priceId: string,
  userId: string,
  userEmail: string,
): Promise<{ sessionId: string; url: string | null }> {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

  if (!origin) {
    throw new Error('App URL is not set in environment variables or as a fallback.');
  }

  // Fetch the price and product to get tier information
  const price = await stripe.prices.retrieve(priceId, {
    expand: ['product'],
  });

  const product = price.product as Stripe.Product;
  
  // Extract tier from product name or metadata
  // You can customize this logic based on how you name your products in Stripe
  // For example: "SeaJourney Premium" -> "premium", "SeaJourney Pro" -> "pro"
  let tier = 'premium'; // default
  if (product.metadata?.tier) {
    tier = product.metadata.tier;
  } else if (product.name) {
    // Extract tier from product name (e.g., "Premium" from "SeaJourney Premium")
    const nameLower = product.name.toLowerCase();
    if (nameLower.includes('premium')) {
      tier = 'premium';
    } else if (nameLower.includes('pro')) {
      tier = 'pro';
    } else if (nameLower.includes('basic')) {
      tier = 'basic';
    } else {
      // Use a sanitized version of the product name as tier
      tier = product.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
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
      tier, // Store the tier in metadata for verification
      productId: product.id,
      productName: product.name,
    },
  });

  console.log(`[SERVER] Created checkout session for user ${userId} with tier: ${tier}`);

  return {
    sessionId: session.id,
    url: session.url,
  };
}


export type SeaTimeReportData = {
  userProfile: UserProfile;
  serviceRecords: (SeaServiceRecord & { vesselName: string, totalDays: number })[];
  vesselDetails?: Vessel;
  totalDays: number;
  totalSeaDays: number;
  totalStandbyDays: number;
};

export async function generateSeaTimeReportData(
  userId: string,
  filterType: 'vessel' | 'date_range',
  vesselId?: string,
  dateRange?: { from: Date; to: Date }
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
    activeSeaServiceId: userProfileData.active_sea_service_id,
  };

  // 2. Fetch all user's vessels to map names
  const { data: vesselsData, error: vesselsError } = await supabase
    .from('vessels')
    .select('*')
    .eq('owner_id', userId);

  if (vesselsError) {
    throw new Error('Failed to fetch vessels.');
  }

  const vesselsMap = new Map<string, Vessel>();
  (vesselsData || []).forEach(vessel => {
    vesselsMap.set(vessel.id, {
      id: vessel.id,
      name: vessel.name,
      type: vessel.type,
      officialNumber: vessel.official_number,
      ownerId: vessel.owner_id,
    });
  });

  // 3. Fetch all SeaServiceRecords and StateLogs
  let allServiceRecords: SeaServiceRecord[] = [];
  const allStateLogs = new Map<string, StateLog[]>(); // vesselId -> logs

  for (const vessel of vesselsData || []) {
    const { data: serviceData } = await supabase
      .from('sea_service_records')
      .select('*')
      .eq('vessel_id', vessel.id);

    const { data: logsData } = await supabase
      .from('state_logs')
      .select('*')
      .eq('vessel_id', vessel.id);

    (serviceData || []).forEach(service => {
      allServiceRecords.push({
        id: service.id,
        vesselId: service.vessel_id,
        position: service.position,
        startDate: service.start_date,
        endDate: service.end_date || undefined,
        isCurrent: service.is_current,
        notes: service.notes,
      });
    });

    const logs = (logsData || []).map(log => ({
      id: log.date,
      date: log.date,
      state: log.state,
    }));
    allStateLogs.set(vessel.id, logs);
  }

  // 4. Filter service records based on criteria
  let filteredServiceRecords: SeaServiceRecord[] = [];
  if (filterType === 'vessel') {
    if (!vesselId) throw new Error('Vessel ID is required for vessel filter.');
    filteredServiceRecords = allServiceRecords.filter(service => service.vesselId === vesselId);
  } else if (filterType === 'date_range') {
    if (!dateRange || !dateRange.from || !dateRange.to) throw new Error('Date range is required.');
    
    const fromDate = startOfDay(new Date(dateRange.from));
    const toDate = endOfDay(new Date(dateRange.to));

    filteredServiceRecords = allServiceRecords.filter(service => {
      const tripStart = new Date(service.startDate);
      const tripEnd = service.endDate ? new Date(service.endDate) : new Date();
      // Check for overlap: trip starts before range ends AND trip ends after range starts
      return tripStart <= toDate && tripEnd >= fromDate;
    });
  } else {
    // If no filter, use all service records.
    filteredServiceRecords = allServiceRecords;
  }

  // 5. Process and enrich records
  let totalDays = 0;
  let totalSeaDays = 0;
  let totalStandbyDays = 0;
  
  const dateRangeInterval = dateRange?.from && dateRange.to ? { start: startOfDay(new Date(dateRange.from)), end: endOfDay(new Date(dateRange.to)) } : null;

  const enrichedServiceRecords = filteredServiceRecords.map(service => {
    const logs = allStateLogs.get(service.vesselId) || [];
    let serviceTotalDays = 0;

    logs.forEach(log => {
      const dayDate = new Date(log.date);
      const serviceStartDate = new Date(service.startDate);
      const serviceEndDate = service.endDate ? new Date(service.endDate) : new Date();

      // Check if the log date is within the service period
      if (!isWithinInterval(dayDate, { start: startOfDay(serviceStartDate), end: endOfDay(serviceEndDate) })) {
        return;
      }

      // If filtering by date range, also check if it's within that range
      if (dateRangeInterval && !isWithinInterval(dayDate, dateRangeInterval)) {
          return;
      }
      
      const state = log.state;
      totalDays++;
      serviceTotalDays++;
      if (state === 'underway') totalSeaDays++;
      if (state === 'in-port' || state === 'at-anchor') totalStandbyDays++;
    });
    
    return {
      ...service,
      vesselName: vesselsMap.get(service.vesselId)?.name || 'Unknown Vessel',
      totalDays: serviceTotalDays,
    };
  });
  
  // For date range reports, we might not have a single vessel detail
  const finalVesselDetails = filterType === 'vessel' && vesselId ? vesselsMap.get(vesselId) : undefined;


  return {
    userProfile,
    serviceRecords: enrichedServiceRecords.filter(s => s.totalDays > 0), // Only include services with days in the range
    vesselDetails: finalVesselDetails,
    totalDays,
    totalSeaDays,
    totalStandbyDays,
  };
}
