-- Rename start_date and end_date to issue_date and expire_date in visa_tracker table
-- Note: This will fail if columns are already renamed, which is fine

-- Check if columns need to be renamed (only rename if start_date exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'visa_tracker' 
    AND column_name = 'start_date'
  ) THEN
    ALTER TABLE public.visa_tracker RENAME COLUMN start_date TO issue_date;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'visa_tracker' 
    AND column_name = 'end_date'
  ) THEN
    ALTER TABLE public.visa_tracker RENAME COLUMN end_date TO expire_date;
  END IF;
END $$;

-- Update constraint name if it exists
ALTER TABLE public.visa_tracker 
DROP CONSTRAINT IF EXISTS end_after_start;

-- Add new constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'expire_after_issue' 
    AND conrelid = 'public.visa_tracker'::regclass
  ) THEN
    ALTER TABLE public.visa_tracker 
    ADD CONSTRAINT expire_after_issue CHECK (expire_date >= issue_date);
  END IF;
END $$;

-- Update index name
DROP INDEX IF EXISTS idx_visa_tracker_end_date;
CREATE INDEX IF NOT EXISTS idx_visa_tracker_expire_date ON public.visa_tracker(expire_date);

-- Update comments
COMMENT ON COLUMN public.visa_tracker.issue_date IS 'Date when the visa was issued';
COMMENT ON COLUMN public.visa_tracker.expire_date IS 'Date when the visa expires';

