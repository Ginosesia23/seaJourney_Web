-- Multi-task (batch) TRB sign-off requests.
-- Additive; preserves existing single-task trb_signoff_requests / trb_signoffs.
-- Run AFTER sql/expand-trb-training-record-system.sql

BEGIN;

-- ─── Parent batch request (holds the public review token) ───────────────────

CREATE TABLE IF NOT EXISTS public.trb_batch_signoff_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.trb_enrollments(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  signer_email text NOT NULL,
  signer_name text,
  signer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  signer_assignment_id uuid,
  required_signer_role text NOT NULL DEFAULT 'captain',
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'completed', 'expired', 'cancelled'
    )),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  viewed_at timestamptz,
  optional_message text,
  overall_feedback text,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  vessel_name_snapshot text,
  candidate_assignment_id uuid,
  eligibility_snapshot jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trb_batch_signoff_requests_idempotency_uidx
  ON public.trb_batch_signoff_requests (enrollment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS trb_batch_signoff_requests_signer_idx
  ON public.trb_batch_signoff_requests (lower(signer_email), created_at DESC);

CREATE INDEX IF NOT EXISTS trb_batch_signoff_requests_enrollment_idx
  ON public.trb_batch_signoff_requests (enrollment_id, created_at DESC);

-- ─── Batch items (one per selected task) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trb_batch_signoff_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_request_id uuid NOT NULL REFERENCES public.trb_batch_signoff_requests(id) ON DELETE CASCADE,
  task_progress_id uuid NOT NULL REFERENCES public.trb_task_progress(id) ON DELETE CASCADE,
  -- Shadow single-task request created for FK compatibility with trb_signoffs
  signoff_request_id uuid REFERENCES public.trb_signoff_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'approved', 'changes_requested', 'rejected', 'cancelled'
    )),
  decision_notes text,
  sort_order integer NOT NULL DEFAULT 0,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_request_id, task_progress_id)
);

-- A task may only appear in one pending batch item at a time
CREATE UNIQUE INDEX IF NOT EXISTS trb_batch_signoff_items_progress_pending_uidx
  ON public.trb_batch_signoff_items (task_progress_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS trb_batch_signoff_items_batch_idx
  ON public.trb_batch_signoff_items (batch_request_id, sort_order);

-- Link single-task rows back to a batch (nullable; single-task requests stay null)
ALTER TABLE public.trb_signoff_requests
  ADD COLUMN IF NOT EXISTS batch_request_id uuid
    REFERENCES public.trb_batch_signoff_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS batch_item_id uuid
    REFERENCES public.trb_batch_signoff_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_batch_shadow boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS trb_signoff_requests_batch_idx
  ON public.trb_signoff_requests (batch_request_id)
  WHERE batch_request_id IS NOT NULL;

-- Audit events may reference a batch
ALTER TABLE public.trb_audit_events
  ADD COLUMN IF NOT EXISTS batch_request_id uuid
    REFERENCES public.trb_batch_signoff_requests(id) ON DELETE SET NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.trb_batch_signoff_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trb_batch_signoff_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trb_batch_signoff_requests_select_own ON public.trb_batch_signoff_requests;
CREATE POLICY trb_batch_signoff_requests_select_own
  ON public.trb_batch_signoff_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.trb_enrollments e
      WHERE e.id = enrollment_id AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) = lower(trb_batch_signoff_requests.signer_email)
    )
  );

DROP POLICY IF EXISTS trb_batch_signoff_items_select_own ON public.trb_batch_signoff_items;
CREATE POLICY trb_batch_signoff_items_select_own
  ON public.trb_batch_signoff_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trb_batch_signoff_requests b
      WHERE b.id = batch_request_id
        AND (
          b.requested_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.trb_enrollments e
            WHERE e.id = b.enrollment_id AND e.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND lower(u.email) = lower(b.signer_email)
          )
        )
    )
  );

-- No authenticated INSERT/UPDATE/DELETE — service-role only (APIs)

COMMIT;
