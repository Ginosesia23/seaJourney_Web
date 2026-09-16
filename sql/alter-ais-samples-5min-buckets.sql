-- Adaptive AIS sample buckets: allow one sample per 5 minutes (underway refresh).
-- Safe to run if create-central-ais-tracking.sql already applied the 30-min indexes.

BEGIN;

DROP INDEX IF EXISTS public.vessel_ais_state_samples_vessel_30min_uniq;
DROP INDEX IF EXISTS public.vessel_ais_state_samples_vessel_hour_uniq;
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

DROP INDEX IF EXISTS public.crew_ais_state_samples_user_30min_uniq;
DROP INDEX IF EXISTS public.crew_ais_state_samples_user_hour_uniq;
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
