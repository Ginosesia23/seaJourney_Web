-- Per-user notification preferences.
--
-- One row per user, with a boolean per notification `kind` (matches the
-- `UserNotificationKind` enum in src/lib/types.ts — keep them in sync).
-- `true` = the user WANTS to receive that kind of notification.
--
-- Consumers:
--   * Mobile app reads this row on launch (and via Supabase Realtime) so it
--     can suppress OS pushes / hide inbox entries for kinds the user turned
--     off. It's the mobile side's job to actually block the notification.
--   * Web dashboard exposes a settings screen that upserts this row.
--   * (Optional, later) server-side helpers like `sendUserNotification` can
--     read this and skip the FCM push for kinds the user disabled — the row
--     is still inserted into `app_user_notifications` so history is intact.
--
-- Defaults are `true` for every kind so existing users keep getting
-- everything unless they explicitly turn something off. A row is
-- lazy-created the first time a user opens their settings; a missing row is
-- treated as "all defaults = true" by clients.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_user_notification_preferences (
  user_id                    UUID        PRIMARY KEY
                                          REFERENCES public.users(id) ON DELETE CASCADE,

  -- Live AIS state change was detected for the user's vessel
  -- (matches kind = 'ais_state_change' in app_user_notifications).
  ais_state_change           BOOLEAN     NOT NULL DEFAULT true,

  -- Daily reminder to log / confirm their onboard state when we haven't
  -- detected it automatically. Separate toggle because it's noisier than
  -- an actual detected change.
  ais_state_change_reminder  BOOLEAN     NOT NULL DEFAULT true,

  -- Sea-time approvals, requests, offers, etc.
  -- (matches kind = 'sea_time').
  sea_time                   BOOLEAN     NOT NULL DEFAULT true,

  -- Testimonial requests / approvals / signatures
  -- (matches kind = 'testimonial').
  testimonial                BOOLEAN     NOT NULL DEFAULT true,

  -- 1:1 messages from an admin (matches kind = 'admin_message').
  admin_message              BOOLEAN     NOT NULL DEFAULT true,

  -- Generic system notifications — password resets, security, misc.
  -- (matches kind = 'system'). Kept toggleable but recommended to leave on.
  system                     BOOLEAN     NOT NULL DEFAULT true,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_user_notification_preferences IS
  'Per-user push-notification opt-in flags, one boolean per UserNotificationKind. Mobile reads this to suppress blocked kinds.';

-- Keep updated_at fresh on every write.
DROP TRIGGER IF EXISTS trg_app_user_notification_preferences_updated_at
  ON public.app_user_notification_preferences;
CREATE TRIGGER trg_app_user_notification_preferences_updated_at
BEFORE UPDATE ON public.app_user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.app_user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users read their own preferences row.
DROP POLICY IF EXISTS "Users read own notification_preferences"
  ON public.app_user_notification_preferences;
CREATE POLICY "Users read own notification_preferences"
  ON public.app_user_notification_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users create their own preferences row (first-time upsert from the app).
DROP POLICY IF EXISTS "Users insert own notification_preferences"
  ON public.app_user_notification_preferences;
CREATE POLICY "Users insert own notification_preferences"
  ON public.app_user_notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users update their own preferences row.
DROP POLICY IF EXISTS "Users update own notification_preferences"
  ON public.app_user_notification_preferences;
CREATE POLICY "Users update own notification_preferences"
  ON public.app_user_notification_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can manage everyone's preferences (support / debugging).
DROP POLICY IF EXISTS "Admins manage all notification_preferences"
  ON public.app_user_notification_preferences;
CREATE POLICY "Admins manage all notification_preferences"
  ON public.app_user_notification_preferences
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

COMMIT;
