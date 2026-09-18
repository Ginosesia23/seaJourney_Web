-- Ensure vessels_public_identity is usable by the mobile app after vessels RLS lockdown.
-- Run in Supabase SQL editor, then fully restart the Flutter app (not just hot reload).

BEGIN;

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
  'Safe vessel identity for crew / Flutter. Not stamp, company, manager, or AIS internals.';

-- Owner rights so crew can read identity without vessels SELECT
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.vessels_public_identity SET (security_invoker = false)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'security_invoker option not set: %', SQLERRM;
  END;
END $$;

REVOKE ALL ON TABLE public.vessels_public_identity FROM PUBLIC;
GRANT SELECT ON TABLE public.vessels_public_identity TO authenticated;
GRANT SELECT ON TABLE public.vessels_public_identity TO service_role;
GRANT SELECT ON TABLE public.vessels_public_identity TO anon;

COMMIT;

-- Reload PostgREST schema cache so the view is visible to the API immediately
NOTIFY pgrst, 'reload schema';

-- Quick checks:
-- SELECT id, name FROM vessels_public_identity LIMIT 5;
-- SELECT relname, reloptions FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relname = 'vessels_public_identity';
