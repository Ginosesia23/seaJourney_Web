-- Allow admins to SELECT all rows from daily_state_logs (e.g. to show each user's current-day state on the admin dashboard).
-- If your existing RLS on daily_state_logs already includes "OR role = 'admin'", you can skip this.

-- Ensure RLS is enabled
ALTER TABLE public.daily_state_logs ENABLE ROW LEVEL SECURITY;

-- Add policy: admins can view all daily_state_logs
DROP POLICY IF EXISTS "Admins can view all daily_state_logs" ON public.daily_state_logs;

CREATE POLICY "Admins can view all daily_state_logs"
ON public.daily_state_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

COMMENT ON POLICY "Admins can view all daily_state_logs" ON public.daily_state_logs IS
'Allows admin users to read all daily_state_logs (e.g. to display each user''s current-day state on the admin dashboard).';
