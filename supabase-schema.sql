-- Supabase Database Schema for SeaJourney
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  profile_picture TEXT,
  bio TEXT,
  registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role TEXT NOT NULL DEFAULT 'crew' CHECK (role IN ('crew', 'vessel', 'admin')),
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'past-due')),
  active_vessel_id UUID REFERENCES vessels(id) ON DELETE SET NULL,
  active_sea_service_id UUID REFERENCES sea_service_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vessels Table
CREATE TABLE IF NOT EXISTS vessels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  official_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sea Service Records Table
CREATE TABLE IF NOT EXISTS sea_service_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- State Logs Table
CREATE TABLE IF NOT EXISTS state_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vessel_id, date)
);

-- Verification Records Table
CREATE TABLE IF NOT EXISTS verification_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('testimonial', 'seatime_report')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Testimonials Table (if needed separately)
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vessels_owner_id ON vessels(owner_id);
CREATE INDEX IF NOT EXISTS idx_sea_service_vessel_id ON sea_service_records(vessel_id);
CREATE INDEX IF NOT EXISTS idx_state_logs_vessel_id ON state_logs(vessel_id);
CREATE INDEX IF NOT EXISTS idx_state_logs_date ON state_logs(date);
CREATE INDEX IF NOT EXISTS idx_verification_records_user_id ON verification_records(user_id);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sea_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Users Table Policies
CREATE POLICY "Users can read their own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Note: Admin/vessel manager listing policy removed to avoid infinite recursion
-- If needed, implement using a security definer function or store role in auth metadata
-- For now, users can only read their own profile

-- Vessels Policies
CREATE POLICY "Users can read their own vessels"
  ON vessels FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own vessels"
  ON vessels FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own vessels"
  ON vessels FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own vessels"
  ON vessels FOR DELETE
  USING (auth.uid() = owner_id);

-- Sea Service Records Policies
CREATE POLICY "Users can manage sea service for their vessels"
  ON sea_service_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vessels
      WHERE vessels.id = sea_service_records.vessel_id
      AND vessels.owner_id = auth.uid()
    )
  );

-- State Logs Policies
CREATE POLICY "Users can manage state logs for their vessels"
  ON state_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vessels
      WHERE vessels.id = state_logs.vessel_id
      AND vessels.owner_id = auth.uid()
    )
  );

-- Verification Records Policies
CREATE POLICY "Anyone can read verification records"
  ON verification_records FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create verification records"
  ON verification_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Testimonials Policies
CREATE POLICY "Users can manage their own testimonials"
  ON testimonials FOR ALL
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vessels_updated_at BEFORE UPDATE ON vessels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sea_service_records_updated_at BEFORE UPDATE ON sea_service_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_state_logs_updated_at BEFORE UPDATE ON state_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_testimonials_updated_at BEFORE UPDATE ON testimonials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

