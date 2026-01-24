-- Check and fix triggers on testimonials table that might reference approved_by
-- This will help identify the problematic trigger

-- List all triggers on testimonials table
SELECT 
  t.trigger_name,
  t.event_manipulation,
  t.action_timing,
  p.proname as function_name
FROM information_schema.triggers t
JOIN pg_trigger pt ON pt.tgname = t.trigger_name
JOIN pg_proc p ON p.oid = pt.tgfoid
WHERE t.event_object_table = 'testimonials'
AND t.event_object_schema = 'public';

-- Show the function definitions to check for approved_by references
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_trigger pt ON pt.tgfoid = p.oid
JOIN information_schema.triggers t ON t.trigger_name = pt.tgname
WHERE t.event_object_table = 'testimonials'
AND t.event_object_schema = 'public';

-- If you find a trigger that references approved_by, you can drop it with:
-- DROP TRIGGER IF EXISTS <trigger_name> ON public.testimonials;

-- Then recreate only the triggers we need (the code generation triggers)
-- These are already defined in auto-generate-testimonial-code-on-approval.sql

