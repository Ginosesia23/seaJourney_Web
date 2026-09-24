-- Explicit Training Record (Digital TRB Companion) sign-off authority.
-- Additive. Does NOT grant authority from vessel_manager_id or testimonials alone.
-- Run AFTER vessel assignments / vessel_manager_id / digital TRB companion exist.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vessel_trb_signoff_authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Explicit permission flag (always true for active rows; kept for future flags)
  can_sign_training_records boolean NOT NULL DEFAULT true,
  -- Optional future scope (NULL = all programmes on this vessel)
  program_id uuid REFERENCES public.trb_programs(id) ON DELETE CASCADE,
  program_version_id uuid REFERENCES public.trb_program_versions(id) ON DELETE CASCADE,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessel_trb_auth_valid_range CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT vessel_trb_auth_revoked_until CHECK (
    revoked_at IS NULL OR valid_until IS NULL OR revoked_at >= valid_from
  )
);

COMMENT ON TABLE public.vessel_trb_signoff_authorities IS
  'Explicit SeaJourney Digital TRB Companion sign-off grants. Vessel managers and officers are NOT assessors unless granted here.';

-- One active (non-revoked) grant per user per vessel (programme-scoped rows allowed as separate grants)
CREATE UNIQUE INDEX IF NOT EXISTS vessel_trb_signoff_authorities_active_uidx
  ON public.vessel_trb_signoff_authorities (
    vessel_id,
    user_id,
    COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(program_version_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS vessel_trb_signoff_authorities_vessel_idx
  ON public.vessel_trb_signoff_authorities (vessel_id)
  WHERE revoked_at IS NULL AND can_sign_training_records = true;

CREATE INDEX IF NOT EXISTS vessel_trb_signoff_authorities_user_idx
  ON public.vessel_trb_signoff_authorities (user_id)
  WHERE revoked_at IS NULL;

-- Snapshot columns on immutable sign-offs (nullable for historical rows)
ALTER TABLE public.trb_signoffs
  ADD COLUMN IF NOT EXISTS authority_id uuid
    REFERENCES public.vessel_trb_signoff_authorities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authority_source text,
  ADD COLUMN IF NOT EXISTS signer_vessel_role text,
  ADD COLUMN IF NOT EXISTS is_vessel_manager_snapshot boolean;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.vessel_trb_signoff_authorities ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active grants for vessels they belong to
DROP POLICY IF EXISTS vessel_trb_auth_select_related ON public.vessel_trb_signoff_authorities;
CREATE POLICY vessel_trb_auth_select_related
  ON public.vessel_trb_signoff_authorities FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.vessels v
      WHERE v.id = vessel_id
        AND (
          v.vessel_manager_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role = 'vessel'
              AND u.active_vessel_id = v.id
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.vessel_assignments va
      WHERE va.vessel_id = vessel_trb_signoff_authorities.vessel_id
        AND va.user_id = auth.uid()
        AND va.end_date IS NULL
    )
  );

-- No authenticated INSERT/UPDATE/DELETE — service-role APIs only

-- Lightweight authority audit (enrollment_id is NOT NULL on trb_audit_events)
CREATE TABLE IF NOT EXISTS public.vessel_trb_authority_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  authority_id uuid REFERENCES public.vessel_trb_signoff_authorities(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vessel_trb_authority_events_vessel_idx
  ON public.vessel_trb_authority_events (vessel_id, created_at DESC);

ALTER TABLE public.vessel_trb_authority_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vessel_trb_authority_events_select_manager ON public.vessel_trb_authority_events;
CREATE POLICY vessel_trb_authority_events_select_manager
  ON public.vessel_trb_authority_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vessels v
      WHERE v.id = vessel_id
        AND (
          v.vessel_manager_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role = 'vessel'
              AND u.active_vessel_id = v.id
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
          )
        )
    )
  );

COMMIT;
