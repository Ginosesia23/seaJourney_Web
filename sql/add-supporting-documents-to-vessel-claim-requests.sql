-- Add supporting_documents column to vessel_claim_requests table
-- This column will store an array of document URLs that prove the user is the captain of the vessel

ALTER TABLE public.vessel_claim_requests
ADD COLUMN IF NOT EXISTS supporting_documents TEXT[] NULL;

-- Add comment to the column for documentation
COMMENT ON COLUMN public.vessel_claim_requests.supporting_documents IS 'Array of document URLs (certificates, licenses, contracts, etc.) that prove the user is the captain of the vessel. Required for vessel claim requests.';

-- Create index for faster queries (though arrays are less commonly indexed)
-- This index can help with queries that check if documents exist
CREATE INDEX IF NOT EXISTS idx_vessel_claim_requests_has_documents 
ON public.vessel_claim_requests USING GIN (supporting_documents)
WHERE supporting_documents IS NOT NULL AND array_length(supporting_documents, 1) > 0;
