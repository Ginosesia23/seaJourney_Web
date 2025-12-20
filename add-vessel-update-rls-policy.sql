-- Allow vessel role users to update their own vessel
-- This enables vessel managers to edit vessel details

-- First, check what policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'vessels';

-- Drop the policy if it exists (to allow updates)
DROP POLICY IF EXISTS "Vessel managers can update their vessel" ON public.vessels;

-- Create policy that allows vessel role users to update vessels
-- where their active_vessel_id matches the vessel id
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
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'vessel'
    AND users.active_vessel_id = vessels.id
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);
