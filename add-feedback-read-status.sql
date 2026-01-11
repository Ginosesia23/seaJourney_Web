-- Add admin_response_read_at column to feedback table
-- This allows users to mark admin responses as read, clearing the notification badge

ALTER TABLE public.feedback
ADD COLUMN IF NOT EXISTS admin_response_read_at TIMESTAMPTZ NULL;

-- Add index for efficient queries on unread responses
CREATE INDEX IF NOT EXISTS idx_feedback_unread_response 
ON public.feedback(user_id) 
WHERE admin_response IS NOT NULL AND admin_response_read_at IS NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.feedback.admin_response_read_at IS 
'Timestamp when the user marked the admin response as read. NULL means the response is unread.';
