-- Add start_date field to users table for vessel accounts
-- This allows vessel accounts to set their official start date
-- and restricts state changes to dates from this start date onwards

-- Add the start_date column (nullable date field)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS start_date DATE;

-- Add comment to explain the field
COMMENT ON COLUMN public.users.start_date IS 'Official start date for vessel accounts. Vessel accounts can only change states from this date onwards. Only applicable to users with role="vessel".';

