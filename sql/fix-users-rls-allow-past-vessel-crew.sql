-- Allow vessel managers / captains to view profiles of crew who have
-- ANY assignment on their vessel (past or present), not only active ones.
-- Required for Manage Crew "Past members" and Documents generator past crew.

CREATE OR REPLACE FUNCTION public.can_view_user_profile(viewed_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  viewing_user_role TEXT;
  viewing_user_vessel_id UUID;
BEGIN
  SELECT role, active_vessel_id INTO viewing_user_role, viewing_user_vessel_id
  FROM public.users
  WHERE id = auth.uid();

  IF viewing_user_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  -- Any historical assignment on the vessel is enough to view the profile.
  IF viewing_user_role IN ('vessel', 'captain') AND viewing_user_vessel_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.vessel_assignments va
      WHERE va.user_id = viewed_user_id
        AND va.vessel_id = viewing_user_vessel_id
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.can_view_user_profile(UUID) IS
'True when the viewer may SELECT the given user profile. Vessel/captain viewers may see anyone with a past or present vessel_assignments row on their active vessel.';
