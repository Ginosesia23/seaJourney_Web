-- Link AIS Passages Map features to Passage Log Book rows so the same
-- voyage is not recorded twice when a tier allows both.

ALTER TABLE public.passage_logs
  ADD COLUMN IF NOT EXISTS ais_fingerprint text;

COMMENT ON COLUMN public.passage_logs.ais_fingerprint IS
  'Stable key vesselId|startTime|endTime from an AIS map passage. Used to dedupe promote-to-logbook.';

-- One AIS voyage → at most one logbook row per crew member.
CREATE UNIQUE INDEX IF NOT EXISTS passage_logs_crew_ais_fingerprint_uniq
  ON public.passage_logs (crew_id, ais_fingerprint)
  WHERE ais_fingerprint IS NOT NULL;
