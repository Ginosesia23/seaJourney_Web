-- Add captain_license column to approved_testimonials if it doesn't exist
-- This is a safety migration in case the table was created without this column

DO $$
BEGIN
    -- Check if the column exists, and add it if it doesn't
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'approved_testimonials' 
        AND column_name = 'captain_license'
    ) THEN
        ALTER TABLE public.approved_testimonials
        ADD COLUMN captain_license TEXT NULL;
        
        COMMENT ON COLUMN public.approved_testimonials.captain_license IS 'Captain license/certification (e.g., MCA 500GT)';
        
        RAISE NOTICE 'Added captain_license column to approved_testimonials table';
    ELSE
        RAISE NOTICE 'Column captain_license already exists in approved_testimonials table';
    END IF;
END $$;

