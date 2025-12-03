-- Update state_logs table to match new format:
-- id: uuid
-- user_id: uuid
-- vessel_id: uuid
-- state: text
-- log_date: date (rename from 'date')
-- created_at: timestamptz
-- updated_at: timestamptz

DO $$
BEGIN
    -- Step 1: Add user_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'state_logs' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE state_logs 
        ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'user_id column added.';
    END IF;
    
    -- Step 2: Rename 'date' column to 'log_date' if it exists and log_date doesn't
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'state_logs' 
        AND column_name = 'date'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'state_logs' 
        AND column_name = 'log_date'
    ) THEN
        ALTER TABLE state_logs 
        RENAME COLUMN date TO log_date;
        RAISE NOTICE 'date column renamed to log_date.';
    END IF;
    
    -- Step 3: Add created_at if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'state_logs' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE state_logs 
        ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        RAISE NOTICE 'created_at column added.';
    END IF;
    
    -- Step 4: Add updated_at if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'state_logs' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE state_logs 
        ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        RAISE NOTICE 'updated_at column added.';
    END IF;
    
    -- Step 5: Update the unique constraint to include user_id
    -- Drop old constraint if it exists
    ALTER TABLE state_logs DROP CONSTRAINT IF EXISTS state_logs_vessel_id_date_key;
    ALTER TABLE state_logs DROP CONSTRAINT IF EXISTS state_logs_user_id_vessel_id_log_date_key;
    
    -- Add new unique constraint with user_id
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'state_logs_user_id_vessel_id_log_date_key' 
        AND table_name = 'state_logs'
    ) THEN
        ALTER TABLE state_logs 
        ADD CONSTRAINT state_logs_user_id_vessel_id_log_date_key 
        UNIQUE (user_id, vessel_id, log_date);
        RAISE NOTICE 'Unique constraint added on (user_id, vessel_id, log_date).';
    END IF;
    
    -- Step 6: Make user_id NOT NULL (after populating it with data)
    -- Note: You may need to populate existing records with user_id before running this
    -- Uncomment after data migration:
    -- ALTER TABLE state_logs ALTER COLUMN user_id SET NOT NULL;
    
    -- Step 7: Update indexes
    DROP INDEX IF EXISTS idx_state_logs_date;
    CREATE INDEX IF NOT EXISTS idx_state_logs_user_id ON state_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_state_logs_vessel_id ON state_logs(vessel_id);
    CREATE INDEX IF NOT EXISTS idx_state_logs_log_date ON state_logs(log_date);
    
    RAISE NOTICE 'Indexes updated.';
    
END $$;

-- Update the trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS update_state_logs_updated_at ON state_logs;
CREATE TRIGGER update_state_logs_updated_at 
    BEFORE UPDATE ON state_logs
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Update RLS policies to include user_id check
DROP POLICY IF EXISTS "Authenticated users can manage state logs" ON state_logs;

CREATE POLICY "Users can read their own state logs"
  ON state_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own state logs"
  ON state_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own state logs"
  ON state_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own state logs"
  ON state_logs FOR DELETE
  USING (auth.uid() = user_id);

RAISE NOTICE 'Migration complete. Please populate user_id for existing records before setting it to NOT NULL.';

