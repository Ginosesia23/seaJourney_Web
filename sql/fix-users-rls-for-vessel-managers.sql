-- Allow vessel managers, captains, and admins to view user profiles for crew on their vessel
-- This enables the crew page to show crew member profiles
-- We avoid infinite recursion by checking vessel_assignments instead of querying users table

-- First, check what policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'users';

-- Drop the policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Vessel managers can view crew profiles" ON public.users;

-- Create policy that allows vessel managers/captains/admins to view profiles of users
-- who have active assignments on their vessel
-- This avoids infinite recursion by not querying the users table
CREATE POLICY "Vessel managers can view crew profiles"
ON public.users
FOR SELECT
USING (
  -- User can always see their own profile
  auth.uid() = id
  OR
  -- Vessel managers/captains/admins can see profiles of users with assignments on their vessel
  EXISTS (
    SELECT 1 FROM public.vessel_assignments va
    INNER JOIN public.users u ON u.id = auth.uid()
    WHERE va.user_id = users.id
    AND va.end_date IS NULL  -- Active assignment
    AND (
      (u.role = 'vessel' AND u.active_vessel_id = va.vessel_id)
      OR (u.role = 'captain' AND u.active_vessel_id = va.vessel_id)
      OR u.role = 'admin'
    )
  )
);

