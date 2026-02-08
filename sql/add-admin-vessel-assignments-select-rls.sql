-- Allow admins to view all vessel assignments
-- This enables the admin crew page to fetch all assignments and then look up user info

-- First, create a function to check if user is admin (avoids recursion)
-- Only create if it doesn't exist (might be created by other migrations)
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- Drop the policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Admins can view all vessel assignments" ON public.vessel_assignments;

-- Create policy that allows admins to view all vessel assignments
-- Uses the function to avoid recursion
CREATE POLICY "Admins can view all vessel assignments"
ON public.vessel_assignments
FOR SELECT
USING (public.is_admin_user());

COMMENT ON POLICY "Admins can view all vessel assignments" ON public.vessel_assignments IS 'Allows admin users to view all vessel assignments. This is necessary for the admin crew page to fetch all assignments and then look up user information. Uses a function to avoid RLS recursion.';
