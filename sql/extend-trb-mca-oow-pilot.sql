-- Extend Digital TRB Companion for MCA OOW (Yachts) one-section pilot.
-- Does NOT modify the fictional demonstration programme.
-- Run AFTER sql/create-digital-trb-companion.sql

BEGIN;

-- ─── Programme / version source metadata ───────────────────────────────────

ALTER TABLE public.trb_programs
  ADD COLUMN IF NOT EXISTS source_authority text,
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_published_at date,
  ADD COLUMN IF NOT EXISTS source_license text,
  ADD COLUMN IF NOT EXISTS source_license_url text,
  ADD COLUMN IF NOT EXISTS recognition_status text NOT NULL DEFAULT 'not_approved'
    CHECK (recognition_status IN (
      'not_approved', 'pending_review', 'recognised', 'withdrawn'
    )),
  ADD COLUMN IF NOT EXISTS recognised_by text,
  ADD COLUMN IF NOT EXISTS recognised_at timestamptz;

ALTER TABLE public.trb_program_versions
  ADD COLUMN IF NOT EXISTS source_version_reference text,
  ADD COLUMN IF NOT EXISTS source_checked_at date,
  ADD COLUMN IF NOT EXISTS attribution_html text,
  ADD COLUMN IF NOT EXISTS pilot_disclaimer text;

ALTER TABLE public.trb_sections
  ADD COLUMN IF NOT EXISTS source_section_reference text,
  ADD COLUMN IF NOT EXISTS source_page_start integer,
  ADD COLUMN IF NOT EXISTS source_page_end integer;

ALTER TABLE public.trb_tasks
  ADD COLUMN IF NOT EXISTS source_task_reference text,
  ADD COLUMN IF NOT EXISTS source_page_start integer,
  ADD COLUMN IF NOT EXISTS source_page_end integer,
  ADD COLUMN IF NOT EXISTS source_text_hash text,
  ADD COLUMN IF NOT EXISTS seajourney_guidance text,
  ADD COLUMN IF NOT EXISTS official_signer_instruction text;

-- Candidate consent on enrolment (required for MCA pilot)
ALTER TABLE public.trb_enrollments
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS consent_disclaimer_version text,
  ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_payload jsonb;

-- ─── Parallel official-book confirmations ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trb_parallel_book_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_progress_id uuid NOT NULL REFERENCES public.trb_task_progress(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_role text NOT NULL CHECK (reporter_role IN ('candidate', 'captain')),
  reported_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reported_by_email text,
  official_book_status text NOT NULL DEFAULT 'not_recorded'
    CHECK (official_book_status IN (
      'not_recorded', 'awaiting_signature', 'signed', 'discrepancy_reported'
    )),
  official_book_signed_at timestamptz,
  official_book_signer_name text,
  official_book_signer_rank text,
  candidate_declaration text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_progress_id, reporter_role)
);

CREATE INDEX IF NOT EXISTS trb_parallel_book_progress_idx
  ON public.trb_parallel_book_confirmations (task_progress_id);

-- ─── Pilot feedback ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trb_pilot_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.trb_enrollments(id) ON DELETE CASCADE,
  task_progress_id uuid REFERENCES public.trb_task_progress(id) ON DELETE SET NULL,
  signoff_request_id uuid REFERENCES public.trb_signoff_requests(id) ON DELETE SET NULL,
  submitted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitter_role text NOT NULL CHECK (submitter_role IN ('candidate', 'captain', 'administrator')),
  submitter_email text,
  ease_of_use_rating integer CHECK (ease_of_use_rating BETWEEN 1 AND 5),
  clarity_rating integer CHECK (clarity_rating BETWEEN 1 AND 5),
  confidence_rating integer CHECK (confidence_rating BETWEEN 1 AND 5),
  time_to_complete_minutes integer CHECK (time_to_complete_minutes IS NULL OR time_to_complete_minutes >= 0),
  what_worked text,
  what_was_unclear text,
  what_would_you_change text,
  encountered_connectivity_issue boolean,
  would_use_again boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trb_pilot_feedback_enrollment_idx
  ON public.trb_pilot_feedback (enrollment_id, created_at DESC);

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.trb_parallel_book_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_pilot_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trb_parallel_book_select_own ON public.trb_parallel_book_confirmations;
CREATE POLICY trb_parallel_book_select_own
  ON public.trb_parallel_book_confirmations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trb_task_progress p
      JOIN public.trb_enrollments e ON e.id = p.enrollment_id
      WHERE p.id = task_progress_id AND e.user_id = auth.uid()
    )
    OR reported_by_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS trb_parallel_book_insert_candidate ON public.trb_parallel_book_confirmations;
CREATE POLICY trb_parallel_book_insert_candidate
  ON public.trb_parallel_book_confirmations FOR INSERT TO authenticated
  WITH CHECK (
    reporter_role = 'candidate'
    AND candidate_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trb_task_progress p
      JOIN public.trb_enrollments e ON e.id = p.enrollment_id
      WHERE p.id = task_progress_id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS trb_parallel_book_update_candidate ON public.trb_parallel_book_confirmations;
CREATE POLICY trb_parallel_book_update_candidate
  ON public.trb_parallel_book_confirmations FOR UPDATE TO authenticated
  USING (
    reporter_role = 'candidate'
    AND candidate_id = auth.uid()
  )
  WITH CHECK (
    reporter_role = 'candidate'
    AND candidate_id = auth.uid()
  );

DROP POLICY IF EXISTS trb_pilot_feedback_select_own ON public.trb_pilot_feedback;
CREATE POLICY trb_pilot_feedback_select_own
  ON public.trb_pilot_feedback FOR SELECT TO authenticated
  USING (
    submitted_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trb_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS trb_pilot_feedback_insert_candidate ON public.trb_pilot_feedback;
CREATE POLICY trb_pilot_feedback_insert_candidate
  ON public.trb_pilot_feedback FOR INSERT TO authenticated
  WITH CHECK (
    submitter_role IN ('candidate', 'administrator')
    AND submitted_by_user_id = auth.uid()
    AND (
      submitter_role = 'administrator'
      OR EXISTS (
        SELECT 1 FROM public.trb_enrollments e
        WHERE e.id = enrollment_id AND e.user_id = auth.uid()
      )
    )
  );

-- Catalogue SELECT already covers pilot versions with status = 'pilot'.
-- Discovery of the MCA pilot is enforced in application code (flag + allowlist).

COMMIT;
