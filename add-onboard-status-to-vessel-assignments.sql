-- Add onboard status to vessel_assignments table
-- This allows vessel accounts to track which crew members are currently onboard
-- When requesting testimonials, the system will send to the onboard captain

-- Add onboard column (defaults to false for existing records)
ALTER TABLE public.vessel_assignments
ADD COLUMN IF NOT EXISTS onboard BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient queries to find onboard crew
CREATE INDEX IF NOT EXISTS idx_vessel_assignments_onboard 
ON public.vessel_assignments(vessel_id, onboard) 
WHERE onboard = true AND end_date IS NULL;

-- Add comment
COMMENT ON COLUMN public.vessel_assignments.onboard IS 
'Indicates if the crew member is currently onboard the vessel. Used to determine which captain should receive testimonial requests. Only vessel accounts can update this field.';

-- Update RLS policies to allow vessel accounts to update onboard status for their vessel's crew
-- Vessel accounts can update onboard status for crew members assigned to their active vessel
DROP POLICY IF EXISTS "Vessel managers can update onboard status for their vessel crew" ON public.vessel_assignments;

CREATE POLICY "Vessel managers can update onboard status for their vessel crew"
ON public.vessel_assignments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessel_assignments.vessel_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessel_assignments.vessel_id
  )
);

-- Also allow vessel accounts to view assignments for their vessel (if not already allowed)
DROP POLICY IF EXISTS "Vessel managers can view assignments for their vessel" ON public.vessel_assignments;

CREATE POLICY "Vessel managers can view assignments for their vessel"
ON public.vessel_assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
      AND users.role = 'vessel'
      AND users.active_vessel_id = vessel_assignments.vessel_id
  )
  OR auth.uid() = vessel_assignments.user_id -- Users can always view their own assignments
);

COMMENT ON POLICY "Vessel managers can update onboard status for their vessel crew" ON public.vessel_assignments IS 
'Allows vessel account users to toggle onboard/offboard status for crew members assigned to their active vessel.';
