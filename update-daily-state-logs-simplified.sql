-- Update daily_state_logs table to simplified structure
-- user_id, vessel_id, date, state (only state can be updated)
-- Run this in your Supabase SQL Editor

DO $$
BEGIN
    -- Step 1: Add user_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE daily_state_logs 
        ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        
        -- For existing records, we need to set a user_id
        -- You may need to update this based on your data
        -- For now, we'll set it to NULL and you'll need to populate it manually
        RAISE NOTICE 'user_id column added. Please update existing records with appropriate user_id values.';
    END IF;
    
    -- Step 2: Add state column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'state'
    ) THEN
        ALTER TABLE daily_state_logs 
        ADD COLUMN state TEXT CHECK (state IN ('underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard'));
        
        -- Set a default state for existing records
        UPDATE daily_state_logs SET state = 'underway' WHERE state IS NULL;
        
        -- Make it NOT NULL after setting defaults
        ALTER TABLE daily_state_logs 
        ALTER COLUMN state SET NOT NULL;
        
        RAISE NOTICE 'state column added with default value.';
    END IF;
    
    -- Step 3: Drop position column if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'position'
    ) THEN
        ALTER TABLE daily_state_logs DROP COLUMN position;
        RAISE NOTICE 'position column removed.';
    END IF;
    
    -- Step 4: Drop notes column if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_state_logs' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE daily_state_logs DROP COLUMN notes;
        RAISE NOTICE 'notes column removed.';
    END IF;
    
    -- Step 5: Drop old unique constraint if it exists
    ALTER TABLE daily_state_logs DROP CONSTRAINT IF EXISTS daily_state_logs_vessel_id_date_key;
    
    -- Step 6: Make user_id NOT NULL (after you've populated it)
    -- Uncomment this after you've updated all existing records with user_id
    -- ALTER TABLE daily_state_logs ALTER COLUMN user_id SET NOT NULL;
    
    -- Step 7: Add new unique constraint on (user_id, vessel_id, date)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'daily_state_logs_user_vessel_date_key' 
        AND table_name = 'daily_state_logs'
    ) THEN
        ALTER TABLE daily_state_logs 
        ADD CONSTRAINT daily_state_logs_user_vessel_date_key UNIQUE (user_id, vessel_id, date);
        
        RAISE NOTICE 'Unique constraint added on (user_id, vessel_id, date).';
    END IF;
    
    -- Step 8: Create indexes
    CREATE INDEX IF NOT EXISTS idx_daily_state_logs_user_id ON daily_state_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_daily_state_logs_vessel_id ON daily_state_logs(vessel_id);
    CREATE INDEX IF NOT EXISTS idx_daily_state_logs_date ON daily_state_logs(date);
    
    RAISE NOTICE 'Indexes created.';
    
END $$;

-- Update RLS policies
DROP POLICY IF EXISTS "Authenticated users can manage daily state logs" ON daily_state_logs;

CREATE POLICY "Users can read their own daily state logs"
  ON daily_state_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own daily state logs"
  ON daily_state_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily state logs"
  ON daily_state_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily state logs"
  ON daily_state_logs FOR DELETE
  USING (auth.uid() = user_id);

