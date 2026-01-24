-- Add RLS policy to allow viewing approved captaincy requests
-- This is necessary for crew members to find active captains when requesting testimonials
-- Approved requests are public information - if a captain is approved, users should be able to see it

-- Policy: Anyone can view approved captaincy requests
-- This allows users to check if a vessel has an active approved captain
CREATE POLICY "Users can view approved captaincy requests"
ON public.vessel_claim_requests
FOR SELECT
USING (status = 'approved');

COMMENT ON POLICY "Users can view approved captaincy requests" ON public.vessel_claim_requests IS 
'Allows all authenticated users to view approved captaincy requests. This is necessary for crew members to identify active captains when requesting testimonials. Approved requests are considered public information.';
