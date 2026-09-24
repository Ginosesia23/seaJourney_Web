-- AIS API Monitor: standardise ais_fetch_log + admin aggregation RPCs.
--
-- Depends on:
--   sql/create-central-ais-tracking.sql   (ais_fetch_log, vessel_ais_status, ais_observations)
--   sql/add-adaptive-ais-scheduling.sql   (tracking_mode, scheduled_reason, next_ais_check_at …)
--   sql/add-ais-provider-poll-entitlement.sql (vessels.ais_provider_poll_enabled)
--
-- Safe to re-run. Does NOT delete data, does NOT change RLS on existing tables.
--
-- Column mapping (existing columns are reused, not duplicated):
--   provider            → existing provider
--   vessel_id           → existing vessel_id
--   requested_at        → existing requested_at (now set to the moment the HTTP request started)
--   success             → existing success (true = usable fix / response returned)
--   http_status         → existing response_status
--   error_message       → existing error_message (sanitised; never contains api-key)
--   trigger_source      → existing trigger_source (now a typed AisTriggerSource value)
--   tracking_mode       → existing tracking_mode
--   scheduled_reason    → existing scheduled_reason
--   mmsi, completed_at, response_time_ms, provider_credits_used → added below
--
-- Provider requests are rows with cached_or_api = 'api' AND provider_called IS DISTINCT FROM false.
-- Rows with cached_or_api = 'cache' are cached reads (no provider call) and are excluded
-- from every monitor metric.

-- ─── 1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.ais_fetch_log
  ADD COLUMN IF NOT EXISTS mmsi text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_time_ms integer,
  ADD COLUMN IF NOT EXISTS provider_credits_used numeric,
  ADD COLUMN IF NOT EXISTS trigger_detail text,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS provider_called boolean;

COMMENT ON COLUMN public.ais_fetch_log.response_status IS
  'HTTP status returned by the provider (http_status). NULL when the request never got a response (network error / timeout) or no request was made.';
COMMENT ON COLUMN public.ais_fetch_log.mmsi IS
  'MMSI (digits only) sent to the provider, when the request was made by MMSI.';
COMMENT ON COLUMN public.ais_fetch_log.completed_at IS
  'When the provider HTTP request finished (success or failure).';
COMMENT ON COLUMN public.ais_fetch_log.response_time_ms IS
  'Wall-clock provider HTTP round-trip in milliseconds.';
COMMENT ON COLUMN public.ais_fetch_log.provider_credits_used IS
  'Provider credits consumed, only when the provider reports it. NULL = unknown (Datalastic does not currently report per-request credits).';
COMMENT ON COLUMN public.ais_fetch_log.trigger_source IS
  'Typed AisTriggerSource: adaptive_scheduler | retry | manual_admin | manual_user | premium_enabled | entitlement_refresh | state_change | initial_tracking_start | history_import | vessel_lookup | unknown.';
COMMENT ON COLUMN public.ais_fetch_log.trigger_detail IS
  'Free-form call-site detail (e.g. route name). Legacy trigger strings were preserved here during backfill.';
COMMENT ON COLUMN public.ais_fetch_log.endpoint IS
  'Provider endpoint: vessel | vessel_history | vessel_info | vessel_find.';
COMMENT ON COLUMN public.ais_fetch_log.provider_called IS
  'False when an api-path attempt was aborted before any provider HTTP request (e.g. missing MMSI/IMO).';

-- ─── 2. Backfill legacy provider rows (api rows only; cache rows untouched) ───

UPDATE public.ais_fetch_log
SET trigger_detail = trigger_source
WHERE cached_or_api = 'api'
  AND trigger_detail IS NULL
  AND trigger_source IS NOT NULL
  AND trigger_source NOT IN (
    'adaptive_scheduler', 'retry', 'manual_admin', 'manual_user', 'premium_enabled',
    'entitlement_refresh', 'state_change', 'initial_tracking_start',
    'history_import', 'vessel_lookup', 'unknown'
  );

-- Only map legacy strings whose meaning is unambiguous. 'vessel-sync:manual'
-- was used by BOTH manual Sync and initial tracking start → 'unknown'.
UPDATE public.ais_fetch_log
SET trigger_source = CASE
    WHEN trigger_source LIKE 'vessel-sync:cron%' THEN 'adaptive_scheduler'
    WHEN trigger_source LIKE 'api:force%'        THEN 'manual_user'
    WHEN trigger_source LIKE 'crew-enable%'      THEN 'premium_enabled'
    ELSE 'unknown'
  END
