-- Add date of birth and sex (gender) fields to users table for MCA applications
-- These fields are required for MCA Watch Rating Certificate applications

-- Add date_of_birth column (DATE type for proper date handling)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add sex column (TEXT type, values: 'male' or 'female')
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IS NULL OR sex IN ('male', 'female'));

-- Add comments for documentation
COMMENT ON COLUMN public.users.date_of_birth IS 'Date of birth for MCA applications (format: YYYY-MM-DD)';
COMMENT ON COLUMN public.users.sex IS 'Gender/sex for MCA applications. Values: male or female';
