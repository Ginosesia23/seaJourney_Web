-- Allow vessel managers with approved sea-time access to view crew certificates.
-- Reuses vessel_sea_time_access_requests (same consent gate as testimonials / personal logs).

DROP POLICY IF EXISTS "Vessel managers can view certificates for crew with approved access"
  ON public.certificates;

CREATE POLICY "Vessel managers can view certificates for crew with approved access"
ON public.certificates
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = certificates.user_id
      AND vsar.status = 'approved'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMENT ON POLICY "Vessel managers can view certificates for crew with approved access"
ON public.certificates IS
'Vessel managers with an approved vessel_sea_time_access_requests row may SELECT certificates for that crew member. Admins may SELECT all.';
