-- ============================================================================
-- Adds an "onboard override" timestamp to vessel_assignments.
--
-- When a vessel manager toggles a crew member's onboard status from the
-- Onboard Tracker and the new state disagrees with the rotation pattern
-- for today, the UI offers two choices:
--
--   1. "Change the rotation pattern" — opens the rotation editor.
--   2. "Override until the next scheduled change" — flips the onboard
--      flag and writes `onboard_override_until` to the next pattern
--      transition date. While `onboard_override_until > now()`, the
--      sync route (`/api/crew-rotation/sync`) leaves the row alone so
--      the manual choice persists across page reloads. Once the
--      override expires the rotation pattern takes back over.
--
-- The column is nullable; existing rows are unaffected.
-- ============================================================================

ALTER TABLE public.vessel_assignments
  ADD COLUMN IF NOT EXISTS onboard_override_until timestamptz NULL;

COMMENT ON COLUMN public.vessel_assignments.onboard_override_until IS
  'When set in the future, the crew rotation sync will not overwrite the onboard flag on this row until this timestamp passes. Used when a vessel manager manually overrides the rotation pattern from the Onboard Tracker. Cleared automatically when the override is reverted or when the rotation pattern is edited.';

-- Helpful index for the sync route: it only cares about rows whose
-- override hasn't expired yet.
CREATE INDEX IF NOT EXISTS vessel_assignments_onboard_override_until_idx
  ON public.vessel_assignments (vessel_id, onboard_override_until)
  WHERE onboard_override_until IS NOT NULL;
