-- Fix RLS policies for captain_role_applications to allow admins to view all fields including supporting_documents
-- This uses a SECURITY DEFINER function to avoid RLS recursion issues

-- Drop existing admin policies if they exist
DROP POLICY IF EXISTS "Admins can view all applications" ON public.captain_role_applications;
DROP POLICY IF EXISTS "Admins can update applications" ON public.captain_role_applications;

-- Create a SECURITY DEFINER function to safely check admin status
-- This avoids RLS recursion issues by bypassing RLS when checking the user's role
CREATE OR REPLACE FUNCTION public.is_admin_user_safe()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Use SECURITY DEFINER to bypass RLS on users table
  -- This allows us to check the user's role without triggering recursion
  SELECT role INTO user_role
  FROM public.users
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_role = 'admin', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_admin_user_safe() TO authenticated;

-- Policy: Admins can view all applications (with all fields including supporting_documents)
CREATE POLICY "Admins can view all applications"
ON public.captain_role_applications
FOR SELECT
USING (public.is_admin_user_safe());

-- Policy: Admins can update applications (approve/reject)
CREATE POLICY "Admins can update applications"
ON public.captain_role_applications
FOR UPDATE
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

COMMENT ON POLICY "Admins can view all applications" ON public.captain_role_applications IS 
'Allows admin users to view all captain role applications including all fields (supporting_documents, notes, etc.). Uses SECURITY DEFINER function to avoid RLS recursion.';
COMMENT ON POLICY "Admins can update applications" ON public.captain_role_applications IS 
'Allows admin users to approve or reject captain role applications. Uses SECURITY DEFINER function to avoid RLS recursion.';
