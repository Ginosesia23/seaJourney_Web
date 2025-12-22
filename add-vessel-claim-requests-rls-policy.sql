-- RLS policies for vessel_claim_requests table
-- These policies allow users to create and view their own claim requests
-- and allow vessel managers/admins to view requests for their vessels

-- Enable RLS if not already enabled
ALTER TABLE public.vessel_claim_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Users can insert own claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Users can update own pending claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Vessel managers can view claim requests for their vessel" ON public.vessel_claim_requests;

-- Policy 1: Users can view their own claim requests
-- This avoids recursion by only checking auth.uid() directly
CREATE POLICY "Users can view own claim requests"
ON public.vessel_claim_requests
FOR SELECT
USING (auth.uid() = requested_by);

-- Policy 2: Users can insert their own claim requests
-- Simple check using only auth.uid() - no table joins that could cause recursion
CREATE POLICY "Users can insert own claim requests"
ON public.vessel_claim_requests
FOR INSERT
WITH CHECK (auth.uid() = requested_by);

-- Policy 3: Users can update their own pending requests (e.g., cancel)
-- Only allows updates to pending requests owned by the user
CREATE POLICY "Users can update own pending claim requests"
ON public.vessel_claim_requests
FOR UPDATE
USING (auth.uid() = requested_by AND status = 'pending')
WITH CHECK (auth.uid() = requested_by);

-- Policy 4: Vessel managers and admins can view claim requests for their vessels
-- This uses a SECURITY DEFINER function that bypasses RLS to avoid recursion
CREATE OR REPLACE FUNCTION public.can_view_vessel_claim_requests(vessel_id_param UUID)
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
  -- Use pg_catalog.current_setting to get the current user without triggering RLS
  SELECT role, active_vessel_id INTO current_user_role, current_user_active_vessel_id
  FROM public.users
  WHERE id = (SELECT auth.uid());

  -- Return NULL if user not found (safer than FALSE)
  IF current_user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin can see all requests
  IF current_user_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  -- Vessel managers can see requests for their active vessel
  IF current_user_role = 'vessel' AND current_user_active_vessel_id = vessel_id_param THEN
    RETURN TRUE;
  END IF;

  -- Captains can see requests for their active vessel
  IF current_user_role = 'captain' AND current_user_active_vessel_id = vessel_id_param THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.can_view_vessel_claim_requests(UUID) TO authenticated;

-- Now create the policy using the function
CREATE POLICY "Vessel managers can view claim requests for their vessel"
ON public.vessel_claim_requests
FOR SELECT
USING (
  auth.uid() = requested_by  -- Users can always see their own requests
  OR
  public.can_view_vessel_claim_requests(vessel_id)  -- Vessel managers/admins can see requests for their vessels
);

COMMENT ON TABLE public.vessel_claim_requests IS 'Tracks vessel claim/captaincy requests. Users can request captaincy of vessels they have worked on.';

