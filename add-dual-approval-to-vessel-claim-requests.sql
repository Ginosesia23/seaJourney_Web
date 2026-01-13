-- Add dual approval system for vessel claim requests
-- Vessel accounts and admins both need to approve before captaincy is granted
-- Also enforces maximum of 2 captains per vessel (for rotational partners)

-- Add new columns for vessel and admin approval tracking
ALTER TABLE public.vessel_claim_requests
ADD COLUMN IF NOT EXISTS vessel_approved_by UUID NULL REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS vessel_approved_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS admin_approved_by UUID NULL REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMPTZ NULL;

-- Update status constraint to include new intermediate states
-- Status flow: 'pending' -> 'vessel_approved' or 'admin_approved' -> 'approved' (when both approve) or 'rejected'
ALTER TABLE public.vessel_claim_requests
DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE public.vessel_claim_requests
ADD CONSTRAINT valid_status CHECK (
  status IN ('pending', 'vessel_approved', 'admin_approved', 'approved', 'rejected')
);

-- Add comments
COMMENT ON COLUMN public.vessel_claim_requests.vessel_approved_by IS 'User ID of the vessel account that approved this request';
COMMENT ON COLUMN public.vessel_claim_requests.vessel_approved_at IS 'Timestamp when the vessel account approved this request';
COMMENT ON COLUMN public.vessel_claim_requests.admin_approved_by IS 'User ID of the admin that approved this request';
COMMENT ON COLUMN public.vessel_claim_requests.admin_approved_at IS 'Timestamp when the admin approved this request';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_vessel_claim_requests_vessel_approved_by ON public.vessel_claim_requests(vessel_approved_by);
CREATE INDEX IF NOT EXISTS idx_vessel_claim_requests_admin_approved_by ON public.vessel_claim_requests(admin_approved_by);
CREATE INDEX IF NOT EXISTS idx_vessel_claim_requests_vessel_status ON public.vessel_claim_requests(vessel_id, status);

-- Function to count active captains for a vessel
-- Active captains are those with approved vessel_claim_requests (status = 'approved')
CREATE OR REPLACE FUNCTION public.count_active_captains_for_vessel(vessel_id_param UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  captain_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO captain_count
  FROM public.vessel_claim_requests
  WHERE vessel_id = vessel_id_param
    AND status = 'approved';
  
  RETURN captain_count;
END;
$$;

COMMENT ON FUNCTION public.count_active_captains_for_vessel IS 'Returns the count of approved captains for a given vessel (max 2 allowed)';

-- Update RLS policies to allow vessel accounts to update requests for their vessel
-- Vessel accounts can approve/reject requests for their own vessel
DROP POLICY IF EXISTS "Vessel managers can update claim requests for their vessel" ON public.vessel_claim_requests;

CREATE POLICY "Vessel managers can update claim requests for their vessel"
ON public.vessel_claim_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessel_claim_requests.vessel_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessel_claim_requests.vessel_id
  )
);

-- Admins can update any request
DROP POLICY IF EXISTS "Admins can update claim requests" ON public.vessel_claim_requests;

CREATE POLICY "Admins can update claim requests"
ON public.vessel_claim_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'admin'
  )
);
