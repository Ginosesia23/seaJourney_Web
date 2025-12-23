-- Add RLS policy to allow captains with active signing authority to view logs
-- for any user on their vessel (needed for testimonial request verification)

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Captains can view logs for testimonial verification" ON public.daily_state_logs;

-- Policy: Captains with active signing authority can view logs for any user on their vessel
-- This allows captains to verify dates when reviewing testimonial requests
CREATE POLICY "Captains can view logs for testimonial verification"
ON public.daily_state_logs
FOR SELECT
USING (
  -- Allow if user owns the log (standard case)
  auth.uid() = user_id
  OR
  -- Allow if user is a captain with active signing authority on this vessel
  (
    EXISTS (
      SELECT 1
      FROM public.vessel_signing_authorities vsa
      WHERE vsa.captain_user_id = auth.uid()
        AND vsa.vessel_id = daily_state_logs.vessel_id
        AND vsa.is_primary = true
        AND vsa.end_date IS NULL  -- Active signing authority
    )
  )
  OR
  -- Allow if user is an approved captain (via vessel_claim_requests)
  (
    EXISTS (
      SELECT 1
      FROM public.vessel_claim_requests vcr
      WHERE vcr.requested_by = auth.uid()
        AND vcr.status = 'approved'
        AND vcr.vessel_id = daily_state_logs.vessel_id
    )
  )
  OR
  -- Allow if user is vessel manager and log's user_id matches vessel_manager_id
  (
    EXISTS (
      SELECT 1
      FROM public.vessels v
      WHERE v.vessel_manager_id = auth.uid()
        AND v.id = daily_state_logs.vessel_id
        AND v.vessel_manager_id = daily_state_logs.user_id
    )
  )
  OR
  -- Admins can see all logs
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

COMMENT ON POLICY "Captains can view logs for testimonial verification" ON public.daily_state_logs IS 
'Allows captains with active signing authority or approved captaincy to view logs for any user on their vessel. This enables testimonial request verification where captains need to compare requested dates with actual logged dates.';
