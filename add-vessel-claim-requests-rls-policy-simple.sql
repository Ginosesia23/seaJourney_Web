-- Simplified RLS policies for vessel_claim_requests table
-- This version avoids any potential recursion issues

-- Enable RLS if not already enabled
ALTER TABLE public.vessel_claim_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Users can insert own claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Users can update own pending claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Vessel managers can view claim requests for their vessel" ON public.vessel_claim_requests;

-- Drop the function if it exists
DROP FUNCTION IF EXISTS public.can_view_vessel_claim_requests(UUID);

-- Policy 1: Users can view their own claim requests
CREATE POLICY "Users can view own claim requests"
ON public.vessel_claim_requests
FOR SELECT
USING (auth.uid() = requested_by);

-- Policy 2: Users can insert their own claim requests
-- This is the critical one for creating requests
CREATE POLICY "Users can insert own claim requests"
ON public.vessel_claim_requests
FOR INSERT
WITH CHECK (auth.uid() = requested_by);

-- Policy 3: Users can update their own pending requests (e.g., cancel)
CREATE POLICY "Users can update own pending claim requests"
ON public.vessel_claim_requests
FOR UPDATE
USING (auth.uid() = requested_by AND status = 'pending')
WITH CHECK (auth.uid() = requested_by);

-- Note: For now, we'll keep the SELECT policy simple
-- Vessel managers/admins viewing will be handled separately if needed
-- This avoids any potential recursion issues

COMMENT ON TABLE public.vessel_claim_requests IS 'Tracks vessel claim/captaincy requests. Users can request captaincy of vessels they have worked on.';

