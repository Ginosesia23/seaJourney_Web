-- Apply ONLY after harden-ais-entitlement-privacy-identity.sql diagnostics
-- show zero duplicate MMSI and zero duplicate IMO rows.
--
-- If CREATE UNIQUE INDEX fails, stop and clean duplicates — do not force.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS vessels_mmsi_unique_idx
  ON public.vessels (mmsi)
  WHERE mmsi IS NOT NULL AND btrim(mmsi) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS vessels_imo_unique_idx
  ON public.vessels (imo)
  WHERE imo IS NOT NULL AND btrim(imo) <> '';

COMMIT;
