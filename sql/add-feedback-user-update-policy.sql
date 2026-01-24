-- Add RLS policy to allow users to update their own feedback
-- Specifically to mark admin responses as read

-- Users can update their own feedback (to mark responses as read)
CREATE POLICY "Users can update own feedback"
ON public.feedback
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
