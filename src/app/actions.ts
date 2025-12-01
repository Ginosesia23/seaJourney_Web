
'use server';

import { adminDb } from '@/firebase/admin';
import type { SeaServiceRecord, UserProfile, Vessel, StateLog } from '@/lib/types';
import { isWithinInterval, fromUnixTime, startOfDay, endOfDay } from 'date-fns';
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

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    customer_email: userEmail,
    client_reference_id: userId,
    success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/offers`,
    metadata: {
      userId,
      priceId,
    },
  });

  console.log("Users id: " + userId);

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
  
  const db = adminDb;

  // 1. Fetch user profile
  const userProfileRef = db.doc(`users/${userId}`);
  const userProfileSnap = await userProfileRef.get();
  if (!userProfileSnap.exists) {
    throw new Error('User profile not found.');
  }
  const userProfile = userProfileSnap.data() as UserProfile;

  // 2. Fetch all user's vessels to map names
  const vesselsRef = db.collection(`users/${userId}/vessels`);
  const vesselsSnap = await vesselsRef.get();
  const vesselsMap = new Map<string, Vessel>();
  vesselsSnap.forEach(doc => vesselsMap.set(doc.id, { id: doc.id, ...doc.data() } as Vessel));

  // 3. Fetch all SeaServiceRecords and StateLogs
  let allServiceRecords: SeaServiceRecord[] = [];
  const allStateLogs = new Map<string, StateLog[]>(); // vesselId -> logs

  for (const vessel of vesselsSnap.docs) {
    const serviceRef = db.collection(`users/${userId}/vessels/${vessel.id}/seaService`);
    const logsRef = db.collection(`users/${userId}/vessels/${vessel.id}/stateLogs`);

    const [serviceSnap, logsSnap] = await Promise.all([serviceRef.get(), logsRef.get()]);
    
    serviceSnap.forEach(doc => allServiceRecords.push({ id: doc.id, ...doc.data() } as SeaServiceRecord));
    const logs = logsSnap.docs.map(doc => doc.data() as StateLog);
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
      const tripStart = (service.startDate as any).toDate();
      const tripEnd = service.endDate ? (service.endDate as any).toDate() : new Date();
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
      const serviceStartDate = (service.startDate as any).toDate();
      const serviceEndDate = service.endDate ? (service.endDate as any).toDate() : new Date();

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
