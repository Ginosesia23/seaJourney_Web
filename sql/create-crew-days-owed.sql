-- Days owed to the vessel when a crew member is manually signed off
-- during a rotation ON period (override while they should be onboard).

CREATE TABLE IF NOT EXISTS public.crew_days_owed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  crew_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  vessel_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- rotation_block = until the current onboard block ends per rota
  -- until_return = open until the crew member is toggled back onboard
  scope TEXT NOT NULL DEFAULT 'rotation_block'
    CHECK (scope IN ('rotation_block', 'until_return')),

  notes TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT crew_days_owed_end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_days_owed_crew_user_id ON public.crew_days_owed(crew_user_id);
CREATE INDEX IF NOT EXISTS idx_crew_days_owed_vessel_id ON public.crew_days_owed(vessel_id);
CREATE INDEX IF NOT EXISTS idx_crew_days_owed_dates ON public.crew_days_owed(start_date, end_date);

DROP TRIGGER IF EXISTS trg_crew_days_owed_updated_at ON public.crew_days_owed;
CREATE TRIGGER trg_crew_days_owed_updated_at
BEFORE UPDATE ON public.crew_days_owed
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crew_days_owed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vessel managers can view days owed for their vessel crew"
ON public.crew_days_owed
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_days_owed.vessel_id
  )
);

CREATE POLICY "Vessel managers can create days owed for their vessel crew"
ON public.crew_days_owed
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_days_owed.vessel_id
  )
  AND auth.uid() = vessel_user_id
);

CREATE POLICY "Vessel managers can update days owed for their vessel crew"
ON public.crew_days_owed
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_days_owed.vessel_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_days_owed.vessel_id
  )
);

CREATE POLICY "Vessel managers can delete days owed for their vessel crew"
ON public.crew_days_owed
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = crew_days_owed.vessel_id
  )
);

CREATE POLICY "Crew members can view own days owed"
ON public.crew_days_owed
FOR SELECT
USING (auth.uid() = crew_user_id);
