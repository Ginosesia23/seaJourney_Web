-- Restore Flutter vessel names without reopening full vessels catalog.
--
-- The shipping mobile app still does:
--   vessel_assignments.select('*, vessels(*)')
-- After locking vessels SELECT to managers/admins only, that embed is empty
-- and the app shows "Unknown vessel".
--
-- This policy lets a crew/captain SELECT the vessels rows they are related to
-- (active/past assignment OR personal sea-time logs). Managers/admins keep
-- their existing full SELECT policies.
--
-- Trade-off: for THOSE vessels only, the client can see management columns
-- (stamp, company, etc.) again — same as before the harden for assigned vessels.
-- Unrelated vessels remain hidden (catalog still uses vessels_public_identity / APIs).
--
-- Run in Supabase SQL editor, then force-quit and reopen the mobile app.

BEGIN;

DROP POLICY IF EXISTS "Crew can view related vessels for identity"
  ON public.vessels;

CREATE POLICY "Crew can view related vessels for identity"
ON public.vessels
FOR SELECT
USING (
  -- Active or past assignment
  EXISTS (
    SELECT 1
    FROM public.vessel_assignments va
    WHERE va.vessel_id = vessels.id
      AND va.user_id = auth.uid()
  )
  -- Or personal sea-time / state logs on this vessel
  OR EXISTS (
    SELECT 1
    FROM public.daily_state_logs dsl
    WHERE dsl.vessel_id = vessels.id
      AND dsl.user_id = auth.uid()
    LIMIT 1
  )
);

COMMENT ON POLICY "Crew can view related vessels for identity" ON public.vessels IS
  'Temporary compatibility for Flutter vessels(*) embeds. Allows SELECT on vessels the caller is assigned to or has logged on. Prefer vessels_public_identity in new app builds.';

-- Keep / refresh public identity view for web + future Flutter
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

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.vessels_public_identity SET (security_invoker = false)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'security_invoker not set: %', SQLERRM;
  END;
END $$;

REVOKE ALL ON TABLE public.vessels_public_identity FROM PUBLIC;
GRANT SELECT ON TABLE public.vessels_public_identity TO authenticated;
GRANT SELECT ON TABLE public.vessels_public_identity TO service_role;
GRANT SELECT ON TABLE public.vessels_public_identity TO anon;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify as yourself in SQL (optional):
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'vessels' ORDER BY policyname;
-- Expected SELECT policies:
--   Admins can view all vessels
--   Vessel managers can view their vessel
--   Crew can view related vessels for identity
