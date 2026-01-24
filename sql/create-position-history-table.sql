-- Create position_history table to track user position changes over time
-- This allows users to maintain a history of their positions when they get promoted

CREATE TABLE IF NOT EXISTS public.position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  position TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL, -- NULL = current position
  
  vessel_id UUID NULL REFERENCES public.vessels(id) ON DELETE SET NULL, -- Optional: link to vessel if position is vessel-specific
  notes TEXT NULL, -- Optional notes about the position change
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Validation
  CONSTRAINT end_after_start CHECK (end_date IS NULL OR end_date >= start_date),
  
  -- Ensure no overlapping positions (one position at a time)
  CONSTRAINT no_overlapping_positions EXCLUDE USING GIST (
    user_id WITH =,
    daterange(start_date, COALESCE(end_date, 'infinity'::date), '[)') WITH &&
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_position_history_user_id ON public.position_history(user_id);
CREATE INDEX IF NOT EXISTS idx_position_history_vessel_id ON public.position_history(vessel_id);
CREATE INDEX IF NOT EXISTS idx_position_history_current ON public.position_history(user_id) WHERE end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_position_history_dates ON public.position_history(user_id, start_date DESC, end_date NULLS LAST);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_position_history_updated_at ON public.position_history;
CREATE TRIGGER trg_position_history_updated_at
BEFORE UPDATE ON public.position_history
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.position_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own position history"
ON public.position_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own position history"
ON public.position_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own position history"
ON public.position_history
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own position history"
ON public.position_history
FOR DELETE
USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE public.position_history IS 'Tracks user position changes over time, allowing users to maintain a history when promoted';
COMMENT ON COLUMN public.position_history.end_date IS 'NULL indicates the current/active position';
