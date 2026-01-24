-- Add discharge_book_number column to users table
-- Used for storing crew members' discharge book numbers for use in testimonials

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS discharge_book_number TEXT NULL;

COMMENT ON COLUMN users.discharge_book_number IS 'Discharge book number for crew members. Used in testimonial PDFs and official documents.';

