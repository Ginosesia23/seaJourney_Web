-- Allow 'amsa' for pdf_format (AMSA Form 771) alongside existing values.
-- Error without this: new row for relation vessel_generated_testimonials violates check constraint vessel_generated_testimonials_pdf_format_check

ALTER TABLE public.vessel_generated_testimonials
  DROP CONSTRAINT IF EXISTS vessel_generated_testimonials_pdf_format_check;

ALTER TABLE public.vessel_generated_testimonials
  ADD CONSTRAINT vessel_generated_testimonials_pdf_format_check
  CHECK (pdf_format IN ('seajourney', 'mca', 'amsa'));

COMMENT ON COLUMN public.vessel_generated_testimonials.pdf_format IS
  'PDF layout: seajourney (branded), mca (MCA forms), amsa (AMSA 771).';
