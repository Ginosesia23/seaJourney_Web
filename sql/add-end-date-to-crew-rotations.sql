-- Add optional end_date to crew_rotations
-- Run once against your Supabase project after create-crew-rotations.sql

ALTER TABLE crew_rotations
  ADD COLUMN IF NOT EXISTS end_date date;
