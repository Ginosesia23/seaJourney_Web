-- Create vessel_captaincy table to track vessel captaincy/ownership requests
CREATE TABLE IF NOT EXISTS public.vessel_captaincy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One pending request per vessel per user (using partial unique index instead)
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_vessel_captaincy_vessel_id ON public.vessel_captaincy(vessel_id);
CREATE INDEX IF NOT EXISTS idx_vessel_captaincy_user_id ON public.vessel_captaincy(user_id);
CREATE INDEX IF NOT EXISTS idx_vessel_captaincy_status ON public.vessel_captaincy(status);
-- Partial unique index to ensure one pending request per user-vessel pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_vessel_captaincy_pending_unique 
  ON public.vessel_captaincy(vessel_id, user_id) 
  WHERE status = 'pending';

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_vessel_captaincy_updated_at ON public.vessel_captaincy;
CREATE TRIGGER trg_vessel_captaincy_updated_at
BEFORE UPDATE ON public.vessel_captaincy
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vessel_captaincy ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view captaincy requests for vessels they're requesting captaincy for
CREATE POLICY "Users can view own captaincy requests"
ON public.vessel_captaincy
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own captaincy requests
CREATE POLICY "Users can insert own captaincy requests"
ON public.vessel_captaincy
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending requests (e.g., cancel)
CREATE POLICY "Users can update own pending requests"
ON public.vessel_captaincy
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.vessel_captaincy IS 'Tracks captaincy/ownership requests for vessels. Users with captain role/position can request captaincy.';
