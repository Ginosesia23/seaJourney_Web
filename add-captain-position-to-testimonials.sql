-- Add captain_position column to testimonials table
-- This allows us to store the captain's position when they approve a testimonial
-- so the crew member can use it in the PDF without needing permission to view the captain's profile

ALTER TABLE public.testimonials
ADD COLUMN IF NOT EXISTS captain_position TEXT NULL;

-- Add comment to column
COMMENT ON COLUMN public.testimonials.captain_position IS 
'Stores the captain''s position (e.g., "Master", "Chief Officer") at the time of approval. This allows crew members to generate PDFs with captain details without needing permission to view the captain''s profile.';

