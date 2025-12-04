-- Testimonials Table
-- Run this in your Supabase SQL Editor
-- This matches the Testimonial interface structure

CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  at_sea_days INTEGER NOT NULL,
  standby_days INTEGER NOT NULL,
  yard_days INTEGER NOT NULL,
  leave_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_captain', 'pending_official', 'approved', 'rejected')),
  pdf_url TEXT,
  captain_name TEXT,
  captain_email TEXT,
  official_body TEXT,
  official_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_testimonials_user_id ON testimonials(user_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_vessel_id ON testimonials(vessel_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials(status);
CREATE INDEX IF NOT EXISTS idx_testimonials_captain_email ON testimonials(captain_email);

-- Enable Row Level Security
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for testimonials
-- Users can manage their own testimonials
CREATE POLICY "Users can read their own testimonials"
  ON testimonials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own testimonials"
  ON testimonials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own testimonials"
  ON testimonials FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own testimonials"
  ON testimonials FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_testimonials_updated_at BEFORE UPDATE ON testimonials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

