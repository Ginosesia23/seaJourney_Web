-- Allow vessel managers with approved vessel_sea_time_access to delete testimonials
-- for those crew members (e.g. to remove approved testimonials with password confirmation).

DROP POLICY IF EXISTS "Vessel managers can delete crew testimonials with approved access" ON public.testimonials;
CREATE POLICY "Vessel managers can delete crew testimonials with approved access"
ON public.testimonials
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = testimonials.user_id
      AND vsar.status = 'approved'
  )
);

COMMENT ON POLICY "Vessel managers can delete crew testimonials with approved access" ON public.testimonials IS
'Allows vessel managers to delete testimonials for crew members who have granted them approved sea time access. Used with password confirmation when deleting approved testimonials from the crew page.';
