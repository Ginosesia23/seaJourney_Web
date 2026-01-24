-- Add RLS policy to allow approved captains to view logs from vessel manager
-- This allows captains with approved captaincy requests to see the vessel account logs

-- First, ensure RLS is enabled on daily_state_logs table
ALTER TABLE public.daily_state_logs ENABLE ROW LEVEL SECURITY;

-- Drop the policy if it already exists
DROP POLICY IF EXISTS "Approved captains can view vessel manager logs" ON public.daily_state_logs;

-- Policy: Approved captains can view logs where user_id matches the vessel_manager_id
-- This allows captains to see the vessel account's logs for their approved vessel
CREATE POLICY "Approved captains can view vessel manager logs"
ON public.daily_state_logs
FOR SELECT
USING (
  -- Allow if user owns the log (standard case)
  auth.uid() = user_id
  OR
  -- Allow if user is an approved captain and the log's user_id matches the vessel's vessel_manager_id
  (
    EXISTS (
      SELECT 1
      FROM public.vessel_claim_requests vcr
      INNER JOIN public.vessels v ON v.id = vcr.vessel_id
      WHERE vcr.requested_by = auth.uid()
        AND vcr.status = 'approved'
        AND vcr.vessel_id = daily_state_logs.vessel_id
        AND v.vessel_manager_id = daily_state_logs.user_id
    )
  )
);

COMMENT ON POLICY "Approved captains can view vessel manager logs" ON public.daily_state_logs IS 
'Allows approved captains to view logs from the vessel manager (vessel_manager_id) for their approved vessel';
