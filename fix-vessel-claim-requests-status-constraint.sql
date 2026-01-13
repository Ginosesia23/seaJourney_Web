-- Fix vessel_claim_requests status constraint
-- The constraint might have a different name or might not have been updated properly

-- First, check what constraints exist on the status column
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.vessel_claim_requests'::regclass
  AND conname LIKE '%status%';

-- Drop all existing status constraints (they might have different names)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.vessel_claim_requests'::regclass
          AND (conname LIKE '%status%' OR conname LIKE '%valid%')
    ) LOOP
        EXECUTE 'ALTER TABLE public.vessel_claim_requests DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add the correct constraint with explicit name
ALTER TABLE public.vessel_claim_requests
ADD CONSTRAINT vessel_claim_requests_status_check CHECK (
  status IN ('pending', 'vessel_approved', 'admin_approved', 'approved', 'rejected')
);

-- Verify the constraint was added
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.vessel_claim_requests'::regclass
  AND conname = 'vessel_claim_requests_status_check';

COMMENT ON CONSTRAINT vessel_claim_requests_status_check ON public.vessel_claim_requests IS 
'Ensures status is one of: pending, vessel_approved, admin_approved, approved, rejected';
