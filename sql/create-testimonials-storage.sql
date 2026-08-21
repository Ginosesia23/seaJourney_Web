-- Private storage for approved testimonial PDF snapshots.
-- Path: <crew_user_id>/<testimonial_id>.pdf
--
-- Uploads use the service role (API routes). Policies allow the crew
-- member to read their own folder via Storage if needed; app downloads
-- go through /api/testimonials/[id]/file.

INSERT INTO storage.buckets (id, name, public)
VALUES ('testimonials', 'testimonials', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Crew read own testimonial PDFs'
  ) THEN
    CREATE POLICY "Crew read own testimonial PDFs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'testimonials'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins read testimonial PDFs'
  ) THEN
    CREATE POLICY "Admins read testimonial PDFs"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'testimonials'
      AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'admin'
      )
    );
  END IF;
END $$;
