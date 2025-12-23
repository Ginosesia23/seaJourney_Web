-- Add captain_user_id column to testimonials table
-- This allows us to directly link testimonials to captain user accounts
-- instead of relying solely on email matching

-- Add the column (nullable to support existing testimonials and external captains)
ALTER TABLE public.testimonials
ADD COLUMN IF NOT EXISTS captain_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_testimonials_captain_user_id 
ON public.testimonials(captain_user_id) 
WHERE captain_user_id IS NOT NULL;

-- Create index for querying by status and captain_user_id (for inbox)
CREATE INDEX IF NOT EXISTS idx_testimonials_status_captain_user_id 
ON public.testimonials(status, captain_user_id) 
WHERE captain_user_id IS NOT NULL;

-- Add comment to column
COMMENT ON COLUMN public.testimonials.captain_user_id IS 
'References the user account of the captain for this testimonial. When set, the testimonial will appear in the captain''s inbox automatically. If NULL, captain_email is used for email-based requests.';

-- Update RLS policies to allow users to create testimonials with captain_user_id
-- Users can create testimonials for any captain (the captain can then approve/reject)
-- Note: This assumes the existing RLS policy allows users to insert their own testimonials

-- Policy: Captains can view testimonials addressed to them (by captain_user_id)
DROP POLICY IF EXISTS "Captains can view testimonials addressed to them by user_id" ON public.testimonials;
CREATE POLICY "Captains can view testimonials addressed to them by user_id"
ON public.testimonials
FOR SELECT
USING (
  -- Captains can see testimonials where they are the captain_user_id
  captain_user_id = auth.uid()
  OR
  -- Admins can see all testimonials
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Users can create testimonials with captain_user_id
-- This allows any user to send a testimonial request to any captain
-- The captain will then see it in their inbox and can approve/reject
DROP POLICY IF EXISTS "Users can create testimonials with captain_user_id" ON public.testimonials;
CREATE POLICY "Users can create testimonials with captain_user_id"
ON public.testimonials
FOR INSERT
WITH CHECK (
  -- Users can create testimonials for themselves (user_id = auth.uid())
  user_id = auth.uid()
  AND
  -- If captain_user_id is set, it must be a valid user
  (captain_user_id IS NULL OR EXISTS (
    SELECT 1 FROM public.users WHERE id = captain_user_id
  ))
);

-- Policy: Users can update their own testimonials (before captain responds)
-- This allows users to edit draft testimonials or cancel pending ones
DROP POLICY IF EXISTS "Users can update own pending testimonials" ON public.testimonials;
CREATE POLICY "Users can update own pending testimonials"
ON public.testimonials
FOR UPDATE
USING (
  -- Users can update their own testimonials if status is draft or pending
  user_id = auth.uid() 
  AND status IN ('draft', 'pending_captain')
)
WITH CHECK (
  user_id = auth.uid()
);

-- Policy: Captains can update testimonials addressed to them
-- This allows captains to approve/reject testimonials in their inbox
DROP POLICY IF EXISTS "Captains can update testimonials addressed to them" ON public.testimonials;
CREATE POLICY "Captains can update testimonials addressed to them"
ON public.testimonials
FOR UPDATE
USING (
  -- Captains can update testimonials where they are the captain_user_id
  captain_user_id = auth.uid()
  AND status = 'pending_captain'
)
WITH CHECK (
  captain_user_id = auth.uid()
  AND status IN ('approved', 'rejected')
);
