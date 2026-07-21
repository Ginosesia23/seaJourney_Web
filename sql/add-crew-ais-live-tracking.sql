-- Live AIS tracking for premium crew members.
--
-- Adds:
--   1. `users.ais_live_tracking_enabled`     – per-crew opt-in flag (default false)
--   2. `users.ais_live_last_sync_at`         – timestamp of the most recent successful sync
--   3. `users.ais_live_last_sync_error`      – error from the most recent sync, if any
--   4. `crew_ais_state_samples`              – append-only hourly AIS state samples per
--                                              crew user for their active vessel; used to
--                                              aggregate a daily state at end-of-day.
--
-- Enabled crew are polled by the `/api/ais/crew-cron` cron endpoint every hour. Each
-- sample records the latest AIS fix for the crew's active vessel and the state derived
-- from it. Aggregation into `daily_state_logs` uses the same algorithm as the AIS
-- history import (analyze-daily-state.ts) but with the following crew-specific rule:
--
--   * if `underway` appears in ≥ 4 hourly samples for the day → the day is `underway`
--   * otherwise the most frequent state wins (with underway priority as a tie-break)
--
-- Samples older than 8 days are purged by the cron.

BEGIN;

-- 1. Crew opt-in flag + last-sync bookkeeping on `users`.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ais_live_tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ais_live_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS ais_live_last_sync_error text;

COMMENT ON COLUMN public.users.ais_live_tracking_enabled IS
  'Crew opt-in for hourly live AIS tracking on their active vessel. Requires Premium or Professional tier.';
COMMENT ON COLUMN public.users.ais_live_last_sync_at IS
  'Timestamp of the most recent successful crew AIS sync (any sample write).';
COMMENT ON COLUMN public.users.ais_live_last_sync_error IS
  'Reason the last crew AIS sync failed or was skipped, cleared on next success.';

-- 2. Hourly AIS state samples table.
CREATE TABLE IF NOT EXISTS public.crew_ais_state_samples (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vessel_id      uuid           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  -- The calendar date this sample belongs to (in the crew's local day; the cron
  -- passes an explicit `logDate` derived from client-side "today"). Used for
  -- fast per-day aggregation queries.
  sample_date    date           NOT NULL,
  -- Timestamp we ran the AIS lookup (server clock, not the AIS fix time).
  sampled_at     timestamptz    NOT NULL DEFAULT now(),
  -- Timestamp of the AIS fix returned by Datalastic (may be earlier than
  -- sampled_at if the vessel's transponder was silent for a while).
  ais_position_at timestamptz,
  -- Daily state derived from this single fix (`mapAisToDailyStatus`).
  state          text           NOT NULL CHECK (state IN ('underway','at-anchor','in-port','on-leave','in-yard')),
  nav_status     text,
  speed_kn       numeric,
  lat            numeric,
  lon            numeric,
  -- Raw Datalastic response for auditing / re-analysis via `analyzeAisDailyState`.
  raw_position   jsonb,
  created_at     timestamptz    NOT NULL DEFAULT now()
);

-- One sample per user per calendar hour (UTC). Prevents duplicate cron runs
-- from double-inserting the same hour. We pin the truncation to UTC via
-- `AT TIME ZONE 'UTC'` so the expression is IMMUTABLE (a plain
-- `date_trunc(text, timestamptz)` is only STABLE and can't be indexed).
CREATE UNIQUE INDEX IF NOT EXISTS crew_ais_state_samples_user_hour_uniq
  ON public.crew_ais_state_samples
    (user_id, (date_trunc('hour', sampled_at AT TIME ZONE 'UTC')));

CREATE INDEX IF NOT EXISTS crew_ais_state_samples_user_date_idx
  ON public.crew_ais_state_samples (user_id, sample_date);

CREATE INDEX IF NOT EXISTS crew_ais_state_samples_vessel_date_idx
  ON public.crew_ais_state_samples (vessel_id, sample_date);

CREATE INDEX IF NOT EXISTS crew_ais_state_samples_sampled_at_idx
  ON public.crew_ais_state_samples (sampled_at);

COMMENT ON TABLE public.crew_ais_state_samples IS
  'Hourly AIS state snapshots per crew user for their active vessel. Aggregated into daily_state_logs at end-of-day.';

-- 3. RLS: crew can read their own samples; service role (cron) writes.
ALTER TABLE public.crew_ais_state_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crew_ais_state_samples_owner_select
  ON public.crew_ais_state_samples;
CREATE POLICY crew_ais_state_samples_owner_select
  ON public.crew_ais_state_samples
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS crew_ais_state_samples_admin_select
  ON public.crew_ais_state_samples;
CREATE POLICY crew_ais_state_samples_admin_select
  ON public.crew_ais_state_samples
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMIT;
