import { Resend } from 'resend';
import { EMAIL_PRIMARY_BLUE } from '@/lib/email-colors';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const SITE_URL =
  process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seajourney.co.uk';
const FROM_EMAIL = process.env.BILLING_FROM_EMAIL || 'SeaJourney <team@seajourney.co.uk>';

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
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function emailShell({
  heading,
  bodyHtml,
  ctaLabel,
  ctaHref,
}: {
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:${EMAIL_PRIMARY_BLUE};padding:28px 24px;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="180" style="display:block;margin:0 auto;max-width:180px;height:auto;border:0;" />
              <p style="margin:14px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">${escapeHtml(heading)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;color:#1e1e1e;font-size:16px;line-height:1.6;">
              ${bodyHtml}
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:20px 0 4px;">
                    <a href="${ctaHref}" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">${escapeHtml(ctaLabel)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                You're receiving this because a SeaJourney user sent a request to your account. You can manage notifications from your dashboard.
              </p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin-top:10px;">
          <tr>
            <td style="text-align:center;font-size:10px;color:#9ca3af;">SeaJourney • Digital sea-service logbook for yacht crew</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export type SeaTimeRequestEmailArgs = {
  to: string;
  recipientFirstName?: string | null;
  vesselName: string;
  crewName: string;
  startDate: string;
  endDate: string;
};

/**
 * Notify a vessel manager that a crew member has requested sea time
 * to be copied from the vessel's daily state log into their logbook.
 */
export async function sendSeaTimeRequestEmail(
  args: SeaTimeRequestEmailArgs,
): Promise<{ success: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[SEA TIME REQUEST EMAIL] Resend API key not configured – skipping');
    return { success: false, error: new Error('Resend not configured') };
  }

  const { to, recipientFirstName, vesselName, crewName, startDate, endDate } = args;
  const greeting = recipientFirstName
    ? `Hi ${escapeHtml(recipientFirstName)},`
    : 'Hi there,';
  const range = `${formatDateForEmail(startDate)} – ${formatDateForEmail(endDate)}`;
  const inboxUrl = `${SITE_URL}/dashboard/inbox`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">
      <strong>${escapeHtml(crewName)}</strong> has sent a sea time request for
      <strong>${escapeHtml(vesselName)}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f4f7fb;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;color:#374151;font-size:14px;">
          <div style="margin-bottom:6px;"><strong>Vessel:</strong> ${escapeHtml(vesselName)}</div>
          <div style="margin-bottom:6px;"><strong>Crew member:</strong> ${escapeHtml(crewName)}</div>
          <div><strong>Date range:</strong> ${escapeHtml(range)}</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#374151;font-size:15px;">
      Open your inbox to approve or reject the request. Approving will copy the vessel's daily state logs for these dates into the crew member's logbook.
    </p>
  `;

  const html = emailShell({
    heading: 'New sea time request',
    bodyHtml,
    ctaLabel: 'Open inbox',
    ctaHref: inboxUrl,
  });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `New sea time request for ${vesselName}`,
      html,
    });
    console.log('[SEA TIME REQUEST EMAIL] Sent to', to);
    return { success: true };
  } catch (err) {
    console.error('[SEA TIME REQUEST EMAIL] Failed to send to', to, err);
    return { success: false, error: err };
  }
}

export type TestimonialRequestEmailArgs = {
  to: string;
  recipientFirstName?: string | null;
  crewName: string;
  vesselName: string;
  startDate: string;
  endDate: string;
  totalDays?: number | null;
  initiatedByVesselManager?: boolean;
};

/**
 * Notify a linked SeaJourney captain that a testimonial has been
 * sent to their inbox for sign-off.
 */
export async function sendTestimonialRequestEmail(
  args: TestimonialRequestEmailArgs,
): Promise<{ success: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[TESTIMONIAL REQUEST EMAIL] Resend API key not configured – skipping');
    return { success: false, error: new Error('Resend not configured') };
  }

  const {
    to,
    recipientFirstName,
    crewName,
    vesselName,
    startDate,
    endDate,
    totalDays,
    initiatedByVesselManager,
  } = args;

  const greeting = recipientFirstName
    ? `Hi ${escapeHtml(recipientFirstName)},`
    : 'Hi Captain,';
  const range = `${formatDateForEmail(startDate)} – ${formatDateForEmail(endDate)}`;
  const signoffsUrl = `${SITE_URL}/dashboard/sign-offs`;
  const senderLine = initiatedByVesselManager
    ? `The vessel manager of <strong>${escapeHtml(vesselName)}</strong> has sent you a testimonial for <strong>${escapeHtml(crewName)}</strong> to sign off.`
    : `<strong>${escapeHtml(crewName)}</strong> has requested a testimonial from you for their service on <strong>${escapeHtml(vesselName)}</strong>.`;

  const totalDaysRow = typeof totalDays === 'number' && totalDays > 0
    ? `<div><strong>Total days:</strong> ${totalDays}</div>`
    : '';

  const bodyHtml = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">${senderLine}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f4f7fb;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;color:#374151;font-size:14px;">
          <div style="margin-bottom:6px;"><strong>Crew member:</strong> ${escapeHtml(crewName)}</div>
          <div style="margin-bottom:6px;"><strong>Vessel:</strong> ${escapeHtml(vesselName)}</div>
          <div style="margin-bottom:6px;"><strong>Period:</strong> ${escapeHtml(range)}</div>
          ${totalDaysRow}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#374151;font-size:15px;">
      Open your sign-off queue to review the testimonial, add your comments and approve or reject it.
    </p>
  `;

  const html = emailShell({
    heading: 'Testimonial awaiting your sign-off',
    bodyHtml,
    ctaLabel: 'Review testimonial',
    ctaHref: signoffsUrl,
  });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Testimonial sign-off request – ${crewName} (${vesselName})`,
      html,
    });
    console.log('[TESTIMONIAL REQUEST EMAIL] Sent to', to);
    return { success: true };
  } catch (err) {
    console.error('[TESTIMONIAL REQUEST EMAIL] Failed to send to', to, err);
    return { success: false, error: err };
  }
}

export type SeaTimeRequestDecisionEmailArgs = {
  to: string;
  recipientFirstName?: string | null;
  decision: 'approved' | 'rejected';
  vesselName: string;
  startDate: string;
  endDate: string;
  rejectionReason?: string | null;
  logsCopied?: number | null;
};

/**
 * Notify a crew member that a vessel manager approved or rejected
 * their sea time request.
 */
export async function sendSeaTimeRequestDecisionEmail(
  args: SeaTimeRequestDecisionEmailArgs,
): Promise<{ success: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[SEA TIME DECISION EMAIL] Resend API key not configured – skipping');
    return { success: false, error: new Error('Resend not configured') };
  }

  const {
    to,
    recipientFirstName,
    decision,
    vesselName,
    startDate,
    endDate,
    rejectionReason,
    logsCopied,
  } = args;

  const greeting = recipientFirstName
    ? `Hi ${escapeHtml(recipientFirstName)},`
    : 'Hi there,';
  const range = `${formatDateForEmail(startDate)} – ${formatDateForEmail(endDate)}`;

  const isApproved = decision === 'approved';
  const heading = isApproved ? 'Sea time request approved' : 'Sea time request rejected';
  const subject = isApproved
    ? `Sea time approved for ${vesselName}`
    : `Sea time request rejected – ${vesselName}`;
  const ctaLabel = isApproved ? 'Open my logbook' : 'Open dashboard';
  const ctaHref = `${SITE_URL}/dashboard${isApproved ? '/sea-time-request' : ''}`;

  const reasonBlock = !isApproved && rejectionReason?.trim()
    ? `<p style="margin:0 0 16px;"><strong>Reason:</strong> ${escapeHtml(rejectionReason.trim())}</p>`
    : '';

  const copiedLine = isApproved && typeof logsCopied === 'number' && logsCopied > 0
    ? `<p style="margin:0 0 8px;color:#374151;font-size:15px;">${logsCopied} day${logsCopied === 1 ? '' : 's'} of vessel state logs were copied into your logbook.</p>`
    : '';

  const lead = isApproved
    ? `Your sea time request for <strong>${escapeHtml(vesselName)}</strong> has been <strong>approved</strong>.`
    : `Your sea time request for <strong>${escapeHtml(vesselName)}</strong> has been <strong>rejected</strong>.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">${lead}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f4f7fb;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;color:#374151;font-size:14px;">
          <div style="margin-bottom:6px;"><strong>Vessel:</strong> ${escapeHtml(vesselName)}</div>
          <div><strong>Date range:</strong> ${escapeHtml(range)}</div>
        </td>
      </tr>
    </table>
    ${reasonBlock}
    ${copiedLine}
  `;

  const html = emailShell({ heading, bodyHtml, ctaLabel, ctaHref });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });
    console.log('[SEA TIME DECISION EMAIL] Sent to', to, decision);
    return { success: true };
  } catch (err) {
    console.error('[SEA TIME DECISION EMAIL] Failed to send to', to, err);
    return { success: false, error: err };
  }
}

export type TestimonialDecisionEmailArgs = {
  to: string;
  recipientFirstName?: string | null;
  decision: 'approved' | 'rejected';
  crewName?: string | null;
  vesselName: string;
  startDate: string;
  endDate: string;
  captainName?: string | null;
  testimonialCode?: string | null;
  rejectionReason?: string | null;
};

/**
 * Notify a crew member that their testimonial has been signed off
 * (approved) or rejected by the captain.
 */
export async function sendTestimonialDecisionEmail(
  args: TestimonialDecisionEmailArgs,
): Promise<{ success: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[TESTIMONIAL DECISION EMAIL] Resend API key not configured – skipping');
    return { success: false, error: new Error('Resend not configured') };
  }

  const {
    to,
    recipientFirstName,
    decision,
    vesselName,
    startDate,
    endDate,
    captainName,
    testimonialCode,
    rejectionReason,
  } = args;

  const greeting = recipientFirstName
    ? `Hi ${escapeHtml(recipientFirstName)},`
    : 'Hi there,';
  const range = `${formatDateForEmail(startDate)} – ${formatDateForEmail(endDate)}`;

  const isApproved = decision === 'approved';
  const heading = isApproved ? 'Testimonial approved' : 'Testimonial rejected';
  const subject = isApproved
    ? `Testimonial approved – ${vesselName}`
    : `Testimonial rejected – ${vesselName}`;
  const ctaLabel = 'Open testimonials';
  const ctaHref = `${SITE_URL}/dashboard/career-documents?tab=testimonials`;

  const captainLine = captainName?.trim()
    ? `<div style="margin-bottom:6px;"><strong>Captain:</strong> ${escapeHtml(captainName.trim())}</div>`
    : '';

  const codeLine = isApproved && testimonialCode?.trim()
    ? `<div style="margin-bottom:6px;"><strong>Verification code:</strong> ${escapeHtml(testimonialCode.trim())}</div>`
    : '';

  const reasonBlock = !isApproved && rejectionReason?.trim()
    ? `<p style="margin:0 0 16px;"><strong>Reason:</strong> ${escapeHtml(rejectionReason.trim())}</p>`
    : '';

  const lead = isApproved
    ? `Your testimonial for <strong>${escapeHtml(vesselName)}</strong> has been signed off and is now <strong>approved</strong>. You can download the signed PDF from your testimonials page.`
    : `Your testimonial for <strong>${escapeHtml(vesselName)}</strong> has been <strong>rejected</strong>.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">${lead}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f4f7fb;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;color:#374151;font-size:14px;">
          <div style="margin-bottom:6px;"><strong>Vessel:</strong> ${escapeHtml(vesselName)}</div>
          <div style="margin-bottom:6px;"><strong>Period:</strong> ${escapeHtml(range)}</div>
          ${captainLine}
          ${codeLine}
        </td>
      </tr>
    </table>
    ${reasonBlock}
  `;

  const html = emailShell({ heading, bodyHtml, ctaLabel, ctaHref });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });
    console.log('[TESTIMONIAL DECISION EMAIL] Sent to', to, decision);
    return { success: true };
  } catch (err) {
    console.error('[TESTIMONIAL DECISION EMAIL] Failed to send to', to, err);
    return { success: false, error: err };
  }
}
