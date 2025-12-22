-- Add admin permissions to vessel_claim_requests RLS policies
-- This allows admins to view and update all captaincy/claim requests
-- Uses direct role check - users can always see their own row in users table

-- Drop existing admin policies if they exist
DROP POLICY IF EXISTS "Admins can view all claim requests" ON public.vessel_claim_requests;
DROP POLICY IF EXISTS "Admins can update all claim requests" ON public.vessel_claim_requests;

-- Drop the function if it exists (from previous version)
DROP FUNCTION IF EXISTS public.is_admin_user();

-- Policy 4: Admins can view all claim requests
-- Users can always see their own row in users table, so this check won't cause recursion
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

COMMENT ON POLICY "Admins can view all claim requests" ON public.vessel_claim_requests IS 'Allows admin users to view all vessel claim requests. Checks user role directly from users table.';
COMMENT ON POLICY "Admins can update all claim requests" ON public.vessel_claim_requests IS 'Allows admin users to approve or reject any vessel claim request. Checks user role directly from users table.';
