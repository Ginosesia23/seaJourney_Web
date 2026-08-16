-- Places discovered along Passages Map tracks.
-- As a crew sails near towns/ports we reverse-geocode once per ~cell and
-- remember the label so revisiting the same area does not re-resolve or
-- stack duplicate markers. The map paints these as extra city/port labels.

BEGIN;

CREATE TABLE IF NOT EXISTS public.crew_passage_map_places (
  id           uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Rounded grid key (~0.1°) so the same anchorage / port approach
  -- resolves once even when GPS endpoints jitter slightly.
  cell_key     text           NOT NULL,
  lat          numeric        NOT NULL,
  lon          numeric        NOT NULL,
  name         text           NOT NULL,
  kind         text           NOT NULL
                 CHECK (kind IN ('city', 'town', 'port')),
  -- Optional nearest curated hub when the primary label is a geocoded town.
  port_name    text,
  created_at   timestamptz    NOT NULL DEFAULT now(),
  updated_at   timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT crew_passage_map_places_unique
    UNIQUE (user_id, cell_key)
);

CREATE INDEX IF NOT EXISTS crew_passage_map_places_user_idx
  ON public.crew_passage_map_places (user_id);

COMMENT ON TABLE public.crew_passage_map_places IS
  'Per-user town/port labels unlocked by sailing near them on the Passages Map. One row per (user, cell_key); never re-geocoded on revisit.';

DROP TRIGGER IF EXISTS trg_crew_passage_map_places_updated_at
  ON public.crew_passage_map_places;
CREATE TRIGGER trg_crew_passage_map_places_updated_at
BEFORE UPDATE ON public.crew_passage_map_places
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crew_passage_map_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own map places"
  ON public.crew_passage_map_places;
CREATE POLICY "Users read own map places"
  ON public.crew_passage_map_places
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Writes go through the Next.js API with the service-role client.

DROP POLICY IF EXISTS "Admins manage all map places"
  ON public.crew_passage_map_places;
CREATE POLICY "Admins manage all map places"
  ON public.crew_passage_map_places
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
