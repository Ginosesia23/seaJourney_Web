-- Harden vessel privacy: full vessels row = management-only;
-- ordinary users read public identity via vessels_public_identity.
--
-- Also rewires AIS/shared-data policies that previously did
--   EXISTS (SELECT 1 FROM vessels …)
-- under the caller's RLS (which would break once crew lose vessels SELECT).
-- Access semantics for AIS are unchanged — only the evaluation path.
--
-- Run in Supabase SQL editor after reviewing.
-- Does not drop AIS history or change subscription logic.

BEGIN;

-- Ensure RLS is on
ALTER TABLE public.vessels ENABLE ROW LEVEL SECURITY;

-- ─── Drop known overly-permissive SELECT policies (remote defaults / legacy) ─
DROP POLICY IF EXISTS "Enable read access for all users" ON public.vessels;
DROP POLICY IF EXISTS "Enable read access for all users" ON vessels;
DROP POLICY IF EXISTS "Users can view vessels" ON public.vessels;
DROP POLICY IF EXISTS "Authenticated users can view vessels" ON public.vessels;
DROP POLICY IF EXISTS "Authenticated users can read vessels" ON public.vessels;
DROP POLICY IF EXISTS "Anyone can view vessels" ON public.vessels;
DROP POLICY IF EXISTS "Public vessels are viewable by everyone" ON public.vessels;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.vessels;
DROP POLICY IF EXISTS "vessels_select_authenticated" ON public.vessels;
DROP POLICY IF EXISTS "Crew can view vessels" ON public.vessels;
DROP POLICY IF EXISTS "Users can view all vessels" ON public.vessels;
DROP POLICY IF EXISTS "Assigned crew can view vessels" ON public.vessels;
DROP POLICY IF EXISTS "Captains can view vessels" ON public.vessels;
DROP POLICY IF EXISTS "Crew and captains can view vessels" ON public.vessels;

-- Overly broad UPDATE (any authenticated user) — replace with manager/admin only
DROP POLICY IF EXISTS "Authenticated users can update vessels" ON public.vessels;
DROP POLICY IF EXISTS "Users can update vessels" ON public.vessels;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.vessels;

-- Keep / recreate admin SELECT
DROP POLICY IF EXISTS "Admins can view all vessels" ON public.vessels;
CREATE POLICY "Admins can view all vessels"
ON public.vessels
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'admin'
  )
);

-- Managers: linked via vessel_manager_id OR vessel-role active_vessel_id
DROP POLICY IF EXISTS "Vessel managers can view their vessel" ON public.vessels;
CREATE POLICY "Vessel managers can view their vessel"
ON public.vessels
FOR SELECT
USING (
  vessel_manager_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessels.id
  )
);

COMMENT ON POLICY "Vessel managers can view their vessel" ON public.vessels IS
  'Full vessels row (including stamp, company, AIS flags) for the managing vessel account only. Ordinary crew must use vessels_public_identity.';

COMMENT ON POLICY "Admins can view all vessels" ON public.vessels IS
  'Admins may SELECT full vessel rows for support tooling.';

-- ─── Shared AIS access helper (SECURITY DEFINER → bypasses vessels RLS) ─────
-- Preserves the same who-may-read rules used by vessel_ais_status /
-- ais_observations / vessel_daily_ais_summary without requiring vessels SELECT.

