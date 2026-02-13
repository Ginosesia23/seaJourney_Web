-- Add assignment_role to vessel_assignments for per-vessel permission level
-- Vessel managers can set: crew, officer, captain, admin (controls what tasks the person can do on this vessel)
-- position = job title (e.g. Deckhand, Chief Officer); assignment_role = permission level

ALTER TABLE public.vessel_assignments
ADD COLUMN IF NOT EXISTS assignment_role TEXT NULL;

-- Default existing rows to 'crew'; new rows can default in app or via trigger
UPDATE public.vessel_assignments
SET assignment_role = 'crew'
WHERE assignment_role IS NULL;

-- Optional: constrain to allowed values (comment out if you prefer app-only validation)
-- ALTER TABLE public.vessel_assignments
-- ADD CONSTRAINT vessel_assignments_assignment_role_check
-- CHECK (assignment_role IS NULL OR assignment_role IN ('crew', 'officer', 'captain', 'admin'));

COMMENT ON COLUMN public.vessel_assignments.assignment_role IS
'Permission level for this person on this vessel: crew, officer, captain, admin. Set by vessel manager. Distinct from position (job title).';
