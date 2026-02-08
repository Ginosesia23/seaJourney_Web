-- Add data_source column to testimonials table
-- This stores whether the testimonial was generated using 'crew' or 'vessel' logs
-- For vessel managers generating testimonials for crew members with approved access

ALTER TABLE public.testimonials
ADD COLUMN IF NOT EXISTS data_source TEXT NULL CHECK (data_source IN ('crew', 'vessel'));

-- Add comment to column
COMMENT ON COLUMN public.testimonials.data_source IS 
'Indicates the data source used for generating this testimonial: "crew" for crew member logs, "vessel" for vessel logs. Only relevant for vessel-manager-generated testimonials where crew member has approved access.';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_testimonials_data_source 
ON public.testimonials(data_source) 
WHERE data_source IS NOT NULL;
