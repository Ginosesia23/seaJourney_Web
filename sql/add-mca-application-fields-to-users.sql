-- Add MCA Application fields to users table
-- These fields will be used to auto-populate MCA Watch Rating Certificate applications

-- Add personal details fields for MCA applications
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS title TEXT, -- Mr/Mrs/Miss/etc
ADD COLUMN IF NOT EXISTS place_of_birth TEXT,
ADD COLUMN IF NOT EXISTS country_of_birth TEXT,
ADD COLUMN IF NOT EXISTS nationality TEXT,
ADD COLUMN IF NOT EXISTS telephone TEXT,
ADD COLUMN IF NOT EXISTS mobile TEXT;

-- Add address fields (stored as separate columns for easier querying)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS address_line2 TEXT,
ADD COLUMN IF NOT EXISTS address_district TEXT,
ADD COLUMN IF NOT EXISTS address_town_city TEXT,
ADD COLUMN IF NOT EXISTS address_county_state TEXT,
ADD COLUMN IF NOT EXISTS address_post_code TEXT,
ADD COLUMN IF NOT EXISTS address_country TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.users.title IS 'Title (Mr/Mrs/Miss/etc) for MCA applications';
COMMENT ON COLUMN public.users.place_of_birth IS 'Place of birth for MCA applications';
COMMENT ON COLUMN public.users.country_of_birth IS 'Country of birth for MCA applications';
COMMENT ON COLUMN public.users.nationality IS 'Nationality for MCA applications';
COMMENT ON COLUMN public.users.telephone IS 'Telephone number for MCA applications';
COMMENT ON COLUMN public.users.mobile IS 'Mobile number for MCA applications';
COMMENT ON COLUMN public.users.address_line1 IS 'Address line 1 for MCA applications';
COMMENT ON COLUMN public.users.address_line2 IS 'Address line 2 for MCA applications';
COMMENT ON COLUMN public.users.address_district IS 'Address district for MCA applications';
COMMENT ON COLUMN public.users.address_town_city IS 'Town/City for MCA applications';
COMMENT ON COLUMN public.users.address_county_state IS 'County/State for MCA applications';
COMMENT ON COLUMN public.users.address_post_code IS 'Post code for MCA applications';
COMMENT ON COLUMN public.users.address_country IS 'Country for MCA applications';
