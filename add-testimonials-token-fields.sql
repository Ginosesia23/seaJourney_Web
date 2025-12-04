-- Add token fields to testimonials table for secure signoff links
-- Run this in your Supabase SQL Editor

ALTER TABLE testimonials 
ADD COLUMN IF NOT EXISTS signoff_token UUID,
ADD COLUMN IF NOT EXISTS signoff_token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signoff_target_email TEXT,
ADD COLUMN IF NOT EXISTS signoff_used_at TIMESTAMPTZ;

-- Create index for token lookups
CREATE INDEX IF NOT EXISTS idx_testimonials_signoff_token ON testimonials(signoff_token) WHERE signoff_token IS NOT NULL;

-- Create index for token expiration queries
CREATE INDEX IF NOT EXISTS idx_testimonials_signoff_token_expires ON testimonials(signoff_token_expires_at) WHERE signoff_token_expires_at IS NOT NULL;

