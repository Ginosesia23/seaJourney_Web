/**
 * Server-side helper for delivering a push notification to a single user.
 *
 * How it works
 * ------------
 * Three steps, in order:
 *   1. CHECK `app_user_notification_preferences` — one boolean per
 *      `UserNotificationKind`. If the user opted out of this kind we skip
 *      the whole thing (no inbox row, no FCM push) and return
 *      `{ ok: true, skipped: 'preference_disabled' }`. Missing row = all
 *      defaults on (send everything). Unknown / null `kind` also sends.
 *   2. INSERT a row into `app_user_notifications` — the "durable inbox" the
 *      mobile / web reads for unread badges + history.
 *   3. INVOKE the `user-notifications-push` Supabase Edge Function — the
 *      function looks up the user's `users.fcm_token` and delivers an OS
 *      push via FCM v1 (same setup as `send-broadcast-push`).
 *
 * Step 3 is fire-and-forget: an FCM failure does NOT roll back the row, so
 * the notification is still delivered on the next in-app inbox load. Step 2
 * is required — if it fails we return an error result and do not call FCM.
 *
 * The helper NEVER throws — a failed notification should not fail the
 * caller's business logic (an AIS sync, a testimonial approval, etc.).
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { UserNotificationKind } from '@/lib/types';

export type SendUserNotificationInput = {
  userId: string;
  title: string;
  body: string;
  kind?: UserNotificationKind | string | null;
  /** Optional structured payload for deep-linking / mobile UI. */
  metadata?: Record<string, unknown> | null;
  /**
   * When true, ignore `app_user_notification_preferences` and always send.
   * Intended for dev/test routes and critical system messages the user can't
   * opt out of. Defaults to false.
   */
  bypassPreferences?: boolean;
};

export type SendUserNotificationResult =
  | {
      ok: true;
      notificationId: string;
      /** True when the FCM push succeeded. False when it was skipped/failed. */
      pushed: boolean;
      pushReason?: string;
    }
  | {
      ok: true;
      /** Kind was opted out via `app_user_notification_preferences`. */
      skipped: 'preference_disabled';
      kind: string;
    }
  | { ok: false; reason: string };

const PUSH_FUNCTION_NAME = 'user-notifications-push';

/**
 * Notification kinds that have a matching boolean column on
 * `public.app_user_notification_preferences`. Kinds NOT in this set can't be
 * opted out (they always send). Keep in sync with the SQL migration and the
 * `UserNotificationKind` union in `src/lib/types.ts`.
 */
const PREFERENCE_COLUMNS = [
  'ais_state_change',
  'ais_state_change_reminder',
  'sea_time',
  'testimonial',
  'admin_message',
  'system',
] as const;

type PreferenceColumn = (typeof PREFERENCE_COLUMNS)[number];

function preferenceColumnForKind(kind: string | null): PreferenceColumn | null {
  if (!kind) return null;
  return (PREFERENCE_COLUMNS as readonly string[]).includes(kind)
    ? (kind as PreferenceColumn)
    : null;
}

/**
 * Returns `true` when the user has this kind enabled (or has no preferences
 * row / the kind isn't opt-outable). Returns `false` ONLY when there is an
 * explicit `false` in the preferences row.
 *
 * Fails open: any lookup error is logged and treated as "send" so a broken
 * preferences table never silently swallows notifications.
 */
async function isNotificationKindEnabled(
  userId: string,
  kind: string | null,
): Promise<boolean> {
  const column = preferenceColumnForKind(kind);
  if (!column) return true;

  try {
    const { data, error } = await supabaseAdmin
      .from('app_user_notification_preferences')
      .select(column)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[sendUserNotification] preference lookup failed', {
        userId,
        kind,
        error,
      });
      return true;
    }
    if (!data) return true;

    const value = (data as Record<string, unknown>)[column];
    return value !== false;
  } catch (err) {
    console.warn('[sendUserNotification] preference lookup threw', {
      userId,
      kind,
      err,
    });
    return true;
  }
}

export async function sendUserNotification(
  input: SendUserNotificationInput,
): Promise<SendUserNotificationResult> {
  if (!input.userId) {
    return { ok: false, reason: 'userId is required' };
  }
  if (!input.title?.trim() || !input.body?.trim()) {
    return { ok: false, reason: 'title and body are required' };
  }

  const title = input.title.trim();
  const body = input.body.trim();
  const kind = input.kind ?? null;
  const metadata = input.metadata ?? null;

  // 1. Preference gate. If the user opted out of this kind, drop the whole
  //    thing so nothing lands in the inbox and no push fires. This is the
  //    server-side counterpart to the mobile app's local filter — both are
  //    driven by the same `app_user_notification_preferences` row.
  if (!input.bypassPreferences) {
    const enabled = await isNotificationKindEnabled(input.userId, kind);
    if (!enabled) {
      return {
        ok: true,
        skipped: 'preference_disabled',
        kind: String(kind ?? ''),
      };
    }
  }

  // 2. Durable inbox row.
  let notificationId: string;
  try {
    const { data, error } = await supabaseAdmin
      .from('app_user_notifications')
      .insert({
        user_id: input.userId,
        title,
        body,
        kind,
        metadata,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[sendUserNotification] insert failed', {
        userId: input.userId,
        kind,
        error,
      });
      return { ok: false, reason: error.message };
    }
    notificationId = data.id as string;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Notification insert failed';
    console.error('[sendUserNotification] insert threw', {
      userId: input.userId,
      kind,
      err,
    });
    return { ok: false, reason: message };
  }

  // 3. FCM push via Edge Function. Never blocks the caller on failure.
  let pushed = false;
  let pushReason: string | undefined;
  try {
    const route =
      metadata && typeof metadata === 'object' && typeof (metadata as any).route === 'string'
        ? ((metadata as any).route as string)
        : 'main';

    const { data: pushData, error: pushError } = await supabaseAdmin.functions.invoke(
      PUSH_FUNCTION_NAME,
      {
        body: {
          userId: input.userId,
          title,
          body,
          kind: typeof kind === 'string' ? kind : undefined,
          route,
          metadata,
        },
      },
    );

    if (pushError) {
      pushReason = pushError.message || 'FCM invoke failed';
      console.warn('[sendUserNotification] push invoke failed', {
        userId: input.userId,
        pushError,
      });
    } else if (pushData && typeof pushData === 'object') {
      const d = pushData as Record<string, unknown>;
      pushed = d.sent === true;
      if (!pushed) {
        pushReason = (d.skipped as string) || (d.error as string) || 'push not sent';
      }
    }
  } catch (err) {
    pushReason = err instanceof Error ? err.message : 'push invoke threw';
    console.warn('[sendUserNotification] push invoke threw', {
      userId: input.userId,
      err,
    });
  }

  return { ok: true, notificationId, pushed, pushReason };
}
