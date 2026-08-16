-- Durable place memory for AIS state detection.
-- When a vessel sits stationary at a location, we remember the preferred
-- state (in-port / at-anchor / in-yard) so a later return within ~0.4 nm
-- can bias ambiguous AIS samples toward what we recorded there before.
-- Survives hourly sample retention (~8 days).

BEGIN;

CREATE TABLE IF NOT EXISTS public.vessel_ais_place_memory (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id        uuid           NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  center_lat       numeric        NOT NULL,
  center_lon       numeric        NOT NULL,
  preferred_state  text           NOT NULL
                   CHECK (preferred_state IN ('at-anchor', 'in-port', 'in-yard')),
  visit_count      integer        NOT NULL DEFAULT 1 CHECK (visit_count >= 1),
  last_seen_at     timestamptz    NOT NULL DEFAULT now(),
  last_place_name  text,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vessel_ais_place_memory_vessel_idx
  ON public.vessel_ais_place_memory (vessel_id);

CREATE INDEX IF NOT EXISTS vessel_ais_place_memory_vessel_lat_lon_idx
  ON public.vessel_ais_place_memory (vessel_id, center_lat, center_lon);

COMMENT ON TABLE public.vessel_ais_place_memory IS
  'Per-vessel remembered stationary places for AIS state bias. Matching uses a ~0.4 nm radius around center_lat/lon.';

DROP TRIGGER IF EXISTS trg_vessel_ais_place_memory_updated_at
  ON public.vessel_ais_place_memory;
CREATE TRIGGER trg_vessel_ais_place_memory_updated_at
BEFORE UPDATE ON public.vessel_ais_place_memory
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vessel_ais_place_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vessel_ais_place_memory_manager_select
  ON public.vessel_ais_place_memory;
CREATE POLICY vessel_ais_place_memory_manager_select
  ON public.vessel_ais_place_memory
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vessels v
      WHERE v.id = vessel_id AND v.vessel_manager_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS vessel_ais_place_memory_admin_select
  ON public.vessel_ais_place_memory;
CREATE POLICY vessel_ais_place_memory_admin_select
  ON public.vessel_ais_place_memory
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMIT;
