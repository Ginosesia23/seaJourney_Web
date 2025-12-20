-- Add additional vessel detail fields to vessels table
-- These fields allow vessel managers to store comprehensive vessel information

DO $$
BEGIN
  -- Add length_m (in meters)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'length_m'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN length_m NUMERIC(10, 2) NULL;
    
    COMMENT ON COLUMN public.vessels.length_m IS 'Length of the vessel in meters';
  END IF;

  -- Add number of crew
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'number_of_crew'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN number_of_crew INTEGER NULL;
    
    COMMENT ON COLUMN public.vessels.number_of_crew IS 'Number of crew members on the vessel';
  END IF;

  -- Add gross_tonnage (gross tonnage in tonnes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'gross_tonnage'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN gross_tonnage NUMERIC(10, 2) NULL;
    
    COMMENT ON COLUMN public.vessels.gross_tonnage IS 'Gross tonnage in tonnes';
  END IF;

  -- Add beam (width in meters)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'beam'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN beam NUMERIC(10, 2) NULL;
    
    COMMENT ON COLUMN public.vessels.beam IS 'Beam (width) of the vessel in meters';
  END IF;

  -- Add draft (in meters)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'draft'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN draft NUMERIC(10, 2) NULL;
    
    COMMENT ON COLUMN public.vessels.draft IS 'Draft of the vessel in meters';
  END IF;

  -- Add build_year
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'build_year'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN build_year INTEGER NULL;
    
    COMMENT ON COLUMN public.vessels.build_year IS 'Year the vessel was built';
  END IF;

  -- Add flag state (country of registration)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'flag_state'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN flag_state TEXT NULL;
    
    COMMENT ON COLUMN public.vessels.flag_state IS 'Flag state (country of registration)';
  END IF;

  -- Add call sign
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'call_sign'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN call_sign TEXT NULL;
    
    COMMENT ON COLUMN public.vessels.call_sign IS 'Radio call sign';
  END IF;

  -- Add MMSI (Maritime Mobile Service Identity)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'mmsi'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN mmsi TEXT NULL;
    
    COMMENT ON COLUMN public.vessels.mmsi IS 'Maritime Mobile Service Identity number';
  END IF;

  -- Add description/notes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vessels' 
    AND column_name = 'description'
  ) THEN
    ALTER TABLE public.vessels 
    ADD COLUMN description TEXT NULL;
    
    COMMENT ON COLUMN public.vessels.description IS 'Additional vessel description or notes';
  END IF;
END $$;
