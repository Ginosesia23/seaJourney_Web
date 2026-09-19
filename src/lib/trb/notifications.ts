import { sendUserNotification } from '@/lib/notifications/send-user-notification';

export type TrbNotificationEvent =
  | 'task_ready_for_assessment'
  | 'signoff_requested'
  | 'request_viewed'
  | 'changes_requested'
  | 'task_approved'
  | 'task_rejected'
  | 'request_expiring'
  | 'request_expired'
  | 'request_cancelled';

const TITLES: Record<TrbNotificationEvent, string> = {
  task_ready_for_assessment: 'Training task ready for assessment',
  signoff_requested: 'Training sign-off requested',
  request_viewed: 'Training sign-off request viewed',
  changes_requested: 'Training task — changes requested',
  task_approved: 'Training task approved',
  task_rejected: 'Training task rejected',
  request_expiring: 'Training sign-off request expiring',
  request_expired: 'Training sign-off request expired',
  request_cancelled: 'Training sign-off request cancelled',
};

/** Fire-and-forget inbox + optional FCM; never throws. Uses kind `testimonial` preferences as closest match until a dedicated TRB preference column exists. */
export async function notifyTrbEvent(opts: {
  userId: string | null | undefined;
  event: TrbNotificationEvent;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.userId) return;
  try {
    await sendUserNotification({
      userId: opts.userId,
      title: TITLES[opts.event],
      body: opts.body,
      kind: 'testimonial',
      metadata: {
        domain: 'trb',
        event: opts.event,
        ...(opts.metadata || {}),
      },
    });
  } catch (err) {
    console.warn('[TRB notify]', opts.event, err);
  }
}
