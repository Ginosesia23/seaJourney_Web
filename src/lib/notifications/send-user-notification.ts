/**
 * Server-side helper for delivering a push notification to a single user.
 *
 * How it works
 * ------------
 * Two side effects, in order:
 *   1. INSERT a row into `app_user_notifications` — the "durable inbox" the
 *      mobile / web reads for unread badges + history.
 *   2. INVOKE the `user-notifications-push` Supabase Edge Function — the
 *      function looks up the user's `users.fcm_token` and delivers an OS
 *      push via FCM v1 (same setup as `send-broadcast-push`).
 *
 * Step 2 is fire-and-forget: an FCM failure does NOT roll back the row, so
 * the notification is still delivered on the next in-app inbox load. Step 1
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
};

export type SendUserNotificationResult =
  | {
      ok: true;
      notificationId: string;
      /** True when the FCM push succeeded. False when it was skipped/failed. */
      pushed: boolean;
      pushReason?: string;
    }
  | { ok: false; reason: string };

const PUSH_FUNCTION_NAME = 'user-notifications-push';

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

  // 1. Durable inbox row.
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

  // 2. FCM push via Edge Function. Never blocks the caller on failure.
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
