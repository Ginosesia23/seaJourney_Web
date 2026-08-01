-- Private storage bucket for crew certificate document copies.
-- Path: <user_id>/<uuid>-<filename>
--
-- If you hit a deadlock (40P01), wait a few seconds and re-run.
-- Prefer running STEP 1 alone, then STEP 2 — DROP POLICY on
-- storage.objects locks hard and conflicts with live Storage traffic.
--
-- Our upload/download APIs use the service role (bypass RLS), so the
-- bucket alone is enough for the app to work; policies harden direct client access.

-- =============================================================================
-- STEP 1 — bucket (safe to re-run)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- STEP 2 — policies (create-only; no DROP, fewer deadlocks)
-- Re-run this block alone if STEP 1 already succeeded.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users read own certificate files'
  ) THEN
    CREATE POLICY "Users read own certificate files"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'certificates'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users upload own certificate files'
  ) THEN
    CREATE POLICY "Users upload own certificate files"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'certificates'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users update own certificate files'
  ) THEN
    CREATE POLICY "Users update own certificate files"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'certificates'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users delete own certificate files'
  ) THEN
    CREATE POLICY "Users delete own certificate files"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'certificates'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins read certificate files'
  ) THEN
    CREATE POLICY "Admins read certificate files"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'certificates'
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
    );
  END IF;
END $$;
