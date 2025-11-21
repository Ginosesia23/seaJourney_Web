'use server';

import { Purchases } from '@revenuecat/purchases-js';

// This function will run on the server
export async function purchaseSubscriptionPackage(
  packageIdentifier: string,
  appUserId: string
) {
  if (!process.env.REVENUECAT_SECRET_API_KEY) {
    throw new Error('RevenueCat secret API key is not set in your .env file.');
  }

  if (!appUserId) {
    throw new Error('User is not authenticated.');
  }

  // Initialize RevenueCat SDK on the server with the secret key
  const purchases = new Purchases(process.env.REVENUECAT_SECRET_API_KEY!);

  try {
    // This is a placeholder for server-side purchase logic.
    // In a real scenario, you'd integrate with a payment gateway here
    // and then grant entitlement via RevenueCat's API.
    // For the purpose of this prototype, we'll simulate granting entitlement.
    
    const parts = packageIdentifier.split('_');
    const entitlementId = parts[0]; // e.g., 'standard', 'premium', 'vessel'

    await purchases.grantEntitlement(appUserId, entitlementId);

    // After granting, we fetch the updated customer info to confirm.
    const customerInfo = await purchases.getCustomerInfo(appUserId);

    // Check if the entitlement is now active.
    if (customerInfo.entitlements.active[entitlementId]) {
      return { success: true, customerInfo };
    } else {
      throw new Error(`Failed to grant entitlement: ${entitlementId}`);
    }

  } catch (error: any) {
    console.error('Server-side purchase failed:', error);
    return { success: false, error: error.message };
  }
}
