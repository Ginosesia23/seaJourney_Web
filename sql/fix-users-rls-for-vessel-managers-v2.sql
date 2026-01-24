-- Allow vessel managers, captains, and admins to view user profiles for crew on their vessel
-- This enables the crew page to show crew member profiles based on vessel_assignments
-- Updated version that works with vessel_assignments table

-- First, check what policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'users';

-- Drop the existing policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Vessel managers can view crew profiles" ON public.users;

-- Create policy that allows vessel managers/captains/admins to view profiles of users
-- who have active assignments (end_date IS NULL) on their vessel
-- This works by checking vessel_assignments table
CREATE POLICY "Vessel managers can view crew profiles"
ON public.users
FOR SELECT
USING (
  -- User can always see their own profile
  auth.uid() = id
  OR
  -- Vessel managers/captains/admins can see profiles of users with active assignments on their vessel
  EXISTS (
    SELECT 1 FROM public.vessel_assignments va
    INNER JOIN public.users viewing_user ON viewing_user.id = auth.uid()
    WHERE va.user_id = users.id
    AND va.end_date IS NULL  -- Active assignment
    AND (
      (viewing_user.role = 'vessel' AND viewing_user.active_vessel_id = va.vessel_id)
      OR (viewing_user.role = 'captain' AND viewing_user.active_vessel_id = va.vessel_id)
      OR viewing_user.role = 'admin'
    )
  )
);

