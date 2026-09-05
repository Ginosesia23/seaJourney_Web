-- Vessel must approve crew before personal plans pause under the vessel subscription.
-- Stops self-assigning to a subscribed vessel to pause personal billing without consent.

CREATE OR REPLACE FUNCTION public.is_admin_user_safe()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.users WHERE id = auth.uid();
  RETURN COALESCE(user_role = 'admin', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin_user_safe() TO authenticated;

CREATE TABLE IF NOT EXISTS public.vessel_plan_coverage_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  crew_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  vessel_name TEXT NOT NULL DEFAULT '',
  vessel_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected

  notes TEXT NULL,
  rejection_reason TEXT NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,

  -- Avoid re-emailing the vessel on every assignment reconcile
  vessel_notified_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vessel_plan_coverage_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT vessel_plan_coverage_unique_crew_vessel
    UNIQUE (crew_user_id, vessel_id)
);

CREATE INDEX IF NOT EXISTS idx_vessel_plan_coverage_vessel_status
  ON public.vessel_plan_coverage_requests (vessel_id, status);

CREATE INDEX IF NOT EXISTS idx_vessel_plan_coverage_manager_status
  ON public.vessel_plan_coverage_requests (vessel_manager_id, status);

CREATE INDEX IF NOT EXISTS idx_vessel_plan_coverage_crew
  ON public.vessel_plan_coverage_requests (crew_user_id, status);

DROP TRIGGER IF EXISTS trg_vessel_plan_coverage_updated_at
  ON public.vessel_plan_coverage_requests;
CREATE TRIGGER trg_vessel_plan_coverage_updated_at
BEFORE UPDATE ON public.vessel_plan_coverage_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vessel_plan_coverage_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Crew can view own plan coverage requests"
  ON public.vessel_plan_coverage_requests;
CREATE POLICY "Crew can view own plan coverage requests"
ON public.vessel_plan_coverage_requests
FOR SELECT
TO authenticated
USING (auth.uid() = crew_user_id);

DROP POLICY IF EXISTS "Vessel managers can view plan coverage for their vessels"
  ON public.vessel_plan_coverage_requests;
CREATE POLICY "Vessel managers can view plan coverage for their vessels"
ON public.vessel_plan_coverage_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = vessel_manager_id
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'vessel'
      AND u.active_vessel_id = vessel_plan_coverage_requests.vessel_id
  )
  OR EXISTS (
    SELECT 1 FROM public.vessels v
    WHERE v.id = vessel_plan_coverage_requests.vessel_id
      AND v.vessel_manager_id = auth.uid()
  )
  OR public.is_admin_user_safe()
);

DROP POLICY IF EXISTS "Vessel managers can update plan coverage requests"
  ON public.vessel_plan_coverage_requests;
CREATE POLICY "Vessel managers can update plan coverage requests"
ON public.vessel_plan_coverage_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = vessel_manager_id
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'vessel'
      AND u.active_vessel_id = vessel_plan_coverage_requests.vessel_id
  )
  OR EXISTS (
    SELECT 1 FROM public.vessels v
    WHERE v.id = vessel_plan_coverage_requests.vessel_id
      AND v.vessel_manager_id = auth.uid()
  )
  OR public.is_admin_user_safe()
)
WITH CHECK (
  auth.uid() = vessel_manager_id
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'vessel'
      AND u.active_vessel_id = vessel_plan_coverage_requests.vessel_id
  )
  OR EXISTS (
    SELECT 1 FROM public.vessels v
    WHERE v.id = vessel_plan_coverage_requests.vessel_id
      AND v.vessel_manager_id = auth.uid()
  )
  OR public.is_admin_user_safe()
);

COMMENT ON TABLE public.vessel_plan_coverage_requests IS
  'Crew requests to fall under a Vessel Professional/Fleet subscription. Personal billing pauses only after vessel approval.';

-- Grandfather anyone already paused so they are not suddenly resumed.
INSERT INTO public.vessel_plan_coverage_requests (
  crew_user_id,
  vessel_id,
  vessel_name,
  vessel_manager_id,
  status,
  notes,
  reviewed_at,
  vessel_notified_at
)
SELECT
  u.id,
  u.personal_plan_paused_for_vessel_id,
  COALESCE(v.name, 'Vessel'),
  v.vessel_manager_id,
  'approved',
  'Grandfathered from existing personal-plan pause',
  COALESCE(u.personal_plan_paused_at, NOW()),
  COALESCE(u.personal_plan_paused_at, NOW())
FROM public.users u
LEFT JOIN public.vessels v ON v.id = u.personal_plan_paused_for_vessel_id
WHERE u.personal_plan_paused_at IS NOT NULL
  AND u.personal_plan_paused_for_vessel_id IS NOT NULL
ON CONFLICT (crew_user_id, vessel_id) DO NOTHING;
