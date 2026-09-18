-- Hotfix: leftover permissive vessels policies that survived the first harden run.
-- The live policy names differed slightly from the DROP list ("read" vs "view").
--
-- Safe to re-run. Does not touch INSERT create policy (API uses service role;
-- client create can stay authenticated until you migrate all inserts server-side).

BEGIN;

-- This is the policy that still allows crew full-row SELECT
DROP POLICY IF EXISTS "Authenticated users can read vessels" ON public.vessels;
DROP POLICY IF EXISTS "Authenticated users can view vessels" ON public.vessels;

-- Any authenticated user could UPDATE any vessel — remove it
DROP POLICY IF EXISTS "Authenticated users can update vessels" ON public.vessels;

-- Ensure manager UPDATE policy exists (idempotent recreate)
DROP POLICY IF EXISTS "Vessel managers can update their vessel" ON public.vessels;
CREATE POLICY "Vessel managers can update their vessel"
ON public.vessels
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessels.id
  )
  OR EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'admin'
  )
  OR vessel_manager_id = auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessels.id
  )
  OR EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'admin'
  )
  OR vessel_manager_id = auth.uid()
);

COMMIT;

-- Verify — only these SELECT policies should remain on vessels:
--   Admins can view all vessels
--   Vessel managers can view their vessel
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'vessels'
-- ORDER BY cmd, policyname;
