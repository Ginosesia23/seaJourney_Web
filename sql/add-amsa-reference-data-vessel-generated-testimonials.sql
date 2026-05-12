-- AMSA Form 771 sea service reference codes (mode, type, duties, propulsion) for vessel-generated documents.
ALTER TABLE public.vessel_generated_testimonials
  ADD COLUMN IF NOT EXISTS amsa_reference_data JSONB DEFAULT NULL;

COMMENT ON COLUMN public.vessel_generated_testimonials.amsa_reference_data IS
  'AMSA 771 reference section: mode_of_operation (VU|NUD|NUE), type_of_operation[], duties_performed[], propulsion_type[].';
