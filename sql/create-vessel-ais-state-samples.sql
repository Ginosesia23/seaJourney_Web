-- Hourly AIS samples for vessel-manager auto state (no daily login required).
-- Polled by /api/ais/cron when vessels.ais_tracking_enabled = true.
-- Aggregated with analyzeAisDailyState (≥ 4h underway = sea day).

BEGIN;

CREATE TABLE IF NOT EXISTS public.vessel_ais_state_samples (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id       uuid           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  sample_date     date           NOT NULL,
  sampled_at      timestamptz    NOT NULL DEFAULT now(),
  ais_position_at timestamptz,
  state           text           NOT NULL CHECK (state IN ('underway','at-anchor','in-port','on-leave','in-yard')),
  nav_status      text,
  speed_kn        numeric,
  lat             numeric,
  lon             numeric,
  raw_position    jsonb,
  created_at      timestamptz    NOT NULL DEFAULT now()
);

-- One sample per vessel per UTC hour.
CREATE UNIQUE INDEX IF NOT EXISTS vessel_ais_state_samples_vessel_hour_uniq
  ON public.vessel_ais_state_samples
    (vessel_id, (date_trunc('hour', sampled_at AT TIME ZONE 'UTC')));

CREATE INDEX IF NOT EXISTS vessel_ais_state_samples_vessel_date_idx
  ON public.vessel_ais_state_samples (vessel_id, sample_date);

CREATE INDEX IF NOT EXISTS vessel_ais_state_samples_sampled_at_idx
  ON public.vessel_ais_state_samples (sampled_at);

COMMENT ON TABLE public.vessel_ais_state_samples IS
  'Hourly AIS snapshots per vessel. Cron aggregates into the manager daily_state_logs without requiring login.';

ALTER TABLE public.vessel_ais_state_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vessel_ais_state_samples_manager_select
  ON public.vessel_ais_state_samples;
CREATE POLICY vessel_ais_state_samples_manager_select
  ON public.vessel_ais_state_samples
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vessels v
      WHERE v.id = vessel_id AND v.vessel_manager_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS vessel_ais_state_samples_admin_select
  ON public.vessel_ais_state_samples;
CREATE POLICY vessel_ais_state_samples_admin_select
  ON public.vessel_ais_state_samples
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMIT;
