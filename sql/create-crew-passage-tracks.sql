-- Cache table for the Passages Map (Professional crew tier).
--
-- Datalastic doesn't archive per-vessel history for free — every /vessel_history
-- call is billed. Rendering "all passages the crew has done" on demand would
-- fire dozens of calls every time the page opens. This table stores the
-- computed passage tracks (GeoJSON LineStrings + metadata) so subsequent
-- views are instant and free.
--
-- Cache key: (user_id, vessel_id, assignment_start, assignment_end).
--   - One row per (user, vessel, assignment segment). If the user has two
--     separate assignments on the same vessel (e.g. two contracts), each
--     gets its own row.
--   - `assignment_end` is NULL for currently-active assignments; those rows
--     are refreshed on demand (see `fetched_at` staleness check in the API).
--
-- The polyline itself is stored as a GeoJSON `FeatureCollection` of
-- `LineString`s in `track_geojson` — one Feature per detected passage
-- (a passage = contiguous "underway" fixes bracketed by stationary
-- periods). Rendering just drops the FeatureCollection into a MapLibre
-- source; no client-side geometry work needed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.crew_passage_tracks (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vessel_id         UUID           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,

  -- Assignment segment this cached track covers. `assignment_end` is NULL
  -- when the assignment is still active (crew currently onboard); those
  -- rows are the ones the API will refresh when they age past the
  -- staleness threshold.
  assignment_start  DATE           NOT NULL,
  assignment_end    DATE,

  -- The passages themselves. GeoJSON FeatureCollection where each Feature
  -- is a LineString of [lon, lat] coordinates with a `properties` object
  -- containing:
  --   - passageIndex     : 0-based index within this assignment
  --   - startTime        : ISO8601 UTC of the first fix in this passage
  --   - endTime          : ISO8601 UTC of the last fix in this passage
  --   - distanceNm       : haversine sum along the passage
  --   - pointCount       : number of AIS fixes in this passage
  --   - avgSpeedKn       : mean SOG across the passage
  --   - maxSpeedKn       : peak SOG
  track_geojson     JSONB          NOT NULL,

  -- Bounding box [minLon, minLat, maxLon, maxLat] across all passages in
  -- this row. Used by the client to fit the map on load.
  bbox              JSONB,

  -- Aggregate stats for the whole assignment segment. Handy for the
  -- legend / stats panel without having to walk the FeatureCollection.
  passage_count     INTEGER        NOT NULL DEFAULT 0,
  total_distance_nm NUMERIC(12, 2) NOT NULL DEFAULT 0,
  point_count       INTEGER        NOT NULL DEFAULT 0,
  first_fix_at      TIMESTAMPTZ,
  last_fix_at       TIMESTAMPTZ,

  -- Where we got the data + when. Used for cache invalidation.
  source            TEXT           NOT NULL DEFAULT 'datalastic_history',
  datalastic_request_count INTEGER NOT NULL DEFAULT 0,
  fetched_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- Prevent duplicate cache rows for the same segment. NULL assignment_end
  -- means "still active" — we allow at most one active row per (user,
  -- vessel) via the partial unique index below.
  CONSTRAINT crew_passage_tracks_segment_unique
    UNIQUE (user_id, vessel_id, assignment_start, assignment_end)
);

CREATE INDEX IF NOT EXISTS crew_passage_tracks_user_idx
  ON public.crew_passage_tracks (user_id);

CREATE INDEX IF NOT EXISTS crew_passage_tracks_user_vessel_idx
  ON public.crew_passage_tracks (user_id, vessel_id);

-- Partial unique index guarantees a single "active" (assignment_end IS NULL)
-- cache row per (user, vessel); Postgres treats NULLs as distinct in the
-- composite UNIQUE above, so we need this to prevent duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS crew_passage_tracks_active_segment_unique
  ON public.crew_passage_tracks (user_id, vessel_id, assignment_start)
  WHERE assignment_end IS NULL;

COMMENT ON TABLE public.crew_passage_tracks IS
  'Cached AIS passage tracks per (user, vessel, assignment segment) for the Passages Map page. FeatureCollection of LineStrings ready to drop into MapLibre.';

-- updated_at trigger (public.set_updated_at() is the shared helper used by
-- the rest of the schema — see e.g. create-crew-leave-periods-table.sql).
DROP TRIGGER IF EXISTS trg_crew_passage_tracks_updated_at
  ON public.crew_passage_tracks;
CREATE TRIGGER trg_crew_passage_tracks_updated_at
BEFORE UPDATE ON public.crew_passage_tracks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crew_passage_tracks ENABLE ROW LEVEL SECURITY;

-- Users read their own cached tracks. The Passages Map page relies on this
-- directly via the anon client if you ever want to render without a server
-- round-trip; today the API uses the service-role client and short-circuits
-- RLS, so this policy is mostly defense-in-depth.
DROP POLICY IF EXISTS "Users read own passage tracks"
  ON public.crew_passage_tracks;
CREATE POLICY "Users read own passage tracks"
  ON public.crew_passage_tracks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE for `authenticated` — writes go through the
-- Next.js API using the service-role client (which bypasses RLS). This
-- keeps cost control (Datalastic calls) server-side.

-- Admins can manage all rows (support / debugging).
DROP POLICY IF EXISTS "Admins manage all passage tracks"
  ON public.crew_passage_tracks;
CREATE POLICY "Admins manage all passage tracks"
  ON public.crew_passage_tracks
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
