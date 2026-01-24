-- Ensure public access policy exists for approved_testimonials verification
-- This allows anyone (including unauthenticated users) to verify records using testimonial codes

-- Drop existing policy if it exists (to recreate with correct settings)
DROP POLICY IF EXISTS "Public can verify approved testimonials" ON public.approved_testimonials;

-- Create policy: Allow public SELECT access for verification purposes
-- This enables the verify page to work without requiring user authentication
CREATE POLICY "Public can verify approved testimonials"
ON public.approved_testimonials
FOR SELECT
USING (true); -- Allow public read access for verification purposes

COMMENT ON POLICY "Public can verify approved testimonials" ON public.approved_testimonials IS 
'Allows unauthenticated users to verify approved testimonials using testimonial codes. This is necessary for public verification functionality where officials or users need to verify records without logging in.';
