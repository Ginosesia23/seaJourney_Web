-- Create oow_applications table to store MCA MSF 4274 CoC oral exam applications
-- Mirrors nav_watch_applications so crew can save and re-download packs

CREATE TABLE IF NOT EXISTS public.oow_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  certificate_type TEXT NOT NULL,
  training_route TEXT NOT NULL DEFAULT 'examination',
  personal_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  sea_service_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  supporting_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'oow_applications_user_id_fkey'
  ) THEN
    ALTER TABLE public.oow_applications
    ADD CONSTRAINT oow_applications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_oow_applications_user_id ON public.oow_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_oow_applications_created_at ON public.oow_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oow_applications_certificate_type ON public.oow_applications(certificate_type);

ALTER TABLE public.oow_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own oow applications" ON public.oow_applications;
CREATE POLICY "Users can view their own oow applications"
ON public.oow_applications
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own oow applications" ON public.oow_applications;
CREATE POLICY "Users can create their own oow applications"
ON public.oow_applications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own oow applications" ON public.oow_applications;
CREATE POLICY "Users can update their own oow applications"
ON public.oow_applications
FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own oow applications" ON public.oow_applications;
CREATE POLICY "Users can delete their own oow applications"
ON public.oow_applications
FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all oow applications" ON public.oow_applications;
CREATE POLICY "Admins can view all oow applications"
ON public.oow_applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMENT ON TABLE public.oow_applications IS
  'Stores MCA MSF 4274 Certificate of Competency (OOW/Chief Mate/Master) oral exam applications';
COMMENT ON COLUMN public.oow_applications.training_route IS
  'MCA training route used for sea-service target: examination | foundation_degree | hnc_hnd | amet | other';
COMMENT ON COLUMN public.oow_applications.personal_details IS
  'JSONB personal/home address and declaration metadata used to regenerate the PDF';
COMMENT ON COLUMN public.oow_applications.sea_service_records IS
  'JSONB array of sea service rows written into MSF 4274';
COMMENT ON COLUMN public.oow_applications.supporting_evidence IS
  'JSONB checklist of NOE supporting documents the applicant confirms they hold';
