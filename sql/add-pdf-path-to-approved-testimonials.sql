-- Store the storage path of the frozen PDF created at approval time.
ALTER TABLE public.approved_testimonials
  ADD COLUMN IF NOT EXISTS pdf_path TEXT NULL;

COMMENT ON COLUMN public.approved_testimonials.pdf_path IS
  'Storage object path in the testimonials bucket (crew_user_id/testimonial_id.pdf), written when the captain approves.';

CREATE INDEX IF NOT EXISTS idx_approved_testimonials_pdf_path
  ON public.approved_testimonials(pdf_path)
  WHERE pdf_path IS NOT NULL;
