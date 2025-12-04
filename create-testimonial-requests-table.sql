-- Testimonial Requests Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS testimonial_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  captain_email TEXT NOT NULL,
  captain_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  testimonial_content TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_user_id ON testimonial_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_vessel_id ON testimonial_requests(vessel_id);
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_status ON testimonial_requests(status);
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_captain_email ON testimonial_requests(captain_email);

-- Enable Row Level Security
ALTER TABLE testimonial_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for testimonial_requests
-- Users can manage their own testimonial requests
CREATE POLICY "Users can read their own testimonial requests"
  ON testimonial_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own testimonial requests"
  ON testimonial_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own testimonial requests"
  ON testimonial_requests FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: Captains (identified by email) will need a separate mechanism to update testimonials
-- This could be done via a server action or API route that verifies the captain's email
-- For now, users can update their own requests (captains would use a separate interface)

-- Trigger to automatically update updated_at
CREATE TRIGGER update_testimonial_requests_updated_at BEFORE UPDATE ON testimonial_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

