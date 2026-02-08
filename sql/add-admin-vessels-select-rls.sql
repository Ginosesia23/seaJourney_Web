-- Allow admins to view all vessels
-- This enables the admin crew page to display vessel names for all crew members

-- First, check what policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'vessels';

-- Drop the policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Admins can view all vessels" ON public.vessels;

-- Create policy that allows admins to view all vessels
CREATE POLICY "Admins can view all vessels"
ON public.vessels
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

COMMENT ON POLICY "Admins can view all vessels" ON public.vessels IS 'Allows admin users to view all vessels. This is necessary for the admin crew page to display vessel names for all crew members.';
