-- Remove owner_id column from vessels table
-- Run this in your Supabase SQL Editor

-- Drop the owner_id column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'vessels' 
        AND column_name = 'owner_id'
    ) THEN
        -- Drop the index first
        DROP INDEX IF EXISTS idx_vessels_owner_id;
        
        -- Drop the column
        ALTER TABLE vessels DROP COLUMN owner_id;
        
        RAISE NOTICE 'owner_id column removed from vessels table.';
    ELSE
        RAISE NOTICE 'owner_id column does not exist in vessels table.';
    END IF;
END $$;

-- Update RLS policies for vessels
-- Allow all authenticated users to read/manage vessels
DROP POLICY IF EXISTS "Users can read their own vessels" ON vessels;
DROP POLICY IF EXISTS "Users can create their own vessels" ON vessels;
DROP POLICY IF EXISTS "Users can update their own vessels" ON vessels;
DROP POLICY IF EXISTS "Users can delete their own vessels" ON vessels;

-- All authenticated users can read vessels
CREATE POLICY "Authenticated users can read vessels"
  ON vessels FOR SELECT
  USING (auth.role() = 'authenticated');

-- All authenticated users can create vessels
CREATE POLICY "Authenticated users can create vessels"
  ON vessels FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- All authenticated users can update vessels
CREATE POLICY "Authenticated users can update vessels"
  ON vessels FOR UPDATE
  USING (auth.role() = 'authenticated');

-- All authenticated users can delete vessels
CREATE POLICY "Authenticated users can delete vessels"
  ON vessels FOR DELETE
  USING (auth.role() = 'authenticated');

-- Update daily state logs policies (remove owner_id check)
DROP POLICY IF EXISTS "Users can manage sea service for their vessels" ON daily_state_logs;
DROP POLICY IF EXISTS "Authenticated users can manage daily state logs" ON daily_state_logs;
CREATE POLICY "Authenticated users can manage daily state logs"
  ON daily_state_logs FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Update state logs policies (remove owner_id check)
DROP POLICY IF EXISTS "Users can manage state logs for their vessels" ON state_logs;
CREATE POLICY "Users can manage state logs for their vessels"
  ON state_logs FOR ALL
  USING (auth.role() = 'authenticated');

