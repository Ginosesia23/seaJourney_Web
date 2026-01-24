-- Add last_sign_in_at column to users table
-- This column will store the last login timestamp synced from auth.users

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ NULL;

-- Add comment to the column for documentation
COMMENT ON COLUMN public.users.last_sign_in_at IS 'Last sign-in timestamp synced from auth.users.last_sign_in_at via database trigger.';

-- Create index for faster queries on login activity
CREATE INDEX IF NOT EXISTS idx_users_last_sign_in_at ON public.users(last_sign_in_at);

-- Create function to sync last_sign_in_at from auth.users to public.users
-- This function runs with SECURITY DEFINER to bypass RLS policies
CREATE OR REPLACE FUNCTION public.sync_user_last_sign_in()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the users table with the last_sign_in_at from auth.users
  -- Only update if last_sign_in_at has actually changed
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.users
    SET last_sign_in_at = NEW.last_sign_in_at
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires when last_sign_in_at is updated in auth.users
DROP TRIGGER IF EXISTS sync_last_sign_in_trigger ON auth.users;
CREATE TRIGGER sync_last_sign_in_trigger
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION public.sync_user_last_sign_in();

-- Backfill existing data: Sync last_sign_in_at for all existing users
-- This will populate the column with current login data
UPDATE public.users u
SET last_sign_in_at = au.last_sign_in_at
FROM auth.users au
WHERE u.id = au.id
  AND au.last_sign_in_at IS NOT NULL
  AND (u.last_sign_in_at IS NULL OR u.last_sign_in_at < au.last_sign_in_at);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_user_last_sign_in() TO postgres, service_role;
