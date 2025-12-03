-- Rename official_number column to imo in vessels table
-- Run this in your Supabase SQL Editor

DO $$
BEGIN
    -- Check if official_number column exists and imo doesn't
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'vessels' 
        AND column_name = 'official_number'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'vessels' 
        AND column_name = 'imo'
    ) THEN
        -- Rename the column
        ALTER TABLE vessels RENAME COLUMN official_number TO imo;
        RAISE NOTICE 'Column official_number renamed to imo.';
    ELSIF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'vessels' 
        AND column_name = 'imo'
    ) THEN
        RAISE NOTICE 'Column imo already exists.';
    ELSE
        -- If official_number doesn't exist, add imo column
        ALTER TABLE vessels ADD COLUMN imo TEXT;
        RAISE NOTICE 'Column imo added to vessels table.';
    END IF;
END $$;

