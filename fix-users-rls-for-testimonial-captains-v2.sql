-- Allow users to view profiles of captains who are approved for vessels
-- they have logged time on (for testimonial requests)
-- Updated to include captains from vessel_claim_requests (approved status)
-- This enables users to see captain information when requesting testimonials

-- Drop the existing policy first (it depends on the function)
DROP POLICY IF EXISTS "Users can view captains for testimonial requests" ON public.users;

-- Drop the existing function (required to change parameter names)
DROP FUNCTION IF EXISTS public.can_view_captain_for_testimonial(UUID, UUID);

-- Create SECURITY DEFINER function to check if user can view captain profile
-- This bypasses RLS to avoid recursion issues
-- Note: Parameter renamed from captain_user_id to captain_id to avoid ambiguity with column names
CREATE FUNCTION public.can_view_captain_for_testimonial(captain_id UUID, viewing_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- User can always see their own profile
  IF captain_id = viewing_user_id THEN
    RETURN TRUE;
  END IF;

  -- Check if captain has active signing authority on a vessel the viewing user has logged time on or has assignment on
  IF EXISTS (
    SELECT 1 
    FROM public.vessel_signing_authorities vsa
    WHERE vsa.captain_user_id = captain_id
    AND vsa.end_date IS NULL
    AND (
      EXISTS (
        SELECT 1 
        FROM public.daily_state_logs dsl
        WHERE dsl.vessel_id = vsa.vessel_id
        AND dsl.user_id = viewing_user_id
      )
      OR
      EXISTS (
        SELECT 1 
        FROM public.vessel_assignments va
        WHERE va.vessel_id = vsa.vessel_id
        AND va.user_id = viewing_user_id
        AND va.end_date IS NULL
      )
    )
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check if captain is approved in vessel_claim_requests for a vessel the viewing user has logged time on or has assignment on
  IF EXISTS (
    SELECT 1 
    FROM public.vessel_claim_requests vcr
    WHERE vcr.requested_by = captain_id
    AND vcr.status = 'approved'
    AND (
      EXISTS (
        SELECT 1 
        FROM public.daily_state_logs dsl
        WHERE dsl.vessel_id = vcr.vessel_id
        AND dsl.user_id = viewing_user_id
      )
      OR
      EXISTS (
        SELECT 1 
        FROM public.vessel_assignments va
        WHERE va.vessel_id = vcr.vessel_id
        AND va.user_id = viewing_user_id
        AND va.end_date IS NULL
      )
    )
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check if both users have vessel_assignments on the same vessel and captain is approved
  IF EXISTS (
    SELECT 1 
    FROM public.vessel_assignments va_captain
    INNER JOIN public.vessel_assignments va_user ON va_captain.vessel_id = va_user.vessel_id
    WHERE va_captain.user_id = captain_id
    AND va_user.user_id = viewing_user_id
    AND va_captain.end_date IS NULL
    AND va_user.end_date IS NULL
    AND EXISTS (
      SELECT 1 
      FROM public.vessel_claim_requests vcr
      WHERE vcr.requested_by = captain_id
      AND vcr.vessel_id = va_captain.vessel_id
      AND vcr.status = 'approved'
    )
  ) THEN
    RETURN TRUE;
  END IF;

  -- Allow users to view captain profiles if they have created a testimonial for that captain
  -- This enables viewing captain info in the testimonials table
  IF EXISTS (
    SELECT 1 
    FROM public.testimonials t
    WHERE t.captain_user_id = captain_id
    AND t.user_id = viewing_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.can_view_captain_for_testimonial(UUID, UUID) TO authenticated;

-- Create policy using the SECURITY DEFINER function (avoids recursion)
-- Note: Policy was dropped earlier, so we just create it here
CREATE POLICY "Users can view captains for testimonial requests"
ON public.users
FOR SELECT
USING (
  public.can_view_captain_for_testimonial(id, auth.uid())
);
   
COMMENT ON POLICY "Users can view captains for testimonial requests" ON public.users IS 
'Allows users to view profiles of captains who are approved for vessels they have logged time on or are assigned to. This enables testimonial request functionality where users need to see captain information. Includes captains from vessel_signing_authorities, vessel_claim_requests (approved), and vessel_assignments.';
