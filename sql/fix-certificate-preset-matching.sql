-- Tighten certificate matching for career milestones + backfill preset_id
-- where the certificate name clearly matches a catalog preset.

-- Prefer specific name filters over broad ones (e.g. "STCW" matched every STCW cert)
UPDATE public.milestone_requirements
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{nameContains}',
  '"Basic Safety"'
)
WHERE requirement_type = 'certificate'
  AND config->>'presetId' = 'stcw-bst'
  AND COALESCE(config->>'nameContains', '') IN ('STCW', 'stcw');

UPDATE public.milestone_requirements
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{nameContains}',
  '"EDH"'
)
WHERE requirement_type = 'certificate'
  AND config->>'presetId' = 'edh'
  AND COALESCE(config->>'nameContains', '') ILIKE '%efficient deck hand%';

UPDATE public.milestone_requirements
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{nameContains}',
  '"GMDSS"'
)
WHERE requirement_type = 'certificate'
  AND config->>'presetId' = 'gmdss'
  AND COALESCE(config->>'nameContains', '') ILIKE '%gmdss%';

-- Backfill preset_id on existing certificates from known names (best effort)
UPDATE public.certificates
SET preset_id = 'edh'
WHERE preset_id IS NULL
  AND (
    certificate_name ILIKE '%efficient deck hand%'
    OR certificate_name ~* '(^|[^a-z])edh([^a-z]|$)'
  );

UPDATE public.certificates
SET preset_id = 'gmdss'
WHERE preset_id IS NULL
  AND (
    certificate_name ILIKE '%gmdss%'
    OR certificate_name ~* '(^|[^a-z])goc([^a-z]|$)'
    OR certificate_name ~* '(^|[^a-z])roc([^a-z]|$)'
  );

UPDATE public.certificates
SET preset_id = 'stcw-bst'
WHERE preset_id IS NULL
  AND (
    certificate_name ILIKE '%basic safety%'
    OR certificate_name ILIKE '%stcw bst%'
  );

UPDATE public.certificates
SET preset_id = 'eng1'
WHERE preset_id IS NULL
  AND certificate_name ILIKE '%eng1%';
