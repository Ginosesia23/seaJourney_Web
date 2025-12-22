-- Add vessel_manager_id column to vessels table
-- This column stores the user ID of the vessel manager (user with role='vessel' who manages this vessel)
-- This allows approved captains to easily find and fetch the vessel manager's logs

DO $$
BEGIN
  -- Add vessel_manager_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'vessel_manager_id'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN vessel_manager_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
    
    COMMENT ON COLUMN public.vessels.vessel_manager_id IS 'User ID of the vessel manager (user with role=vessel who manages this vessel). Used to fetch vessel account logs.';
    
    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_vessels_vessel_manager_id ON public.vessels(vessel_manager_id);
  END IF;
END $$;
