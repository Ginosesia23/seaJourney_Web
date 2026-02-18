-- Track who generated each testimonial (vessel manager or crew) and copy into approved snapshot
-- So we don't end up with duplicated data across tables; approved_testimonials is the canonical record for approved ones.

-- 1. testimonials: who created this testimonial (vessel manager user_id or crew user_id)
ALTER TABLE public.testimonials
ADD COLUMN IF NOT EXISTS generated_by_user_id UUID NULL REFERENCES auth.users(id);

COMMENT ON COLUMN public.testimonials.generated_by_user_id IS 'User who created this testimonial: vessel manager (if generated from crew page) or crew member (if created from applications).';

CREATE INDEX IF NOT EXISTS idx_testimonials_generated_by_user_id
ON public.testimonials(generated_by_user_id)
WHERE generated_by_user_id IS NOT NULL;

-- 2. approved_testimonials: same tracking on the immutable snapshot
ALTER TABLE public.approved_testimonials
ADD COLUMN IF NOT EXISTS generated_by_user_id UUID NULL REFERENCES auth.users(id);

ALTER TABLE public.approved_testimonials
ADD COLUMN IF NOT EXISTS data_source TEXT NULL CHECK (data_source IN ('crew', 'vessel'));

COMMENT ON COLUMN public.approved_testimonials.generated_by_user_id IS 'User who originally created the testimonial (vessel manager or crew), copied at approval time.';
COMMENT ON COLUMN public.approved_testimonials.data_source IS 'Data source at creation: crew logs or vessel logs, copied from testimonials at approval time.';

CREATE INDEX IF NOT EXISTS idx_approved_testimonials_generated_by
ON public.approved_testimonials(generated_by_user_id)
WHERE generated_by_user_id IS NOT NULL;
