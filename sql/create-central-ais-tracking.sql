-- Centralised vessel AIS tracking: latest status, observations, fetch log, refresh locks.
-- Run after existing AIS migrations (vessels.ais_tracking_enabled, etc.).

BEGIN;

-- ─── Latest AIS status (one row per vessel) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vessel_ais_status (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id               uuid           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  latitude                numeric,
  longitude               numeric,
  speed_kn                numeric,
  course                  numeric,
  heading                 numeric,
  raw_navigation_status   text,
  seajourney_state        text           NOT NULL CHECK (
    seajourney_state IN ('underway','at-anchor','in-port','on-leave','in-yard')
  ),
  provider                text           NOT NULL DEFAULT 'datalastic',
  provider_timestamp      timestamptz,
  fetched_at              timestamptz    NOT NULL DEFAULT now(),
  updated_at              timestamptz    NOT NULL DEFAULT now(),
  raw_position            jsonb,
  refresh_error           text
);

CREATE UNIQUE INDEX IF NOT EXISTS vessel_ais_status_vessel_id_uniq
  ON public.vessel_ais_status (vessel_id);

CREATE INDEX IF NOT EXISTS vessel_ais_status_fetched_at_idx
  ON public.vessel_ais_status (fetched_at);

COMMENT ON TABLE public.vessel_ais_status IS
  'Latest known AIS fix per vessel. Updated by trusted backend processes only.';

-- ─── Historical AIS observations ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ais_observations (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id               uuid           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  latitude                numeric,
  longitude               numeric,
  speed_kn                numeric,
  course                  numeric,
  heading                 numeric,
  raw_navigation_status   text,
  seajourney_state        text           NOT NULL CHECK (
    seajourney_state IN ('underway','at-anchor','in-port','on-leave','in-yard')
  ),
  provider                text           NOT NULL DEFAULT 'datalastic',
  provider_timestamp      timestamptz,
  fetched_at              timestamptz    NOT NULL DEFAULT now(),
  created_at              timestamptz    NOT NULL DEFAULT now(),
  raw_position            jsonb
);

-- Avoid duplicate observations for the same provider fix.
CREATE UNIQUE INDEX IF NOT EXISTS ais_observations_vessel_provider_ts_uniq
  ON public.ais_observations (vessel_id, provider_timestamp)
  WHERE provider_timestamp IS NOT NULL;

CREATE INDEX IF NOT EXISTS ais_observations_vessel_fetched_idx
  ON public.ais_observations (vessel_id, fetched_at DESC);

COMMENT ON TABLE public.ais_observations IS
  'Append-only AIS observation history. One row per successful provider fetch.';

-- ─── API usage / fetch log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ais_fetch_log (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id         uuid           REFERENCES public.vessels(id) ON DELETE SET NULL,
  provider          text           NOT NULL DEFAULT 'datalastic',
  requested_at      timestamptz    NOT NULL DEFAULT now(),
  success           boolean        NOT NULL,
  response_status   integer,
  cached_or_api     text           NOT NULL CHECK (cached_or_api IN ('cache', 'api')),
  error_message     text,
  trigger_source    text
);

CREATE INDEX IF NOT EXISTS ais_fetch_log_requested_at_idx
  ON public.ais_fetch_log (requested_at DESC);

CREATE INDEX IF NOT EXISTS ais_fetch_log_vessel_requested_idx
  ON public.ais_fetch_log (vessel_id, requested_at DESC);

COMMENT ON TABLE public.ais_fetch_log IS
  'AIS provider request audit log for cost / reliability monitoring.';

