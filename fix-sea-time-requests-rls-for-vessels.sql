-- Fix RLS policy for sea_time_requests to allow vessel accounts to view requests
-- Uses SECURITY DEFINER function to avoid RLS recursion issues with users table

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Vessel managers can view requests for their vessel" ON public.sea_time_requests;

-- Drop function if it exists
DROP FUNCTION IF EXISTS public.can_vessel_view_sea_time_requests(UUID);

-- Create a SECURITY DEFINER function to check if vessel can view sea time requests
-- This bypasses RLS on the users table to avoid recursion
CREATE OR REPLACE FUNCTION public.can_vessel_view_sea_time_requests(vessel_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role TEXT;
  current_user_active_vessel_id UUID;
BEGIN
  -- Get the current user's role and active_vessel_id directly
  -- SECURITY DEFINER allows this to bypass RLS on users table
  SELECT role, active_vessel_id INTO current_user_role, current_user_active_vessel_id
  FROM public.users
  WHERE id = auth.uid();

  -- Return FALSE if user not found
  IF current_user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin can see all requests
  IF current_user_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  -- Vessel managers can see requests for their active vessel
  IF current_user_role = 'vessel' AND current_user_active_vessel_id IS NOT NULL AND current_user_active_vessel_id = vessel_id_param THEN
    RETURN TRUE;
  END IF;

  -- Captains can see requests for their active vessel
  IF current_user_role = 'captain' AND current_user_active_vessel_id IS NOT NULL AND current_user_active_vessel_id = vessel_id_param THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.can_vessel_view_sea_time_requests(UUID) TO authenticated;

-- Create policy using the function
CREATE POLICY "Vessel managers can view requests for their vessel"
ON public.sea_time_requests
FOR SELECT
USING (
  -- Crew members can view their own requests (existing policy)
  auth.uid() = crew_user_id
  OR
  -- Vessel managers/admins can see requests for their vessels (using function)
  public.can_vessel_view_sea_time_requests(vessel_id)
);

-- Also update the UPDATE policy to use the function
DROP POLICY IF EXISTS "Vessel managers can approve/reject requests" ON public.sea_time_requests;

CREATE POLICY "Vessel managers can approve/reject requests"
ON public.sea_time_requests
FOR UPDATE
USING (
  public.can_vessel_view_sea_time_requests(vessel_id)
  AND status = 'pending'
)
WITH CHECK (
  public.can_vessel_view_sea_time_requests(vessel_id)
  AND status IN ('approved', 'rejected')
);

COMMENT ON POLICY "Vessel managers can view requests for their vessel" ON public.sea_time_requests IS 
'Allows vessel account users and captains to view sea time requests for their active vessel. Uses SECURITY DEFINER function to avoid RLS recursion.';

COMMENT ON FUNCTION public.can_vessel_view_sea_time_requests IS 
'Checks if the current vessel account user or captain can view sea time requests for a given vessel. Returns TRUE if user is a vessel account/captain and the vessel_id matches their active_vessel_id, or if user is an admin.';
