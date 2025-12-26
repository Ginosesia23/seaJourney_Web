-- Add visa rule compliance fields to visa_tracker table
ALTER TABLE public.visa_tracker 
ADD COLUMN IF NOT EXISTS rule_type TEXT DEFAULT 'fixed' CHECK (rule_type IN ('fixed', 'rolling')),
ADD COLUMN IF NOT EXISTS days_allowed INTEGER NULL, -- e.g., 90 for Schengen
ADD COLUMN IF NOT EXISTS period_days INTEGER NULL; -- e.g., 180 for Schengen (rolling period)

-- Update existing records to have default fixed rule
UPDATE public.visa_tracker 
SET rule_type = 'fixed', days_allowed = total_days 
WHERE rule_type IS NULL OR days_allowed IS NULL;

-- Add comment explaining the fields
COMMENT ON COLUMN public.visa_tracker.rule_type IS 'Type of visa rule: "fixed" (total days in visa period) or "rolling" (e.g., 90 days in any 180-day period)';
COMMENT ON COLUMN public.visa_tracker.days_allowed IS 'Number of days allowed (e.g., 90 for Schengen)';
COMMENT ON COLUMN public.visa_tracker.period_days IS 'Period in days for rolling rules (e.g., 180 for Schengen). Only used when rule_type is "rolling"';

