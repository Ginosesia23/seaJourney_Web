-- Add CHECK constraint for vessel type enum
-- Run this in your Supabase SQL Editor
-- NOTE: If you get an error about an existing enum, use fix-vessel-type-enum.sql instead

DO $$
BEGIN
    -- First, check if there's an existing enum type that might conflict
    IF EXISTS (
        SELECT 1 
        FROM pg_type 
        WHERE typname = 'vessel_type'
    ) THEN
        RAISE EXCEPTION 'An existing vessel_type enum was found. Please run fix-vessel-type-enum.sql instead to handle the migration.';
    END IF;
    
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'vessels_type_check' 
        AND table_name = 'vessels'
    ) THEN
        -- First, update any existing invalid values to 'other'
        UPDATE vessels 
        SET type = 'other' 
        WHERE type NOT IN ('motor-yacht', 'sailing-yacht', 'catamaran', 'superyacht', 'megayacht', 'trawler', 'fishing-vessel', 'cargo-ship', 'container-ship', 'tanker', 'cruise-ship', 'ferry', 'research-vessel', 'offshore-vessel', 'other');
        
        -- Add the CHECK constraint
        ALTER TABLE vessels 
        ADD CONSTRAINT vessels_type_check 
        CHECK (type IN ('motor-yacht', 'sailing-yacht', 'catamaran', 'superyacht', 'megayacht', 'trawler', 'fishing-vessel', 'cargo-ship', 'container-ship', 'tanker', 'cruise-ship', 'ferry', 'research-vessel', 'offshore-vessel', 'other'));
        
        RAISE NOTICE 'CHECK constraint added to vessels.type column.';
    ELSE
        RAISE NOTICE 'CHECK constraint already exists on vessels.type column.';
    END IF;
END $$;

