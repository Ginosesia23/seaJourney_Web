import { NextResponse } from 'next/server';

import { hasVesselPremiumPlusFeatures } from '@/supabase/database/subscription-helpers';

export const FORM_BUILDER_TIER_MESSAGE =
  'Form Builder requires Vessel Premium, Professional, or Fleet';

export type FormBuilderProfile = {
  role?: string | null;
  subscription_tier?: string | null;
  subscriptionTier?: string | null;
  subscription_status?: string | null;
  subscriptionStatus?: string | null;
  cancel_at_period_end?: boolean | null;
  cancelAtPeriodEnd?: boolean | null;
  current_period_end?: string | null;
  currentPeriodEnd?: string | null;
} | null;

/** Returns a NextResponse when access is denied, or null when allowed. */
export function formBuilderAccessDenied(profile: FormBuilderProfile): NextResponse | null {
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = (profile.role || '').toLowerCase();
  if (role === 'admin') return null;

  if (role === 'vessel' && !hasVesselPremiumPlusFeatures(profile)) {
    return NextResponse.json({ error: FORM_BUILDER_TIER_MESSAGE }, { status: 402 });
  }

  return null;
}

/** Client-side mirror of the API gate for vessel managers. */
export function canUseVesselFormBuilder(profile: unknown): boolean {
  if (!profile) return false;
  return hasVesselPremiumPlusFeatures(profile);
}
