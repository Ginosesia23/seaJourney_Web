import { Resend } from 'resend';
import { EMAIL_PRIMARY_BLUE } from '@/lib/email-colors';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seajourney.co.uk';
const FROM_EMAIL = process.env.BILLING_FROM_EMAIL || 'SeaJourney <team@seajourney.co.uk>';

/**
 * Send a "Welcome to SeaJourney" email to new joiners (self-signup or added by vessel).
 */
export async function sendWelcomeEmail(args: { to: string; firstName?: string | null }): Promise<{ success: boolean; error?: unknown }> {
  if (!resend) {
    console.warn('[WELCOME EMAIL] Resend API key not configured - skipping');
    return { success: false, error: new Error('Resend not configured') };
  }

  const { to, firstName } = args;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Welcome to SeaJourney</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:${EMAIL_PRIMARY_BLUE};padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">Welcome to SeaJourney</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Your digital sea-service logbook for yacht crew</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#1e1e1e;font-size:16px;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 16px;color:#1e1e1e;font-size:16px;line-height:1.6;">
                We're glad to have you on board. SeaJourney helps you track your sea time, manage your maritime career, and generate the documents you need for MCA applications and beyond.
              </p>
              <p style="margin:0 0 20px;color:#1e1e1e;font-size:16px;line-height:1.6;">
                <strong>Getting started:</strong>
              </p>
              <ul style="margin:0 0 24px;padding-left:20px;color:#1e1e1e;font-size:15px;line-height:1.7;">
                <li>Log your daily state (at sea, standby, on leave) on the <strong>Current</strong> or <strong>Calendar</strong> page</li>
                <li>Track leave periods so they're excluded from sea time calculations</li>
                <li>Export your sea time to CSV, Excel, or PDF</li>
                <li>Request sea time from your vessel or generate testimonials</li>
              </ul>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Go to your dashboard</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
                If you have any questions, just reply to this email or visit our help section from the dashboard.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                You're receiving this because you signed up or were added to SeaJourney.
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
</html>
  `.trim();

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Welcome to SeaJourney',
      html,
    });
    console.log('[WELCOME EMAIL] Sent successfully to', to);
    return { success: true };
  } catch (err) {
    console.error('[WELCOME EMAIL] Failed to send to', to, err);
    return { success: false, error: err };
  }
}
