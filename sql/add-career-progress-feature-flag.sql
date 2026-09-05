-- Seed career progress feature flag for admin tier / kill-switch control.
INSERT INTO public.platform_feature_flags (key, enabled)
VALUES ('career_progress', true)
ON CONFLICT (key) DO NOTHING;
