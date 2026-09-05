-- Platform feature flags: admin kill-switches for unfinished / broken
-- production features without a redeploy.
--
-- Defaults: if a key has no row, the app treats it as ENABLED
-- (safe before this migration is applied).

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  note text,
  last_enabled_at timestamptz,
  last_disabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.platform_feature_flags IS
  'Admin-managed kill switches. Missing key = enabled (catalog default).';

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read platform_feature_flags"
  ON public.platform_feature_flags;
CREATE POLICY "Anyone authenticated can read platform_feature_flags"
ON public.platform_feature_flags
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage platform_feature_flags"
  ON public.platform_feature_flags;
CREATE POLICY "Admins can manage platform_feature_flags"
ON public.platform_feature_flags
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- Seed known keys as enabled so the admin UI has rows immediately.
INSERT INTO public.platform_feature_flags (key, enabled)
VALUES
  ('passages_map', true),
  ('passage_logbook', true),
  ('ais_history_import', true),
  ('ais_live_tracking', true),
  ('visa_tracker', true),
  ('bridge_watch_log', true),
  ('watch_schedule', true),
  ('crew_rotation', true),
  ('testimonials', true),
  ('apply_tickets', true),
  ('career_progress', true),
  ('vessel_document_generator', true),
  ('certificates', true),
  ('proof_of_service', true),
  ('sea_time_request', true),
  ('export_reports', true),
  ('vessel_team_accounts', true)
ON CONFLICT (key) DO NOTHING;
