-- Per-user push notifications (matches `app_broadcast_notifications` shape,
-- plus a `user_id` so we can target one crew member instead of everyone).
--
-- The web app inserts rows here from server-side flows (crew AIS sync,
-- testimonial decisions, sea-time approvals, etc.). The mobile app listens
-- for INSERTs on this table (via Supabase Realtime / Database Webhook) and
-- delivers an OS push notification to the target user's registered device.
--
-- IMPORTANT: for delivery to actually reach a phone, the mobile-side
-- listener must be wired to the same table name — coordinate any rename
-- with the iOS/Android app.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_user_notifications (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT           NOT NULL,
  body       TEXT           NOT NULL,
  -- Free-form category so mobile can pick an icon/route (e.g. 'ais_state_change',
  -- 'testimonial', 'sea_time', 'system'). Nullable to keep INSERTs simple.
  kind       TEXT,
  -- Optional structured payload — deep-link params, related record ids, etc.
  metadata   JSONB,
  -- Set by the mobile app / web when the user opens the notification.
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_user_notifications_user_created_idx
  ON public.app_user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_user_notifications_user_unread_idx
  ON public.app_user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.app_user_notifications IS
  'Per-user push notifications. Server inserts rows; mobile Realtime listener delivers OS push and renders in-app inbox.';

ALTER TABLE public.app_user_notifications ENABLE ROW LEVEL SECURITY;

-- Users read their own notifications (used by the mobile in-app inbox / web).
DROP POLICY IF EXISTS "Users read own app_user_notifications"
  ON public.app_user_notifications;
CREATE POLICY "Users read own app_user_notifications"
  ON public.app_user_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users mark their own notifications as read (set read_at).
DROP POLICY IF EXISTS "Users update own app_user_notifications"
  ON public.app_user_notifications;
CREATE POLICY "Users update own app_user_notifications"
  ON public.app_user_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read & manage everyone's notifications (support / debugging).
DROP POLICY IF EXISTS "Admins can manage app_user_notifications"
  ON public.app_user_notifications;
CREATE POLICY "Admins can manage app_user_notifications"
  ON public.app_user_notifications
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

-- No INSERT policy for `authenticated` — inserts are server-side only via
-- the service-role client (bypasses RLS).

COMMIT;
