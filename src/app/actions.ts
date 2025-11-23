
'use server';

import { doc, setDoc } from 'firebase/firestore';
import { getSdks } from '@/firebase'; // Assuming getSdks is available for server-side admin-like init
import { initializeApp, getApps, App } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

// This function will run on the server
export async function purchaseSubscriptionPackage(
  entitlementId: string, // This is the entitlement identifier, e.g., "sj_starter"
  appUserId: string
) {
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
    const subscriber = data.subscriber;
    const activeEntitlement = subscriber.entitlements[entitlementId];

    if (activeEntitlement && new Date(activeEntitlement.expires_date) > new Date()) {
       // --- START: Update Firestore ---
       // This part requires a server-side way to interact with Firestore.
       // We'll use a simple admin-like initialization here.
       // NOTE: For a real production app, you'd use the Firebase Admin SDK.
       // For this prototype, we re-initialize a firestore instance on the server.
       let app: App;
       if (!getApps().length) {
         app = initializeApp(firebaseConfig, 'server-action-app');
       } else {
         app = getApps()[0];
       }
       const firestore = getFirestore(app);

       const userProfileRef = doc(firestore, 'users', appUserId, 'profile', appUserId);
       await setDoc(userProfileRef, {
           subscriptionTier: entitlementId, // e.g., 'sj_starter'
           subscriptionStatus: 'active',
       }, { merge: true });
       // --- END: Update Firestore ---

       return { success: true, customerInfo: subscriber };
    } else {
       throw new Error(`Entitlement '${entitlementId}' not found or expired after grant.`);
    }

  } catch (error: any) {
    console.error('Server-side promotional grant failed:', error);
    return { success: false, error: error.message };
  }
}
