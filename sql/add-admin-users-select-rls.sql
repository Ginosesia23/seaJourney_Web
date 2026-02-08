-- Allow admins to view all user profiles
-- This enables the admin crew page to display all users with vessel assignments
-- Uses a function to avoid recursion issues with self-joins

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
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- Create policy that allows admins to view all users (except vessel accounts are handled separately)
-- Uses the function to avoid recursion
CREATE POLICY "Admins can view all users"
ON public.users
FOR SELECT
USING (public.is_admin_user());

COMMENT ON POLICY "Admins can view all users" ON public.users IS 'Allows admin users to view all user profiles. This is necessary for the admin crew page to display all users with vessel assignments. Uses a function to avoid RLS recursion.';
