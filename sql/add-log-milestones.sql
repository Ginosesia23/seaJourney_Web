-- Highest notified passage / sea-time milestones per account.
-- Example: {"sea_days":100,"distance_nm":1000,"passages":10}
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS log_milestones jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.log_milestones IS
  'Highest logbook milestone already notified per metric (sea_days, distance_nm, passages).';
