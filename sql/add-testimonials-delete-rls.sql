-- Add RLS policy to allow users to delete their own testimonials
-- Users should be able to delete their own testimonials, especially rejected ones

-- Policy: Users can delete their own testimonials
DROP POLICY IF EXISTS "Users can delete their own testimonials" ON public.testimonials;
CREATE POLICY "Users can delete their own testimonials"
ON public.testimonials
FOR DELETE
USING (
  -- Users can delete their own testimonials
  user_id = auth.uid()
  OR
  -- Admins can delete any testimonial
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMENT ON POLICY "Users can delete their own testimonials" ON public.testimonials IS 
'Allows users to delete their own testimonials. This enables users to remove rejected or unwanted testimonials from their account. Admins can delete any testimonial.';

