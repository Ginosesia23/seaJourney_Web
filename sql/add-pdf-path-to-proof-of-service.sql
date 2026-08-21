-- Store the storage path of the frozen Proof of Service PDF created when
-- the vessel manager saves the record to the crew profile.
ALTER TABLE public.proof_of_service
  ADD COLUMN IF NOT EXISTS pdf_path TEXT NULL;

COMMENT ON COLUMN public.proof_of_service.pdf_path IS
  'Storage object path in the proof-of-service bucket (crew_user_id/<id>.pdf), written when the record is saved.';

CREATE INDEX IF NOT EXISTS idx_proof_of_service_pdf_path
  ON public.proof_of_service(pdf_path)
  WHERE pdf_path IS NOT NULL;
