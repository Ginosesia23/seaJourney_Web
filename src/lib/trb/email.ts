import { Resend } from 'resend';
import { EMAIL_PRIMARY_BLUE } from '@/lib/email-colors';
import { TRB_DISCLAIMER } from '@/lib/trb/constants';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://www.seajourney.co.uk';
const FROM_EMAIL = process.env.BILLING_FROM_EMAIL || 'SeaJourney <team@seajourney.co.uk>';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'team@seajourney.co.uk';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateForEmail(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export type TrbSignoffRequestEmailArgs = {
  to: string;
  signerName?: string | null;
  crewName: string;
  vesselName?: string | null;
  programmeName: string;
  taskTitle: string;
  requestedAt: string | Date;
  expiresAt: string | Date;
  reviewUrl: string;
  optionalMessage?: string | null;
  disclaimer?: string | null;
};

/**
 * Branded Digital TRB Companion captain review email.
 * Development-safe: skips send when RESEND_API_KEY is unset.
 */
export async function sendTrbSignoffRequestEmail(
  args: TrbSignoffRequestEmailArgs,
): Promise<{ success: boolean; skipped?: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[TRB SIGNOFF EMAIL] Resend API key not configured – skipping');
    return { success: false, skipped: true, error: new Error('Resend not configured') };
  }

  const greeting = args.signerName
    ? `Hi ${escapeHtml(args.signerName)},`
    : 'Hi Captain,';

  const vesselRow = args.vesselName
    ? `<div style="margin-bottom:6px;"><strong>Vessel:</strong> ${escapeHtml(args.vesselName)}</div>`
    : '';

  const messageRow = args.optionalMessage?.trim()
    ? `<p style="margin:16px 0 0;color:#374151;font-size:14px;"><strong>Message from candidate:</strong> ${escapeHtml(args.optionalMessage.trim())}</p>`
    : '';

  const bodyHtml = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">
      <strong>${escapeHtml(args.crewName)}</strong> has requested captain review of a
      <strong>Training Record</strong> digital companion task.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f4f7fb;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;color:#374151;font-size:14px;">
          <div style="margin-bottom:6px;"><strong>Crew member:</strong> ${escapeHtml(args.crewName)}</div>
          ${vesselRow}
          <div style="margin-bottom:6px;"><strong>Programme:</strong> ${escapeHtml(args.programmeName)}</div>
          <div style="margin-bottom:6px;"><strong>Task:</strong> ${escapeHtml(args.taskTitle)}</div>
          <div style="margin-bottom:6px;"><strong>Requested:</strong> ${escapeHtml(formatDateForEmail(args.requestedAt))}</div>
          <div><strong>Link expires:</strong> ${escapeHtml(formatDateForEmail(args.expiresAt))}</div>
        </td>
      </tr>
    </table>
    ${messageRow}
    <p style="margin:16px 0;padding:12px 14px;background:#fff7ed;border-radius:8px;color:#9a3412;font-size:13px;line-height:1.5;">
      <strong>Security:</strong> Do not forward this link. It is single-use for your review decision.
      Evidence is not attached to this email — open the secure review page to view it.
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:12px;line-height:1.5;">
      ${escapeHtml(args.disclaimer || TRB_DISCLAIMER)}
    </p>
    <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">
      Questions? Contact ${escapeHtml(SUPPORT_EMAIL)}.
    </p>
  `;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Training task review request</title></head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:${EMAIL_PRIMARY_BLUE};padding:28px 24px;text-align:center;">
            <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="180" style="display:block;margin:0 auto;max-width:180px;height:auto;border:0;" />
            <p style="margin:14px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Digital TRB Companion — captain review</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 24px;color:#1e1e1e;font-size:16px;line-height:1.6;">
            ${bodyHtml}
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px 0 4px;">
                  <a href="${args.reviewUrl}" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Review training task</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
              SeaJourney Training Records is a digital companion for officer-reviewed training evidence — not an official MCA/PYA Training Record Book.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [args.to],
      subject: `Training task review – ${args.crewName} (${args.taskTitle})`,
      html,
    });
    console.log('[TRB SIGNOFF EMAIL] Sent to', args.to);
    return { success: true };
  } catch (err) {
    console.error('[TRB SIGNOFF EMAIL] Failed to send to', args.to, err);
    return { success: false, error: err };
  }
}

export type TrbBatchSignoffRequestEmailArgs = {
  to: string;
  signerName?: string | null;
  crewName: string;
  vesselName?: string | null;
  programmeName: string;
  taskCount: number;
  tasks: Array<{ code: string; title: string }>;
  requestedAt: string | Date;
  expiresAt: string | Date;
  reviewUrl: string;
  optionalMessage?: string | null;
  disclaimer?: string | null;
};

export async function sendTrbBatchSignoffRequestEmail(
  args: TrbBatchSignoffRequestEmailArgs,
): Promise<{ success: boolean; skipped?: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[TRB BATCH SIGNOFF EMAIL] Resend API key not configured – skipping');
    return { success: false, skipped: true, error: new Error('Resend not configured') };
  }

  const greeting = args.signerName
    ? `Hi ${escapeHtml(args.signerName)},`
    : 'Hi Captain,';

  const vesselRow = args.vesselName
    ? `<div style="margin-bottom:6px;"><strong>Vessel:</strong> ${escapeHtml(args.vesselName)}</div>`
    : '';

  const taskList = args.tasks
    .slice(0, 20)
    .map(
      (t) =>
        `<li style="margin:0 0 4px;">${escapeHtml(t.code ? `${t.code} · ${t.title}` : t.title)}</li>`,
    )
    .join('');
  const more =
    args.tasks.length > 20
      ? `<li style="margin:0;">…and ${args.tasks.length - 20} more</li>`
      : '';

  const messageRow = args.optionalMessage?.trim()
    ? `<p style="margin:16px 0 0;color:#374151;font-size:14px;"><strong>Message from candidate:</strong> ${escapeHtml(args.optionalMessage.trim())}</p>`
    : '';

  const disclaimer = escapeHtml(args.disclaimer || TRB_DISCLAIMER);

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;"><tr><td align="center">
    <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:20px 24px;background:${EMAIL_PRIMARY_BLUE};color:#fff;font-size:18px;font-weight:700;">SeaJourney · Training sign-off</td></tr>
      <tr><td style="padding:24px;color:#111827;font-size:15px;line-height:1.55;">
        <p style="margin:0 0 16px;">${greeting}</p>
        <p style="margin:0 0 16px;"><strong>${escapeHtml(args.crewName)}</strong> requested review of <strong>${args.taskCount}</strong> Digital TRB Companion task${args.taskCount === 1 ? '' : 's'}.</p>
        <div style="margin:0 0 16px;padding:14px 16px;background:#f4f7fb;border-radius:8px;color:#374151;font-size:14px;">
          <div style="margin-bottom:6px;"><strong>Programme:</strong> ${escapeHtml(args.programmeName)}</div>
          ${vesselRow}
          <div style="margin-bottom:6px;"><strong>Requested:</strong> ${escapeHtml(formatDateForEmail(args.requestedAt))}</div>
          <div><strong>Expires:</strong> ${escapeHtml(formatDateForEmail(args.expiresAt))}</div>
        </div>
        <p style="margin:0 0 8px;font-weight:600;">Tasks</p>
        <ul style="margin:0 0 16px;padding-left:18px;color:#374151;font-size:14px;">${taskList}${more}</ul>
        ${messageRow}
        <p style="margin:20px 0 0;"><a href="${escapeHtml(args.reviewUrl)}" style="display:inline-block;background:${EMAIL_PRIMARY_BLUE};color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Review all tasks</a></p>
        <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">${disclaimer}</p>
        <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">Questions? ${escapeHtml(SUPPORT_EMAIL)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [args.to],
      subject: `Training review – ${args.crewName} (${args.taskCount} tasks)`,
      html,
    });
    console.log('[TRB BATCH SIGNOFF EMAIL] Sent to', args.to);
    return { success: true };
  } catch (err) {
    console.error('[TRB BATCH SIGNOFF EMAIL] Failed', args.to, err);
    return { success: false, error: err };
  }
}

export function trbAppBaseUrl(): string {
  return SITE_URL.replace(/\/$/, '');
}
