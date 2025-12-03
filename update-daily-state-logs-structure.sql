-- Update daily_state_logs table structure
-- Remove end_date, created_at, updated_at and change start_date to date
-- Run this in your Supabase SQL Editor

DO $$
BEGIN
    -- Step 1: Drop the trigger if it exists
    DROP TRIGGER IF EXISTS update_daily_state_logs_updated_at ON daily_state_logs;
    
    -- Step 2: Drop the updated_at column if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE daily_state_logs DROP COLUMN updated_at;
        RAISE NOTICE 'updated_at column removed.';
    END IF;
    
    -- Step 3: Drop the created_at column if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE daily_state_logs DROP COLUMN created_at;
        RAISE NOTICE 'created_at column removed.';
    END IF;
    
    -- Step 4: Drop the end_date column if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'end_date'
    ) THEN
        ALTER TABLE daily_state_logs DROP COLUMN end_date;
        RAISE NOTICE 'end_date column removed.';
    END IF;
    
    -- Step 5: Rename start_date to date if start_date exists and date doesn't
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'start_date'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'date'
    ) THEN
        -- Convert TIMESTAMPTZ to DATE
        ALTER TABLE daily_state_logs 
        ALTER COLUMN start_date TYPE DATE USING start_date::DATE;
        
        -- Rename the column
        ALTER TABLE daily_state_logs RENAME COLUMN start_date TO date;
        
        RAISE NOTICE 'start_date column renamed to date and converted to DATE type.';
    END IF;
    
    -- Step 6: Add unique constraint on (vessel_id, date) if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'daily_state_logs_vessel_id_date_key' 
        AND table_name = 'daily_state_logs'
    ) THEN
        ALTER TABLE daily_state_logs 
        ADD CONSTRAINT daily_state_logs_vessel_id_date_key UNIQUE (vessel_id, date);
        
        RAISE NOTICE 'Unique constraint added on (vessel_id, date).';
    END IF;
    
END $$;