WHERE cached_or_api = 'api'
  AND (
    trigger_source IS NULL
    OR trigger_source NOT IN (
      'adaptive_scheduler', 'retry', 'manual_admin', 'manual_user', 'premium_enabled',
      'entitlement_refresh', 'state_change', 'initial_tracking_start',
      'history_import', 'vessel_lookup', 'unknown'
    )
  );

-- Every legacy api row came from the central /vessel refresh path.
UPDATE public.ais_fetch_log
SET endpoint = 'vessel'
WHERE cached_or_api = 'api' AND endpoint IS NULL;

UPDATE public.ais_fetch_log
SET provider_called = (scheduled_reason IS DISTINCT FROM 'missing_identity')
WHERE cached_or_api = 'api' AND provider_called IS NULL;

-- ─── 3. Indexes (partial on provider rows so cache-read volume doesn't bloat them) ─

CREATE INDEX IF NOT EXISTS ais_fetch_log_api_requested_idx
  ON public.ais_fetch_log (requested_at DESC)
  WHERE cached_or_api = 'api';

CREATE INDEX IF NOT EXISTS ais_fetch_log_api_vessel_requested_idx
  ON public.ais_fetch_log (vessel_id, requested_at DESC)
  WHERE cached_or_api = 'api';

CREATE INDEX IF NOT EXISTS ais_fetch_log_api_failed_requested_idx
  ON public.ais_fetch_log (requested_at DESC)
  WHERE cached_or_api = 'api' AND success = false;

CREATE INDEX IF NOT EXISTS ais_fetch_log_api_trigger_requested_idx
  ON public.ais_fetch_log (trigger_source, requested_at DESC)
  WHERE cached_or_api = 'api';

CREATE INDEX IF NOT EXISTS ais_fetch_log_mmsi_requested_idx
  ON public.ais_fetch_log (mmsi, requested_at DESC)
  WHERE mmsi IS NOT NULL;

-- Scheduler health: vessels past their next check.
CREATE INDEX IF NOT EXISTS vessel_ais_status_failures_idx
  ON public.vessel_ais_status (consecutive_fetch_failures)
  WHERE consecutive_fetch_failures > 0;

-- ─── 4. Admin aggregation RPCs (service_role only) ─────────────────────────
--
-- All functions are read-only SQL, bounded by explicit time windows, and are
-- executable ONLY by service_role. The Next.js admin API verifies the caller is
-- an admin (users.role = 'admin') server-side before calling them.

-- 4a. Request stats for a window (optionally one vessel).
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_request_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_vessel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  succeeded bigint,
  failed bigint,
  avg_response_ms numeric,
  p95_response_ms numeric,
  rate_limited bigint,
  auth_failed bigint,
  server_errors bigint,
  network_errors bigint,
  distinct_vessels bigint,
  last_request_at timestamptz,
  last_success_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE l.success)::bigint,
    count(*) FILTER (WHERE NOT l.success)::bigint,
    round(avg(l.response_time_ms)::numeric, 0),
    round((percentile_cont(0.95) WITHIN GROUP (ORDER BY l.response_time_ms))::numeric, 0),
    count(*) FILTER (WHERE l.response_status = 429)::bigint,
    count(*) FILTER (WHERE l.response_status IN (401, 403))::bigint,
    count(*) FILTER (WHERE l.response_status >= 500)::bigint,
    count(*) FILTER (WHERE NOT l.success AND l.response_status IS NULL)::bigint,
    count(DISTINCT l.vessel_id)::bigint,
    max(l.requested_at),
    max(l.requested_at) FILTER (WHERE l.success)
  FROM public.ais_fetch_log l
  WHERE l.cached_or_api = 'api'
    AND l.provider_called IS DISTINCT FROM false
    AND l.requested_at >= p_from
    AND l.requested_at < p_to
    AND (p_vessel_id IS NULL OR l.vessel_id = p_vessel_id);
$$;

