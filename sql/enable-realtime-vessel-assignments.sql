-- Enable Realtime for vessel_assignments (fixes CHANNEL_ERROR on Current Service page).
-- Safe to re-run: skips if the table is already in the publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'vessel_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vessel_assignments;
  END IF;
END $$;
