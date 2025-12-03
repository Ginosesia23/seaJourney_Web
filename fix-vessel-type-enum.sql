-- Fix vessel type enum or add CHECK constraint
-- Run this in your Supabase SQL Editor

DO $$
BEGIN
    -- Step 1: Drop any existing CHECK constraints first
    ALTER TABLE vessels DROP CONSTRAINT IF EXISTS vessels_type_check;
    ALTER TABLE vessels DROP CONSTRAINT IF EXISTS type_check;
    
    -- Step 2: Check if there's an existing enum type
    IF EXISTS (
        SELECT 1 
        FROM pg_type 
        WHERE typname = 'vessel_type'
    ) THEN
        -- Step 3: Convert the column from enum to TEXT (using USING clause to cast)
        ALTER TABLE vessels ALTER COLUMN type TYPE TEXT USING type::TEXT;
        
        -- Step 4: Drop the enum type (CASCADE will drop any dependencies)
        DROP TYPE IF EXISTS vessel_type CASCADE;
        
        RAISE NOTICE 'Removed existing vessel_type enum and converted column to TEXT.';
    END IF;
    
    -- Step 5: Now update any existing values that don't match our new enum to 'other'
    -- We need to check what values exist first and update them
    UPDATE vessels 
    SET type = 'other' 
    WHERE type IS NOT NULL 
    AND type NOT IN ('motor-yacht', 'sailing-yacht', 'catamaran', 'superyacht', 'megayacht', 'trawler', 'fishing-vessel', 'cargo-ship', 'container-ship', 'tanker', 'cruise-ship', 'ferry', 'research-vessel', 'offshore-vessel', 'other');
    
    -- Step 6: Add the CHECK constraint
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'vessels_type_check' 
        AND table_name = 'vessels'
    ) THEN
        ALTER TABLE vessels 
        ADD CONSTRAINT vessels_type_check 
        CHECK (type IN ('motor-yacht', 'sailing-yacht', 'catamaran', 'superyacht', 'megayacht', 'trawler', 'fishing-vessel', 'cargo-ship', 'container-ship', 'tanker', 'cruise-ship', 'ferry', 'research-vessel', 'offshore-vessel', 'other'));
        
        RAISE NOTICE 'CHECK constraint added to vessels.type column.';
    ELSE
        RAISE NOTICE 'CHECK constraint already exists on vessels.type column.';
    END IF;
END $$;

