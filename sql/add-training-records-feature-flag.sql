-- Seed training records flag with Test accounts crew tier only.
-- `set:test` maps to users.is_testing (same chip as Free / Premium on Feature flags).
INSERT INTO public.platform_feature_flags (key, enabled, min_crew_tier)
VALUES ('training_records', true, 'set:test')
ON CONFLICT (key) DO UPDATE
SET
  min_crew_tier = COALESCE(public.platform_feature_flags.min_crew_tier, EXCLUDED.min_crew_tier);
