-- Reactivate signing authorities for all approved captains
-- This fixes the issue where signing authorities were ended when a second captain was approved
-- Only reactivates signing authorities for captains who have approved vessel_claim_requests

-- Reactivate signing authorities for captains with approved vessel_claim_requests
-- IMPORTANT: Vessels can have up to 2 active captains, but only ONE can be primary
-- The exclusion constraint "one_active_primary_per_vessel" enforces: only one captain 
-- can have is_primary=true AND end_date IS NULL at the same time per vessel
-- Strategy: 
-- 1. First, reactivate ALL inactive captains as non-primary (to avoid constraint violation)
-- 2. Then, if there's no existing active primary, set the first reactivated one as primary
-- Result: Both captains will be active (end_date IS NULL), but only one will be primary

-- Step 1: Reactivate signing authorities, but set ALL as non-primary initially
-- This avoids the constraint violation
UPDATE public.vessel_signing_authorities vsa
SET 
  end_date = NULL,
  start_date = CURRENT_DATE,
  is_primary = false -- Set all as non-primary initially
FROM public.vessel_claim_requests vcr
WHERE vsa.captain_user_id = vcr.requested_by
  AND vsa.vessel_id = vcr.vessel_id
  AND vcr.status = 'approved'
  AND vsa.end_date IS NOT NULL; -- Only inactive ones

-- Step 2: For each vessel, check if there's an existing active primary
-- If not, set the first reactivated one as primary
WITH vessels_without_primary AS (
  SELECT DISTINCT vsa.vessel_id
  FROM public.vessel_signing_authorities vsa
  JOIN public.vessel_claim_requests vcr 
    ON vsa.captain_user_id = vcr.requested_by 
    AND vsa.vessel_id = vcr.vessel_id
  WHERE vcr.status = 'approved'
    AND vsa.end_date IS NULL
    AND vsa.start_date = CURRENT_DATE -- Just reactivated
    AND NOT EXISTS (
      -- Check if there's an active primary that wasn't just reactivated
      SELECT 1 
      FROM public.vessel_signing_authorities existing
      WHERE existing.vessel_id = vsa.vessel_id
        AND existing.end_date IS NULL
        AND existing.is_primary = true
        AND existing.start_date != CURRENT_DATE -- Not just reactivated
    )
),
reactivation_candidates AS (
  SELECT 
    vsa.id,
    vsa.vessel_id,
    ROW_NUMBER() OVER (
      PARTITION BY vsa.vessel_id 
      ORDER BY COALESCE(vcr.vessel_approved_at, vcr.admin_approved_at, vcr.created_at) ASC, vsa.start_date ASC
    ) as rn
  FROM public.vessel_signing_authorities vsa
  JOIN public.vessel_claim_requests vcr 
    ON vsa.captain_user_id = vcr.requested_by 
    AND vsa.vessel_id = vcr.vessel_id
  JOIN vessels_without_primary vwp ON vwp.vessel_id = vsa.vessel_id
  WHERE vcr.status = 'approved'
    AND vsa.end_date IS NULL
    AND vsa.start_date = CURRENT_DATE -- Just reactivated
)
-- Set the first reactivated one as primary ONLY if there's no existing active primary
UPDATE public.vessel_signing_authorities vsa
SET is_primary = true
FROM reactivation_candidates rc
WHERE vsa.id = rc.id
  AND rc.rn = 1; -- First one

-- Step 3: Ensure any currently active signing authorities follow the one-primary rule
-- If there are multiple active primaries, keep only the oldest one as primary
WITH active_primaries AS (
  SELECT 
    id,
    vessel_id,
    start_date,
    ROW_NUMBER() OVER (
      PARTITION BY vessel_id 
      ORDER BY start_date ASC
    ) as rn
  FROM public.vessel_signing_authorities
  WHERE end_date IS NULL
    AND is_primary = true
)
UPDATE public.vessel_signing_authorities vsa
SET is_primary = false
FROM active_primaries ap
WHERE vsa.id = ap.id
  AND ap.rn > 1; -- Keep only the first one as primary

-- Verify the update
SELECT 
  vsa.captain_user_id,
  vsa.vessel_id,
  vsa.is_primary,
  vsa.start_date,
  vsa.end_date,
  vcr.status as claim_status
FROM public.vessel_signing_authorities vsa
JOIN public.vessel_claim_requests vcr 
  ON vsa.captain_user_id = vcr.requested_by 
  AND vsa.vessel_id = vcr.vessel_id
WHERE vcr.status = 'approved'
ORDER BY vsa.vessel_id, vsa.is_primary DESC, vsa.start_date DESC;
