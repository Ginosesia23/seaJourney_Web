-- Add recipient_id to feedback for admin-to-user messages
-- When set: message is from admin (user_id) to the recipient (recipient_id)
-- When NULL: classic user-to-admin feedback (user_id = submitter)

ALTER TABLE public.feedback
ADD COLUMN IF NOT EXISTS recipient_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_recipient_id ON public.feedback(recipient_id);

COMMENT ON COLUMN public.feedback.recipient_id IS
'When set, this row is an admin message to this user. user_id is the admin who sent it. When NULL, normal feedback from user_id to admins.';

-- Allow users to see feedback where they are the recipient (messages sent to them)
DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback;
CREATE POLICY "Users can view own feedback"
ON public.feedback
FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = recipient_id);
