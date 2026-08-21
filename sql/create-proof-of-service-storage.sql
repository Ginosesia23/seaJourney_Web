-- Private storage for frozen Proof of Service PDFs.
-- Path: <crew_user_id>/<proof_of_service_id>.pdf
--
-- Uploads use the service role (API routes). App downloads go through
-- /api/proof-of-service/[id]/file.

INSERT INTO storage.buckets (id, name, public)
VALUES ('proof-of-service', 'proof-of-service', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Crew read own proof-of-service PDFs'
  ) THEN
    CREATE POLICY "Crew read own proof-of-service PDFs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'proof-of-service'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins read proof-of-service PDFs'
  ) THEN
    CREATE POLICY "Admins read proof-of-service PDFs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'proof-of-service'
      AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'admin'
      )
    );
  END IF;
END $$;
