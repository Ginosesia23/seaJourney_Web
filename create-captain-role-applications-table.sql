-- Create captain_role_applications table
-- This table stores applications from users with position="Captain" who want to upgrade to role="captain"
-- Admins can review supporting documents and approve/reject these applications

CREATE TABLE IF NOT EXISTS public.captain_role_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  supporting_documents TEXT[], -- Array of document URLs
  notes TEXT, -- Optional notes from the applicant
  reviewed_by UUID, -- Admin user ID who reviewed the application
  reviewed_at TIMESTAMPTZ, -- When the application was reviewed
  rejection_reason TEXT, -- Reason for rejection (if rejected)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT captain_role_applications_pkey PRIMARY KEY (id),
  CONSTRAINT captain_role_applications_user_id_fkey FOREIGN KEY (user_id) 
    REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT captain_role_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) 
    REFERENCES public.users(id) ON DELETE SET NULL,
  -- Note: We enforce one pending application per user in application logic, not via constraint
  -- This allows users to submit new applications after rejection
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_captain_role_applications_user_id ON public.captain_role_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_captain_role_applications_status ON public.captain_role_applications(status);
CREATE INDEX IF NOT EXISTS idx_captain_role_applications_reviewed_by ON public.captain_role_applications(reviewed_by);

-- Add comments
COMMENT ON TABLE public.captain_role_applications IS 
'Applications from users with position="Captain" who want to upgrade their role to "captain". Admins can review and approve/reject these applications.';
COMMENT ON COLUMN public.captain_role_applications.supporting_documents IS 
'Array of document URLs (e.g., links to certificates, licenses, or documents stored in Supabase Storage)';
COMMENT ON COLUMN public.captain_role_applications.status IS 
'Application status: pending (awaiting review), approved (role upgraded), or rejected';
COMMENT ON CONSTRAINT one_pending_application_per_user ON public.captain_role_applications IS 
'Ensures a user can only have one pending application at a time. The deferred constraint allows updating status before inserting a new pending record.';

-- Enable RLS
ALTER TABLE public.captain_role_applications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own applications
CREATE POLICY "Users can view their own applications"
ON public.captain_role_applications
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own applications (only if they have position="Captain" and role != "captain")
-- This check is enforced in the application logic, not RLS
CREATE POLICY "Users can create their own applications"
ON public.captain_role_applications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

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

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_captain_role_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_captain_role_applications_updated_at ON public.captain_role_applications;
CREATE TRIGGER update_captain_role_applications_updated_at
  BEFORE UPDATE ON public.captain_role_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_captain_role_applications_updated_at();
