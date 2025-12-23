-- Allow users to view profiles of captains who have active signing authority
-- on vessels they have logged time on (for testimonial requests)
-- This enables users to see captain information when requesting testimonials

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view captains for testimonial requests" ON public.users;

-- Create policy that allows users to view profiles of captains
-- who have active signing authority on vessels they have logged time on
CREATE POLICY "Users can view captains for testimonial requests"
ON public.users
FOR SELECT
USING (
  -- User can always see their own profile
  auth.uid() = id
  OR
  -- Users can see profiles of captains who have active signing authority
  -- on vessels they have logged time on (via daily_state_logs)
  EXISTS (
    SELECT 1 
    FROM public.vessel_signing_authorities vsa
    WHERE vsa.captain_user_id = users.id
    AND vsa.is_primary = true
    AND vsa.end_date IS NULL  -- Active signing authority
    AND EXISTS (
      -- User has logged time on this vessel
      SELECT 1 
      FROM public.daily_state_logs dsl
      WHERE dsl.vessel_id = vsa.vessel_id
      AND dsl.user_id = auth.uid()
    )
  )
  OR
  -- Admins can see all users
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

COMMENT ON POLICY "Users can view captains for testimonial requests" ON public.users IS 
'Allows users to view profiles of captains who have active signing authority on vessels they have logged time on. This enables testimonial request functionality where users need to see captain information.';
