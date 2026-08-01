-- Per-month cache for the Passages Map.
--
-- Design rationale
-- ────────────────
-- The original `crew_passage_tracks` table cached one row per
-- (user, vessel, assignment_start, assignment_end). That worked for a
-- "show me everything on this assignment" view, but breaks down as soon
-- as we want to browse month-by-month, because:
--
--   1. Assignments are usually long-running. Storing a single row per
--      assignment means every month re-render walks the whole array.
--   2. Datalastic bills per API call and caps each call at ~31 days of
--      history. Caching by month aligns cache granularity with API
--      granularity — one fetch fills exactly one cache row.
--   3. Old months are immutable. Once we've cached January's passages
--      we NEVER need to hit Datalastic for January again (barring a
--      manual /refresh). The month-keyed cache row is effectively
--      write-once.
--
-- Cache key: (user_id, vessel_id, month_key) where month_key is the
-- first day of the month in UTC as a DATE, e.g. 2026-07-01 for July.
-- Using a DATE (rather than a text 'YYYY-MM') lets Postgres range-scan
-- with normal date operators and keeps join semantics clean.
--
-- The polyline itself is stored as a GeoJSON FeatureCollection of
-- LineStrings in `track_geojson`, exactly matching the shape produced
-- by src/lib/passages-map/segment-tracks.ts. Each Feature's
-- `properties.startTime` MUST fall within this row's month — the API
-- writer is responsible for bucketing incoming Datalastic fetches into
-- the correct month(s) and never mixes months in a single row.
--
-- Coexistence with the older `crew_passage_tracks` table:
--   The old table is left in place (it's still the assignment-segment
--   view of the same data), but the Passages Map API is being migrated
--   to read from this new table exclusively. Once we're confident the
--   month cache is fully populated, the old table can be dropped in a
--   follow-up migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.crew_passage_month_cache (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vessel_id         UUID           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,

  -- First day of the UTC month this row covers, e.g. 2026-07-01. All
  -- features stored in `track_geojson` must have `startTime` inside
  -- [month_key, month_key + 1 month).
  month_key         DATE           NOT NULL,

  -- FeatureCollection of LineStrings for this month only. Shape matches
  -- src/lib/passages-map/segment-tracks.ts — each Feature has:
  --   passageIndex, startTime, endTime, distanceNm, pointCount,
  --   avgSpeedKn, maxSpeedKn.
  track_geojson     JSONB          NOT NULL,

  -- [minLon, minLat, maxLon, maxLat] across all passages in this row.
  bbox              JSONB,

  -- Aggregate stats scoped to THIS MONTH ONLY. Handy for the legend
  -- without walking the FeatureCollection.
  passage_count     INTEGER        NOT NULL DEFAULT 0,
  total_distance_nm NUMERIC(12, 2) NOT NULL DEFAULT 0,
  point_count       INTEGER        NOT NULL DEFAULT 0,
  first_fix_at      TIMESTAMPTZ,
  last_fix_at       TIMESTAMPTZ,

  -- Provenance + freshness.
  source            TEXT           NOT NULL DEFAULT 'datalastic_history',
  datalastic_request_count INTEGER NOT NULL DEFAULT 0,
  fetched_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- Whether this month is CURRENT (still filling with new fixes) or
  -- PAST (immutable). Set at insert time based on the current UTC
  -- month; used to decide whether to consider the row stale.
  is_current_month  BOOLEAN        NOT NULL DEFAULT false,

  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT crew_passage_month_cache_unique
    UNIQUE (user_id, vessel_id, month_key)
);

CREATE INDEX IF NOT EXISTS crew_passage_month_cache_user_idx
  ON public.crew_passage_month_cache (user_id);

CREATE INDEX IF NOT EXISTS crew_passage_month_cache_user_month_idx
  ON public.crew_passage_month_cache (user_id, month_key);

CREATE INDEX IF NOT EXISTS crew_passage_month_cache_user_vessel_month_idx
  ON public.crew_passage_month_cache (user_id, vessel_id, month_key);

COMMENT ON TABLE public.crew_passage_month_cache IS
  'Per-month passage-track cache for the Passages Map. One row per (user, vessel, YYYY-MM). Older months are immutable; only the current month is refreshed on demand.';

DROP TRIGGER IF EXISTS trg_crew_passage_month_cache_updated_at
  ON public.crew_passage_month_cache;
CREATE TRIGGER trg_crew_passage_month_cache_updated_at
BEFORE UPDATE ON public.crew_passage_month_cache
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crew_passage_month_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own passage months"
  ON public.crew_passage_month_cache;
CREATE POLICY "Users read own passage months"
  ON public.crew_passage_month_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Writes go through the Next.js API using the service-role client, which
-- bypasses RLS. Keeps Datalastic-call cost control on the server.

DROP POLICY IF EXISTS "Admins manage all passage months"
  ON public.crew_passage_month_cache;
CREATE POLICY "Admins manage all passage months"
  ON public.crew_passage_month_cache
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMIT;
