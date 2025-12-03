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
  active_sea_service_id UUID REFERENCES daily_state_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vessels Table (vessels are shared, not owned by users)
CREATE TABLE IF NOT EXISTS vessels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('motor-yacht', 'sailing-yacht', 'catamaran', 'superyacht', 'megayacht', 'trawler', 'fishing-vessel', 'cargo-ship', 'container-ship', 'tanker', 'cruise-ship', 'ferry', 'research-vessel', 'offshore-vessel', 'other')),
  imo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily State Logs Table (records the state for a specific date)
CREATE TABLE IF NOT EXISTS daily_state_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, vessel_id, date)
);

-- State Logs Table
CREATE TABLE IF NOT EXISTS state_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard')),
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, vessel_id, date)
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
CREATE INDEX IF NOT EXISTS idx_daily_state_logs_user_id ON daily_state_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_state_logs_vessel_id ON daily_state_logs(vessel_id);
CREATE INDEX IF NOT EXISTS idx_daily_state_logs_date ON daily_state_logs(date);
CREATE INDEX IF NOT EXISTS idx_state_logs_user_id ON state_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_state_logs_vessel_id ON state_logs(vessel_id);
CREATE INDEX IF NOT EXISTS idx_state_logs_date ON state_logs(date);
CREATE INDEX IF NOT EXISTS idx_verification_records_user_id ON verification_records(user_id);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_state_logs ENABLE ROW LEVEL SECURITY;
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

-- Vessels Policies (vessels are shared, all authenticated users can manage them)
CREATE POLICY "Authenticated users can read vessels"
  ON vessels FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create vessels"
  ON vessels FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update vessels"
  ON vessels FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete vessels"
  ON vessels FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Daily State Logs Policies (users can manage their own daily state logs)
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

-- State Logs Policies (users can manage their own state logs)
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

-- Trigger for daily_state_logs updated_at
CREATE TRIGGER update_daily_state_logs_updated_at BEFORE UPDATE ON daily_state_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_state_logs_updated_at BEFORE UPDATE ON state_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_testimonials_updated_at BEFORE UPDATE ON testimonials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

