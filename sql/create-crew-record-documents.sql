-- Historical / manually uploaded documents that a vessel attaches to a
-- crew member's record (e.g. testimonials generated before SeaJourney).
-- Visible to the crew member and to the vessel that uploaded them.
--
-- Path in storage: <crew_user_id>/<document_id>-<filename>
-- Uploads/downloads go through /api/crew-record-documents (service role).

-- =============================================================================
-- Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.crew_record_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  crew_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  document_kind TEXT NOT NULL
    CHECK (document_kind IN ('testimonial', 'proof_of_service', 'certificate', 'other')),
  origin TEXT NOT NULL
    CHECK (origin IN ('pre_seajourney', 'manual')),
  issued_on DATE NULL,
  notes TEXT NULL,

  start_date DATE NULL,
  end_date DATE NULL,
  total_days INTEGER NULL CHECK (total_days IS NULL OR total_days >= 0),
  at_sea_days INTEGER NULL CHECK (at_sea_days IS NULL OR at_sea_days >= 0),
  standby_days INTEGER NULL CHECK (standby_days IS NULL OR standby_days >= 0),
  yard_days INTEGER NULL CHECK (yard_days IS NULL OR yard_days >= 0),
  leave_days INTEGER NULL CHECK (leave_days IS NULL OR leave_days >= 0),
  counts_toward_career BOOLEAN NOT NULL DEFAULT false,

  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT crew_record_documents_end_after_start
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

COMMENT ON COLUMN public.crew_record_documents.counts_toward_career IS
  'When true, at-sea / total / standby days are included in career documented sea time.';
COMMENT ON COLUMN public.crew_record_documents.at_sea_days IS
  'At-sea days attested on this uploaded testimonial or proof of service.';

CREATE INDEX IF NOT EXISTS idx_crew_record_documents_crew
  ON public.crew_record_documents(crew_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_record_documents_vessel
  ON public.crew_record_documents(vessel_id, created_at DESC);

ALTER TABLE public.crew_record_documents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_crew_record_documents_updated_at ON public.crew_record_documents;
CREATE TRIGGER trg_crew_record_documents_updated_at
BEFORE UPDATE ON public.crew_record_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Crew can read documents attached to their own record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crew_record_documents'
      AND policyname = 'Crew can view own record documents'
  ) THEN
    CREATE POLICY "Crew can view own record documents"
    ON public.crew_record_documents
    FOR SELECT
    USING (crew_user_id = auth.uid());
  END IF;
END $$;

-- Vessel managers can read documents they uploaded, or for their vessel
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crew_record_documents'
      AND policyname = 'Vessel managers can view crew record documents'
  ) THEN
    CREATE POLICY "Vessel managers can view crew record documents"
    ON public.crew_record_documents
    FOR SELECT
    USING (
      uploaded_by_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.vessels v
        WHERE v.id = crew_record_documents.vessel_id
          AND v.vessel_manager_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'admin'
      )
    );
  END IF;
END $$;

-- Inserts/updates/deletes go through the service-role API. No client INSERT
-- policy — keeps file + row atomic.

COMMENT ON TABLE public.crew_record_documents IS
'Files a vessel attaches to a crew record (historical testimonials, manual scans). Visible to that crew member and the vessel.';
COMMENT ON COLUMN public.crew_record_documents.origin IS
'pre_seajourney = produced before using SeaJourney; manual = uploaded by the vessel outside the generator.';
COMMENT ON COLUMN public.crew_record_documents.document_kind IS
'What the file is: testimonial, proof_of_service, certificate, or other.';

-- =============================================================================
-- Storage bucket (private)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('crew-record-documents', 'crew-record-documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Crew read own record document files'
  ) THEN
    CREATE POLICY "Crew read own record document files"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'crew-record-documents'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Admins read crew record document files'
  ) THEN
    CREATE POLICY "Admins read crew record document files"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'crew-record-documents'
      AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'admin'
      )
    );
  END IF;
END $$;
