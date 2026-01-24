-- Allow vessel managers, captains, and admins to view all assignments for vessels they manage
-- This enables the crew page to show all crew members on a vessel

-- First, drop the policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Vessel managers can view assignments for their vessel" ON public.vessel_assignments;

-- Check if vessel managers can view assignments for their active vessel
-- Users with role 'vessel' can view assignments where vessel_id matches their active_vessel_id
CREATE POLICY "Vessel managers can view assignments for their vessel"
ON public.vessel_assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND (
      (users.role = 'vessel' AND users.active_vessel_id = vessel_assignments.vessel_id)
      OR (users.role = 'captain' AND users.active_vessel_id = vessel_assignments.vessel_id)
      OR users.role = 'admin'
    )
  )
);

