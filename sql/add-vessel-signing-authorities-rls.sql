-- RLS policies for vessel_signing_authorities table
-- This table tracks which captains are authorized to sign testimonials for vessels

-- Enable RLS if not already enabled
ALTER TABLE public.vessel_signing_authorities ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active signing authorities (public information)
-- This allows crew members to find active captains when requesting testimonials
CREATE POLICY "Users can view active signing authorities"
ON public.vessel_signing_authorities
FOR SELECT
USING (end_date IS NULL);

COMMENT ON POLICY "Users can view active signing authorities" ON public.vessel_signing_authorities IS 
'Allows all authenticated users to view active signing authorities (where end_date IS NULL). This is necessary for crew members to identify active captains when requesting testimonials. Active signing authorities are considered public information.';

-- Policy: Only admins can insert signing authorities (through API routes with supabaseAdmin)
-- Regular users cannot directly insert/update/delete - this is managed through the approval process
-- Note: Insert/update/delete operations should be done via API routes using supabaseAdmin
