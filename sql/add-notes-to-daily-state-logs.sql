-- Add notes column to daily_state_logs table
-- This allows users to add optional notes or reminders for each date

ALTER TABLE public.daily_state_logs 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add comment
COMMENT ON COLUMN public.daily_state_logs.notes IS 
'Optional notes or reminders for this date. Users can add any additional information they want to remember.';
