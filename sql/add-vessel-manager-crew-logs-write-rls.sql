-- Allow vessel managers with approved access to insert/update/delete
-- daily_state_logs for that crew member on THAT vessel only.
-- Auto-granted while the crew member is covered by the vessel subscription.

DROP POLICY IF EXISTS "Vessel managers can insert crew logs with approved access"
  ON public.daily_state_logs;
DROP POLICY IF EXISTS "Vessel managers can update crew logs with approved access"
  ON public.daily_state_logs;
DROP POLICY IF EXISTS "Vessel managers can delete crew logs with approved access"
  ON public.daily_state_logs;

CREATE POLICY "Vessel managers can insert crew logs with approved access"
ON public.daily_state_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    JOIN public.users u ON u.id = auth.uid()
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = daily_state_logs.user_id
      AND vsar.vessel_id = daily_state_logs.vessel_id
      AND vsar.status = 'approved'
      AND u.role = 'vessel'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Vessel managers can update crew logs with approved access"
ON public.daily_state_logs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    JOIN public.users u ON u.id = auth.uid()
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = daily_state_logs.user_id
      AND vsar.vessel_id = daily_state_logs.vessel_id
      AND vsar.status = 'approved'
      AND u.role = 'vessel'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    JOIN public.users u ON u.id = auth.uid()
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = daily_state_logs.user_id
      AND vsar.vessel_id = daily_state_logs.vessel_id
      AND vsar.status = 'approved'
      AND u.role = 'vessel'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Vessel managers can delete crew logs with approved access"
ON public.daily_state_logs
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.vessel_sea_time_access_requests vsar
    JOIN public.users u ON u.id = auth.uid()
    WHERE vsar.vessel_user_id = auth.uid()
      AND vsar.crew_user_id = daily_state_logs.user_id
      AND vsar.vessel_id = daily_state_logs.vessel_id
      AND vsar.status = 'approved'
      AND u.role = 'vessel'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMENT ON POLICY "Vessel managers can insert crew logs with approved access"
ON public.daily_state_logs IS
'Vessel managers with approved data access may write daily states for that crew member on that vessel.';

COMMENT ON POLICY "Vessel managers can update crew logs with approved access"
ON public.daily_state_logs IS
'Vessel managers with approved data access may update daily states for that crew member on that vessel.';

COMMENT ON POLICY "Vessel managers can delete crew logs with approved access"
ON public.daily_state_logs IS
'Vessel managers with approved data access may delete daily states for that crew member on that vessel.';
