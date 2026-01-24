-- Add captain_signature column to approved_testimonials table
-- This stores the captain's signature at the time of approval (immutable snapshot)

ALTER TABLE approved_testimonials 
ADD COLUMN IF NOT EXISTS captain_signature TEXT NULL;

-- Add comment to the column for documentation
COMMENT ON COLUMN approved_testimonials.captain_signature IS 'Base64-encoded signature image of the captain who approved the testimonial. Captured at approval time.';

-- No index needed as this column won't be used for filtering/searching

