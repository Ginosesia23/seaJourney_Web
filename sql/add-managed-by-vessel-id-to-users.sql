-- Add managed_by_vessel_id to users.
-- A non-null value means this user is a "vessel-linked secondary account":
-- the user was created BY a vessel manager (on the Vessel Pro/Fleet plan)
-- and is owned/operated by that vessel. The captain, officer, engineer, or
-- manager attached to a vessel can use this account to log in and sign off
-- documents without using their personal SeaJourney account.
--
-- See:
--  - src/app/api/users/invite-vessel-role/route.ts
--  - src/app/dashboard/vessel-roles/page.tsx
--
-- The account is otherwise a normal Supabase user; we just track the
-- "managing vessel" so we can filter for it and end the linkage cleanly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'managed_by_vessel_id'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN managed_by_vessel_id UUID NULL
        REFERENCES public.vessels(id) ON DELETE SET NULL;

    COMMENT ON COLUMN public.users.managed_by_vessel_id IS
      'If non-null, this is a vessel-linked secondary account owned by the referenced vessel. Created via /api/users/invite-vessel-role by a vessel manager on the Pro or Fleet tier. Used by the vessel-roles page and (future) auto sign-off flows.';

    CREATE INDEX IF NOT EXISTS idx_users_managed_by_vessel_id
      ON public.users(managed_by_vessel_id)
      WHERE managed_by_vessel_id IS NOT NULL;
  END IF;
END $$;
