-- Per-feature minimum subscription tiers (admin-configurable on Feature flags page).
-- NULL = use catalog default in app code.
-- Access rule: user's effective tier rank >= min tier rank (higher plans inherit access).

ALTER TABLE public.platform_feature_flags
  ADD COLUMN IF NOT EXISTS min_crew_tier text,
  ADD COLUMN IF NOT EXISTS min_vessel_tier text;

COMMENT ON COLUMN public.platform_feature_flags.min_crew_tier IS
  'Crew tier access. Prefer set encoding: set:crew_limited,premium (independent tiers). Legacy single slug still means that tier and above.';

COMMENT ON COLUMN public.platform_feature_flags.min_vessel_tier IS
  'Lowest vessel-manager tier with access when the feature is globally enabled. Higher tiers inherit automatically.';
