-- Persist Nav Watch supporting checklist ticks so saved applications can
-- show expandable progress toward a complete MCA Watch Rating pack.

ALTER TABLE public.nav_watch_applications
  ADD COLUMN IF NOT EXISTS supporting_evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.nav_watch_applications.supporting_evidence IS
  'JSONB checklist of supporting documents / evidence for the Watch Rating application pack';
