-- Fix vessel_captaincy constraint violation issue
-- This script checks for triggers and ensures vessel_captaincy is not being used incorrectly

-- 1. Check for triggers on vessel_claim_requests that might insert into vessel_captaincy
SELECT 
    t.trigger_name,
    t.event_manipulation,
    t.event_object_table,
    t.action_statement,
    t.action_timing
FROM information_schema.triggers t
WHERE t.event_object_table = 'vessel_claim_requests'
AND t.event_object_schema = 'public';

-- 2. Check for functions that reference vessel_captaincy
-- Note: This query checks function definitions, which might be large
SELECT 
    p.proname AS function_name,
    n.nspname AS schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
    p.prosrc LIKE '%vessel_captaincy%'
    OR p.prosrc LIKE '%vessel_claim_requests%'
);

-- 2b. Get the full function definition for any functions found above
-- Replace <function_name> with the actual function name from the query above
-- SELECT pg_get_functiondef(p.oid) 
-- FROM pg_proc p 
-- JOIN pg_namespace n ON p.pronamespace = n.oid 
-- WHERE n.nspname = 'public' AND p.proname = '<function_name>';

-- 3. If vessel_captaincy table is not being used, we can either:
--    Option A: Drop the table entirely (if it's legacy)
--    Option B: Modify the constraint to allow the status being inserted
--    Option C: Ensure any inserts use valid status values

-- Option A: Drop vessel_captaincy table if it's not being used
-- Uncomment the following lines if you want to drop the table:
-- DROP TABLE IF EXISTS public.vessel_captaincy CASCADE;

-- Option B: Check what status values are being inserted
-- Run this query to see what's in vessel_captaincy:
SELECT DISTINCT status FROM public.vessel_captaincy;

-- Option C: If you need to keep vessel_captaincy, ensure inserts use valid status
-- The constraint allows: 'pending', 'approved', 'rejected'
-- Make sure any code inserting into this table uses one of these values

-- 4. If there's a trigger causing the issue, drop it:
-- First, find the trigger name from the query above, then:
-- DROP TRIGGER IF EXISTS <trigger_name> ON public.vessel_claim_requests;
