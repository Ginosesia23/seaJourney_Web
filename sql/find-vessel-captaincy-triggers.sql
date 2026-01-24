-- Find what's causing the vessel_captaincy constraint violation
-- Run these queries one at a time

-- 1. Check all triggers on vessel_claim_requests
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'vessel_claim_requests'
AND event_object_schema = 'public';

-- 2. Check for triggers on vessel_captaincy itself
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'vessel_captaincy'
AND event_object_schema = 'public';

-- 3. Check what functions exist that might reference vessel_captaincy
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
    p.prosrc LIKE '%vessel_captaincy%'
    OR p.prosrc LIKE '%vessel_claim_requests%'
);

-- 4. Check if there are any recent inserts into vessel_captaincy (if you have audit logging)
-- This might help identify what's trying to insert
SELECT * FROM public.vessel_captaincy 
ORDER BY created_at DESC 
LIMIT 10;

-- 5. The simplest solution: Drop the vessel_captaincy table if it's not being used
-- Uncomment the line below to drop it:
-- DROP TABLE IF EXISTS public.vessel_captaincy CASCADE;
