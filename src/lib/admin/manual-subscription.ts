import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const MANUAL_CREW_TIERS = [
  { value: 'free', label: 'Free' },
  { value: 'crew_limited', label: 'Crew limited' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
  { value: 'professional', label: 'Professional' },
] as const;

export const MANUAL_VESSEL_TIERS = [
  { value: 'free', label: 'Free' },
  { value: 'vessel_lite', label: 'Vessel Standard' },
  { value: 'vessel_basic', label: 'Vessel Premium' },
  { value: 'vessel_pro', label: 'Vessel Professional' },
  { value: 'vessel_fleet', label: 'Vessel Fleet' },
] as const;

export const MANUAL_ROLES = [
  { value: 'crew', label: 'Crew' },
  { value: 'captain', label: 'Captain' },
  { value: 'vessel', label: 'Vessel manager' },
] as const;

export const MANUAL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'past-due', label: 'Past due' },
] as const;

const CREW_TIER_VALUES = new Set(MANUAL_CREW_TIERS.map((t) => t.value));
const VESSEL_TIER_VALUES = new Set(MANUAL_VESSEL_TIERS.map((t) => t.value));
const ACCOUNT_ROLES = new Set(MANUAL_ROLES.map((r) => r.value));
const STATUSES = new Set(['active', 'inactive', 'past_due']);

export function normalizeAdminRole(role: string | null | undefined): string {
  const r = (role || 'crew').toLowerCase();
  if (r === 'crew' || r === 'captain' || r === 'vessel') return r;
  return 'crew';
}

export function normalizeAdminStatus(status: string | null | undefined): string {
  const s = (status || 'inactive').toLowerCase().replace(/_/g, '-');
  return MANUAL_STATUSES.some((item) => item.value === s) ? s : 'inactive';
}

export function defaultTierForAdminRole(role: string, currentTier: string): string {
  const tier = currentTier.toLowerCase();
  const options = role === 'vessel' ? MANUAL_VESSEL_TIERS : MANUAL_CREW_TIERS;
  if (options.some((item) => item.value === tier)) return tier;
  return role === 'vessel' ? 'vessel_lite' : 'free';
}

export type ManualSubscriptionInput = {
  role?: string;
  subscriptionTier: string;
  subscriptionStatus: string;
};

export type ManualSubscriptionResult =
  | {
      ok: true;
      user: Record<string, unknown>;
      roleChanged: boolean;
      warning: string | null;
    }
  | { ok: false; status: number; error: string };

export async function applyManualSubscriptionUpdate(
  userId: string,
  input: ManualSubscriptionInput,
): Promise<ManualSubscriptionResult> {
  const { data: target, error: targetError } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, stripe_subscription_id, email, active_vessel_id, managed_by_vessel_id, is_testing',
    )
    .eq('id', userId)
    .maybeSingle();

  if (targetError || !target) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  const currentRole = (target.role || '').toLowerCase();
  if (currentRole === 'admin') {
    return { ok: false, status: 403, error: 'Cannot update admin accounts here' };
  }

  if (currentRole !== 'crew' && currentRole !== 'captain' && currentRole !== 'vessel') {
    return {
      ok: false,
      status: 403,
      error: 'Only crew, captain, or vessel accounts can be updated here',
    };
  }

  let nextRole = currentRole;
  if (typeof input.role === 'string' && input.role.trim()) {
    nextRole = input.role.toLowerCase().trim();
  }
  if (!ACCOUNT_ROLES.has(nextRole)) {
    return { ok: false, status: 400, error: 'role must be crew, captain, or vessel' };
  }

  const tier = input.subscriptionTier.toLowerCase().trim();
  let status = input.subscriptionStatus.toLowerCase().trim();
  if (status === 'past-due') status = 'past_due';

  const allowedTiers = nextRole === 'vessel' ? VESSEL_TIER_VALUES : CREW_TIER_VALUES;
  if (!tier || !allowedTiers.has(tier)) {
    return {
      ok: false,
      status: 400,
      error:
        nextRole === 'vessel'
          ? 'Invalid subscriptionTier for vessel account'
          : 'Invalid subscriptionTier for crew account',
    };
  }
  if (!status || !STATUSES.has(status)) {
    return {
      ok: false,
      status: 400,
      error: 'subscriptionStatus must be active, inactive, or past-due',
    };
  }

  const roleChanged = nextRole !== currentRole;
  const updatePayload: Record<string, unknown> = {
    role: nextRole,
    subscription_tier: tier,
    subscription_status: status,
    pending_subscription_tier: null,
    pending_change_effective_at: null,
  };

  if (roleChanged && nextRole === 'vessel') {
    updatePayload.active_vessel_id = null;
    updatePayload.managed_by_vessel_id = null;
    updatePayload.linked_account_features = [];
  }

  if (roleChanged && nextRole !== 'vessel' && currentRole === 'vessel') {
    updatePayload.active_vessel_id = null;
    updatePayload.managed_by_vessel_id = null;
    updatePayload.linked_account_features = [];
  }

  if (target.is_testing === true) {
    updatePayload.stripe_subscription_id = null;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('users')
    .update(updatePayload)
    .eq('id', userId)
    .select(
      'id, role, subscription_tier, subscription_status, current_period_end, cancel_at_period_end, stripe_subscription_id, active_vessel_id',
    )
    .single();

  if (updateError) {
    console.error('[admin/manual-subscription] update failed', updateError);
    return {
      ok: false,
      status: 500,
      error: updateError.message || 'Failed to update subscription',
    };
  }

  const warnings: string[] = [];
  if (target.stripe_subscription_id && target.is_testing !== true) {
    warnings.push(
      'User still has a Stripe subscription — billing may not match this manual tier until Stripe or the webhook updates it.',
    );
  }
  if (target.is_testing === true && target.stripe_subscription_id) {
    warnings.push(
      'Demo account — Stripe subscription link was cleared so manual tier is not overwritten on login.',
    );
  }
  if (roleChanged && nextRole === 'vessel') {
    warnings.push(
      'Account is now a vessel account. Link a vessel under Vessel subscriptions if needed.',
    );
  }
  if (roleChanged && currentRole === 'vessel' && nextRole !== 'vessel') {
    warnings.push('Account was converted from vessel back to a crew-style role.');
  }

  return {
    ok: true,
    user: updated as Record<string, unknown>,
    roleChanged,
    warning: warnings.length ? warnings.join(' ') : null,
  };
}
