-- Create visa_tracker table to track visa days for users
CREATE TABLE IF NOT EXISTS public.visa_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  area_name TEXT NOT NULL, -- e.g., "Schengen Area", "USA", "Australia"
  issue_date DATE NOT NULL, -- Date when the visa was issued
  expire_date DATE NOT NULL, -- Date when the visa expires
  total_days INTEGER NOT NULL, -- Total days allowed (calculated from issue_date to expire_date)
  notes TEXT NULL, -- Optional notes about the visa
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Validation
  CONSTRAINT expire_after_issue CHECK (expire_date >= issue_date),
  CONSTRAINT positive_days CHECK (total_days > 0)
);

CREATE INDEX IF NOT EXISTS idx_visa_tracker_user_id ON public.visa_tracker(user_id);
CREATE INDEX IF NOT EXISTS idx_visa_tracker_expire_date ON public.visa_tracker(expire_date);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_visa_tracker_updated_at ON public.visa_tracker;
CREATE TRIGGER trg_visa_tracker_updated_at
BEFORE UPDATE ON public.visa_tracker
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.visa_tracker ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own visa entries" ON public.visa_tracker;
DROP POLICY IF EXISTS "Users can insert own visa entries" ON public.visa_tracker;
DROP POLICY IF EXISTS "Users can update own visa entries" ON public.visa_tracker;
DROP POLICY IF EXISTS "Users can delete own visa entries" ON public.visa_tracker;
DROP POLICY IF EXISTS "Admins can view all visa entries" ON public.visa_tracker;

-- Users can view their own visa entries
CREATE POLICY "Users can view own visa entries"
ON public.visa_tracker
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own visa entries
CREATE POLICY "Users can insert own visa entries"
ON public.visa_tracker
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own visa entries
CREATE POLICY "Users can update own visa entries"
ON public.visa_tracker
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own visa entries
CREATE POLICY "Users can delete own visa entries"
ON public.visa_tracker
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can view all visa entries
CREATE POLICY "Admins can view all visa entries"
ON public.visa_tracker
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Create visa_entries table to track individual days spent in the area
CREATE TABLE IF NOT EXISTS public.visa_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  visa_id UUID NOT NULL REFERENCES public.visa_tracker(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  entry_date DATE NOT NULL, -- The date the user was in the area
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One entry per visa per date
  UNIQUE(visa_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_visa_entries_visa_id ON public.visa_entries(visa_id);
CREATE INDEX IF NOT EXISTS idx_visa_entries_user_id ON public.visa_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_visa_entries_date ON public.visa_entries(entry_date);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_visa_entries_updated_at ON public.visa_entries;
CREATE TRIGGER trg_visa_entries_updated_at
BEFORE UPDATE ON public.visa_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.visa_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for visa_entries
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own visa entry dates" ON public.visa_entries;
DROP POLICY IF EXISTS "Users can insert own visa entry dates" ON public.visa_entries;
DROP POLICY IF EXISTS "Users can update own visa entry dates" ON public.visa_entries;
DROP POLICY IF EXISTS "Users can delete own visa entry dates" ON public.visa_entries;
DROP POLICY IF EXISTS "Admins can view all visa entry dates" ON public.visa_entries;

-- Users can view their own visa entry dates
CREATE POLICY "Users can view own visa entry dates"
ON public.visa_entries
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own visa entry dates
CREATE POLICY "Users can insert own visa entry dates"
ON public.visa_entries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own visa entry dates
CREATE POLICY "Users can update own visa entry dates"
ON public.visa_entries
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own visa entry dates
CREATE POLICY "Users can delete own visa entry dates"
ON public.visa_entries
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can view all visa entry dates
CREATE POLICY "Admins can view all visa entry dates"
ON public.visa_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMENT ON TABLE public.visa_tracker IS 'Tracks visa days for users in specific areas/regions';
COMMENT ON COLUMN public.visa_tracker.area_name IS 'Name of the area/region (e.g., Schengen Area, USA, Australia)';
COMMENT ON COLUMN public.visa_tracker.issue_date IS 'Date when the visa was issued';
COMMENT ON COLUMN public.visa_tracker.expire_date IS 'Date when the visa expires';
COMMENT ON COLUMN public.visa_tracker.total_days IS 'Total days allowed on this visa (from issue_date to expire_date)';
COMMENT ON TABLE public.visa_entries IS 'Tracks individual days when users were in visa areas';
COMMENT ON COLUMN public.visa_entries.entry_date IS 'The date the user was in the visa area';

