-- Add position column to users table
-- This migration adds a position field to store the user's job position/role

-- Add position column (nullable, stores user's position/role)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS position TEXT;

-- Add comment for documentation
COMMENT ON COLUMN users.position IS 'User''s job position or role in maritime industry';

