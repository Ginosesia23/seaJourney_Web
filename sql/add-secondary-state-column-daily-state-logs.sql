-- Optional secondary vessel state for a single calendar day (premium / advanced logging).
-- Primary column remains `state`. Use `secondary_state` when a day needs an additional
-- movement-related classification (e.g. alongside underway). App layer should restrict
-- writes to eligible subscription tiers.
--
-- Prerequisites: public.daily_state_logs exists with primary `state` as text.
-- Note: Older migration add-secondary-state-to-daily-state-logs.sql added a boolean
--       is_secondary_state (later renamed to is_part_of_active_passage). This file
--       adds a different column: the actual secondary state value.

ALTER TABLE public.daily_state_logs
ADD COLUMN IF NOT EXISTS secondary_state TEXT;

-- Align with DailyStatus in application code; adjust if you add new states.
ALTER TABLE public.daily_state_logs
DROP CONSTRAINT IF EXISTS daily_state_logs_secondary_state_check;

ALTER TABLE public.daily_state_logs
ADD CONSTRAINT daily_state_logs_secondary_state_check
CHECK (
  secondary_state IS NULL
  OR secondary_state = ANY (ARRAY[
    'underway',
    'at-anchor',
    'in-port',
    'on-leave',
    'in-yard'
  ]::text[])
);

COMMENT ON COLUMN public.daily_state_logs.secondary_state IS
'Optional second daily status for the same date (e.g. premium vessel movement detail). NULL means not set. Must be a valid DailyStatus when present.';

-- Speed filters/reports that only need rows with a secondary state set
CREATE INDEX IF NOT EXISTS idx_daily_state_logs_has_secondary_state
ON public.daily_state_logs (vessel_id, user_id)
WHERE secondary_state IS NOT NULL;
