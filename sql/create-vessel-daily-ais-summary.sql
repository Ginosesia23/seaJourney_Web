-- Vessel daily AIS duration summary (sea-service evidence layer).
-- Built on top of ais_observations — does not replace vessel_ais_status.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vessel_daily_ais_summary (
  id                            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id                     uuid           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  date                          date           NOT NULL,

  underway_seconds              integer        NOT NULL DEFAULT 0 CHECK (underway_seconds >= 0),
  anchor_seconds                integer        NOT NULL DEFAULT 0 CHECK (anchor_seconds >= 0),
  moored_seconds                integer        NOT NULL DEFAULT 0 CHECK (moored_seconds >= 0),
  port_seconds                  integer        NOT NULL DEFAULT 0 CHECK (port_seconds >= 0),
  unknown_seconds               integer        NOT NULL DEFAULT 0 CHECK (unknown_seconds >= 0),

  distance_nm                   numeric        NOT NULL DEFAULT 0 CHECK (distance_nm >= 0),

  first_observation_at          timestamptz,
  last_observation_at           timestamptz,
  observation_count             integer        NOT NULL DEFAULT 0 CHECK (observation_count >= 0),

  current_state                 text           CHECK (
    current_state IS NULL OR current_state IN (
      'underway','at-anchor','in-port','on-leave','in-yard'
    )
  ),
  qualifying_daily_state        text           CHECK (
    qualifying_daily_state IS NULL OR qualifying_daily_state IN (
      'underway','at-anchor','in-port','on-leave','in-yard'
    )
  ),
  underway_qualified            boolean        NOT NULL DEFAULT false,

  is_final                      boolean        NOT NULL DEFAULT false,

  last_processed_observation_id uuid           REFERENCES public.ais_observations(id) ON DELETE SET NULL,
  calculation_version           integer        NOT NULL DEFAULT 1,

  created_at                    timestamptz    NOT NULL DEFAULT now(),
  updated_at                    timestamptz    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vessel_daily_ais_summary_vessel_date_uniq
  ON public.vessel_daily_ais_summary (vessel_id, date);

CREATE INDEX IF NOT EXISTS vessel_daily_ais_summary_date_idx
  ON public.vessel_daily_ais_summary (date);

CREATE INDEX IF NOT EXISTS vessel_daily_ais_summary_vessel_updated_idx
  ON public.vessel_daily_ais_summary (vessel_id, updated_at DESC);

COMMENT ON TABLE public.vessel_daily_ais_summary IS
  'Duration-based daily AIS sea-service evidence per vessel. current_state = latest fix; qualifying_daily_state = ≥4h underway rule etc.';

COMMENT ON COLUMN public.vessel_daily_ais_summary.underway_seconds IS
  'Accumulated seconds attributed to underway (duration, not sample count).';

COMMENT ON COLUMN public.vessel_daily_ais_summary.moored_seconds IS
  'Accumulated seconds for in-port / moored. port_seconds reserved for finer port berth splits.';

ALTER TABLE public.vessel_daily_ais_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vessel_daily_ais_summary_select ON public.vessel_daily_ais_summary;
CREATE POLICY vessel_daily_ais_summary_select
  ON public.vessel_daily_ais_summary
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vessels v
      WHERE v.id = vessel_id
        AND (
          v.vessel_manager_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
          )
          OR EXISTS (
            SELECT 1 FROM public.vessel_assignments va
            WHERE va.vessel_id = vessel_daily_ais_summary.vessel_id
              AND va.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.subscription_tier = 'vessel_linked'
              AND (
                u.managed_by_vessel_id = vessel_daily_ais_summary.vessel_id
                OR u.active_vessel_id = vessel_daily_ais_summary.vessel_id
              )
          )
        )
    )
  );

-- Clients must not write calculated summaries (service role bypasses RLS).
-- Do not add a FOR ALL deny policy here — it can interfere with SELECT under
-- some Postgres RLS combinations. With no INSERT/UPDATE/DELETE policies,
-- writes from authenticated clients are denied by default.

-- Realtime for live "underway qualified" updates on the dashboard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'vessel_daily_ais_summary'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vessel_daily_ais_summary;
  END IF;
END $$;

COMMIT;