CREATE OR REPLACE FUNCTION public.can_access_shared_vessel_ais(p_vessel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_vessel_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid AND u.role = 'admin'
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vessels v
    WHERE v.id = p_vessel_id
      AND v.vessel_manager_id = v_uid
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vessel_assignments va
    WHERE va.vessel_id = p_vessel_id
      AND va.user_id = v_uid
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid
      AND u.subscription_tier = 'vessel_linked'
      AND (
        u.managed_by_vessel_id = p_vessel_id
        OR u.active_vessel_id = p_vessel_id
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_shared_vessel_ais(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_shared_vessel_ais(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_shared_vessel_ais(uuid) TO service_role;

COMMENT ON FUNCTION public.can_access_shared_vessel_ais(uuid) IS
  'True when the caller may read shared AIS tables for the vessel. SECURITY DEFINER so AIS RLS does not require vessels SELECT.';

-- Rewire AIS SELECT policies (same entitlements, invoker-safe)
DROP POLICY IF EXISTS vessel_ais_status_select ON public.vessel_ais_status;
CREATE POLICY vessel_ais_status_select
  ON public.vessel_ais_status
  FOR SELECT
  USING (public.can_access_shared_vessel_ais(vessel_id));

DROP POLICY IF EXISTS ais_observations_select ON public.ais_observations;
CREATE POLICY ais_observations_select
  ON public.ais_observations
  FOR SELECT
  USING (public.can_access_shared_vessel_ais(vessel_id));

DROP POLICY IF EXISTS vessel_daily_ais_summary_select ON public.vessel_daily_ais_summary;
CREATE POLICY vessel_daily_ais_summary_select
  ON public.vessel_daily_ais_summary
  FOR SELECT
  USING (public.can_access_shared_vessel_ais(vessel_id));

-- Note: vessel_ais_state_samples / vessel_ais_place_memory remain manager+admin
-- only. Managers retain vessels SELECT, so their existing policies stay valid.

-- ─── Public identity view (owner rights → only public columns) ─────────────
-- security_invoker = false so authenticated callers can read public identity
-- without needing full-row SELECT on vessels.
-- Do NOT use SELECT * — explicit column list only.

DROP VIEW IF EXISTS public.vessels_public_identity;

CREATE VIEW public.vessels_public_identity AS
SELECT
  id,
  name,
  type,
  mmsi,
  imo,
  flag,
  call_sign,
  length_m,
  beam,
  gross_tonnage,
  build_year,
  is_official
FROM public.vessels;

COMMENT ON VIEW public.vessels_public_identity IS
  'Safe physical-vessel identity for crew/catalog. Does NOT include stamp, company contacts, vessel_manager_id, AIS scheduling flags, or other management fields. Flutter and crew clients must use this (or an equivalent API), never vessels.select(*).';

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.vessels_public_identity SET (security_invoker = false)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not set security_invoker=false (older Postgres); view uses owner rights by default.';
  END;
END $$;

REVOKE ALL ON TABLE public.vessels_public_identity FROM PUBLIC;
GRANT SELECT ON TABLE public.vessels_public_identity TO authenticated;
GRANT SELECT ON TABLE public.vessels_public_identity TO service_role;

-- Authorised readers may learn vessel_manager_id without full-row SELECT
-- (crew feature boost, testimonials fallback, captains).
CREATE OR REPLACE FUNCTION public.get_vessel_manager_id(p_vessel_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manager uuid;
BEGIN
  IF v_uid IS NULL OR p_vessel_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT vessel_manager_id INTO v_manager
  FROM public.vessels
  WHERE id = p_vessel_id;

  IF v_manager IS NULL THEN
    RETURN NULL;
  END IF;

  -- Manager or admin
  IF v_manager = v_uid THEN
    RETURN v_manager;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid AND u.role = 'admin'
  ) THEN
    RETURN v_manager;
  END IF;

  -- Active assignment on this vessel (crew / captain)
  IF EXISTS (
    SELECT 1 FROM public.vessel_assignments va
    WHERE va.vessel_id = p_vessel_id
      AND va.user_id = v_uid
      AND va.end_date IS NULL
  ) THEN
    RETURN v_manager;
  END IF;

  -- Has personal sea-service / state logs on this vessel
  IF EXISTS (
    SELECT 1 FROM public.daily_state_logs dsl
    WHERE dsl.vessel_id = p_vessel_id
      AND dsl.user_id = v_uid
    LIMIT 1
  ) THEN
    RETURN v_manager;
  END IF;

  -- Active signing authority on this vessel
  IF EXISTS (
    SELECT 1 FROM public.vessel_signing_authorities sa
    WHERE sa.vessel_id = p_vessel_id
      AND sa.captain_user_id = v_uid
      AND sa.end_date IS NULL
  ) THEN
    RETURN v_manager;
  END IF;

  -- Approved captaincy claim for this vessel
  IF EXISTS (
    SELECT 1 FROM public.vessel_claim_requests cr
    WHERE cr.vessel_id = p_vessel_id
      AND cr.requested_by = v_uid
      AND cr.status = 'approved'
  ) THEN
    RETURN v_manager;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vessel_manager_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vessel_manager_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vessel_manager_id(uuid) TO service_role;

COMMENT ON FUNCTION public.get_vessel_manager_id(uuid) IS
  'Returns vessel_manager_id only when the caller is authorised (manager, admin, assigned crew, sea-time history, signing authority). Does not expose other private vessel columns.';

-- Document fields for crew PDF / sea-service generation (company + stamp only when entitled).
CREATE OR REPLACE FUNCTION public.get_vessel_for_crew_document(p_vessel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manager uuid;
  v_row public.vessels%ROWTYPE;
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL OR p_vessel_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.vessels WHERE id = p_vessel_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_manager := v_row.vessel_manager_id;

  IF v_manager = v_uid THEN
    v_ok := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.role = 'admin'
  ) THEN
    v_ok := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.vessel_assignments va
    WHERE va.vessel_id = p_vessel_id AND va.user_id = v_uid AND va.end_date IS NULL
  ) THEN
    v_ok := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.daily_state_logs dsl
    WHERE dsl.vessel_id = p_vessel_id AND dsl.user_id = v_uid
    LIMIT 1
  ) THEN
    v_ok := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.testimonials t
    WHERE t.vessel_id = p_vessel_id AND t.user_id = v_uid
    LIMIT 1
  ) THEN
    v_ok := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.vessel_generated_testimonials vg
    WHERE vg.vessel_id = p_vessel_id AND vg.crew_user_id = v_uid
    LIMIT 1
  ) THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'type', v_row.type,
    'imo', v_row.imo,
    'mmsi', v_row.mmsi,
    'flag', v_row.flag,
    'call_sign', v_row.call_sign,
    'length_m', v_row.length_m,
    'beam', v_row.beam,
    'gross_tonnage', v_row.gross_tonnage,
    'build_year', v_row.build_year,
    'management_company', v_row.management_company,
    'company_address', v_row.company_address,
    'company_contact', v_row.company_contact,
    'stamp', v_row.stamp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_vessel_for_crew_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vessel_for_crew_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vessel_for_crew_document(uuid) TO service_role;

COMMENT ON FUNCTION public.get_vessel_for_crew_document(uuid) IS
  'Returns public identity plus company/stamp fields needed for crew sea-service PDFs. Never returns AIS scheduling or vessel_manager_id. Caller must be related to the vessel.';

COMMIT;

-- Manual verification (run as crew JWT / in SQL with SET ROLE if available):
-- SELECT * FROM pg_policies WHERE tablename = 'vessels';
-- SELECT * FROM vessels_public_identity LIMIT 5;
-- SELECT * FROM vessels LIMIT 5;  -- should fail / empty for ordinary crew
-- SELECT * FROM vessel_ais_status WHERE vessel_id = '<assigned>';  -- should still work
-- SELECT public.get_vessel_manager_id('<assigned>');  -- uuid or null
