-- Allow vessel managers with approved access requests to view crew member's daily_state_logs
-- This enables vessel managers to generate documents using the crew member's own logs (including watch days)

-- Policy: Vessel managers can view crew member logs if they have approved access
DROP POLICY IF EXISTS "Vessel managers can view crew member logs with approved access" ON public.daily_state_logs;

CREATE POLICY "Vessel managers can view crew member logs with approved access"
ON public.daily_state_logs
FOR SELECT
USING (
  -- Allow if user owns the log (standard case)
  auth.uid() = user_id
  OR
  -- Allow if user is a vessel manager with an approved access request for this crew member
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    JOIN public.users u ON u.id = auth.uid()
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = daily_state_logs.user_id
      AND vsar.vessel_id = daily_state_logs.vessel_id
      AND vsar.status = 'approved'
      AND u.role = 'vessel'
  )
  OR
  -- Allow if user is a captain with active signing authority on this vessel
  (
    EXISTS (
      SELECT 1
      FROM public.vessel_signing_authorities vsa
      WHERE vsa.captain_user_id = auth.uid()
        AND vsa.vessel_id = daily_state_logs.vessel_id
        AND vsa.is_primary = true
        AND vsa.end_date IS NULL
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
  -- Allow if user is vessel manager and log's user_id matches vessel_manager_id (vessel account logs)
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

COMMENT ON POLICY "Vessel managers can view crew member logs with approved access" ON public.daily_state_logs IS 
'Allows vessel managers with approved access requests to view crew member daily_state_logs. This enables the crew documents page where vessel managers can generate documents using the crew member own logs (including watch days and part-of-active-passage flags).';
