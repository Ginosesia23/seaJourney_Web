-- Add career targeting so Apply can recommend the next ticket from a crew member's position.
-- career_track: deck | engine | interior | galley | any
-- target_level: the milestone this application prepares for (e.g. watch_rating, oow)

ALTER TABLE public.application_templates
  ADD COLUMN IF NOT EXISTS career_track TEXT NOT NULL DEFAULT 'any'
    CHECK (career_track IN ('deck', 'engine', 'interior', 'galley', 'any'));

ALTER TABLE public.application_templates
  ADD COLUMN IF NOT EXISTS target_level TEXT NOT NULL DEFAULT 'other';

COMMENT ON COLUMN public.application_templates.career_track IS
  'Career department this application belongs to (deck/engine/interior/galley/any).';
COMMENT ON COLUMN public.application_templates.target_level IS
  'Career milestone this package prepares for (e.g. watch_rating, oow). Used to recommend the next ticket from users.position.';

CREATE INDEX IF NOT EXISTS idx_application_templates_career
  ON public.application_templates(career_track, target_level)
  WHERE status = 'published';
