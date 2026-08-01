-- Publishable professional applications (admin-defined templates) and crew progress.
-- Admins create drafts with requirements (sea time, certificates, etc.), publish them,
-- and crew start an application to track readiness against their SeaJourney records.

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  organization    TEXT NOT NULL,
  description     TEXT,
  instructions    TEXT,
  external_url    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'archived')),
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_templates_status
  ON public.application_templates(status, published_at DESC NULLS LAST);

COMMENT ON TABLE public.application_templates IS
  'Admin-defined professional application packages (e.g. PYA, Nautilus). Crew see published rows on Apply.';

CREATE OR REPLACE FUNCTION public.touch_application_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_application_templates_updated_at
  ON public.application_templates;
CREATE TRIGGER trg_application_templates_updated_at
  BEFORE UPDATE ON public.application_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_application_templates_updated_at();

-- ---------------------------------------------------------------------------
-- Requirements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_requirements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID NOT NULL REFERENCES public.application_templates(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  title             TEXT NOT NULL,
  description       TEXT,
  requirement_type  TEXT NOT NULL CHECK (requirement_type IN (
                      'profile_fields',
                      'certificate',
                      'testimonial',
                      'proof_of_service',
                      'sea_time_min',
                      'manual_checklist',
                      'external_link'
                    )),
  -- Type-specific options, e.g.:
  -- profile_fields: { "fields": ["first_name","last_name","nationality","date_of_birth","email"] }
  -- certificate:    { "minCount": 1, "certificateType": "STCW", "nameContains": "Basic", "mustNotExpired": true }
  -- testimonial:    { "minCount": 1, "status": "approved", "minAtSeaDays": 0 }
  -- proof_of_service: { "minCount": 1 }
  -- sea_time_min:   { "metric": "atSeaDays", "min": 180, "source": "testimonials" }
  -- manual_checklist: { "hint": "Upload your discharge book scan offline" }
  -- external_link:  { "url": "https://...", "label": "Official form" }
  config            JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_required       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_requirements_template
  ON public.application_requirements(template_id, sort_order);

COMMENT ON TABLE public.application_requirements IS
  'Checklist items for an application_templates row. Evaluated against crew records at runtime.';

-- ---------------------------------------------------------------------------
-- Reference files attached by admin (guides, blank forms, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_template_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.application_templates(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  content_type    TEXT,
  file_size       INT,
  uploaded_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_template_files_template
  ON public.application_template_files(template_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Crew instances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           UUID NOT NULL REFERENCES public.application_templates(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'in_progress'
                          CHECK (status IN ('in_progress', 'ready', 'withdrawn')),
  -- Requirement IDs the crew member has manually marked complete (manual_checklist type).
  completed_manual_ids  UUID[] NOT NULL DEFAULT '{}',
  progress_pct          INT NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_applications_user
  ON public.crew_applications(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_applications_template
  ON public.crew_applications(template_id, status);

CREATE OR REPLACE FUNCTION public.touch_crew_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crew_applications_updated_at
  ON public.crew_applications;
CREATE TRIGGER trg_crew_applications_updated_at
  BEFORE UPDATE ON public.crew_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_crew_applications_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.application_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_template_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_applications ENABLE ROW LEVEL SECURITY;

-- Ensure safe admin helper exists (used across admin tables).
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

-- Templates: published readable by any authenticated user; admin full CRUD
DROP POLICY IF EXISTS "Anyone authenticated can read published templates"
  ON public.application_templates;
CREATE POLICY "Anyone authenticated can read published templates"
ON public.application_templates FOR SELECT
USING (status = 'published' OR public.is_admin_user_safe());

DROP POLICY IF EXISTS "Admins manage application templates"
  ON public.application_templates;
CREATE POLICY "Admins manage application templates"
ON public.application_templates FOR ALL
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

-- Requirements: readable when parent template is published (or admin)
DROP POLICY IF EXISTS "Read requirements for visible templates"
  ON public.application_requirements;
CREATE POLICY "Read requirements for visible templates"
ON public.application_requirements FOR SELECT
USING (
  public.is_admin_user_safe()
  OR EXISTS (
    SELECT 1 FROM public.application_templates t
    WHERE t.id = application_requirements.template_id
      AND t.status = 'published'
  )
);

DROP POLICY IF EXISTS "Admins manage application requirements"
  ON public.application_requirements;
CREATE POLICY "Admins manage application requirements"
ON public.application_requirements FOR ALL
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

-- Template files: same visibility as templates
DROP POLICY IF EXISTS "Read files for visible templates"
  ON public.application_template_files;
CREATE POLICY "Read files for visible templates"
ON public.application_template_files FOR SELECT
USING (
  public.is_admin_user_safe()
  OR EXISTS (
    SELECT 1 FROM public.application_templates t
    WHERE t.id = application_template_files.template_id
      AND t.status = 'published'
  )
);

DROP POLICY IF EXISTS "Admins manage application template files"
  ON public.application_template_files;
CREATE POLICY "Admins manage application template files"
ON public.application_template_files FOR ALL
USING (public.is_admin_user_safe())
WITH CHECK (public.is_admin_user_safe());

-- Crew applications: own rows; admin can read all
DROP POLICY IF EXISTS "Users manage own crew applications"
  ON public.crew_applications;
CREATE POLICY "Users manage own crew applications"
ON public.crew_applications FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all crew applications"
  ON public.crew_applications;
CREATE POLICY "Admins read all crew applications"
ON public.crew_applications FOR SELECT
USING (public.is_admin_user_safe());

-- ---------------------------------------------------------------------------
-- Storage bucket for admin reference documents
-- Path: <template_id>/<filename>
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('application-template-files', 'application-template-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Read application template files" ON storage.objects;
CREATE POLICY "Read application template files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'application-template-files'
  AND (
    public.is_admin_user_safe()
    OR EXISTS (
      SELECT 1 FROM public.application_templates t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.status = 'published'
    )
  )
);

DROP POLICY IF EXISTS "Admins write application template files" ON storage.objects;
CREATE POLICY "Admins write application template files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'application-template-files'
  AND public.is_admin_user_safe()
);

DROP POLICY IF EXISTS "Admins update application template files" ON storage.objects;
CREATE POLICY "Admins update application template files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'application-template-files'
  AND public.is_admin_user_safe()
);

DROP POLICY IF EXISTS "Admins delete application template files" ON storage.objects;
CREATE POLICY "Admins delete application template files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'application-template-files'
  AND public.is_admin_user_safe()
);
