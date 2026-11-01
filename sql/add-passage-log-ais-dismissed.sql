-- Soft-hide AIS logbook rows so auto-import does not recreate a voyage
-- the account holder removed.
ALTER TABLE public.passage_logs
  ADD COLUMN IF NOT EXISTS ais_dismissed_at timestamptz;

COMMENT ON COLUMN public.passage_logs.ais_dismissed_at IS
  'When set, this AIS voyage stays out of the logbook and is not auto-imported again.';

CREATE INDEX IF NOT EXISTS passage_logs_ais_dismissed_at_idx
  ON public.passage_logs (crew_id)
  WHERE ais_dismissed_at IS NULL;
