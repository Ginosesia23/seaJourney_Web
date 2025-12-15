-- Needed for GiST exclusion with UUID equality
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create set_updated_at function if it doesn't exist (used by trigger)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.vessel_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,

  start_date DATE NOT NULL,
  end_date DATE NULL, -- NULL = still active

  position TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validation
  CONSTRAINT end_after_start CHECK (end_date IS NULL OR end_date >= start_date),

  -- STRICT RULE: One vessel at a time
  -- '[)' makes end_date exclusive, allowing same-day changeovers:
  -- e.g. end Vessel A = 2025-01-10, start Vessel B = 2025-01-10 ✅ allowed
  CONSTRAINT no_overlapping_assignments EXCLUDE USING GIST (
    user_id WITH =,
    daterange(start_date, COALESCE(end_date, 'infinity'::date), '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_va_user_id ON public.vessel_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_va_vessel_id ON public.vessel_assignments(vessel_id);
CREATE INDEX IF NOT EXISTS idx_va_active_user ON public.vessel_assignments(user_id) WHERE end_date IS NULL;

-- updated_at trigger (reuses public.set_updated_at() if you already created it)
DROP TRIGGER IF EXISTS trg_vessel_assignments_updated_at ON public.vessel_assignments;
CREATE TRIGGER trg_vessel_assignments_updated_at
BEFORE UPDATE ON public.vessel_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vessel_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assignments"
ON public.vessel_assignments
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assignments"
ON public.vessel_assignments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assignments"
ON public.vessel_assignments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assignments"
ON public.vessel_assignments
FOR DELETE
USING (auth.uid() = user_id);

COMMENT ON TABLE public.vessel_assignments IS
'Tracks when users join/leave vessels. NULL end_date means active. Enforces one vessel at a time per user; end_date is exclusive to allow same-day changeovers.';
