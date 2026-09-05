-- Store which certificate catalog preset was used when adding a certificate.
-- Career progress / applications match requirements by preset_id first
-- so EDH cannot satisfy GMDSS (and similar cross-matches).

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS preset_id TEXT;

CREATE INDEX IF NOT EXISTS idx_certificates_preset_id
  ON public.certificates (preset_id)
  WHERE preset_id IS NOT NULL;

COMMENT ON COLUMN public.certificates.preset_id IS
  'Catalog preset id from CERTIFICATE_PRESETS (e.g. edh, gmdss, stcw-bst). Null for custom / legacy rows.';
