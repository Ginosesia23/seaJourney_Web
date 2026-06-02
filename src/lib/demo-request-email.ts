import { Resend } from 'resend';

import { EMAIL_PRIMARY_BLUE } from '@/lib/email-colors';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const SITE_URL =
  process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seajourney.co.uk';
const FROM_EMAIL = process.env.BILLING_FROM_EMAIL || 'SeaJourney <team@seajourney.co.uk>';
const DEMO_INBOX =
  process.env.DEMO_REQUEST_TO_EMAIL ||
  process.env.SUPPORT_EMAIL ||
  'hello@seajourneyapp.com';

export type DemoRequestPayload = {
  name: string;
  email: string;
  company?: string | null;
  audience: 'crew' | 'vessel' | 'fleet' | 'other';
  interest: 'crew' | 'vessel' | 'both' | 'not_sure';
  message?: string | null;
};

const AUDIENCE_LABELS: Record<DemoRequestPayload['audience'], string> = {
  crew: 'Crew member',
  vessel: 'Vessel / yacht manager',
  fleet: 'Fleet operator',
  other: 'Other',
};

const INTEREST_LABELS: Record<DemoRequestPayload['interest'], string> = {
  crew: 'Crew plans',
  vessel: 'Vessel plans',
  both: 'Crew and vessel plans',
  not_sure: 'Not sure yet',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendDemoRequestEmails(
  payload: DemoRequestPayload,
): Promise<{ success: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[DEMO REQUEST] Resend API key not configured — skipping email');
    return { success: false, error: new Error('Resend not configured') };
  }

  const audienceLabel = AUDIENCE_LABELS[payload.audience];
  const interestLabel = INTEREST_LABELS[payload.interest];
  const companyLine = payload.company?.trim()
    ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;vertical-align:top;">Company / vessel</td><td style="padding:8px 0;color:#111827;font-size:14px;">${escapeHtml(payload.company.trim())}</td></tr>`
    : '';
  const messageBlock = payload.message?.trim()
    ? `<p style="margin:20px 0 8px;color:#111827;font-size:15px;font-weight:600;">Message</p><p style="margin:0;color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(payload.message.trim())}</p>`
    : '';

  const internalHtml = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <tr>
      <td style="background:${EMAIL_PRIMARY_BLUE};padding:24px;color:#fff;">
        <h1 style="margin:0;font-size:20px;">New demo request</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">Submitted from ${escapeHtml(SITE_URL)}/request-demo</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;vertical-align:top;">Name</td><td style="padding:8px 0;color:#111827;font-size:14px;">${escapeHtml(payload.name)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top;">Email</td><td style="padding:8px 0;color:#111827;font-size:14px;"><a href="mailto:${escapeHtml(payload.email)}">${escapeHtml(payload.email)}</a></td></tr>
          ${companyLine}
          <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top;">I am a</td><td style="padding:8px 0;color:#111827;font-size:14px;">${escapeHtml(audienceLabel)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top;">Interested in</td><td style="padding:8px 0;color:#111827;font-size:14px;">${escapeHtml(interestLabel)}</td></tr>
        </table>
        ${messageBlock}
      </td>
    </tr>
  </table>
</body>
</html>`;

  const confirmationHtml = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <tr>
      <td style="background:${EMAIL_PRIMARY_BLUE};padding:24px;text-align:center;">
        <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="180" style="display:block;margin:0 auto;max-width:180px;height:auto;border:0;" />
      </td>
    </tr>
    <tr>
      <td style="padding:28px 24px;">
        <p style="margin:0 0 16px;color:#111827;font-size:16px;line-height:1.6;">Hi ${escapeHtml(payload.name.split(' ')[0] || payload.name)},</p>
        <p style="margin:0 0 16px;color:#111827;font-size:16px;line-height:1.6;">
          Thanks for requesting a SeaJourney demo. We've received your details and will be in touch shortly to arrange a walkthrough.
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
          In the meantime, you can explore our plans or start a free trial whenever you're ready.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:12px 0 4px;">
              <a href="${SITE_URL}/offers" style="display:inline-block;padding:12px 22px;background:${EMAIL_PRIMARY_BLUE};color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">View plans</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const { error: internalError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: DEMO_INBOX,
      replyTo: payload.email,
      subject: `Demo request — ${payload.name}${payload.company?.trim() ? ` (${payload.company.trim()})` : ''}`,
      html: internalHtml,
    });
    if (internalError) throw internalError;

    const { error: confirmError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: payload.email,
      subject: 'We received your SeaJourney demo request',
      html: confirmationHtml,
    });
    if (confirmError) {
      console.warn('[DEMO REQUEST] Confirmation email failed:', confirmError);
    }

    return { success: true };
  } catch (error) {
    console.error('[DEMO REQUEST] Failed to send email:', error);
    return { success: false, error };
  }
}
