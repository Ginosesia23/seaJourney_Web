-- AIS entitlement / vessel privacy / MMSI-IMO uniqueness hardening.
--
-- Run AFTER add-ais-provider-poll-entitlement.sql.
--
-- STEP A — Duplicate diagnostics (read-only). Review before indexes.
-- STEP B — Public identity view (no private fields).
-- STEP C — Unique indexes (only if diagnostics show 0 duplicates).

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP A: Duplicate MMSI / IMO report (do NOT auto-merge)
-- ═══════════════════════════════════════════════════════════════════════════

-- Duplicate MMSI (normalised digits-only comparison requires app-normalised storage)
SELECT
  v.mmsi,
  COUNT(*) AS vessel_count,
  ARRAY_AGG(v.id ORDER BY v.created_at NULLS LAST) AS vessel_ids,
  ARRAY_AGG(v.name ORDER BY v.created_at NULLS LAST) AS names,
  ARRAY_AGG(v.vessel_manager_id ORDER BY v.created_at NULLS LAST) AS manager_ids,
  ARRAY_AGG(
    EXISTS (
      SELECT 1 FROM public.vessel_ais_status s WHERE s.vessel_id = v.id
    )
  ) AS has_ais_status
FROM public.vessels v
WHERE v.mmsi IS NOT NULL AND btrim(v.mmsi) <> ''
GROUP BY v.mmsi
HAVING COUNT(*) > 1
ORDER BY vessel_count DESC;

-- Duplicate IMO
SELECT
  v.imo,
  COUNT(*) AS vessel_count,
  ARRAY_AGG(v.id ORDER BY v.created_at NULLS LAST) AS vessel_ids,
  ARRAY_AGG(v.name ORDER BY v.created_at NULLS LAST) AS names,
  ARRAY_AGG(v.vessel_manager_id ORDER BY v.created_at NULLS LAST) AS manager_ids
FROM public.vessels v
WHERE v.imo IS NOT NULL AND btrim(v.imo) <> ''
GROUP BY v.imo
HAVING COUNT(*) > 1
ORDER BY vessel_count DESC;

-- Crew association counts for a specific duplicate set (replace :mmsi):
-- SELECT va.vessel_id, COUNT(*) AS assignments
-- FROM public.vessel_assignments va
-- JOIN public.vessels v ON v.id = va.vessel_id
-- WHERE v.mmsi = ':mmsi'
-- GROUP BY va.vessel_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP B: Public identity view (API-friendly; does not replace vessels RLS)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.vessels_public_identity AS
SELECT
  id,
  name,
  type,
  imo,
  mmsi,
  flag,
  length_m,
  beam,
  gross_tonnage,
  build_year,
  call_sign,
  is_official
FROM public.vessels;

COMMENT ON VIEW public.vessels_public_identity IS
  'Safe physical-vessel identity projection. Excludes stamp, company contacts, vessel_manager_id, AIS operational flags, and other private management fields.';

-- Grant read on the view to authenticated (RLS on base table still applies via security_invoker if supported).
-- On Postgres 15+ use security_invoker; otherwise view uses owner rights — prefer API projections.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.vessels_public_identity SET (security_invoker = true)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'security_invoker not available; rely on API projections for privacy';
  END;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP C: Unique indexes — RUN ONLY AFTER STEP A RETURNS ZERO ROWS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Uncomment and run once duplicates are cleaned:
--
-- BEGIN;
-- CREATE UNIQUE INDEX IF NOT EXISTS vessels_mmsi_unique_idx
--   ON public.vessels (mmsi)
--   WHERE mmsi IS NOT NULL AND btrim(mmsi) <> '';
-- CREATE UNIQUE INDEX IF NOT EXISTS vessels_imo_unique_idx
--   ON public.vessels (imo)
--   WHERE imo IS NOT NULL AND btrim(imo) <> '';
-- COMMIT;
