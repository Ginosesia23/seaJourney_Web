-- Allow vessel managers with approved access requests to insert testimonials for crew members
-- This enables vessel managers to send testimonial requests to captains on behalf of crew members

-- Policy: Vessel managers can insert testimonials for crew members with approved access
DROP POLICY IF EXISTS "Vessel managers can insert testimonials for crew with approved access" ON public.testimonials;

CREATE POLICY "Vessel managers can insert testimonials for crew with approved access"
ON public.testimonials
FOR INSERT
WITH CHECK (
  -- Allow if user is a vessel manager with an approved access request for this crew member
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    JOIN public.users u ON u.id = auth.uid()
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = testimonials.user_id
      AND vsar.vessel_id = testimonials.vessel_id
      AND vsar.status = 'approved'
      AND u.role = 'vessel'
  )
  OR
  -- Users can always create testimonials for themselves (existing behavior)
  user_id = auth.uid()
  OR
  -- Admins can create any testimonial
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMENT ON POLICY "Vessel managers can insert testimonials for crew with approved access" ON public.testimonials IS 
'Allows vessel managers with approved access requests to insert testimonials for crew members. This enables the crew documents page where vessel managers can send testimonial requests to captains on behalf of crew members who have granted access. The policy checks for approved vessel_sea_time_access_requests where the vessel_user_id matches the current user, the crew_user_id matches the testimonial user_id, and the vessel_id matches.';
