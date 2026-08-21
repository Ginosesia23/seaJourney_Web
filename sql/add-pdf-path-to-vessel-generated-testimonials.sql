-- Store frozen PDF path for vessel-generated testimonials (no captain approval).
ALTER TABLE public.vessel_generated_testimonials
  ADD COLUMN IF NOT EXISTS pdf_path TEXT NULL;

COMMENT ON COLUMN public.vessel_generated_testimonials.pdf_path IS
  'Storage path in the testimonials bucket (crew_user_id/vessel-generated/<id>.pdf).';

CREATE INDEX IF NOT EXISTS idx_vessel_generated_testimonials_pdf_path
  ON public.vessel_generated_testimonials(pdf_path)
  WHERE pdf_path IS NOT NULL;
