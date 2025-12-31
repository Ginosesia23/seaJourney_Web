-- Remove any triggers that reference approved_by column
-- This script will help identify and remove problematic triggers

-- First, let's see what triggers exist
DO $$
DECLARE
  trigger_record RECORD;
  function_body TEXT;
BEGIN
  RAISE NOTICE '=== Checking for triggers that reference approved_by ===';
  
  FOR trigger_record IN
    SELECT 
      t.trigger_name,
      t.event_manipulation,
      t.action_timing,
      p.proname as function_name,
      p.oid as function_oid
    FROM information_schema.triggers t
    JOIN pg_trigger pt ON pt.tgname = t.trigger_name
    JOIN pg_proc p ON p.oid = pt.tgfoid
    WHERE t.event_object_table = 'testimonials'
    AND t.event_object_schema = 'public'
  LOOP
    -- Get function definition
    SELECT pg_get_functiondef(trigger_record.function_oid) INTO function_body;
    
    -- Check if it references approved_by
    IF function_body LIKE '%approved_by%' OR function_body LIKE '%NEW.approved_by%' OR function_body LIKE '%OLD.approved_by%' THEN
      RAISE WARNING 'Found trigger % that references approved_by! Dropping it...', trigger_record.trigger_name;
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.testimonials', trigger_record.trigger_name);
    END IF;
  END LOOP;
  
  RAISE NOTICE '=== Trigger check complete ===';
END $$;

-- Ensure our code generation triggers are properly set up (they don't reference approved_by)
-- Re-run the trigger creation to make sure they're correct
\i auto-generate-testimonial-code-on-approval.sql

