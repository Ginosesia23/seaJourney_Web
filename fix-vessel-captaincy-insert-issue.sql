-- Fix vessel_captaincy constraint violation
-- This script finds and fixes what's causing invalid status inserts

-- 1. First, let's see what triggers exist that might be inserting into vessel_captaincy
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('vessel_claim_requests', 'vessel_captaincy')
AND event_object_schema = 'public';

-- 2. Check for functions that insert into vessel_captaincy
-- Run this query separately if needed
SELECT 
    p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prosrc LIKE '%INSERT INTO%vessel_captaincy%';

-- 3. Check what the default status is set to (should be 'pending')
SELECT 
    column_name,
    column_default,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vessel_captaincy'
AND table_schema = 'public'
AND column_name = 'status';

-- 4. The issue might be that something is inserting without specifying status
-- Let's ensure the default is properly set and add a trigger to enforce it
-- First, make sure default is set correctly
ALTER TABLE public.vessel_captaincy 
ALTER COLUMN status SET DEFAULT 'pending';

-- 5. Create a trigger to ensure status is always valid (as a safety net)
CREATE OR REPLACE FUNCTION public.ensure_valid_vessel_captaincy_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If status is NULL or empty, set to 'pending'
    IF NEW.status IS NULL OR NEW.status = '' THEN
        NEW.status := 'pending';
    END IF;
    
    -- Convert 'active' to 'approved' (they mean the same thing)
    IF NEW.status = 'active' THEN
        NEW.status := 'approved';
    END IF;
    
    -- Validate status is one of the allowed values
    IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status value: %. Status must be one of: pending, approved, rejected', NEW.status;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_ensure_valid_vessel_captaincy_status ON public.vessel_captaincy;

-- Create trigger to enforce valid status before insert/update
CREATE TRIGGER trg_ensure_valid_vessel_captaincy_status
BEFORE INSERT OR UPDATE ON public.vessel_captaincy
FOR EACH ROW
EXECUTE FUNCTION public.ensure_valid_vessel_captaincy_status();

-- 6. Check if there are any existing rows with invalid status
SELECT DISTINCT status, COUNT(*) as count
FROM public.vessel_captaincy
GROUP BY status;

-- 7. Fix any existing rows with 'active' status (convert to 'approved')
UPDATE public.vessel_captaincy 
SET status = 'approved' 
WHERE status = 'active';

-- 8. Fix any other invalid statuses (convert to 'pending')
UPDATE public.vessel_captaincy 
SET status = 'pending' 
WHERE status NOT IN ('pending', 'approved', 'rejected');
