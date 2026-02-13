-- One-time share link for vessel-generated documents (send to captain)
ALTER TABLE public.vessel_generated_testimonials
ADD COLUMN IF NOT EXISTS share_token TEXT NULL,
ADD COLUMN IF NOT EXISTS share_token_expires_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS share_sent_to_email TEXT NULL,
ADD COLUMN IF NOT EXISTS share_used_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vessel_generated_testimonials_share_token
ON public.vessel_generated_testimonials(share_token)
WHERE share_token IS NOT NULL;

COMMENT ON COLUMN public.vessel_generated_testimonials.share_token IS 'One-time token for captain to view/download this document.';
COMMENT ON COLUMN public.vessel_generated_testimonials.share_token_expires_at IS 'When the share link expires (e.g. 7 days).';
COMMENT ON COLUMN public.vessel_generated_testimonials.share_sent_to_email IS 'Email address the share link was sent to (captain).';
COMMENT ON COLUMN public.vessel_generated_testimonials.share_used_at IS 'When the captain first opened the link (one-time use).';
