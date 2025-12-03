/**
 * Helper functions for checking subscription status
 * Handles the fact that useDoc returns raw database fields (snake_case)
 */

export function getSubscriptionStatus(userProfile: any): string | null {
  if (!userProfile) return null;
  
  // useDoc returns raw database fields, so check subscription_status first (snake_case)
  // Also check camelCase in case data is transformed somewhere
  return (userProfile as any).subscription_status || (userProfile as any).subscriptionStatus || null;
}

export function hasActiveSubscription(userProfile: any): boolean {
  const status = getSubscriptionStatus(userProfile);
  return status === 'active';
}

