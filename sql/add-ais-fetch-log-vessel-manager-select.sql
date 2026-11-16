-- Allow vessel managers (and vessel-linked accounts for that vessel) to read
-- their own ais_fetch_log rows for the vessel audit page.
-- Metadata only — no URLs, API keys, or raw provider payloads are stored.

BEGIN;

DROP POLICY IF EXISTS ais_fetch_log_vessel_select ON public.ais_fetch_log;
CREATE POLICY ais_fetch_log_vessel_select
  ON public.ais_fetch_log
  FOR SELECT
  USING (
    vessel_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.vessels v
        WHERE v.id = ais_fetch_log.vessel_id
          AND v.vessel_manager_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = 'vessel'
          AND u.active_vessel_id = ais_fetch_log.vessel_id
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.subscription_tier = 'vessel_linked'
          AND (
            u.managed_by_vessel_id = ais_fetch_log.vessel_id
            OR u.active_vessel_id = ais_fetch_log.vessel_id
          )
      )
    )
  );

COMMIT;
