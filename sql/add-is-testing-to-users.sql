-- Mark accounts used for QA / demos so platform analytics can ignore them.
-- Admin toggles via /api/admin/users/testing-flag and the user detail Overview tab.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_testing'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN is_testing BOOLEAN NOT NULL DEFAULT false;

    COMMENT ON COLUMN public.users.is_testing IS
      'When true, this account is a testing/QA/demo account and should be excluded from platform analytics (signups, engagement, sea-time aggregates, etc.). Toggled by admins only.';

    CREATE INDEX IF NOT EXISTS idx_users_is_testing
      ON public.users(is_testing)
      WHERE is_testing = true;
  END IF;
END $$;
