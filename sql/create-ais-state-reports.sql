-- AIS wrong-state reports: vessel / crew Premium users flag incorrect AIS-derived daily states.

CREATE TABLE IF NOT EXISTS public.ais_state_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reported_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Whose daily log this report is about (vessel manager for vessel AIS, crew user for crew AIS)
  subject_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,

  account_type TEXT NOT NULL CHECK (account_type IN ('vessel', 'crew')),
  log_date DATE NOT NULL,

  detected_state TEXT NULL
    CHECK (
      detected_state IS NULL
      OR detected_state IN ('underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard')
    ),
  suggested_state TEXT NOT NULL
    CHECK (suggested_state IN ('underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard')),

  ais_nav_status TEXT NULL,
  ais_speed_kn NUMERIC NULL,
  notes TEXT NULL,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_notes TEXT NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ais_state_reports_detected_differs_suggested
    CHECK (detected_state IS NULL OR detected_state <> suggested_state)
);

-- One open/reviewing report per reporter + vessel + subject + day
CREATE UNIQUE INDEX IF NOT EXISTS uq_ais_state_reports_open_day
  ON public.ais_state_reports (reported_by_user_id, vessel_id, subject_user_id, log_date)
  WHERE status IN ('open', 'reviewing');

CREATE INDEX IF NOT EXISTS idx_ais_state_reports_status
  ON public.ais_state_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ais_state_reports_vessel
  ON public.ais_state_reports (vessel_id);
CREATE INDEX IF NOT EXISTS idx_ais_state_reports_reported_by
  ON public.ais_state_reports (reported_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ais_state_reports_log_date
  ON public.ais_state_reports (log_date DESC);

DROP TRIGGER IF EXISTS trg_ais_state_reports_updated_at ON public.ais_state_reports;
CREATE TRIGGER trg_ais_state_reports_updated_at
BEFORE UPDATE ON public.ais_state_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ais_state_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ais state reports" ON public.ais_state_reports;
DROP POLICY IF EXISTS "Users can create ais state reports" ON public.ais_state_reports;
DROP POLICY IF EXISTS "Admins can view all ais state reports" ON public.ais_state_reports;
DROP POLICY IF EXISTS "Admins can update ais state reports" ON public.ais_state_reports;

CREATE POLICY "Users can view own ais state reports"
ON public.ais_state_reports
FOR SELECT
USING (auth.uid() = reported_by_user_id);

CREATE POLICY "Users can create ais state reports"
ON public.ais_state_reports
FOR INSERT
WITH CHECK (auth.uid() = reported_by_user_id AND auth.uid() = subject_user_id);

CREATE POLICY "Admins can view all ais state reports"
ON public.ais_state_reports
FOR SELECT
USING (public.is_admin_user_safe());

CREATE POLICY "Admins can update ais state reports"
ON public.ais_state_reports
FOR UPDATE
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

COMMENT ON TABLE public.ais_state_reports IS
  'User reports that AIS-derived daily state was wrong. Reviewed by admins.';
COMMENT ON COLUMN public.ais_state_reports.account_type IS
  'vessel = vessel-account AIS tracking; crew = crew Premium live AIS';
COMMENT ON COLUMN public.ais_state_reports.detected_state IS
  'Daily state AIS had set (or null if none logged yet)';
COMMENT ON COLUMN public.ais_state_reports.suggested_state IS
  'What the reporter believes the correct state should be';
