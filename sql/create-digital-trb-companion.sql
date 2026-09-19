-- Digital TRB Companion (Phase 1) — demonstration programme only.
-- Not an MCA/PYA-approved electronic Training Record Book.
--
-- Run in Supabase SQL editor after review.

BEGIN;

-- ─── Programs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trb_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  programme_type text NOT NULL DEFAULT 'demonstration',
  issuing_body text,
  is_official boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trb_program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.trb_programs(id) ON DELETE CASCADE,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pilot', 'active', 'retired')),
  effective_from date,
  effective_to date,
  disclaimer text NOT NULL DEFAULT
    'Demonstration content only. This is not the official MCA/PYA OOW 3000 Training Record Book.',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (program_id, version)
);

CREATE TABLE IF NOT EXISTS public.trb_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_version_id uuid NOT NULL REFERENCES public.trb_program_versions(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.trb_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.trb_sections(id) ON DELETE CASCADE,
  task_code text NOT NULL,
  title text NOT NULL,
  description text,
  evidence_guidance text,
  required_signer_role text NOT NULL DEFAULT 'captain',
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  UNIQUE (section_id, task_code)
);

CREATE TABLE IF NOT EXISTS public.trb_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  program_version_id uuid NOT NULL REFERENCES public.trb_program_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'withdrawn')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trb_enrollments_active_unique
  ON public.trb_enrollments (user_id, program_version_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.trb_task_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.trb_enrollments(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.trb_tasks(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'not_started', 'in_progress', 'awaiting_signoff',
      'changes_requested', 'approved', 'rejected'
    )),
  candidate_notes text,
  claimed_completed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.trb_task_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_progress_id uuid NOT NULL REFERENCES public.trb_task_progress(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0),
  evidence_type text NOT NULL DEFAULT 'document',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.officer_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  rank text,
  coc_number text,
  issuing_authority text,
  verification_status text NOT NULL DEFAULT 'self_declared'
    CHECK (verification_status IN (
      'unverified', 'self_declared', 'pending_review', 'verified', 'rejected'
    )),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS officer_credentials_email_idx
  ON public.officer_credentials (lower(email));

CREATE TABLE IF NOT EXISTS public.trb_signoff_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_progress_id uuid NOT NULL REFERENCES public.trb_task_progress(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  signer_email text NOT NULL,
  signer_name text,
  required_signer_role text NOT NULL DEFAULT 'captain',
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'approved', 'changes_requested', 'rejected', 'expired', 'cancelled'
    )),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trb_signoff_requests_progress_pending_idx
  ON public.trb_signoff_requests (task_progress_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS trb_signoff_requests_token_hash_idx
  ON public.trb_signoff_requests (token_hash);

CREATE TABLE IF NOT EXISTS public.trb_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signoff_request_id uuid NOT NULL UNIQUE REFERENCES public.trb_signoff_requests(id) ON DELETE RESTRICT,
  task_progress_id uuid NOT NULL REFERENCES public.trb_task_progress(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_rank text,
  signer_coc_number text,
  signer_issuing_authority text,
  signer_verification_status text NOT NULL DEFAULT 'self_declared',
  signer_declaration text NOT NULL,
  decision_notes text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  record_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trb_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.trb_enrollments(id) ON DELETE CASCADE,
  task_progress_id uuid REFERENCES public.trb_task_progress(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email text,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trb_audit_events_enrollment_idx
  ON public.trb_audit_events (enrollment_id, created_at DESC);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.trb_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_program_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_task_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_signoff_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_audit_events ENABLE ROW LEVEL SECURITY;

-- Catalog readable by authenticated users (pilot programmes)
DROP POLICY IF EXISTS trb_programs_select_authenticated ON public.trb_programs;
CREATE POLICY trb_programs_select_authenticated
  ON public.trb_programs FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS trb_program_versions_select_authenticated ON public.trb_program_versions;
CREATE POLICY trb_program_versions_select_authenticated
  ON public.trb_program_versions FOR SELECT TO authenticated
  USING (status IN ('pilot', 'active'));

DROP POLICY IF EXISTS trb_sections_select_authenticated ON public.trb_sections;
CREATE POLICY trb_sections_select_authenticated
  ON public.trb_sections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trb_program_versions v
      WHERE v.id = program_version_id AND v.status IN ('pilot', 'active')
    )
  );

DROP POLICY IF EXISTS trb_tasks_select_authenticated ON public.trb_tasks;
CREATE POLICY trb_tasks_select_authenticated
  ON public.trb_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trb_sections s
      JOIN public.trb_program_versions v ON v.id = s.program_version_id
      WHERE s.id = section_id AND v.status IN ('pilot', 'active')
    )
  );

