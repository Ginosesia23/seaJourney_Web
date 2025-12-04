-- Add testimonial_code column to testimonials table
-- Run this in your Supabase SQL Editor

ALTER TABLE testimonials 
ADD COLUMN IF NOT EXISTS testimonial_code TEXT UNIQUE;

-- Create index for testimonial_code lookups
CREATE INDEX IF NOT EXISTS idx_testimonials_code ON testimonials(testimonial_code) WHERE testimonial_code IS NOT NULL;

-- Generate codes for existing testimonials that don't have one
-- This function generates a unique code in the format SJ-XXXX-XXXX
CREATE OR REPLACE FUNCTION generate_testimonial_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  code TEXT;
  exists_check INTEGER;
BEGIN
  LOOP
    -- Generate code: SJ-XXXX-XXXX
    code := 'SJ-' || 
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1) ||
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1) ||
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1) ||
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1) || '-' ||
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1) ||
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1) ||
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1) ||
            SUBSTR(chars, FLOOR(1 + RANDOM() * 36)::INT, 1);
    
    -- Check if code already exists
    SELECT COUNT(*) INTO exists_check
    FROM testimonials
    WHERE testimonial_code = code;
    
    -- If code doesn't exist, return it
    IF exists_check = 0 THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Update existing testimonials without codes
UPDATE testimonials
SET testimonial_code = generate_testimonial_code()
WHERE testimonial_code IS NULL;

-- Drop the helper function after use (optional, or keep for future use)
-- DROP FUNCTION IF EXISTS generate_testimonial_code();

