-- Allow vessel managers to insert vessel_generated_testimonials for crew on their vessel
-- even when the crew member has not granted sea time access. In that case the vessel uses
-- vessel data (data_source = 'vessel') to generate the testimonial.
--
-- Existing policy "Vessel managers can insert testimonials for crew with approved access"
-- still allows insert when there is an approved vessel_sea_time_access_request.
-- This policy adds: vessel managers may also insert when generating for their active vessel
-- (using vessel data when crew has not granted access).

CREATE POLICY "Vessel managers can insert testimonials for crew on their vessel"
ON public.vessel_generated_testimonials
FOR INSERT
WITH CHECK (
  vessel_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'vessel'
      AND u.active_vessel_id = vessel_generated_testimonials.vessel_id
  )
);

COMMENT ON POLICY "Vessel managers can insert testimonials for crew on their vessel" ON public.vessel_generated_testimonials IS
'Allows vessel managers to create vessel_generated_testimonials for any crew on their active vessel, with or without approved sea time access. When access is not approved, the app uses vessel data (data_source = vessel).';
