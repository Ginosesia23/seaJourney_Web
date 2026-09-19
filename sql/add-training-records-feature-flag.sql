-- Seed training records (Digital TRB Companion) feature flag for admin kill-switch / tier control.
INSERT INTO public.platform_feature_flags (key, enabled)
VALUES ('training_records', true)
ON CONFLICT (key) DO NOTHING;
