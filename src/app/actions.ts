
'use server';

import { doc, setDoc, getDoc, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { getSdks } from '@/firebase'; // Assuming getSdks is available for server-side admin-like init
import { initializeApp, getApps, App } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import type { Purchases, CustomerInfo } from '@revenuecat/purchases-js';
import type { SeaServiceRecord, UserProfile, Vessel, StateLog } from '@/lib/types';
import { isWithinInterval, fromUnixTime, startOfDay, endOfDay } from 'date-fns';


// This function will run on the server
export async function purchaseSubscriptionPackage(
  entitlementId: string, // This is the entitlement identifier, e.g., "sj_starter"
  appUserId: string
): Promise<{ success: boolean; customerInfo?: CustomerInfo, error?: string, entitlementId?: string }> {
  const secretApiKey = process.env.REVENUECAT_SECRET_API_KEY;

  if (!secretApiKey) {
    throw new Error('RevenueCat secret API key is not set in your .env file.');
  }

  if (!appUserId) {
    throw new Error('User is not authenticated.');
  }

  try {
    // Grant the promotional entitlement via RevenueCat API
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${appUserId}/entitlements/${entitlementId}/promotional`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secretApiKey}`,
        },
        body: JSON.stringify({
          duration: 'monthly', // Grant a monthly promotional subscription
        }),
      }
    );
    
    if (!response.ok) {
        const errorBody = await response.json();
        console.error('RevenueCat API Error:', errorBody);
        throw new Error(`Failed to grant entitlement. Status: ${response.status} - ${errorBody.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const subscriber = data.subscriber as CustomerInfo;
    const activeEntitlement = subscriber.entitlements.active[entitlementId];

    if (activeEntitlement) {
       return { success: true, customerInfo: subscriber, entitlementId };
    } else {
       throw new Error(`Entitlement '${entitlementId}' not found or expired after grant.`);
    }

  } catch (error: any) {
    console.error('Server-side promotional grant failed:', error);
    return { success: false, error: error.message };
  }
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
  let app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  const db = getFirestore(app);

  // 1. Fetch user profile
  const userProfileRef = doc(db, 'users', userId);
  const userProfileSnap = await getDoc(userProfileRef);
  if (!userProfileSnap.exists()) {
    throw new Error('User profile not found.');
  }
  const userProfile = userProfileSnap.data() as UserProfile;

  // 2. Fetch all user's vessels to map names
  const vesselsRef = collection(db, `users/${userId}/vessels`);
  const vesselsSnap = await getDocs(vesselsRef);
  const vesselsMap = new Map<string, Vessel>();
  vesselsSnap.forEach(doc => vesselsMap.set(doc.id, { id: doc.id, ...doc.data() } as Vessel));

  // 3. Fetch all SeaServiceRecords and StateLogs
  let allServiceRecords: SeaServiceRecord[] = [];
  const allStateLogs = new Map<string, StateLog[]>(); // vesselId -> logs

  for (const vessel of vesselsSnap.docs) {
    const serviceRef = collection(db, `users/${userId}/vessels/${vessel.id}/seaService`);
    const logsRef = collection(db, `users/${userId}/vessels/${vessel.id}/stateLogs`);

    const [serviceSnap, logsSnap] = await Promise.all([getDocs(serviceRef), getDocs(logsRef)]);
    
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
      const tripStart = fromUnixTime(service.startDate.seconds);
      const tripEnd = service.endDate ? fromUnixTime(service.endDate.seconds) : new Date();
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
      const serviceStartDate = fromUnixTime(service.startDate.seconds);
      const serviceEndDate = service.endDate ? fromUnixTime(service.endDate.seconds) : new Date();

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
