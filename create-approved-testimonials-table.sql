-- Create approved_testimonials table to store immutable snapshots of approved testimonials
-- Use IF NOT EXISTS to avoid errors if table already exists
CREATE TABLE IF NOT EXISTS public.approved_testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Original testimonial reference
  testimonial_id UUID NOT NULL REFERENCES public.testimonials(id) ON DELETE CASCADE,
  
  -- Crew member information
  crew_name TEXT NOT NULL,
  rank TEXT NOT NULL, -- Position/rank of the crew member
  
  -- Vessel information
  vessel_name TEXT NOT NULL,
  imo TEXT NULL, -- IMO number if available
  
  -- Service dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Service breakdown
  total_days INTEGER NOT NULL,
  sea_days INTEGER NOT NULL,
  standby_days INTEGER NOT NULL,
  
  -- Captain information
  captain_name TEXT NOT NULL,
  captain_license TEXT NULL, -- Captain's license/certification (e.g., "MCA 500GT")
  
  -- Document identification
  document_id UUID NOT NULL, -- The testimonial.id (UUID)
  testimonial_code TEXT NULL, -- The unique code (SJ-XXXX-XXXX) if available
  
  -- Approval timestamp
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one snapshot per testimonial (testimonials can only be approved once)
  UNIQUE(testimonial_id)
);

-- Add captain_license column if it doesn't exist (safety check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'approved_testimonials' 
        AND column_name = 'captain_license'
    ) THEN
        ALTER TABLE public.approved_testimonials
        ADD COLUMN captain_license TEXT NULL;
        
        COMMENT ON COLUMN public.approved_testimonials.captain_license IS 'Captain license/certification (e.g., MCA 500GT)';
    END IF;
END $$;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_approved_testimonials_testimonial_id ON public.approved_testimonials(testimonial_id);
CREATE INDEX IF NOT EXISTS idx_approved_testimonials_crew_name ON public.approved_testimonials(crew_name);
CREATE INDEX IF NOT EXISTS idx_approved_testimonials_vessel_name ON public.approved_testimonials(vessel_name);
CREATE INDEX IF NOT EXISTS idx_approved_testimonials_approved_at ON public.approved_testimonials(approved_at);
CREATE INDEX IF NOT EXISTS idx_approved_testimonials_document_id ON public.approved_testimonials(document_id);
CREATE INDEX IF NOT EXISTS idx_approved_testimonials_testimonial_code ON public.approved_testimonials(testimonial_code);

-- Enable RLS
ALTER TABLE public.approved_testimonials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own approved testimonials
CREATE POLICY "Users can view own approved testimonials"
ON public.approved_testimonials
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.testimonials
    WHERE testimonials.id = approved_testimonials.testimonial_id
    AND testimonials.user_id = auth.uid()
  )
);

-- Captains can view approved testimonials for their vessels
CREATE POLICY "Captains can view approved testimonials for their vessels"
ON public.approved_testimonials
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.testimonials
    JOIN public.vessel_assignments ON vessel_assignments.vessel_id = testimonials.vessel_id
    WHERE testimonials.id = approved_testimonials.testimonial_id
    AND vessel_assignments.user_id = auth.uid()
    AND vessel_assignments.end_date IS NULL
  )
);

-- Admins can view all approved testimonials
CREATE POLICY "Admins can view all approved testimonials"
ON public.approved_testimonials
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Public can view approved testimonials for verification (by testimonial_code or document_id)
-- This allows officials to verify records without authentication
CREATE POLICY "Public can verify approved testimonials"
ON public.approved_testimonials
FOR SELECT
USING (true); -- Allow public read access for verification purposes

-- Authenticated users can insert approved testimonials when they approve a testimonial
-- This ensures data integrity - only created when testimonial is actually approved
CREATE POLICY "Users can insert approved testimonials when approving"
ON public.approved_testimonials
FOR INSERT
WITH CHECK (
  -- Only allow insert if the testimonial exists and is approved
  -- And the user is either the captain who approved it, or an admin
  (
    EXISTS (
      SELECT 1 FROM public.testimonials
      WHERE testimonials.id = approved_testimonials.testimonial_id
      AND testimonials.status = 'approved'
      AND (
        testimonials.captain_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.users
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  )
);

-- No updates allowed (immutable snapshot)
-- No deletes allowed (immutable snapshot)

COMMENT ON TABLE public.approved_testimonials IS 'Immutable snapshots of approved testimonials for record keeping';
COMMENT ON COLUMN public.approved_testimonials.testimonial_id IS 'Reference to the original testimonial record';
COMMENT ON COLUMN public.approved_testimonials.document_id IS 'The testimonial UUID used as Document ID in PDF footer';
COMMENT ON COLUMN public.approved_testimonials.testimonial_code IS 'The unique reference code (SJ-XXXX-XXXX) if available';
COMMENT ON COLUMN public.approved_testimonials.captain_license IS 'Captain license/certification (e.g., MCA 500GT)';

