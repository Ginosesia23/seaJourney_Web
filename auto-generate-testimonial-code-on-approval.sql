-- Auto-generate testimonial code when testimonial is approved
-- This ensures codes are always unique and generated on the backend

-- Function to generate a unique testimonial code in format SJ-XXXX-XXXX
CREATE OR REPLACE FUNCTION generate_testimonial_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  segment1 TEXT := '';
  segment2 TEXT := '';
  code TEXT;
  attempts INTEGER := 0;
  max_attempts INTEGER := 10;
BEGIN
  -- Try to generate a unique code
  LOOP
    -- Generate first segment (4 characters)
    segment1 := '';
    FOR i IN 1..4 LOOP
      segment1 := segment1 || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    -- Generate second segment (4 characters)
    segment2 := '';
    FOR i IN 1..4 LOOP
      segment2 := segment2 || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    code := 'SJ-' || segment1 || '-' || segment2;
    
    -- Check if code already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.testimonials 
      WHERE testimonial_code = code
    ) THEN
      RETURN code;
    END IF;
    
    attempts := attempts + 1;
    IF attempts >= max_attempts THEN
      -- If we can't generate a unique code after max attempts, raise an error
      RAISE EXCEPTION 'Unable to generate unique testimonial code after % attempts', max_attempts;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-generate testimonial code when status changes to 'approved'
CREATE OR REPLACE FUNCTION auto_generate_testimonial_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate code if:
  -- 1. Status is being changed to 'approved'
  -- 2. Testimonial code is NULL or empty
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    IF NEW.testimonial_code IS NULL OR NEW.testimonial_code = '' THEN
      NEW.testimonial_code := generate_testimonial_code();
      
      -- Log the code generation (optional, can be removed)
      RAISE NOTICE 'Generated testimonial code % for testimonial %', NEW.testimonial_code, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires before update
DROP TRIGGER IF EXISTS trigger_auto_generate_testimonial_code ON public.testimonials;
CREATE TRIGGER trigger_auto_generate_testimonial_code
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_testimonial_code();

-- Also handle INSERT case (if someone creates a testimonial with status 'approved' directly)
CREATE OR REPLACE FUNCTION auto_generate_testimonial_code_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate code if status is 'approved' and code is NULL
  IF NEW.status = 'approved' AND (NEW.testimonial_code IS NULL OR NEW.testimonial_code = '') THEN
    NEW.testimonial_code := generate_testimonial_code();
    
    RAISE NOTICE 'Generated testimonial code % for new testimonial %', NEW.testimonial_code, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_testimonial_code_on_insert ON public.testimonials;
CREATE TRIGGER trigger_auto_generate_testimonial_code_on_insert
  BEFORE INSERT ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_testimonial_code_on_insert();

-- Add comment
COMMENT ON FUNCTION generate_testimonial_code() IS 'Generates a unique testimonial code in format SJ-XXXX-XXXX';
COMMENT ON FUNCTION auto_generate_testimonial_code() IS 'Auto-generates testimonial code when testimonial status changes to approved';
COMMENT ON FUNCTION auto_generate_testimonial_code_on_insert() IS 'Auto-generates testimonial code when testimonial is created with approved status';

