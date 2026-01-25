-- Rename is_secondary_state column to is_part_of_active_passage
-- This column marks days that are part of an active passage and count as "at sea"

ALTER TABLE public.daily_state_logs
RENAME COLUMN is_secondary_state TO is_part_of_active_passage;

-- Update the index name and definition
DROP INDEX IF EXISTS idx_daily_state_logs_secondary_state;

CREATE INDEX IF NOT EXISTS idx_daily_state_logs_part_of_active_passage 
ON public.daily_state_logs(user_id, vessel_id, is_part_of_active_passage) 
WHERE is_part_of_active_passage = TRUE;

-- Update the column comment
COMMENT ON COLUMN public.daily_state_logs.is_part_of_active_passage IS
'When true, this day is marked as part of an active passage and counts as "at sea" instead of standby, even if the vessel state is in-port or at-anchor.';
