-- Allow vessel managers, captains, and admins to view user profiles for crew on their vessel
-- This enables the crew page to show crew member profiles based on vessel_assignments
-- Updated version that avoids self-join issues by using a simpler approach

-- First, check what policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'users';

-- Drop the existing policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Vessel managers can view crew profiles" ON public.users;

-- Create policy that allows vessel managers/captains/admins to view profiles of users
-- who have active assignments (end_date IS NULL) on their vessel
-- This version uses a simpler approach without self-join that might cause 500 errors
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
    WHERE va.user_id = users.id
    AND va.end_date IS NULL  -- Active assignment
    AND va.vessel_id IN (
      -- Get the active_vessel_id of the viewing user (vessel manager/captain/admin)
      SELECT u2.active_vessel_id 
      FROM public.users u2 
      WHERE u2.id = auth.uid()
      AND (
        u2.role = 'vessel'
        OR u2.role = 'captain'
        OR u2.role = 'admin'
      )
      AND u2.active_vessel_id IS NOT NULL
    )
  )
);
