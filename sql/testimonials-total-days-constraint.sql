-- testimonials_total_days_match check constraint:
-- CHECK (total_days = (at_sea_days + standby_days + yard_days + leave_days))
--
-- The app (documents page + crew page) sets total_days to that sum when
-- inserting testimonials (Send to Captain / Send to captain by email).

-- Show the constraint definition (run in Supabase SQL editor if needed):
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid, true) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.testimonials'::regclass
  AND conname = 'testimonials_total_days_match';

-- To drop the constraint (uncomment and run only if required):
-- ALTER TABLE public.testimonials
-- DROP CONSTRAINT IF EXISTS testimonials_total_days_match;
