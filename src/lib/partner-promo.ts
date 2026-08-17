import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const PARTNER_CODE_REWARD_TIERS = ['premium', 'standard', 'professional'] as const;
export type PartnerCodeRewardTier = (typeof PARTNER_CODE_REWARD_TIERS)[number];

export type PartnerPromoRedeemResult = {
  ok: boolean;
  alreadyRedeemed?: boolean;
  companyName?: string;
  rewardTier?: string;
  rewardDays?: number;
  periodEnd?: string;
  error?: string;
};

const CODE_FORMAT = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

export function normalizePartnerCode(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase();
}

export function isValidPartnerCodeFormat(code: string): boolean {
  return CODE_FORMAT.test(normalizePartnerCode(code));
}

export function mapPartnerCodeRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    companyName: row.company_name as string,
    code: row.code as string,
    rewardTier: row.reward_tier as string,
    rewardDays: Number(row.reward_days),
    maxRedemptions: (row.max_redemptions as number | null) ?? null,
    redemptionCount: Number(row.redemption_count || 0),
    expiresAt: (row.expires_at as string | null) ?? null,
    isActive: Boolean(row.is_active),
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

export async function lookupActivePartnerCode(code: string) {
  const normalized = normalizePartnerCode(code);
  if (!isValidPartnerCodeFormat(normalized)) return null;

  const { data, error } = await supabaseAdmin
    .from('partner_promo_codes')
    .select('*')
    .ilike('code', normalized)
    .maybeSingle();

  if (error || !data) return null;

  const mapped = mapPartnerCodeRow(data as Record<string, unknown>);
  if (!mapped.isActive) return null;
  if (mapped.expiresAt && new Date(mapped.expiresAt).getTime() <= Date.now()) return null;
  if (
    mapped.maxRedemptions != null &&
    mapped.redemptionCount >= mapped.maxRedemptions
  ) {
    return { ...mapped, exhausted: true as const };
  }
  return { ...mapped, exhausted: false as const };
}

export async function redeemPartnerPromoCode(
  userId: string,
  code: string,
): Promise<PartnerPromoRedeemResult> {
  const normalized = normalizePartnerCode(code);
  if (!normalized) {
    return { ok: false, error: 'Code is required' };
  }

  const { data, error } = await supabaseAdmin.rpc('redeem_partner_promo_code', {
    p_user_id: userId,
    p_code: normalized,
  });

  if (error) {
    console.error('[partner-promo] redeem RPC', error);
    return {
      ok: false,
      error:
        error.message?.includes('does not exist') || error.code === '42883'
          ? 'Run sql/create-partner-promo-codes.sql in Supabase first'
          : error.message || 'Could not apply code',
    };
  }

  const result = (data || {}) as PartnerPromoRedeemResult;
  if (!result.ok) {
    return { ok: false, error: result.error || 'Could not apply code' };
  }
  return result;
}

/** Flip expired DB-only comps back to free so admin/MRR views stay accurate. */
export async function expireCompGrantIfNeeded(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, stripe_subscription_id, subscription_status, current_period_end')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return false;
  if (data.stripe_subscription_id) return false;
  if (!data.current_period_end) return false;
  if (new Date(data.current_period_end).getTime() > Date.now()) return false;

  const status = String(data.subscription_status || '')
    .toLowerCase()
    .replace(/-/g, '_');
  if (status !== 'active' && status !== 'trialing') return false;

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      subscription_status: 'inactive',
      subscription_tier: 'free',
      cancel_at_period_end: false,
    })
    .eq('id', userId)
    .is('stripe_subscription_id', null);

  if (updateError) {
    console.error('[partner-promo] expire comp grant', updateError);
    return false;
  }
  return true;
}
