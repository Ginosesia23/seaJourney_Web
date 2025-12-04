-- RLS Policies for Token-Based Testimonial Access (Public/Anon Access)
-- Run this in your Supabase SQL Editor
-- This allows unauthenticated users (anon) to read and update testimonials using valid tokens
-- Captains only have the token and email - they don't have user_id or authentication

-- IMPORTANT: These policies work alongside existing user_id-based policies
-- - Existing policies allow authenticated users to access their own testimonials
-- - These new policies allow unauthenticated users (captains) to access testimonials by token
-- Supabase combines multiple policies with OR, so either condition works

-- Drop existing token-based policies if they exist (will recreate them)
DROP POLICY IF EXISTS "Allow public read by signoff token" ON testimonials;
DROP POLICY IF EXISTS "Allow public update by signoff token" ON testimonials;

-- Policy to allow reading testimonials by signoff token
-- This works for anon users (captains) who only have the token
-- The API route validates the token matches and checks email
CREATE POLICY "Allow public read by signoff token"
  ON testimonials FOR SELECT
  TO anon, authenticated
  USING (
    signoff_token IS NOT NULL
  );

-- Policy to allow updating testimonials by signoff token
-- This works for anon users (captains) who only have the token
-- The API route validates the token matches before allowing updates
CREATE POLICY "Allow public update by signoff token"
  ON testimonials FOR UPDATE
  TO anon, authenticated
  USING (
    signoff_token IS NOT NULL
  )
  WITH CHECK (
    signoff_token IS NOT NULL
  );

-- Note: 
-- - These policies allow reading/updating ANY testimonial with a signoff_token
-- - The API routes handle all security validation:
--   - Token from URL must match signoff_token column
--   - Email from URL must match signoff_target_email column
--   - Token must not be expired (signoff_token_expires_at > NOW())
--   - Token must not be used (signoff_used_at IS NULL)
--   - Status must be 'pending_captain'
-- - The RLS policies only provide basic access - detailed security is in the API routes
