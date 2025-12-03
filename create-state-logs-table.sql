-- Update daily_state_logs table to include created_at and updated_at columns
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add created_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'daily_state_logs' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.daily_state_logs 
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    RAISE NOTICE 'created_at column added to daily_state_logs.';
  END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'daily_state_logs' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.daily_state_logs 
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    RAISE NOTICE 'updated_at column added to daily_state_logs.';
  END IF;
END $$;

-- Create or replace the trigger function for updated_at (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_daily_state_logs_updated_at ON public.daily_state_logs;
CREATE TRIGGER update_daily_state_logs_updated_at 
    BEFORE UPDATE ON public.daily_state_logs
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Ensure RLS is enabled
ALTER TABLE public.daily_state_logs ENABLE ROW LEVEL SECURITY;

-- Update RLS Policies (drop and recreate to ensure they're correct)
DROP POLICY IF EXISTS "Users can read their own daily state logs" ON public.daily_state_logs;
DROP POLICY IF EXISTS "Users can create their own daily state logs" ON public.daily_state_logs;
DROP POLICY IF EXISTS "Users can update their own daily state logs" ON public.daily_state_logs;
DROP POLICY IF EXISTS "Users can delete their own daily state logs" ON public.daily_state_logs;

CREATE POLICY "Users can read their own daily state logs"
  ON public.daily_state_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own daily state logs"
  ON public.daily_state_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily state logs"
  ON public.daily_state_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily state logs"
  ON public.daily_state_logs FOR DELETE
  USING (auth.uid() = user_id);

