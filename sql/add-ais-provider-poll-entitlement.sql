-- Premium-crew-funded AIS: durable provider-poll flag + optional MMSI/IMO uniqueness.
--
-- ais_provider_poll_enabled is a CACHED entitlement result maintained by
-- refreshVesselAisEntitlement() — true when vessel plan OR eligible Premium crew
-- warrants central Datalastic polling. Do not treat as a user-facing toggle.
--
-- BEFORE applying unique indexes: run the diagnostic SELECTs below. If any
-- duplicate MMSI/IMO rows exist, resolve them manually first — do NOT delete
-- blindly.

BEGIN;

ALTER TABLE public.vessels
  ADD COLUMN IF NOT EXISTS ais_provider_poll_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vessels.ais_provider_poll_enabled IS
  'Derived: central AIS provider polling is active (vessel plan and/or eligible Premium crew). Maintained by refreshVesselAisEntitlement.';

CREATE INDEX IF NOT EXISTS vessels_ais_provider_poll_enabled_idx
  ON public.vessels (ais_provider_poll_enabled)
  WHERE ais_provider_poll_enabled = true;

-- Backfill from existing vessel-manager opt-in.
UPDATE public.vessels
SET ais_provider_poll_enabled = true
WHERE ais_tracking_enabled = true
  AND ais_provider_poll_enabled = false;

COMMIT;

-- ─── Diagnostics (run manually; do not auto-merge) ─────────────────────────
-- Duplicate MMSI:
--   SELECT mmsi, COUNT(*) AS n, ARRAY_AGG(id) AS vessel_ids
--   FROM public.vessels
--   WHERE mmsi IS NOT NULL AND btrim(mmsi) <> ''
--   GROUP BY mmsi HAVING COUNT(*) > 1;
--
-- Duplicate IMO:
--   SELECT imo, COUNT(*) AS n, ARRAY_AGG(id) AS vessel_ids
--   FROM public.vessels
--   WHERE imo IS NOT NULL AND btrim(imo) <> ''
--   GROUP BY imo HAVING COUNT(*) > 1;
--
-- After duplicates are cleared, apply:
--   CREATE UNIQUE INDEX IF NOT EXISTS vessels_mmsi_unique_idx
--     ON public.vessels (mmsi)
--     WHERE mmsi IS NOT NULL AND btrim(mmsi) <> '';
--   CREATE UNIQUE INDEX IF NOT EXISTS vessels_imo_unique_idx
--     ON public.vessels (imo)
--     WHERE imo IS NOT NULL AND btrim(imo) <> '';
