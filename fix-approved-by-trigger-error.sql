-- Fix trigger error: record "new" has no field "approved_by"
-- This script will help identify and fix any triggers that reference the non-existent approved_by column

-- First, let's check what triggers exist on the testimonials table
DO $$
DECLARE
  trigger_record RECORD;
  function_body TEXT;
BEGIN
  RAISE NOTICE '=== Checking triggers on testimonials table ===';
  FOR trigger_record IN
    SELECT 
      t.trigger_name,
      t.event_manipulation,
      t.action_timing,
      p.proname as function_name,
      pg_get_functiondef(p.oid) as function_definition
    FROM information_schema.triggers t
    JOIN pg_trigger pt ON pt.tgname = t.trigger_name
    JOIN pg_proc p ON p.oid = pt.tgfoid
    WHERE t.event_object_table = 'testimonials'
    AND t.event_object_schema = 'public'
  LOOP
    RAISE NOTICE 'Trigger: % on event: % timing: %', 
      trigger_record.trigger_name, 
      trigger_record.event_manipulation,
      trigger_record.action_timing;
    RAISE NOTICE 'Function: %', trigger_record.function_name;
    
    -- Check if function references approved_by
    IF trigger_record.function_definition LIKE '%approved_by%' THEN
      RAISE WARNING 'Function % references approved_by!', trigger_record.function_name;
    END IF;
  END LOOP;
END $$;

-- Recreate the auto-generate code trigger functions to ensure they don't reference approved_by
-- These are the only triggers we want on the testimonials table for code generation

CREATE OR REPLACE FUNCTION auto_generate_testimonial_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate code if:
  -- 1. Status is being changed to 'approved'
  -- 2. Testimonial code is NULL or empty
  -- Only reference columns that we know exist (status, testimonial_code, id)
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    IF NEW.testimonial_code IS NULL OR NEW.testimonial_code = '' THEN
      NEW.testimonial_code := generate_testimonial_code();
      
      -- Log the code generation
      RAISE NOTICE 'Generated testimonial code % for testimonial %', NEW.testimonial_code, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_generate_testimonial_code_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate code if status is 'approved' and code is NULL
  -- Only reference columns that we know exist (status, testimonial_code, id)
  IF NEW.status = 'approved' AND (NEW.testimonial_code IS NULL OR NEW.testimonial_code = '') THEN
    NEW.testimonial_code := generate_testimonial_code();
    
    RAISE NOTICE 'Generated testimonial code % for new testimonial %', NEW.testimonial_code, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- If there are other triggers causing issues, you may need to drop them
-- Uncomment the following if you need to remove a specific problematic trigger:
-- DROP TRIGGER IF EXISTS <trigger_name> ON public.testimonials;
