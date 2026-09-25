-- Backfill ais_fetch_log from ais_observations so the Admin AIS Monitor has
-- history for the period before provider request logging went live.
--
-- Run AFTER sql/add-ais-fetch-log-monitoring.sql. Safe to re-run (idempotent).
-- Insert-only: no existing rows are updated or deleted.
--
-- What this can and cannot reconstruct:
--   * Each ais_observations row = one SUCCESSFUL provider /vessel request that
--     returned a new position fix. Requests that returned an already-seen fix
--     (same provider_timestamp) and FAILED requests were never stored, so
--     backfilled totals are a lower bound and failures are not backfilled.
--   * The original trigger was not recorded, so rows are labelled
--     trigger_source = 'unknown' with trigger_detail = 'backfill:ais_observations'.
--     HTTP status and response time are left NULL rather than guessed.
--   * Observations within 2 minutes of an existing real log row for the same
--     vessel are skipped, so live-logged requests are never double counted.

BEGIN;

INSERT INTO public.ais_fetch_log (
  vessel_id,
  provider,
  requested_at,
  completed_at,
  success,
  response_status,
  response_time_ms,
  cached_or_api,
  error_message,
  trigger_source,
  trigger_detail,
  endpoint,
  mmsi,
  provider_called
)
SELECT
  o.vessel_id,
  coalesce(o.provider, 'datalastic'),
  o.fetched_at,
  o.fetched_at,
  true,
  NULL,
  NULL,
  'api',
  NULL,
  'unknown',
  'backfill:ais_observations',
  'vessel',
  nullif(regexp_replace(coalesce(v.mmsi, ''), '\D', '', 'g'), ''),
  true
FROM public.ais_observations o
LEFT JOIN public.vessels v ON v.id = o.vessel_id
WHERE o.fetched_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.ais_fetch_log l
    WHERE l.vessel_id = o.vessel_id
      AND l.cached_or_api = 'api'
      AND l.requested_at BETWEEN o.fetched_at - interval '2 minutes'
                             AND o.fetched_at + interval '2 minutes'
  );

COMMIT;

-- Check:
-- SELECT trigger_detail, count(*), min(requested_at), max(requested_at)
-- FROM public.ais_fetch_log GROUP BY 1;
