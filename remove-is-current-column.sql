-- Remove is_current column from daily_state_logs table
-- Run this in your Supabase SQL Editor

-- Drop the is_current column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'is_current'
    ) THEN
        ALTER TABLE daily_state_logs DROP COLUMN is_current;
        RAISE NOTICE 'is_current column removed from daily_state_logs table.';
    ELSE
        RAISE NOTICE 'is_current column does not exist in daily_state_logs table.';
    END IF;
END $$;

-- Note: After running this, the "current" status of a record is determined by:
-- - If end_date IS NULL → the record is current
-- - If end_date IS NOT NULL → the record is completed/past

