-- Fix RLS policies for vessels table
-- Run this in your Supabase SQL Editor

-- Ensure RLS is enabled
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read their own vessels" ON vessels;
DROP POLICY IF EXISTS "Users can create their own vessels" ON vessels;
DROP POLICY IF EXISTS "Users can update their own vessels" ON vessels;
DROP POLICY IF EXISTS "Users can delete their own vessels" ON vessels;
DROP POLICY IF EXISTS "Authenticated users can read vessels" ON vessels;
DROP POLICY IF EXISTS "Authenticated users can create vessels" ON vessels;
DROP POLICY IF EXISTS "Authenticated users can update vessels" ON vessels;
DROP POLICY IF EXISTS "Authenticated users can delete vessels" ON vessels;

-- Create new policies for authenticated users
-- All authenticated users can read vessels
CREATE POLICY "Authenticated users can read vessels"
  ON vessels FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- All authenticated users can create vessels
CREATE POLICY "Authenticated users can create vessels"
  ON vessels FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- All authenticated users can update vessels
CREATE POLICY "Authenticated users can update vessels"
  ON vessels FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- All authenticated users can delete vessels
CREATE POLICY "Authenticated users can delete vessels"
  ON vessels FOR DELETE
  USING (auth.uid() IS NOT NULL);

