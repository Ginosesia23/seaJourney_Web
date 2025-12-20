-- Create a security definer function to check if a user can view another user's profile
-- This avoids recursion issues by using SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.can_view_user_profile(viewed_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  viewing_user_role TEXT;
  viewing_user_vessel_id UUID;
BEGIN
  -- Get the viewing user's role and active_vessel_id
  SELECT role, active_vessel_id INTO viewing_user_role, viewing_user_vessel_id
  FROM public.users
  WHERE id = auth.uid();
  
  -- If viewing user is admin, they can view any profile
  IF viewing_user_role = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  -- If viewing user is vessel or captain, check if viewed user has active assignment on their vessel
  IF viewing_user_role IN ('vessel', 'captain') AND viewing_user_vessel_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.vessel_assignments va
      WHERE va.user_id = viewed_user_id
      AND va.vessel_id = viewing_user_vessel_id
      AND va.end_date IS NULL
    );
  END IF;
  
  -- Otherwise, user can only view their own profile
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the existing policy if it exists
DROP POLICY IF EXISTS "Vessel managers can view crew profiles" ON public.users;

-- Create policy using the function
CREATE POLICY "Vessel managers can view crew profiles"
ON public.users
FOR SELECT
USING (
  auth.uid() = id
  OR public.can_view_user_profile(id)
);
