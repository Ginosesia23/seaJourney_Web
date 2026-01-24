-- Add company address and contact columns to vessels table
-- Note: management_company column already exists

ALTER TABLE vessels 
ADD COLUMN IF NOT EXISTS company_address TEXT NULL,
ADD COLUMN IF NOT EXISTS company_contact TEXT NULL;

COMMENT ON COLUMN vessels.management_company IS 'Company or management company name. Used in testimonials and official documents.';
COMMENT ON COLUMN vessels.company_address IS 'Full company address. Used in testimonials and official documents.';
COMMENT ON COLUMN vessels.company_contact IS 'Company contact details (phone, email, etc.). Used in testimonials and official documents.';

