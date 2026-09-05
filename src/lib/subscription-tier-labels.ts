import {
  MANUAL_CREW_TIERS,
  MANUAL_VESSEL_TIERS,
} from '@/lib/admin/manual-subscription';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  crew_limited: 'Crew Limited',
  vessel_linked: 'Vessel Linked',
  standard: 'Standard',
  premium: 'Premium',
  professional: 'Professional',
  pro: 'Professional',
  vessel_lite: 'Vessel Standard',
  vessel_basic: 'Vessel Premium',
  vessel_pro: 'Vessel Professional',
  vessel_fleet: 'Vessel Fleet',
};

for (const item of MANUAL_CREW_TIERS) {
  TIER_LABELS[item.value] = item.label;
}
for (const item of MANUAL_VESSEL_TIERS) {
  TIER_LABELS[item.value] = item.label;
}

/** Human-readable plan name for a subscription tier slug. */
export function formatSubscriptionTierLabel(
  tier: string | null | undefined,
): string {
  if (!tier || tier === 'free') return 'Free';
  const normalized = tier
    .toLowerCase()
    .replace(/^(sj_|sea_journey_)/, '')
    .trim();
  if (TIER_LABELS[normalized]) return TIER_LABELS[normalized];
  return normalized
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Slug used for comparing profile tier vs Stripe live tier. */
export function normalizeSubscriptionTierSlug(
  tier: string | null | undefined,
): string {
  if (!tier) return 'free';
  return tier
    .toLowerCase()
    .replace(/^(sj_|sea_journey_)/, '')
    .replace(/[\s-]+/g, '_')
    .trim();
}

/**
 * Whether Stripe → Supabase sync should run for this user.
 * Demo/testing and manual comp accounts keep admin-set tiers.
 */
export function shouldSyncSubscriptionFromStripe(user: {
  is_testing?: boolean | null;
  isTesting?: boolean | null;
  stripe_subscription_id?: string | null;
  stripeSubscriptionId?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.is_testing === true || user.isTesting === true) return false;
  const subId = (
    user.stripe_subscription_id ||
    user.stripeSubscriptionId ||
    ''
  )
    .toString()
    .trim();
  return subId.length > 0;
}

/**
 * Tier slug to show in UI — prefer the profile/DB tier unless Stripe is the
 * source of truth for this account.
 */
export function resolveDisplayedSubscriptionTier(args: {
  profileTier: string | null | undefined;
  stripeTierLive?: string | null;
  userProfile?: {
    is_testing?: boolean | null;
    isTesting?: boolean | null;
    stripe_subscription_id?: string | null;
    stripeSubscriptionId?: string | null;
  } | null;
}): string {
  const profile = normalizeSubscriptionTierSlug(args.profileTier);
  const stripe = args.stripeTierLive
    ? normalizeSubscriptionTierSlug(args.stripeTierLive)
    : null;

  if (!shouldSyncSubscriptionFromStripe(args.userProfile ?? null)) {
    return profile;
  }

  return stripe ?? profile;
}
