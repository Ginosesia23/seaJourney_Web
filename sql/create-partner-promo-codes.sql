-- Partner promo codes: companies/schools share a signup code that grants
-- complimentary Premium (or another crew tier) for N days.
-- Run in the Supabase SQL editor once.

CREATE TABLE IF NOT EXISTS public.partner_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  code text NOT NULL,
  reward_tier text NOT NULL DEFAULT 'premium',
  reward_days integer NOT NULL DEFAULT 30
    CHECK (reward_days > 0 AND reward_days <= 365),
  max_redemptions integer
    CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_promo_codes_code_unique
  ON public.partner_promo_codes (upper(btrim(code)));

CREATE INDEX IF NOT EXISTS partner_promo_codes_active_idx
  ON public.partner_promo_codes (is_active);

COMMENT ON TABLE public.partner_promo_codes IS
  'Admin-managed signup codes for training companies / schools. Redeemed at crew signup for a complimentary crew tier.';

CREATE TABLE IF NOT EXISTS public.partner_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.partner_promo_codes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  reward_tier text NOT NULL,
  period_end timestamptz NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS partner_promo_redemptions_code_idx
  ON public.partner_promo_redemptions (code_id);

COMMENT ON TABLE public.partner_promo_redemptions IS
  'One partner-code redemption per user. Used for attribution and to prevent reuse.';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.partner_promo_codes (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Redeem (service_role / SECURITY DEFINER only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_partner_promo_code(
  p_user_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
  v_code public.partner_promo_codes%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_period_end timestamptz;
  v_existing public.partner_promo_redemptions%ROWTYPE;
BEGIN
  v_normalized := upper(btrim(COALESCE(p_code, '')));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code is required');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  SELECT * INTO v_existing
  FROM public.partner_promo_redemptions
  WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'alreadyRedeemed', true,
      'companyName', (
        SELECT company_name FROM public.partner_promo_codes WHERE id = v_existing.code_id
      ),
      'rewardTier', v_existing.reward_tier,
      'periodEnd', v_existing.period_end
    );
  END IF;

  IF COALESCE(v_user.stripe_subscription_id, '') <> '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This account already has a paid subscription');
  END IF;

  SELECT * INTO v_code
  FROM public.partner_promo_codes
  WHERE upper(btrim(code)) = v_normalized
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid code');
  END IF;

  IF NOT v_code.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is no longer active');
  END IF;

  IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;

  IF v_code.max_redemptions IS NOT NULL AND v_code.redemption_count >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has reached its signup limit');
  END IF;

  v_period_end := now() + make_interval(days => v_code.reward_days);

  UPDATE public.users
  SET
    subscription_tier = v_code.reward_tier,
    subscription_status = 'active',
    current_period_end = v_period_end,
    cancel_at_period_end = true,
    promo_code_id = v_code.id
  WHERE id = p_user_id;

  INSERT INTO public.partner_promo_redemptions (code_id, user_id, reward_tier, period_end)
  VALUES (v_code.id, p_user_id, v_code.reward_tier, v_period_end);

  UPDATE public.partner_promo_codes
  SET
    redemption_count = redemption_count + 1,
    updated_at = now()
  WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyRedeemed', false,
    'companyName', v_code.company_name,
    'rewardTier', v_code.reward_tier,
    'rewardDays', v_code.reward_days,
    'periodEnd', v_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_partner_promo_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_partner_promo_code(uuid, text) TO postgres, service_role;

-- Apply a signup code stored on auth user metadata when the profile row is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    username,
    first_name,
    last_name,
    position,
    registration_date,
    role,
    subscription_tier,
    subscription_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || SUBSTRING(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'firstName', ''),
    COALESCE(NEW.raw_user_meta_data->>'lastName', ''),
    COALESCE(NEW.raw_user_meta_data->>'position', NULL),
    NOW(),
    COALESCE(NEW.raw_user_meta_data->>'role', 'crew'),
    'free',
    'inactive'
  )
  ON CONFLICT (id) DO NOTHING;

  IF COALESCE(NEW.raw_user_meta_data->>'promoCode', '') <> '' THEN
    PERFORM public.redeem_partner_promo_code(NEW.id, NEW.raw_user_meta_data->>'promoCode');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.partner_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_promo_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select partner_promo_codes" ON public.partner_promo_codes;
CREATE POLICY "Admins can select partner_promo_codes"
ON public.partner_promo_codes
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS "Admins can insert partner_promo_codes" ON public.partner_promo_codes;
CREATE POLICY "Admins can insert partner_promo_codes"
ON public.partner_promo_codes
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS "Admins can update partner_promo_codes" ON public.partner_promo_codes;
CREATE POLICY "Admins can update partner_promo_codes"
ON public.partner_promo_codes
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS "Admins can delete partner_promo_codes" ON public.partner_promo_codes;
CREATE POLICY "Admins can delete partner_promo_codes"
ON public.partner_promo_codes
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

DROP POLICY IF EXISTS "Admins can select partner_promo_redemptions" ON public.partner_promo_redemptions;
CREATE POLICY "Admins can select partner_promo_redemptions"
ON public.partner_promo_redemptions
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
