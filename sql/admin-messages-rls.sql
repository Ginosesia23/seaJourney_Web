-- Broadcast notifications (matches app: APP_BROADCAST_NOTIFICATIONS_TABLE).
-- Run the whole file in the Supabase SQL editor.
-- If public.app_broadcast_notifications already exists, CREATE TABLE is skipped (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.app_broadcast_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_broadcast_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage app_broadcast_notifications" ON public.app_broadcast_notifications;
CREATE POLICY "Admins can manage app_broadcast_notifications"
ON public.app_broadcast_notifications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);
