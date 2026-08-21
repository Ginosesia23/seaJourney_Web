-- Per-account feature grants for vessel-linked secondary accounts
-- (captain / officer / engineer / manager created via Vessel Roles).
--
-- The JSON array stores grantable feature keys from
-- src/lib/vessel-linked-features.ts. Core pages (home, daily log, calendar,
-- inbox, profile, vessel documents) are always available and are not stored
-- here. Default includes testimonials so existing linked accounts keep the
-- access they already had.
--
-- See:
--  - src/app/dashboard/vessel-roles/page.tsx
--  - src/app/api/users/vessel-role-features/route.ts

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'linked_account_features'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN linked_account_features JSONB NOT NULL DEFAULT '["testimonials"]'::jsonb;

    COMMENT ON COLUMN public.users.linked_account_features IS
      'Feature keys granted to a vessel-linked secondary account by the vessel manager. Only used when managed_by_vessel_id is set. Empty array = core pages only.';

    CREATE INDEX IF NOT EXISTS idx_users_linked_account_features
      ON public.users USING GIN (linked_account_features)
      WHERE managed_by_vessel_id IS NOT NULL;
  END IF;
END $$;
