-- Migration: Add vessel_id and vessel_name columns to existing vessel_sea_time_access_requests table
-- This migration updates existing requests with vessel information

-- Add columns if they don't exist
ALTER TABLE public.vessel_sea_time_access_requests 
ADD COLUMN IF NOT EXISTS vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS vessel_name TEXT;

-- Create index for vessel_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_vessel_sea_time_access_vessel_id ON public.vessel_sea_time_access_requests(vessel_id);

-- Update existing requests with vessel information
-- This looks up the vessel from the vessel_user's active_vessel_id
UPDATE public.vessel_sea_time_access_requests vsar
SET 
  vessel_id = u.active_vessel_id,
  vessel_name = COALESCE(v.name, 'Unknown Vessel')
FROM public.users u
LEFT JOIN public.vessels v ON v.id = u.active_vessel_id
WHERE vsar.vessel_user_id = u.id
  AND vsar.vessel_id IS NULL
  AND u.active_vessel_id IS NOT NULL;

-- Set default values for any remaining NULL values
UPDATE public.vessel_sea_time_access_requests
SET vessel_name = 'Unknown Vessel'
WHERE vessel_name IS NULL;

-- Now make columns NOT NULL (after setting defaults)
ALTER TABLE public.vessel_sea_time_access_requests
ALTER COLUMN vessel_id SET NOT NULL,
ALTER COLUMN vessel_name SET NOT NULL;

COMMENT ON COLUMN public.vessel_sea_time_access_requests.vessel_id IS 'The vessel ID associated with this request (from vessel_user active_vessel_id)';
COMMENT ON COLUMN public.vessel_sea_time_access_requests.vessel_name IS 'The vessel name (stored for easy display without joins)';
