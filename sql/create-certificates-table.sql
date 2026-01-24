-- Create certificates table to track user certificates
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Certificate information
  certificate_name TEXT NOT NULL, -- e.g., "STCW Basic Safety", "Medical Certificate", "Watch Rating"
  certificate_type TEXT NOT NULL, -- e.g., "STCW", "Medical", "MCA", "Other"
  certificate_number TEXT NULL, -- Certificate number/reference if available
  issuing_authority TEXT NULL, -- e.g., "MCA", "USCG", "Transport Canada"
  issue_date DATE NOT NULL, -- Date when the certificate was issued
  expiry_date DATE NULL, -- Date when the certificate expires (null if no expiry)
  
  -- Renewal information
  renewal_required BOOLEAN DEFAULT true, -- Whether this certificate requires renewal
  renewal_notice_days INTEGER DEFAULT 90, -- Days before expiry to send notice
  
  -- Additional details
  notes TEXT NULL, -- Optional notes about the certificate
  document_url TEXT NULL, -- URL to uploaded certificate document if available
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Validation
  CONSTRAINT expiry_after_issue CHECK (expiry_date IS NULL OR expiry_date >= issue_date)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_expiry_date ON public.certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_certificates_certificate_type ON public.certificates(certificate_type);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_certificates_updated_at ON public.certificates;
CREATE TRIGGER trg_certificates_updated_at
BEFORE UPDATE ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can update own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can delete own certificates" ON public.certificates;

-- Users can view their own certificates
CREATE POLICY "Users can view own certificates"
ON public.certificates
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own certificates
CREATE POLICY "Users can insert own certificates"
ON public.certificates
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own certificates
CREATE POLICY "Users can update own certificates"
ON public.certificates
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own certificates
CREATE POLICY "Users can delete own certificates"
ON public.certificates
FOR DELETE
USING (auth.uid() = user_id);

COMMENT ON TABLE public.certificates IS 'Stores user certificates for tracking expiration and renewal dates';
COMMENT ON COLUMN public.certificates.certificate_name IS 'Name of the certificate (e.g., STCW Basic Safety)';
COMMENT ON COLUMN public.certificates.certificate_type IS 'Type/category of certificate (e.g., STCW, Medical, MCA)';
COMMENT ON COLUMN public.certificates.renewal_notice_days IS 'Number of days before expiry to send renewal notice (default 90)';
