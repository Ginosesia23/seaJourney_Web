-- Allow vessel managers with approved access to manage (insert/update/delete)
-- certificates on behalf of that crew member.

DROP POLICY IF EXISTS "Vessel managers can insert certificates for crew with approved access"
  ON public.certificates;
DROP POLICY IF EXISTS "Vessel managers can update certificates for crew with approved access"
  ON public.certificates;
DROP POLICY IF EXISTS "Vessel managers can delete certificates for crew with approved access"
  ON public.certificates;

CREATE POLICY "Vessel managers can insert certificates for crew with approved access"
ON public.certificates
FOR INSERT
WITH CHECK (
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

CREATE POLICY "Vessel managers can update certificates for crew with approved access"
ON public.certificates
FOR UPDATE
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
)
WITH CHECK (
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

CREATE POLICY "Vessel managers can delete certificates for crew with approved access"
ON public.certificates
FOR DELETE
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

COMMENT ON POLICY "Vessel managers can insert certificates for crew with approved access"
ON public.certificates IS
'Vessel managers with approved data access may insert certificates for that crew member.';

COMMENT ON POLICY "Vessel managers can update certificates for crew with approved access"
ON public.certificates IS
'Vessel managers with approved data access may update certificates for that crew member.';

COMMENT ON POLICY "Vessel managers can delete certificates for crew with approved access"
ON public.certificates IS
'Vessel managers with approved data access may delete certificates for that crew member.';
