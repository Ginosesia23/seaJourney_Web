-- Pause a crew member's personal Stripe/comp plan while they are assigned
-- to a vessel on Vessel Professional (`vessel_pro`) or Fleet (`vessel_fleet`).
-- They use the vessel's Crew Limited access until every qualifying assignment ends.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'personal_plan_paused_at'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN personal_plan_paused_at TIMESTAMPTZ NULL,
      ADD COLUMN personal_plan_paused_tier TEXT NULL,
      ADD COLUMN personal_plan_paused_subscription_id TEXT NULL,
      ADD COLUMN personal_plan_paused_for_vessel_id UUID NULL
        REFERENCES public.vessels(id) ON DELETE SET NULL;

    COMMENT ON COLUMN public.users.personal_plan_paused_at IS
      'When set, this crew account has a personal plan paused because they are assigned to a Vessel Professional/Fleet vessel. They are on crew_limited until the assignment ends.';
    COMMENT ON COLUMN public.users.personal_plan_paused_tier IS
      'Personal subscription_tier to restore when the user is no longer assigned to a qualifying vessel.';
    COMMENT ON COLUMN public.users.personal_plan_paused_subscription_id IS
      'Stripe subscription id that was pause_collection''d (if any).';
    COMMENT ON COLUMN public.users.personal_plan_paused_for_vessel_id IS
      'Vessel that triggered the personal-plan pause (for emails and UI).';

    CREATE INDEX IF NOT EXISTS idx_users_personal_plan_paused
      ON public.users(personal_plan_paused_for_vessel_id)
      WHERE personal_plan_paused_at IS NOT NULL;
  END IF;
END $$;
