-- Test query to verify RLS policy is working
-- Replace 'VESSEL_MANAGER_USER_ID' with your actual vessel manager user ID
-- Replace 'CREW_USER_ID' with a crew member's user ID that should be visible

-- First, check if the vessel manager can see their own profile
SELECT id, email, username, role, active_vessel_id 
FROM public.users 
WHERE id = 'VESSEL_MANAGER_USER_ID';  -- Replace with actual ID

-- Check what assignments exist for the vessel
SELECT va.*, u.role as user_role, u.active_vessel_id as user_active_vessel_id
FROM public.vessel_assignments va
INNER JOIN public.users u ON u.id = va.user_id
WHERE va.vessel_id = (
  SELECT active_vessel_id FROM public.users WHERE id = 'VESSEL_MANAGER_USER_ID'  -- Replace with actual ID
)
AND va.end_date IS NULL;

-- Test if vessel manager can see crew member profiles
-- This should return rows if the RLS policy is working
SELECT id, email, username, role 
FROM public.users 
WHERE id IN (
  SELECT va.user_id 
  FROM public.vessel_assignments va
  WHERE va.vessel_id = (SELECT active_vessel_id FROM public.users WHERE id = 'VESSEL_MANAGER_USER_ID')  -- Replace
  AND va.end_date IS NULL
)
AND role != 'vessel';

