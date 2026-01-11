-- Create feedback table for users to send messages to admins
-- Users can report problems or request new features

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'other')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  
  admin_response TEXT NULL,
  admin_response_at TIMESTAMPTZ NULL,
  responded_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_feedback_updated_at ON public.feedback;
CREATE TRIGGER trg_feedback_updated_at
BEFORE UPDATE ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can create feedback" ON public.feedback;
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.feedback;
DROP POLICY IF EXISTS "Admins can update feedback" ON public.feedback;

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
ON public.feedback
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create feedback
CREATE POLICY "Users can create feedback"
ON public.feedback
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create a SECURITY DEFINER function to safely check admin status
CREATE OR REPLACE FUNCTION public.is_admin_user_safe()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Use SECURITY DEFINER to bypass RLS on users table
  SELECT role INTO user_role
  FROM public.users
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_role = 'admin', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function (if not already granted)
GRANT EXECUTE ON FUNCTION public.is_admin_user_safe() TO authenticated;

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
ON public.feedback
FOR SELECT
USING (public.is_admin_user_safe());

-- Admins can update feedback (to respond, change status, etc.)
CREATE POLICY "Admins can update feedback"
ON public.feedback
FOR UPDATE
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

COMMENT ON TABLE public.feedback IS 
'Feedback table for users to report bugs, request features, or send other messages to admins.';
COMMENT ON COLUMN public.feedback.type IS 
'Type of feedback: bug (problem found), feature (new feature request), or other';
COMMENT ON COLUMN public.feedback.status IS 
'Status: open (new), in_progress (being worked on), resolved (fixed/implemented), closed (dismissed)';
COMMENT ON COLUMN public.feedback.admin_response IS 
'Admin response to the feedback';
COMMENT ON COLUMN public.feedback.responded_by IS 
'Admin user ID who responded to this feedback';
