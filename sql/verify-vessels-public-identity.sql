-- Verify vessels_public_identity is readable by crew (owner rights).
-- Run in Supabase SQL editor.

-- 1) View exists + columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vessels_public_identity'
ORDER BY ordinal_position;

-- 2) Prefer security_invoker = false (owner rights).
-- On Postgres 15+ this shows in pg_class.reloptions.
SELECT c.relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vessels_public_identity';

-- 3) Grants
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'vessels_public_identity';

-- 4) Sample (as service role / SQL editor this always works)
SELECT id, name, type, mmsi, imo
FROM public.vessels_public_identity
LIMIT 5;

-- If security_invoker is true, flip it so crew can read without vessels SELECT:
-- ALTER VIEW public.vessels_public_identity SET (security_invoker = false);
