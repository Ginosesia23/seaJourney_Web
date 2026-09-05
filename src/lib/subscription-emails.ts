import { Resend } from "resend";
import { EMAIL_PRIMARY_BLUE } from "@/lib/email-colors";
import { formatSubscriptionTierLabel } from '@/lib/subscription-tier-labels';

const resend = new Resend(process.env.RESEND_API_KEY!);
const SITE_URL = process.env.SITE_URL || "https://www.seajourney.co.uk";
const BILLING_FROM =
  process.env.BILLING_FROM_EMAIL || "SeaJourney <team@seajourney.co.uk>";

/**
 * Format tier name for display
 */
export function formatTierName(tier: string | null | undefined): string {
  return formatSubscriptionTierLabel(tier);
}

/**
 * Send subscription email notification
 */
export async function sendSubscriptionEmail(args: {
  toEmail: string;
  tier: string;
  previousTier?: string | null;
  eventType: "created" | "updated" | "deleted" | "upgraded" | "downgraded" | "resumed";
  effectiveDate?: string | null;
}) {
  const tierName = formatTierName(args.tier);
  const previousTierName = args.previousTier ? formatTierName(args.previousTier) : null;

  let subject = "";
  let html = "";

  switch (args.eventType) {
    case "created":
      subject = `Welcome to SeaJourney ${tierName} Plan!`;
      html = `
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
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde4f0;">
          <tr>
            <td bgcolor="${EMAIL_PRIMARY_BLUE}" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">Welcome to your ${tierName} subscription</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 6px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 10px;">Welcome aboard!</p>
              <p style="margin:0 0 10px;">
                Thank you for subscribing to the <strong>${tierName}</strong> plan. Your subscription is now active and you have full access to all features.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${tierName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Status:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">Active</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 10px;">
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 18px;color:#6b7280;font-size:11px;line-height:1.5;">
              <p style="margin:0 0 6px;">If you have any questions, please don't hesitate to contact our support team.</p>
              <p style="margin:0;color:#9ca3af;font-size:10px;">This email was sent automatically by the SeaJourney billing system.</p>
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
      `;
      break;

    case "upgraded":
      subject = `Your SeaJourney subscription has been upgraded`;
      html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Subscription Upgraded</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde4f0;">
          <tr>
            <td bgcolor="${EMAIL_PRIMARY_BLUE}" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">Subscription upgraded</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 6px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 10px;">Great news!</p>
              <p style="margin:0 0 10px;">
                Your subscription has been upgraded from <strong>${previousTierName || "your previous plan"}</strong> to <strong>${tierName}</strong>. Your upgrade is effective immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Previous Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${previousTierName || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>New Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${tierName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Status:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">Active</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0;">You now have access to all features included in your new plan.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 10px;">
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 18px;color:#6b7280;font-size:11px;line-height:1.5;">
              <p style="margin:0;color:#9ca3af;font-size:10px;">This email was sent automatically by the SeaJourney billing system.</p>
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
      `;
      break;

    case "downgraded":
      const effectiveDateText = args.effectiveDate
        ? new Date(args.effectiveDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "your next billing date";
      subject = `Your SeaJourney subscription change is scheduled`;
      html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Subscription Change Scheduled</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde4f0;">
          <tr>
            <td bgcolor="${EMAIL_PRIMARY_BLUE}" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">Subscription change scheduled</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 6px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 10px;">Your plan change is scheduled</p>
              <p style="margin:0 0 10px;">
                Your subscription will change from <strong>${previousTierName || "your current plan"}</strong> to <strong>${tierName}</strong> on <strong>${effectiveDateText}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Current Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${previousTierName || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>New Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${tierName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Effective Date:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${effectiveDateText}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0;">You'll continue to have access to your current plan features until ${effectiveDateText}. After that, your plan will change to ${tierName}.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 10px;">
              <a href="${SITE_URL}/dashboard/subscription" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Manage Subscription</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 18px;color:#6b7280;font-size:11px;line-height:1.5;">
              <p style="margin:0;color:#9ca3af;font-size:10px;">This email was sent automatically by the SeaJourney billing system.</p>
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
      `;
      break;

    case "deleted":
      subject = `Your SeaJourney subscription has been cancelled`;
      html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Subscription Cancelled</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde4f0;">
          <tr>
            <td bgcolor="${EMAIL_PRIMARY_BLUE}" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">Subscription cancelled</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 6px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 10px;">We're sorry to see you go.</p>
              <p style="margin:0 0 10px;">
                Your <strong>${tierName}</strong> subscription has been cancelled.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${tierName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Status:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">Cancelled</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 10px;">You'll continue to have access to your subscription features until the end of your current billing period. After that, your account will be moved to the free plan.</p>
              <p style="margin:0;">If you change your mind, you can reactivate your subscription at any time from your dashboard.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 10px;">
              <a href="${SITE_URL}/dashboard/subscription" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Manage Subscription</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 18px;color:#6b7280;font-size:11px;line-height:1.5;">
              <p style="margin:0;color:#9ca3af;font-size:10px;">This email was sent automatically by the SeaJourney billing system.</p>
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
      `;
      break;

    case "resumed":
      subject = `Your SeaJourney subscription has been reactivated`;
      html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Subscription Reactivated</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde4f0;">
          <tr>
            <td bgcolor="${EMAIL_PRIMARY_BLUE}" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">Subscription reactivated</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 6px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 10px;">Welcome back!</p>
              <p style="margin:0 0 10px;">
                Your <strong>${tierName}</strong> subscription has been reactivated and is now active. You have full access to all features.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${tierName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Status:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">Active</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 10px;">
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 18px;color:#6b7280;font-size:11px;line-height:1.5;">
              <p style="margin:0;color:#9ca3af;font-size:10px;">This email was sent automatically by the SeaJourney billing system.</p>
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
      `;
      break;

    case "updated":
      // Generic update (fallback)
      subject = `Your SeaJourney subscription has been updated`;
      html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Subscription Updated</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde4f0;">
          <tr>
            <td bgcolor="${EMAIL_PRIMARY_BLUE}" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">Subscription updated</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 6px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              <p style="margin:0 0 10px;">Your subscription has been updated</p>
              <p style="margin:0 0 10px;">
                Your subscription plan has been updated to <strong>${tierName}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Plan:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${tierName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>Status:</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">Active</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 10px;">
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 18px;color:#6b7280;font-size:11px;line-height:1.5;">
              <p style="margin:0;color:#9ca3af;font-size:10px;">This email was sent automatically by the SeaJourney billing system.</p>
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
      `;
      break;
  }

  try {
    const result = await resend.emails.send({
      from: BILLING_FROM,
      to: [args.toEmail],
      subject,
      html,
    });

    console.log(`[SUBSCRIPTION EMAIL] ✅ ${args.eventType} email sent to ${args.toEmail}:`, result);
    return { success: true, result };
  } catch (err) {
    console.error(`[SUBSCRIPTION EMAIL] ❌ Failed to send ${args.eventType} email:`, err);
    return { success: false, error: err };
  }
}

function billingEmailShell(args: {
  eyebrow: string;
  title: string;
  introHtml: string;
  rows: Array<{ label: string; value: string }>;
  ctaHref?: string;
  ctaLabel?: string;
}): string {
  const rowsHtml = args.rows
    .map(
      (row) => `
                <tr>
                  <td style="padding:8px 0;color:#1e1e1e;font-size:13px;"><strong>${row.label}</strong></td>
                  <td align="right" style="padding:8px 0;color:#1e1e1e;font-size:13px;">${row.value}</td>
                </tr>`,
    )
    .join("");
  const ctaHref = args.ctaHref || `${SITE_URL}/dashboard/subscription`;
  const ctaLabel = args.ctaLabel || 'View subscription';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${args.title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dde4f0;">
          <tr>
            <td bgcolor="${EMAIL_PRIMARY_BLUE}" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">${args.eyebrow}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 6px;color:#1e1e1e;font-size:14px;line-height:1.6;">
              ${args.introHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 24px 10px;">
              <a href="${ctaHref}" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">${ctaLabel}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 18px;color:#6b7280;font-size:11px;line-height:1.5;">
              <p style="margin:0;color:#9ca3af;font-size:10px;">This email was sent automatically by the SeaJourney billing system.</p>
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
</html>`;
}

async function sendBillingHtmlEmail(args: {
  toEmail: string;
  subject: string;
  html: string;
  logLabel: string;
}): Promise<{ success: boolean; error?: unknown }> {
  try {
    const result = await resend.emails.send({
      from: BILLING_FROM,
      to: [args.toEmail],
      subject: args.subject,
      html: args.html,
    });
    console.log(`[SUBSCRIPTION EMAIL] ✅ ${args.logLabel} email sent to ${args.toEmail}:`, result);
    return { success: true };
  } catch (err) {
    console.error(`[SUBSCRIPTION EMAIL] ❌ Failed to send ${args.logLabel} email:`, err);
    return { success: false, error: err };
  }
}

/** Personal plan paused while assigned to a Vessel Professional / Fleet vessel. */
export async function sendPersonalPlanPausedForVesselEmail(args: {
  toEmail: string;
  firstName?: string | null;
  pausedTier: string;
  vesselName: string;
}) {
  const planName = formatTierName(args.pausedTier);
  const greeting = args.firstName?.trim() ? `Hi ${args.firstName.trim()},` : "Hi,";
  return sendBillingHtmlEmail({
    toEmail: args.toEmail,
    logLabel: "personal-plan-paused",
    subject: "Your SeaJourney plan is paused while you are on a vessel plan",
    html: billingEmailShell({
      eyebrow: "Personal plan paused",
      title: "Personal plan paused",
      introHtml: `
              <p style="margin:0 0 10px;">${greeting}</p>
              <p style="margin:0 0 10px;">
                You have been assigned to <strong>${args.vesselName}</strong>, which is on a Vessel Professional plan.
                While you are working on that vessel you use the vessel&apos;s SeaJourney access, so your personal
                <strong>${planName}</strong> plan has been paused and you will not be billed for it.
              </p>
              <p style="margin:0 0 10px;">
                When you are no longer assigned to a vessel on that plan, your ${planName} subscription will resume automatically.
              </p>`,
      rows: [
        { label: "Paused plan:", value: planName },
        { label: "Vessel:", value: args.vesselName },
        { label: "Access now:", value: "Vessel plan (Crew Limited)" },
      ],
    }),
  });
}

/** Personal plan resumes after leaving every qualifying vessel assignment. */
export async function sendPersonalPlanResumedAfterVesselEmail(args: {
  toEmail: string;
  firstName?: string | null;
  resumedTier: string;
  vesselName?: string | null;
}) {
  const planName = formatTierName(args.resumedTier);
  const greeting = args.firstName?.trim() ? `Hi ${args.firstName.trim()},` : "Hi,";
  const vesselLine = args.vesselName
    ? `You are no longer assigned to <strong>${args.vesselName}</strong>.`
    : "You are no longer assigned to a vessel on a Vessel Professional plan.";
  return sendBillingHtmlEmail({
    toEmail: args.toEmail,
    logLabel: "personal-plan-resumed",
    subject: "Your SeaJourney plan will resume now that you are no longer assigned to a vessel",
    html: billingEmailShell({
      eyebrow: "Personal plan resuming",
      title: "Personal plan resuming",
      introHtml: `
              <p style="margin:0 0 10px;">${greeting}</p>
              <p style="margin:0 0 10px;">
                ${vesselLine} Your personal <strong>${planName}</strong> plan will resume now, including billing if you have a paid subscription.
              </p>
              <p style="margin:0 0 10px;">
                You can review or change your plan any time from the subscription page.
              </p>`,
      rows: [
        { label: "Resumed plan:", value: planName },
        { label: "Status:", value: "Active" },
      ],
    }),
  });
}

/** Vessel account: crew asked to fall under this vessel's subscription. */
export async function sendVesselPlanCoverageRequestEmail(args: {
  toEmail: string;
  vesselName: string;
  crewName: string;
  crewEmail?: string | null;
}) {
  const greeting = "Hi,";
  const crewLine = args.crewEmail
    ? `${args.crewName} (${args.crewEmail})`
    : args.crewName;
  return sendBillingHtmlEmail({
    toEmail: args.toEmail,
    logLabel: "vessel-plan-coverage-request",
    subject: `${args.crewName} requested to join your SeaJourney vessel plan`,
    html: billingEmailShell({
      eyebrow: "Plan coverage request",
      title: "Approve crew plan coverage",
      introHtml: `
              <p style="margin:0 0 10px;">${greeting}</p>
              <p style="margin:0 0 10px;">
                <strong>${crewLine}</strong> has an active assignment on
                <strong>${args.vesselName}</strong> and asked to pause their personal SeaJourney
                plan while using your vessel subscription.
              </p>
              <p style="margin:0 0 10px;">
                Approve the request in your Inbox only if this person is actually on your vessel.
                Until you approve, their personal billing stays active.
              </p>`,
      rows: [
        { label: "Crew:", value: crewLine },
        { label: "Vessel:", value: args.vesselName },
      ],
      ctaHref: `${SITE_URL}/dashboard/inbox`,
      ctaLabel: "Open Inbox",
    }),
  });
}

/** Crew: vessel approved or rejected plan coverage. */
export async function sendVesselPlanCoverageDecisionEmail(args: {
  toEmail: string;
  firstName?: string | null;
  vesselName: string;
  approved: boolean;
  rejectionReason?: string | null;
}) {
  const greeting = args.firstName?.trim() ? `Hi ${args.firstName.trim()},` : "Hi,";
  if (args.approved) {
    return sendBillingHtmlEmail({
      toEmail: args.toEmail,
      logLabel: "vessel-plan-coverage-approved",
      subject: `${args.vesselName} approved your SeaJourney plan coverage`,
      html: billingEmailShell({
        eyebrow: "Plan coverage approved",
        title: "You are covered by the vessel plan",
        introHtml: `
              <p style="margin:0 0 10px;">${greeting}</p>
              <p style="margin:0 0 10px;">
                <strong>${args.vesselName}</strong> approved your request. Your personal plan will
                pause while you are assigned to that vessel, and you will use the vessel&apos;s
                SeaJourney access instead.
              </p>`,
        rows: [
          { label: "Vessel:", value: args.vesselName },
          { label: "Status:", value: "Approved" },
        ],
      }),
    });
  }

  const reason = args.rejectionReason?.trim();
  return sendBillingHtmlEmail({
    toEmail: args.toEmail,
    logLabel: "vessel-plan-coverage-rejected",
    subject: `${args.vesselName} declined your SeaJourney plan coverage request`,
    html: billingEmailShell({
      eyebrow: "Plan coverage declined",
      title: "Vessel plan coverage declined",
      introHtml: `
              <p style="margin:0 0 10px;">${greeting}</p>
              <p style="margin:0 0 10px;">
                <strong>${args.vesselName}</strong> declined your request to fall under their
                vessel subscription. Your personal plan stays active.
              </p>
              ${
                reason
                  ? `<p style="margin:0 0 10px;"><strong>Reason:</strong> ${reason}</p>`
                  : ""
              }`,
      rows: [
        { label: "Vessel:", value: args.vesselName },
        { label: "Status:", value: "Declined" },
      ],
    }),
  });
}

