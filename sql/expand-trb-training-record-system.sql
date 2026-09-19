-- Expand Training Record system: ready_for_assessment, official/SeaJourney fields,
-- sign-off snapshots, durable rate limits, admin programme RLS.
-- Additive; does not alter testimonial tables.
-- Run AFTER sql/extend-trb-mca-oow-pilot.sql (or create-digital-trb-companion.sql)

BEGIN;

-- ─── Task progress statuses ─────────────────────────────────────────────────

ALTER TABLE public.trb_task_progress
  DROP CONSTRAINT IF EXISTS trb_task_progress_status_check;

ALTER TABLE public.trb_task_progress
  ADD CONSTRAINT trb_task_progress_status_check
  CHECK (status IN (
    'not_started',
    'in_progress',
    'ready_for_assessment',
    'awaiting_signoff',
    'changes_requested',
    'approved',
    'rejected',
    'superseded'
  ));

ALTER TABLE public.trb_task_progress
  ADD COLUMN IF NOT EXISTS ready_for_assessment_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS trb_task_progress_idempotency_uidx
  ON public.trb_task_progress (enrollment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── Official vs SeaJourney task fields ─────────────────────────────────────

ALTER TABLE public.trb_tasks
  ADD COLUMN IF NOT EXISTS official_title text,
  ADD COLUMN IF NOT EXISTS official_description text,
  ADD COLUMN IF NOT EXISTS seajourney_summary text,
  ADD COLUMN IF NOT EXISTS seajourney_completion_guidance text,
  ADD COLUMN IF NOT EXISTS source_page_reference text,
  ADD COLUMN IF NOT EXISTS prerequisites jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.trb_tasks
SET
  official_title = COALESCE(official_title, title),
  official_description = COALESCE(official_description, description),
  seajourney_completion_guidance = COALESCE(
    seajourney_completion_guidance,
    seajourney_guidance
  ),
  source_page_reference = COALESCE(
    source_page_reference,
    CASE
      WHEN source_page_start IS NOT NULL AND source_page_end IS NOT NULL
        THEN source_page_start::text || '-' || source_page_end::text
      WHEN source_page_start IS NOT NULL THEN source_page_start::text
      ELSE NULL
    END
  )
WHERE official_title IS NULL
   OR official_description IS NULL
   OR seajourney_completion_guidance IS NULL
   OR source_page_reference IS NULL;

-- ─── Sign-off request / decision snapshots ──────────────────────────────────

ALTER TABLE public.trb_signoff_requests
  ADD COLUMN IF NOT EXISTS vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vessel_name_snapshot text,
  ADD COLUMN IF NOT EXISTS candidate_assignment_id uuid,
  ADD COLUMN IF NOT EXISTS signer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signer_assignment_id uuid,
  ADD COLUMN IF NOT EXISTS eligibility_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS replaces_request_id uuid REFERENCES public.trb_signoff_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trb_signoff_requests_idempotency_uidx
  ON public.trb_signoff_requests (task_progress_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.trb_signoffs
  ADD COLUMN IF NOT EXISTS candidate_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_name_snapshot text,
  ADD COLUMN IF NOT EXISTS program_id uuid,
  ADD COLUMN IF NOT EXISTS program_version_id uuid,
  ADD COLUMN IF NOT EXISTS section_id uuid,
  ADD COLUMN IF NOT EXISTS task_id uuid,
  ADD COLUMN IF NOT EXISTS task_source_reference text,
  ADD COLUMN IF NOT EXISTS vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vessel_name_snapshot text,
  ADD COLUMN IF NOT EXISTS candidate_assignment_id uuid,
  ADD COLUMN IF NOT EXISTS signer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signer_assignment_id uuid,
  ADD COLUMN IF NOT EXISTS evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS previous_signoff_id uuid REFERENCES public.trb_signoffs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_viewed_at timestamptz;

-- ─── Durable rate limiting (token resolve / decide) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.trb_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 1 CHECK (hit_count >= 0),
  UNIQUE (bucket_key, window_started_at)
);

CREATE INDEX IF NOT EXISTS trb_rate_limits_bucket_idx
  ON public.trb_rate_limits (bucket_key, window_started_at DESC);

ALTER TABLE public.trb_rate_limits ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: service-role only

-- ─── Admin programme management RLS ────────────────────────────────────────

DROP POLICY IF EXISTS trb_programs_admin_all ON public.trb_programs;
CREATE POLICY trb_programs_admin_all
  ON public.trb_programs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS trb_program_versions_admin_all ON public.trb_program_versions;
CREATE POLICY trb_program_versions_admin_all
  ON public.trb_program_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS trb_sections_admin_all ON public.trb_sections;
CREATE POLICY trb_sections_admin_all
  ON public.trb_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS trb_tasks_admin_all ON public.trb_tasks;
CREATE POLICY trb_tasks_admin_all
  ON public.trb_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- Allow candidates to set ready_for_assessment via RLS update WITH CHECK
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
      'not_started', 'in_progress', 'ready_for_assessment', 'awaiting_signoff',
      'changes_requested', 'rejected'
    )
  );

COMMIT;
