
'use server';

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
    // For this prototype, we are granting a promotional subscription.
    // The entitlement identifier is passed directly from the client.
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

    // The response contains subscriber data, let's check if the entitlement is active
    const subscriber = data.subscriber;
    const activeEntitlement = subscriber.entitlements[entitlementId];

    if (activeEntitlement && new Date(activeEntitlement.expires_date) > new Date()) {
       return { success: true, customerInfo: subscriber };
    } else {
       throw new Error(`Entitlement '${entitlementId}' not found or expired after grant.`);
    }

  } catch (error: any) {
    console.error('Server-side promotional grant failed:', error);
    return { success: false, error: error.message };
  }
}
