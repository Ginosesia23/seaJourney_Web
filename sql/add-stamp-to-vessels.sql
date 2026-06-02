-- Add ship's stamp column to vessels table
-- Stored as a base64 data URL (same pattern as users.signature) so the stamp
-- can be embedded directly into generated PDFs without a separate storage
-- bucket or signed-URL round-trip.

ALTER TABLE vessels
ADD COLUMN IF NOT EXISTS stamp TEXT NULL;

COMMENT ON COLUMN vessels.stamp IS 'Vessel ship''s stamp as a base64 image data URL (PNG/JPEG). Used to auto-embed the stamp into vessel-generated documents such as testimonials.';