-- 4b. Gap-filled time series (hour or day buckets, UTC).
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_timeseries(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text DEFAULT 'hour',
  p_vessel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bucket_start timestamptz,
  total bigint,
  succeeded bigint,
  failed bigint,
  avg_response_ms numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      CASE WHEN p_bucket = 'day' THEN 'day' ELSE 'hour' END AS unit,
      CASE WHEN p_bucket = 'day' THEN interval '1 day' ELSE interval '1 hour' END AS step
  ),
  buckets AS (
    SELECT generate_series(
      date_trunc((SELECT unit FROM params), p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
      p_to,
      (SELECT step FROM params)
    ) AS bucket_start
  ),
  agg AS (
    SELECT
      date_trunc((SELECT unit FROM params), l.requested_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket_start,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE l.success)::bigint AS succeeded,
      count(*) FILTER (WHERE NOT l.success)::bigint AS failed,
      round(avg(l.response_time_ms)::numeric, 0) AS avg_response_ms
    FROM public.ais_fetch_log l
    WHERE l.cached_or_api = 'api'
      AND l.provider_called IS DISTINCT FROM false
      AND l.requested_at >= p_from
      AND l.requested_at < p_to
      AND (p_vessel_id IS NULL OR l.vessel_id = p_vessel_id)
    GROUP BY 1
  )
  SELECT
    b.bucket_start,
    coalesce(a.total, 0),
    coalesce(a.succeeded, 0),
    coalesce(a.failed, 0),
    a.avg_response_ms
  FROM buckets b
  LEFT JOIN agg a ON a.bucket_start = b.bucket_start
  ORDER BY b.bucket_start;
$$;

-- 4c. Top consumers (vessel_id NULL = unattributed, e.g. registration lookups).
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_top_vessels(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  vessel_id uuid,
  total bigint,
  succeeded bigint,
  failed bigint,
  avg_response_ms numeric,
  last_request_at timestamptz,
  last_success_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    l.vessel_id,
    count(*)::bigint,
    count(*) FILTER (WHERE l.success)::bigint,
    count(*) FILTER (WHERE NOT l.success)::bigint,
    round(avg(l.response_time_ms)::numeric, 0),
    max(l.requested_at),
    max(l.requested_at) FILTER (WHERE l.success)
  FROM public.ais_fetch_log l
  WHERE l.cached_or_api = 'api'
    AND l.provider_called IS DISTINCT FROM false
    AND l.requested_at >= p_from
    AND l.requested_at < p_to
  GROUP BY l.vessel_id
  ORDER BY count(*) DESC
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- 4d. Trigger / endpoint breakdown for a window.
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_trigger_breakdown(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  trigger_source text,
  endpoint text,
  total bigint,
  failed bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    coalesce(l.trigger_source, 'unknown'),
    coalesce(l.endpoint, 'vessel'),
    count(*)::bigint,
    count(*) FILTER (WHERE NOT l.success)::bigint
  FROM public.ais_fetch_log l
  WHERE l.cached_or_api = 'api'
    AND l.provider_called IS DISTINCT FROM false
    AND l.requested_at >= p_from
    AND l.requested_at < p_to
  GROUP BY 1, 2
  ORDER BY 3 DESC;
$$;

-- 4e. Possible duplicate live-position fetches (same vessel within N seconds).
-- History chunk requests are excluded (sequential chunks are expected).
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_duplicates(
  p_from timestamptz,
  p_to timestamptz,
  p_window_seconds integer DEFAULT 60,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  fetch_id uuid,
  vessel_id uuid,
  requested_at timestamptz,
  trigger_source text,
  previous_fetch_id uuid,
  previous_requested_at timestamptz,
  previous_trigger_source text,
  previous_success boolean,
  seconds_apart numeric,
  likely_legitimate boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ordered AS (
    SELECT
      l.id,
      l.vessel_id,
      l.requested_at,
      coalesce(l.trigger_source, 'unknown') AS trigger_source,
      lag(l.id) OVER w AS prev_id,
      lag(l.requested_at) OVER w AS prev_requested_at,
      coalesce(lag(l.trigger_source) OVER w, 'unknown') AS prev_trigger_source,
      lag(l.success) OVER w AS prev_success
    FROM public.ais_fetch_log l
    WHERE l.cached_or_api = 'api'
      AND l.provider_called IS DISTINCT FROM false
      AND coalesce(l.endpoint, 'vessel') = 'vessel'
      AND l.vessel_id IS NOT NULL
      AND l.requested_at >= p_from - make_interval(secs => greatest(p_window_seconds, 1))
      AND l.requested_at < p_to
    WINDOW w AS (PARTITION BY l.vessel_id ORDER BY l.requested_at)
  )
  SELECT
    o.id,
    o.vessel_id,
    o.requested_at,
    o.trigger_source,
    o.prev_id,
    o.prev_requested_at,
    o.prev_trigger_source,
    o.prev_success,
    round(extract(epoch FROM (o.requested_at - o.prev_requested_at))::numeric, 1),
    (
      o.trigger_source IN ('manual_admin', 'manual_user', 'initial_tracking_start', 'premium_enabled')
      OR o.prev_trigger_source IN ('manual_admin', 'manual_user', 'initial_tracking_start', 'premium_enabled')
      OR o.prev_success = false
    )
  FROM ordered o
  WHERE o.prev_requested_at IS NOT NULL
    AND o.requested_at >= p_from
    AND o.requested_at - o.prev_requested_at <= make_interval(secs => greatest(p_window_seconds, 1))
  ORDER BY o.requested_at DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 500);
$$;

-- 4f. Scheduler health snapshot.
-- eligible = vessel has MMSI/IMO and is opted in (vessel plan flag or cached entitlement)
-- enabled  = vessels.ais_provider_poll_enabled (what the cron actually polls)
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_scheduler_health(
  p_overdue_minutes integer DEFAULT 15,
  p_far_overdue_minutes integer DEFAULT 60
)
RETURNS TABLE (
  eligible bigint,
  enabled bigint,
  enabled_never_scheduled bigint,
  due bigint,
  overdue bigint,
  far_overdue bigint,
  failing bigint,
  failing_5plus bigint,
  mode_fast bigint,
  mode_normal bigint,
  mode_slow bigint,
  mode_transition bigint,
  mode_failure_retry bigint,
  last_scheduler_request_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH enabled_vessels AS (
    SELECT v.id
    FROM public.vessels v
    WHERE v.ais_provider_poll_enabled = true
  ),
  st AS (
    SELECT s.*
    FROM public.vessel_ais_status s
    JOIN enabled_vessels ev ON ev.id = s.vessel_id
  )
  SELECT
    (SELECT count(*) FROM public.vessels v
      WHERE (v.mmsi IS NOT NULL OR v.imo IS NOT NULL)
        AND (v.ais_tracking_enabled = true OR v.ais_provider_poll_enabled = true))::bigint,
    (SELECT count(*) FROM enabled_vessels)::bigint,
    (SELECT count(*) FROM enabled_vessels ev
      WHERE NOT EXISTS (SELECT 1 FROM public.vessel_ais_status s WHERE s.vessel_id = ev.id))::bigint,
    (SELECT count(*) FROM st WHERE st.next_ais_check_at IS NULL OR st.next_ais_check_at <= now())::bigint,
    (SELECT count(*) FROM st
      WHERE st.next_ais_check_at < now() - make_interval(mins => p_overdue_minutes))::bigint,
    (SELECT count(*) FROM st
      WHERE st.next_ais_check_at < now() - make_interval(mins => p_far_overdue_minutes))::bigint,
    (SELECT count(*) FROM st WHERE coalesce(st.consecutive_fetch_failures, 0) > 0)::bigint,
    (SELECT count(*) FROM st WHERE coalesce(st.consecutive_fetch_failures, 0) >= 5)::bigint,
    (SELECT count(*) FROM st WHERE st.ais_tracking_mode = 'fast')::bigint,
    (SELECT count(*) FROM st WHERE st.ais_tracking_mode = 'normal')::bigint,
    (SELECT count(*) FROM st WHERE st.ais_tracking_mode = 'slow')::bigint,
    (SELECT count(*) FROM st WHERE st.ais_tracking_mode = 'transition')::bigint,
    (SELECT count(*) FROM st WHERE st.ais_tracking_mode = 'failure_retry')::bigint,
    (SELECT max(l.requested_at) FROM public.ais_fetch_log l
      WHERE l.cached_or_api = 'api'
        AND l.trigger_source IN ('adaptive_scheduler', 'retry')
        AND l.requested_at >= now() - interval '7 days');
$$;

-- 4g. Vessels needing attention: far overdue, failing, or fetched too often.
-- Rapid threshold default 15/hour: the fastest adaptive interval is 5 min (12/hour).
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_attention_vessels(
  p_far_overdue_minutes integer DEFAULT 60,
  p_rapid_window_minutes integer DEFAULT 60,
  p_rapid_threshold integer DEFAULT 15,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  vessel_id uuid,
  reason text,
  next_ais_check_at timestamptz,
  consecutive_fetch_failures integer,
  ais_tracking_mode text,
  last_successful_fetch_at timestamptz,
  requests_in_window bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH lim AS (SELECT least(greatest(coalesce(p_limit, 25), 1), 200) AS n),
  enabled_status AS (
    SELECT s.*
    FROM public.vessel_ais_status s
    JOIN public.vessels v ON v.id = s.vessel_id
    WHERE v.ais_provider_poll_enabled = true
  ),
  far_overdue AS (
    SELECT s.vessel_id, 'far_overdue'::text AS reason, s.next_ais_check_at,
           s.consecutive_fetch_failures, s.ais_tracking_mode, s.last_successful_fetch_at,
           NULL::bigint AS requests_in_window
    FROM enabled_status s
    WHERE s.next_ais_check_at < now() - make_interval(mins => p_far_overdue_minutes)
    ORDER BY s.next_ais_check_at
    LIMIT (SELECT n FROM lim)
  ),
  failing AS (
    SELECT s.vessel_id, 'failing'::text, s.next_ais_check_at,
           s.consecutive_fetch_failures, s.ais_tracking_mode, s.last_successful_fetch_at,
           NULL::bigint
    FROM enabled_status s
    WHERE coalesce(s.consecutive_fetch_failures, 0) > 0
    ORDER BY s.consecutive_fetch_failures DESC
    LIMIT (SELECT n FROM lim)
  ),
  rapid AS (
    SELECT l.vessel_id, 'rapid_refetch'::text, s.next_ais_check_at,
           s.consecutive_fetch_failures, s.ais_tracking_mode, s.last_successful_fetch_at,
           count(*)::bigint
    FROM public.ais_fetch_log l
    LEFT JOIN public.vessel_ais_status s ON s.vessel_id = l.vessel_id
    WHERE l.cached_or_api = 'api'
      AND l.provider_called IS DISTINCT FROM false
      AND coalesce(l.endpoint, 'vessel') = 'vessel'
      AND l.vessel_id IS NOT NULL
      AND l.requested_at >= now() - make_interval(mins => p_rapid_window_minutes)
    GROUP BY l.vessel_id, s.next_ais_check_at, s.consecutive_fetch_failures,
             s.ais_tracking_mode, s.last_successful_fetch_at
    HAVING count(*) > p_rapid_threshold
    ORDER BY count(*) DESC
    LIMIT (SELECT n FROM lim)
  )
  SELECT * FROM far_overdue
  UNION ALL SELECT * FROM failing
  UNION ALL SELECT * FROM rapid;
$$;

-- 4h. Adaptive-scheduling savings estimate vs a fixed 5-minute schedule.
-- tracked_vessel_days = Σ over (vessel, UTC day) with ≥1 live-position provider
-- request of the fraction of that day inside [p_from, p_to). This is an
-- APPROXIMATION of "days the vessel was tracked" — there is no entitlement history.
CREATE OR REPLACE FUNCTION public.admin_ais_monitor_savings(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  tracked_vessel_days numeric,
  actual_requests bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH live AS (
    SELECT l.vessel_id,
           date_trunc('day', l.requested_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day_start
    FROM public.ais_fetch_log l
    WHERE l.cached_or_api = 'api'
      AND l.provider_called IS DISTINCT FROM false
      AND coalesce(l.endpoint, 'vessel') = 'vessel'
      AND l.vessel_id IS NOT NULL
      AND l.requested_at >= p_from
      AND l.requested_at < p_to
  ),
  vessel_days AS (
    SELECT DISTINCT vessel_id, day_start FROM live
  )
  SELECT
    coalesce(sum(
      extract(epoch FROM (
        least(vd.day_start + interval '1 day', p_to, now())
        - greatest(vd.day_start, p_from)
      )) / 86400.0
    ), 0)::numeric,
    (SELECT count(*) FROM live)::bigint
  FROM vessel_days vd;
$$;

-- ─── 5. Privileges: service_role only ──────────────────────────────────────

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.admin_ais_monitor_request_stats(timestamptz, timestamptz, uuid)',
    'public.admin_ais_monitor_timeseries(timestamptz, timestamptz, text, uuid)',
    'public.admin_ais_monitor_top_vessels(timestamptz, timestamptz, integer)',
    'public.admin_ais_monitor_trigger_breakdown(timestamptz, timestamptz)',
    'public.admin_ais_monitor_duplicates(timestamptz, timestamptz, integer, integer)',
    'public.admin_ais_monitor_scheduler_health(integer, integer)',
    'public.admin_ais_monitor_attention_vessels(integer, integer, integer, integer)',
    'public.admin_ais_monitor_savings(timestamptz, timestamptz)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
