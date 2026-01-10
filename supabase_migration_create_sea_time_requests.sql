-- Create sea_time_requests table for crew members to request sea time from vessels
-- When approved, vessel's state logs for the date range will be copied to the crew member

CREATE TABLE IF NOT EXISTS public.sea_time_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  crew_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  
  -- Optional notes from crew member
  notes TEXT NULL,
  
  -- Optional rejection reason from vessel manager
  rejection_reason TEXT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Validation
  CONSTRAINT end_after_start CHECK (end_date >= start_date),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sea_time_requests_crew_user_id ON public.sea_time_requests(crew_user_id);
CREATE INDEX IF NOT EXISTS idx_sea_time_requests_vessel_id ON public.sea_time_requests(vessel_id);
CREATE INDEX IF NOT EXISTS idx_sea_time_requests_status ON public.sea_time_requests(status);
CREATE INDEX IF NOT EXISTS idx_sea_time_requests_vessel_status ON public.sea_time_requests(vessel_id, status);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_sea_time_requests_updated_at ON public.sea_time_requests;
CREATE TRIGGER trg_sea_time_requests_updated_at
BEFORE UPDATE ON public.sea_time_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.sea_time_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Crew members can view their own requests
CREATE POLICY "Crew members can view own requests"
ON public.sea_time_requests
FOR SELECT
USING (auth.uid() = crew_user_id);

-- Crew members can create their own requests
CREATE POLICY "Crew members can create own requests"
ON public.sea_time_requests
FOR INSERT
WITH CHECK (auth.uid() = crew_user_id);

-- Crew members can update their own pending requests (e.g., cancel)
CREATE POLICY "Crew members can update own pending requests"
ON public.sea_time_requests
FOR UPDATE
USING (auth.uid() = crew_user_id AND status = 'pending')
WITH CHECK (auth.uid() = crew_user_id AND status = 'pending');

-- Vessel managers can view requests for their vessel
CREATE POLICY "Vessel managers can view requests for their vessel"
ON public.sea_time_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND (
      (users.role = 'vessel' AND users.active_vessel_id = sea_time_requests.vessel_id)
      OR (users.role = 'captain' AND users.active_vessel_id = sea_time_requests.vessel_id)
      OR users.role = 'admin'
    )
  )
);

-- Vessel managers can approve/reject requests for their vessel
CREATE POLICY "Vessel managers can approve/reject requests"
ON public.sea_time_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND (
      (users.role = 'vessel' AND users.active_vessel_id = sea_time_requests.vessel_id)
      OR (users.role = 'captain' AND users.active_vessel_id = sea_time_requests.vessel_id)
      OR users.role = 'admin'
    )
  )
  AND sea_time_requests.status = 'pending'
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND (
      (users.role = 'vessel' AND users.active_vessel_id = sea_time_requests.vessel_id)
      OR (users.role = 'captain' AND users.active_vessel_id = sea_time_requests.vessel_id)
      OR users.role = 'admin'
    )
  )
  AND sea_time_requests.status IN ('approved', 'rejected')
);

COMMENT ON TABLE public.sea_time_requests IS 'Tracks requests from crew members to copy vessel sea time logs. When approved, vessel state logs for the date range are copied to the crew member.';

