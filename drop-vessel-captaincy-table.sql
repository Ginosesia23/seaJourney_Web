-- Drop vessel_captaincy table if it's causing constraint violations
-- This table appears to be legacy/unused since we're using vessel_claim_requests instead

-- First, drop any dependent objects
DROP TRIGGER IF EXISTS trg_vessel_captaincy_updated_at ON public.vessel_captaincy;
DROP POLICY IF EXISTS "Users can view own captaincy requests" ON public.vessel_captaincy;
DROP POLICY IF EXISTS "Users can insert own captaincy requests" ON public.vessel_captaincy;
DROP POLICY IF EXISTS "Users can update own pending requests" ON public.vessel_captaincy;

-- Drop indexes
DROP INDEX IF EXISTS idx_vessel_captaincy_vessel_id;
DROP INDEX IF EXISTS idx_vessel_captaincy_user_id;
DROP INDEX IF EXISTS idx_vessel_captaincy_status;
DROP INDEX IF EXISTS idx_vessel_captaincy_pending_unique;

-- Finally, drop the table
DROP TABLE IF EXISTS public.vessel_captaincy CASCADE;

-- Note: CASCADE will drop any foreign key constraints that reference this table
-- If you have other tables referencing vessel_captaincy, you'll need to handle those first