-- Enrolments: own rows only
DROP POLICY IF EXISTS trb_enrollments_select_own ON public.trb_enrollments;
CREATE POLICY trb_enrollments_select_own
  ON public.trb_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS trb_enrollments_insert_own ON public.trb_enrollments;
CREATE POLICY trb_enrollments_insert_own
  ON public.trb_enrollments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS trb_enrollments_update_own ON public.trb_enrollments;
CREATE POLICY trb_enrollments_update_own
  ON public.trb_enrollments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Task progress: own enrolment only; cannot set approved/rejected directly
DROP POLICY IF EXISTS trb_task_progress_select_own ON public.trb_task_progress;
CREATE POLICY trb_task_progress_select_own
  ON public.trb_task_progress FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trb_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS trb_task_progress_insert_own ON public.trb_task_progress;
CREATE POLICY trb_task_progress_insert_own
  ON public.trb_task_progress FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trb_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
    AND status IN ('not_started', 'in_progress')
  );

DROP POLICY IF EXISTS trb_task_progress_update_own ON public.trb_task_progress;
CREATE POLICY trb_task_progress_update_own
  ON public.trb_task_progress FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trb_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
    AND status <> 'approved'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trb_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
    AND status IN (
      'not_started', 'in_progress', 'awaiting_signoff',
      'changes_requested', 'rejected'
    )
  );

-- Evidence: own progress only
DROP POLICY IF EXISTS trb_task_evidence_select_own ON public.trb_task_evidence;
CREATE POLICY trb_task_evidence_select_own
  ON public.trb_task_evidence FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trb_task_progress p
      JOIN public.trb_enrollments e ON e.id = p.enrollment_id
      WHERE p.id = task_progress_id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS trb_task_evidence_insert_own ON public.trb_task_evidence;
CREATE POLICY trb_task_evidence_insert_own
  ON public.trb_task_evidence FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trb_task_progress p
      JOIN public.trb_enrollments e ON e.id = p.enrollment_id
      WHERE p.id = task_progress_id
        AND e.user_id = auth.uid()
        AND p.status IN ('not_started', 'in_progress', 'changes_requested', 'rejected')
    )
  );

DROP POLICY IF EXISTS trb_task_evidence_delete_own ON public.trb_task_evidence;
CREATE POLICY trb_task_evidence_delete_own
  ON public.trb_task_evidence FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trb_task_progress p
      JOIN public.trb_enrollments e ON e.id = p.enrollment_id
      WHERE p.id = task_progress_id
        AND e.user_id = auth.uid()
        AND p.status IN ('not_started', 'in_progress', 'changes_requested', 'rejected')
    )
  );

-- Candidates may read their own requests/signoffs/audit; no direct insert of signoffs
DROP POLICY IF EXISTS trb_signoff_requests_select_own ON public.trb_signoff_requests;
CREATE POLICY trb_signoff_requests_select_own
  ON public.trb_signoff_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid());

DROP POLICY IF EXISTS trb_signoffs_select_own ON public.trb_signoffs;
CREATE POLICY trb_signoffs_select_own
  ON public.trb_signoffs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trb_task_progress p
      JOIN public.trb_enrollments e ON e.id = p.enrollment_id
      WHERE p.id = task_progress_id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS trb_audit_events_select_own ON public.trb_audit_events;
CREATE POLICY trb_audit_events_select_own
  ON public.trb_audit_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trb_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
  );

-- Own officer credentials profile rows
DROP POLICY IF EXISTS officer_credentials_select_own ON public.officer_credentials;
CREATE POLICY officer_credentials_select_own
  ON public.officer_credentials FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

DROP POLICY IF EXISTS officer_credentials_insert_own ON public.officer_credentials;
CREATE POLICY officer_credentials_insert_own
  ON public.officer_credentials FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Admin read-all for support
DROP POLICY IF EXISTS trb_enrollments_admin_select ON public.trb_enrollments;
CREATE POLICY trb_enrollments_admin_select
  ON public.trb_enrollments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- Captains list requests by email match (dashboard optional)
DROP POLICY IF EXISTS trb_signoff_requests_select_signer ON public.trb_signoff_requests;
CREATE POLICY trb_signoff_requests_select_signer
  ON public.trb_signoff_requests FOR SELECT TO authenticated
  USING (lower(signer_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

COMMIT;

-- Storage bucket (private). Uploads/downloads via service-role API routes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('trb-evidence', 'trb-evidence', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Crew read own TRB evidence'
  ) THEN
    CREATE POLICY "Crew read own TRB evidence"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'trb-evidence'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;
