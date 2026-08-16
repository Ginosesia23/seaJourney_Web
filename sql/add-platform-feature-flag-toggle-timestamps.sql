-- Track when each feature was last turned on / off (for admin expand panel).

ALTER TABLE public.platform_feature_flags
  ADD COLUMN IF NOT EXISTS last_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_disabled_at timestamptz;

COMMENT ON COLUMN public.platform_feature_flags.last_enabled_at IS
  'Most recent time this flag was set to enabled=true.';
COMMENT ON COLUMN public.platform_feature_flags.last_disabled_at IS
  'Most recent time this flag was set to enabled=false.';

-- Best-effort backfill from current state.
UPDATE public.platform_feature_flags
SET last_enabled_at = COALESCE(last_enabled_at, updated_at, now())
WHERE enabled = true AND last_enabled_at IS NULL;

UPDATE public.platform_feature_flags
SET last_disabled_at = COALESCE(last_disabled_at, updated_at, now())
WHERE enabled = false AND last_disabled_at IS NULL;
