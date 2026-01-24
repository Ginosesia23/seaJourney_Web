-- Allow vessel managers, captains, and admins to view user profiles for crew on their vessel
-- This enables the crew page to show all crew members whose active_vessel_id matches the vessel
-- Updated to check active_vessel_id directly instead of only vessel_assignments

-- First, check what policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'users';

-- Drop the existing policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Vessel managers can view crew profiles" ON public.users;

-- Create policy that allows vessel managers/captains/admins to view profiles of users
-- whose active_vessel_id matches their vessel
-- This is simpler and more direct than checking vessel_assignments
CREATE POLICY "Vessel managers can view crew profiles"
ON public.users
FOR SELECT
USING (
  -- User can always see their own profile
  auth.uid() = id
  OR
  -- Vessel managers/captains/admins can see profiles of users 
  -- whose active_vessel_id matches their own active_vessel_id
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND users.active_vessel_id IS NOT NULL
    AND users.active_vessel_id = u.active_vessel_id
    AND (
      u.role = 'vessel'
      OR u.role = 'captain'
      OR u.role = 'admin'
    )
    -- Exclude vessel accounts themselves from being viewed (they should see crew/captain/admin only)
    AND users.role != 'vessel'
  )
);

