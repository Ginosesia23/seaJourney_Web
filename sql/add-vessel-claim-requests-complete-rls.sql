-- Complete RLS policies for vessel_claim_requests table
-- This file consolidates all policies including admin access
-- Run this to ensure all policies are set up correctly

-- Enable RLS if not already enabled
ALTER TABLE public.vessel_claim_requests ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Users can insert own claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Users can update own pending claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Vessel managers can view claim requests for their vessel" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Admins can view all claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Admins can update all claim requests" ON public.vessel_claim_requests;

-- Drop functions if they exist
DROP FUNCTION IF EXISTS public.can_view_vessel_claim_requests(UUID);
DROP FUNCTION IF EXISTS public.is_admin_user();

-- Policy 1: Users can view their own claim requests
CREATE POLICY "Users can view own claim requests"
ON public.vessel_claim_requests
FOR SELECT
USING (auth.uid() = requested_by);

-- Policy 2: Users can insert their own claim requests
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

-- Policy 4: Admins can view all claim requests
-- This policy checks if the user is an admin by reading their own row from users table
-- Users should always be able to read their own row (basic RLS policy)
-- If recursion occurs, it means the users table RLS policy is too complex and needs to be simplified
CREATE POLICY "Admins can view all claim requests"
ON public.vessel_claim_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Policy 5: Admins can update any claim request (to approve/reject)
CREATE POLICY "Admins can update all claim requests"
ON public.vessel_claim_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

COMMENT ON TABLE public.vessel_claim_requests IS 'Tracks vessel claim/captaincy requests. Users can request captaincy of vessels they have worked on.';
COMMENT ON POLICY "Users can view own claim requests" ON public.vessel_claim_requests IS 'Allows users to view their own claim requests';
COMMENT ON POLICY "Users can insert own claim requests" ON public.vessel_claim_requests IS 'Allows users to create their own claim requests';
COMMENT ON POLICY "Users can update own pending claim requests" ON public.vessel_claim_requests IS 'Allows users to update their own pending requests';
COMMENT ON POLICY "Admins can view all claim requests" ON public.vessel_claim_requests IS 'Allows admin users to view all vessel claim requests. Checks user role from users table. Requires users table RLS to allow reading own row.';
COMMENT ON POLICY "Admins can update all claim requests" ON public.vessel_claim_requests IS 'Allows admin users to approve or reject any vessel claim request. Checks user role from users table. Requires users table RLS to allow reading own row.';

