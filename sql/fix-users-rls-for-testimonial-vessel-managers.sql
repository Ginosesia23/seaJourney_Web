-- Allow crew to view the vessel manager profile for vessels they have
-- logged time on (or have an active assignment), so they can request a
-- testimonial from the vessel manager when no captain is assigned.
--
-- IMPORTANT: Uses a SECURITY DEFINER function so the policy does not
-- recurse through vessels / daily_state_logs / vessel_assignments RLS that
-- themselves query public.users (that recursion breaks useDoc on users).

DROP POLICY IF EXISTS "Users can view vessel managers for testimonial requests"
  ON public.users;

DROP FUNCTION IF EXISTS public.can_view_vessel_manager_for_testimonial(UUID, UUID);

CREATE FUNCTION public.can_view_vessel_manager_for_testimonial(
  manager_id UUID,
  viewing_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF manager_id IS NULL OR viewing_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Own profile is always allowed by other policies; short-circuit here too.
  IF manager_id = viewing_user_id THEN
    RETURN TRUE;
  END IF;

  -- Manager must be linked on vessels.vessel_manager_id, and the viewer must
  -- have logged time on that vessel or have an active assignment.
  RETURN EXISTS (
    SELECT 1
    FROM public.vessels v
    WHERE v.vessel_manager_id = manager_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.daily_state_logs dsl
          WHERE dsl.vessel_id = v.id
            AND dsl.user_id = viewing_user_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.vessel_assignments va
          WHERE va.vessel_id = v.id
            AND va.user_id = viewing_user_id
            AND va.end_date IS NULL
        )
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_vessel_manager_for_testimonial(UUID, UUID)
  TO authenticated;

CREATE POLICY "Users can view vessel managers for testimonial requests"
ON public.users
FOR SELECT
USING (
  public.can_view_vessel_manager_for_testimonial(id, auth.uid())
);

COMMENT ON POLICY "Users can view vessel managers for testimonial requests"
ON public.users IS
'Allows crew to view the vessel manager profile on vessels they have logged time on or are assigned to. Uses a SECURITY DEFINER helper to avoid RLS recursion on public.users.';
