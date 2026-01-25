-- Add secondary_state column to daily_state_logs table
-- This allows users to mark days as "at sea" during passage interruptions
-- Available to all users (not just officers)

ALTER TABLE public.daily_state_logs 
ADD COLUMN IF NOT EXISTS is_secondary_state BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_state_logs_secondary_state 
ON public.daily_state_logs(user_id, vessel_id, is_secondary_state) 
WHERE is_secondary_state = TRUE;

-- Add comment
COMMENT ON COLUMN public.daily_state_logs.is_secondary_state IS 
'When TRUE, this date counts as "at sea" instead of standby. Used for passage interruptions (e.g., bad weather, refueling) that should count as sea time.';
