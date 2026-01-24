-- Add signature column to users table
-- This column will store base64-encoded signature images for captain accounts

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS signature TEXT NULL;

-- Add comment to the column for documentation
COMMENT ON COLUMN users.signature IS 'Base64-encoded signature image for captain accounts. Used on crew testimonials.';

-- No index needed as this column won't be used for filtering/searching

