-- Adaptive vessel-level AIS scheduling fields on vessel_ais_status.
-- Cron runs every 5 minutes but only fetches vessels where next_ais_check_at <= now().

BEGIN;

ALTER TABLE public.vessel_ais_status
  ADD COLUMN IF NOT EXISTS next_ais_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS ais_tracking_mode text
    CHECK (
      ais_tracking_mode IS NULL OR ais_tracking_mode IN (
        'fast', 'normal', 'slow', 'transition', 'failure_retry'
      )
    ),
  ADD COLUMN IF NOT EXISTS last_state_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS state_stable_since timestamptz,
  ADD COLUMN IF NOT EXISTS last_successful_fetch_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_fetch_failures integer NOT NULL DEFAULT 0
    CHECK (consecutive_fetch_failures >= 0);

CREATE INDEX IF NOT EXISTS vessel_ais_status_next_check_due_idx
  ON public.vessel_ais_status (next_ais_check_at ASC NULLS FIRST);

COMMENT ON COLUMN public.vessel_ais_status.next_ais_check_at IS
  'Earliest time the adaptive scheduler may call the AIS provider for this vessel.';
COMMENT ON COLUMN public.vessel_ais_status.ais_tracking_mode IS
  'Derived polling mode: fast (underway), transition, normal (anchor), slow (moored), failure_retry.';
COMMENT ON COLUMN public.vessel_ais_status.state_stable_since IS
  'When the current live seajourney_state was first continuously observed.';
COMMENT ON COLUMN public.vessel_ais_status.consecutive_fetch_failures IS
  'Provider failures since last success; drives retry backoff.';

-- Optional: reason column on fetch log for adaptive scheduling analytics.
ALTER TABLE public.ais_fetch_log
  ADD COLUMN IF NOT EXISTS tracking_mode text,
  ADD COLUMN IF NOT EXISTS scheduled_reason text;

COMMENT ON COLUMN public.ais_fetch_log.tracking_mode IS
  'ais_tracking_mode at time of request (underway_fast, anchor_normal, etc.).';
COMMENT ON COLUMN public.ais_fetch_log.scheduled_reason IS
  'Why the fetch ran: cron_due, manual_refresh, failure_retry, cache, etc.';

-- Newly enabled vessels without a schedule row are due immediately via NULL next_ais_check_at.
-- Backfill next check for existing rows based on current state (conservative: due now so cron catches up).
UPDATE public.vessel_ais_status
SET next_ais_check_at = COALESCE(next_ais_check_at, now())
WHERE next_ais_check_at IS NULL;

COMMIT;