-- ─── Refresh locks (serverless-safe deduplication) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.vessel_ais_refresh_locks (
  vessel_id     uuid           PRIMARY KEY REFERENCES public.vessels(id) ON DELETE CASCADE,
  locked_until  timestamptz    NOT NULL,
  locked_at     timestamptz    NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vessel_ais_refresh_locks IS
  'Short-lived per-vessel refresh locks. Expires automatically if a worker crashes.';

-- Try to acquire a refresh lock. Returns true when this caller owns the lock.
CREATE OR REPLACE FUNCTION public.try_acquire_vessel_ais_refresh_lock(
  p_vessel_id uuid,
  p_ttl_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  INSERT INTO public.vessel_ais_refresh_locks (vessel_id, locked_until, locked_at)
  VALUES (p_vessel_id, now() + make_interval(secs => p_ttl_seconds), now())
  ON CONFLICT (vessel_id) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        locked_at = EXCLUDED.locked_at
    WHERE public.vessel_ais_refresh_locks.locked_until < now()
  RETURNING true INTO v_acquired;

  IF v_acquired IS NULL THEN
    -- Conflict branch did not update (lock still held).
    SELECT false INTO v_acquired;
  END IF;

  RETURN COALESCE(v_acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_vessel_ais_refresh_lock(p_vessel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.vessel_ais_refresh_locks WHERE vessel_id = p_vessel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_vessel_ais_refresh_lock(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_vessel_ais_refresh_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_vessel_ais_refresh_lock(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_vessel_ais_refresh_lock(uuid) TO service_role;

-- ─── RLS: read for authorised users; writes via service role only ──────────────

ALTER TABLE public.vessel_ais_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ais_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ais_fetch_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_ais_refresh_locks ENABLE ROW LEVEL SECURITY;

-- vessel_ais_status SELECT: vessel manager, assigned crew/captain, linked team, admin
DROP POLICY IF EXISTS vessel_ais_status_select ON public.vessel_ais_status;
CREATE POLICY vessel_ais_status_select
  ON public.vessel_ais_status
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
            WHERE va.vessel_id = vessel_ais_status.vessel_id
              AND va.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.subscription_tier = 'vessel_linked'
              AND (u.managed_by_vessel_id = vessel_ais_status.vessel_id
                   OR u.active_vessel_id = vessel_ais_status.vessel_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS ais_observations_select ON public.ais_observations;
CREATE POLICY ais_observations_select
  ON public.ais_observations
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
            WHERE va.vessel_id = ais_observations.vessel_id
              AND va.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.subscription_tier = 'vessel_linked'
              AND (u.managed_by_vessel_id = ais_observations.vessel_id
                   OR u.active_vessel_id = ais_observations.vessel_id)
          )
        )
    )
  );

-- Fetch log: admin read only (cost monitoring)
DROP POLICY IF EXISTS ais_fetch_log_admin_select ON public.ais_fetch_log;
CREATE POLICY ais_fetch_log_admin_select
  ON public.ais_fetch_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Refresh locks: no client access
DROP POLICY IF EXISTS vessel_ais_refresh_locks_deny_all ON public.vessel_ais_refresh_locks;
CREATE POLICY vessel_ais_refresh_locks_deny_all
  ON public.vessel_ais_refresh_locks
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ─── Realtime for dashboard live updates ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'vessel_ais_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vessel_ais_status;
  END IF;
END $$;

-- Relax sample uniqueness → 5-minute buckets (matches underway refresh interval).
DROP INDEX IF EXISTS public.vessel_ais_state_samples_vessel_hour_uniq;
DROP INDEX IF EXISTS public.vessel_ais_state_samples_vessel_30min_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS vessel_ais_state_samples_vessel_5min_uniq
  ON public.vessel_ais_state_samples (
    vessel_id,
    (
      date_trunc('hour', sampled_at AT TIME ZONE 'UTC')
      + floor(
          EXTRACT(MINUTE FROM sampled_at AT TIME ZONE 'UTC') / 5
        ) * interval '5 minutes'
    )
  );

DROP INDEX IF EXISTS public.crew_ais_state_samples_user_hour_uniq;
DROP INDEX IF EXISTS public.crew_ais_state_samples_user_30min_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS crew_ais_state_samples_user_5min_uniq
  ON public.crew_ais_state_samples (
    user_id,
    vessel_id,
    (
      date_trunc('hour', sampled_at AT TIME ZONE 'UTC')
      + floor(
          EXTRACT(MINUTE FROM sampled_at AT TIME ZONE 'UTC') / 5
        ) * interval '5 minutes'
    )
  );

COMMIT;
