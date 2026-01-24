-- Add 'captain' role to users table
-- This migration adds 'captain' as a valid role option in addition to 'crew', 'vessel', and 'admin'
-- A captain is a crew member with extra privileges (like vessel management, inbox access, etc.)

-- First, check if there's an existing constraint on the role column
-- If there is, we need to drop it and recreate it with the new role

-- Drop existing constraint if it exists (PostgreSQL doesn't allow direct modification)
DO $$
BEGIN
  -- Drop the constraint if it exists (constraint names may vary)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_role_check' 
    AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_role_check;
  END IF;
  
  -- Also check for other possible constraint names
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE '%role%check%' 
    AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT (
      SELECT conname FROM pg_constraint 
      WHERE conname LIKE '%role%check%' 
      AND conrelid = 'public.users'::regclass 
      LIMIT 1
    );
  END IF;
END $$;

-- Add the updated constraint with 'captain' included
ALTER TABLE public.users
ADD CONSTRAINT users_role_check 
CHECK (role IN ('crew', 'vessel', 'admin', 'captain'));

-- Add comment for documentation
COMMENT ON COLUMN public.users.role IS 'User role: crew (standard crew member), captain (crew with extra privileges like vessel management and inbox access), vessel (vessel manager), or admin (full admin access)';
