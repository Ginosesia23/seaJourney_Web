-- Freeze analyzer explanation on AIS wrong-state reports at submit time.

ALTER TABLE public.ais_state_reports
  ADD COLUMN IF NOT EXISTS detection_snapshot JSONB NULL;

COMMENT ON COLUMN public.ais_state_reports.detection_snapshot IS
  'Compact analyzer output (reason, metrics, counts) captured when the report was filed.';
