-- Add is_official column to vessels table
-- This column indicates whether a vessel was created/taken control by a vessel role user (true) or crew member (false)

-- Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'is_official'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN is_official BOOLEAN NOT NULL DEFAULT false;
    
    COMMENT ON COLUMN public.vessels.is_official IS 'Indicates if vessel was created/taken control by a vessel role user (true) or crew member (false)';
  END IF;
END $$;

