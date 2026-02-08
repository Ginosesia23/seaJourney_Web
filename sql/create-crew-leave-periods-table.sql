-- Create crew_leave_periods table for vessel managers to log leave periods for crew members
-- These periods will be excluded from sea time calculations

CREATE TABLE IF NOT EXISTS public.crew_leave_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  crew_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  vessel_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- The vessel manager who logged this
  
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  notes TEXT NULL, -- Optional notes about the leave period
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Validation
  CONSTRAINT end_after_start CHECK (end_date >= start_date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_crew_leave_periods_crew_user_id ON public.crew_leave_periods(crew_user_id);
CREATE INDEX IF NOT EXISTS idx_crew_leave_periods_vessel_id ON public.crew_leave_periods(vessel_id);
CREATE INDEX IF NOT EXISTS idx_crew_leave_periods_dates ON public.crew_leave_periods(start_date, end_date);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_crew_leave_periods_updated_at ON public.crew_leave_periods;
CREATE TRIGGER trg_crew_leave_periods_updated_at
BEFORE UPDATE ON public.crew_leave_periods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.crew_leave_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Vessel managers can view leave periods for crew members on their vessel
CREATE POLICY "Vessel managers can view leave periods for their vessel crew"
ON public.crew_leave_periods
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_leave_periods.vessel_id
  )
);

-- Vessel managers can create leave periods for crew members on their vessel
CREATE POLICY "Vessel managers can create leave periods for their vessel crew"
ON public.crew_leave_periods
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_leave_periods.vessel_id
  )
  AND auth.uid() = vessel_user_id
);

-- Vessel managers can update leave periods for crew members on their vessel
CREATE POLICY "Vessel managers can update leave periods for their vessel crew"
ON public.crew_leave_periods
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_leave_periods.vessel_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_leave_periods.vessel_id
  )
);

-- Vessel managers can delete leave periods for crew members on their vessel
CREATE POLICY "Vessel managers can delete leave periods for their vessel crew"
ON public.crew_leave_periods
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_leave_periods.vessel_id
  )
);

-- Crew members can view their own leave periods
CREATE POLICY "Crew members can view own leave periods"
ON public.crew_leave_periods
FOR SELECT
USING (auth.uid() = crew_user_id);

-- Admins can view all leave periods
CREATE POLICY "Admins can view all leave periods"
ON public.crew_leave_periods
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'admin'
  )
);
