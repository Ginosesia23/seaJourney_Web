-- Enable Realtime for tables the dashboard attention bar watches.
-- Safe to re-run: skips tables already in the publication.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_state_logs',
    'certificates',
    'visa_tracker',
    'users',
    'vessels',
    'vessel_assignments',
    'testimonials',
    'vessel_sea_time_offers',
    'vessel_sea_time_access_requests',
    'vessel_plan_coverage_requests',
    'sea_time_requests',
    'vessel_claim_requests',
    'captain_role_applications',
    'trb_signoff_requests',
    'trb_batch_signoff_requests',
    'ais_state_reports',
    'feedback'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
