-- Add SELECT policy for vessel accounts to view captaincy requests for their vessel
-- This allows vessel accounts to see requests that need their approval
-- Uses SECURITY DEFINER function to avoid RLS recursion issues

-- Drop existing policy and function if they exist
DROP POLICY IF EXISTS "Vessel managers can view claim requests for their vessel" ON public.vessel_claim_requests;
DROP FUNCTION IF EXISTS public.can_vessel_view_claim_requests(UUID);

-- Create a SECURITY DEFINER function to check if vessel can view requests
-- This bypasses RLS on the users table to avoid recursion
CREATE OR REPLACE FUNCTION public.can_vessel_view_claim_requests(vessel_id_param UUID)
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

  -- Return FALSE if user not found or not a vessel account
  IF current_user_role IS NULL OR current_user_role != 'vessel' THEN
    RETURN FALSE;
  END IF;

  -- Check if the vessel_id matches the user's active_vessel_id
  IF current_user_active_vessel_id IS NOT NULL AND current_user_active_vessel_id = vessel_id_param THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.can_vessel_view_claim_requests(UUID) TO authenticated;

-- Create policy using the function
CREATE POLICY "Vessel managers can view claim requests for their vessel"
ON public.vessel_claim_requests
FOR SELECT
USING (
  public.can_vessel_view_claim_requests(vessel_id)
);

COMMENT ON POLICY "Vessel managers can view claim requests for their vessel" ON public.vessel_claim_requests IS 'Allows vessel account users to view captaincy requests for their active vessel. Uses SECURITY DEFINER function to avoid RLS recursion.';
COMMENT ON FUNCTION public.can_vessel_view_claim_requests IS 'Checks if the current vessel account user can view requests for a given vessel. Returns TRUE if user is a vessel account and the vessel_id matches their active_vessel_id.';
