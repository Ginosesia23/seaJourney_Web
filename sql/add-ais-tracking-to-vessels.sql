-- AIS live tracking (Datalastic) for vessel Premium / Professional tiers.
-- When enabled, SeaJourney derives daily_state_logs from AIS navigational status.

ALTER TABLE public.vessels
ADD COLUMN IF NOT EXISTS ais_tracking_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ais_last_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS ais_last_nav_status text,
ADD COLUMN IF NOT EXISTS ais_last_speed numeric,
ADD COLUMN IF NOT EXISTS ais_last_position_at timestamptz,
ADD COLUMN IF NOT EXISTS ais_last_sync_error text;

COMMENT ON COLUMN public.vessels.ais_tracking_enabled IS
  'When true, daily vessel state is updated from Datalastic AIS data instead of manual entry.';
COMMENT ON COLUMN public.vessels.ais_last_sync_at IS 'Last time SeaJourney polled Datalastic for this vessel.';
COMMENT ON COLUMN public.vessels.ais_last_nav_status IS 'Raw navigational_status from the last successful AIS poll.';
COMMENT ON COLUMN public.vessels.ais_last_speed IS 'Speed (kn) from the last successful AIS poll.';
COMMENT ON COLUMN public.vessels.ais_last_position_at IS 'AIS position timestamp (UTC) from the last successful poll.';
COMMENT ON COLUMN public.vessels.ais_last_sync_error IS 'Last sync failure message, cleared on success.';
