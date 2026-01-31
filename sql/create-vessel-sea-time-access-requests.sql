-- Create vessel_sea_time_access_requests table for vessel managers to request access to view crew members' sea time
-- When approved, vessel managers can view the crew member's sea time breakdown

CREATE TABLE IF NOT EXISTS public.vessel_sea_time_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  vessel_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crew_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  vessel_name TEXT NOT NULL, -- Store vessel name for easy display
  
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  
  -- Optional notes from vessel manager
  notes TEXT NULL,
  
  -- Optional rejection reason from crew member
  rejection_reason TEXT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Validation
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Ensure one request per vessel-crew pair
  CONSTRAINT unique_vessel_crew_pair UNIQUE (vessel_user_id, crew_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_access_vessel_user_id ON public.vessel_sea_time_access_requests(vessel_user_id);
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_access_crew_user_id ON public.vessel_sea_time_access_requests(crew_user_id);
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_access_vessel_id ON public.vessel_sea_time_access_requests(vessel_id);
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_access_status ON public.vessel_sea_time_access_requests(status);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_vessel_sea_time_access_updated_at ON public.vessel_sea_time_access_requests;
CREATE TRIGGER trg_vessel_sea_time_access_updated_at
BEFORE UPDATE ON public.vessel_sea_time_access_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.vessel_sea_time_access_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Vessel managers can view their own requests
CREATE POLICY "Vessel managers can view own requests"
ON public.vessel_sea_time_access_requests
FOR SELECT
USING (auth.uid() = vessel_user_id);

-- Vessel managers can create their own requests
CREATE POLICY "Vessel managers can create own requests"
ON public.vessel_sea_time_access_requests
FOR INSERT
WITH CHECK (auth.uid() = vessel_user_id);

-- Crew members can view requests for them
CREATE POLICY "Crew members can view requests for them"
ON public.vessel_sea_time_access_requests
FOR SELECT
USING (auth.uid() = crew_user_id);

-- Crew members can update pending requests for them (approve/reject)
CREATE POLICY "Crew members can update own requests"
ON public.vessel_sea_time_access_requests
FOR UPDATE
USING (auth.uid() = crew_user_id AND status = 'pending')
WITH CHECK (auth.uid() = crew_user_id AND status IN ('approved', 'rejected'));

-- Admins can view all requests
CREATE POLICY "Admins can view all requests"
ON public.vessel_sea_time_access_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

COMMENT ON TABLE public.vessel_sea_time_access_requests IS 'Tracks requests from vessel managers to view crew members sea time. When approved, vessel managers can view the crew members sea time breakdown.';
