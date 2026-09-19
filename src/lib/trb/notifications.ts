import { sendUserNotification } from '@/lib/notifications/send-user-notification';

export type TrbNotificationEvent =
  | 'task_ready_for_assessment'
  | 'signoff_requested'
  | 'request_viewed'
  | 'changes_requested'
  | 'task_approved'
  | 'task_rejected'
  | 'batch_signoff_mixed'
  | 'batch_signoff_reviewed'
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
  batch_signoff_mixed: 'Training sign-off — mixed results',
  batch_signoff_reviewed: 'Training sign-off reviewed',
  request_expiring: 'Training sign-off request expiring',
  request_expired: 'Training sign-off request expired',
  request_cancelled: 'Training sign-off request cancelled',
};

/** Choose notification event for a completed multi-task (batch) decision. */
export function batchDecisionNotificationEvent(counts: {
  approved: number;
  changesRequested: number;
  rejected: number;
}): TrbNotificationEvent {
  const { approved, changesRequested, rejected } = counts;
  if (approved > 0 && changesRequested === 0 && rejected === 0) {
    return 'task_approved';
  }
  if (changesRequested > 0 && approved === 0 && rejected === 0) {
    return 'changes_requested';
  }
  if (rejected > 0 && approved === 0 && changesRequested === 0) {
    return 'task_rejected';
  }
  // Mixed outcomes (e.g. some approved + some changes), or empty edge case
  if (
    (approved > 0 && (changesRequested > 0 || rejected > 0)) ||
    (changesRequested > 0 && rejected > 0)
  ) {
    return 'batch_signoff_mixed';
  }
  return 'batch_signoff_reviewed';
}

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
