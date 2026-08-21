-- Normalize proof_of_service.verification_code to POS-XXXXXXXX (8 chars).
-- Legacy rows were stored as 10-char hex fragments without the POS- prefix,
-- which broke public verify lookups that expect POS- + 8 characters.

UPDATE public.proof_of_service
SET verification_code =
  'POS-' || upper(substring(regexp_replace(verification_code, '^POS-?', '', 'i'), 1, 8))
WHERE verification_code IS NOT NULL
  AND verification_code !~ '^POS-[A-Z0-9]{8}$';

ALTER TABLE public.proof_of_service
  ALTER COLUMN verification_code SET DEFAULT (
    'POS-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_of_service_verification_code
  ON public.proof_of_service (verification_code);

COMMENT ON COLUMN public.proof_of_service.verification_code IS
  'Unique code in format POS-XXXXXXXX, generated on insert for public verification.';
