-- Remove any triggers that might be syncing vessel_claim_requests to vessel_captaincy
-- This should fix the constraint violation error

-- Check for and drop any triggers on vessel_claim_requests that reference vessel_captaincy
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Find all triggers on vessel_claim_requests table
    FOR trigger_record IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'vessel_claim_requests'
        AND event_object_schema = 'public'
    LOOP
        -- Drop the trigger
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.vessel_claim_requests', trigger_record.trigger_name);
        RAISE NOTICE 'Dropped trigger: %', trigger_record.trigger_name;
    END LOOP;
END $$;

-- Also check for functions that might be inserting into vessel_captaincy
-- List all functions that reference vessel_captaincy
SELECT 
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND pg_get_functiondef(p.oid) LIKE '%vessel_captaincy%';

-- Note: If you find a function that's inserting into vessel_captaincy,
-- you'll need to either drop it or modify it to not insert invalid status values
