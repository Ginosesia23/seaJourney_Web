-- Allow vessel managers with approved access requests to view testimonials for crew members
-- This enables vessel managers to generate documents on behalf of crew members who have granted access

-- Policy: Vessel managers can view testimonials for crew members who have approved access
DROP POLICY IF EXISTS "Vessel managers can view testimonials for crew with approved access" ON public.testimonials;

CREATE POLICY "Vessel managers can view testimonials for crew with approved access"
ON public.testimonials
FOR SELECT
USING (
  -- Check if user is a vessel manager with an approved access request for this crew member
  -- The vessel_sea_time_access_requests table already ensures vessel_user_id references a vessel manager
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = testimonials.user_id
      AND vsar.status = 'approved'
  )
  OR
  -- Users can always view their own testimonials (existing behavior)
  user_id = auth.uid()
  OR
  -- Captains can view testimonials addressed to them (existing behavior)
  captain_user_id = auth.uid()
  OR
  -- Admins can view all testimonials (existing behavior)
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMENT ON POLICY "Vessel managers can view testimonials for crew with approved access" ON public.testimonials IS 
'Allows vessel managers with approved access requests to view testimonials for crew members. This enables the crew documents page where vessel managers can generate documents on behalf of crew members who have granted access. The policy checks for approved vessel_sea_time_access_requests where the vessel_user_id matches the current user and the crew_user_id matches the testimonial owner.';
