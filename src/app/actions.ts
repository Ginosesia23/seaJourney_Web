
'use server';

import { doc, setDoc, getDoc, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { getSdks } from '@/firebase'; // Assuming getSdks is available for server-side admin-like init
import { initializeApp, getApps, App } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import type { Purchases, CustomerInfo } from '@revenuecat/purchases-js';
import type { Trip, UserProfile, Vessel } from '@/lib/types';


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
  trips: (Trip & { vesselName: string })[];
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
  const userProfileRef = doc(db, 'users', userId, 'profile', userId);
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

  // 3. Fetch trips (past and current)
  const pastTripsRef = collection(db, `users/${userId}/trips`);
  const currentTripRef = collection(db, `users/${userId}/currentStatus`);
  
  const [pastTripsSnap, currentTripsSnap] = await Promise.all([
    getDocs(pastTripsRef),
    getDocs(currentTripRef)
  ]);

  let allTrips: Trip[] = [];
  pastTripsSnap.forEach(doc => allTrips.push({ id: doc.id, ...doc.data() } as Trip));
  currentTripsSnap.forEach(doc => allTrips.push({ id: doc.id, ...doc.data() } as Trip));

  // 4. Filter trips based on criteria
  let filteredTrips: Trip[] = [];
  if (filterType === 'vessel') {
    if (!vesselId) throw new Error('Vessel ID is required for vessel filter.');
    filteredTrips = allTrips.filter(trip => trip.vesselId === vesselId);
  } else if (filterType === 'date_range') {
    if (!dateRange || !dateRange.from || !dateRange.to) throw new Error('Date range is required.');
    
    const fromTimestamp = Timestamp.fromDate(dateRange.from);
    const toTimestamp = Timestamp.fromDate(dateRange.to);

    filteredTrips = allTrips.filter(trip => {
      const tripStart = trip.startDate;
      // If trip is current, endDate is now. Otherwise use stored endDate.
      const tripEnd = trip.endDate || Timestamp.now(); 
      // Check for overlap
      return tripStart <= toTimestamp && tripEnd >= fromTimestamp;
    });
  }

  // 5. Process and enrich trips
  let totalDays = 0;
  let totalSeaDays = 0;
  let totalStandbyDays = 0;

  const enrichedTrips = filteredTrips.map(trip => {
    Object.values(trip.dailyStates).forEach(state => {
      totalDays++;
      if (state === 'underway') totalSeaDays++;
      if (state === 'in-port' || state === 'at-anchor') totalStandbyDays++;
    });

    return {
      ...trip,
      vesselName: vesselsMap.get(trip.vesselId)?.name || 'Unknown Vessel',
    };
  });

  return {
    userProfile,
    trips: enrichedTrips,
    vesselDetails: vesselId ? vesselsMap.get(vesselId) : undefined,
    totalDays,
    totalSeaDays,
    totalStandbyDays,
  };
}
