import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const SITE_URL = process.env.SITE_URL || "https://www.seajourney.co.uk";
const BILLING_FROM =
  process.env.BILLING_FROM_EMAIL || "SeaJourney <team@seajourney.co.uk>";

/**
 * Format tier name for display
 */
export function formatTierName(tier: string | null | undefined): string {
  if (!tier) return "Free";
  const cleaned = tier.replace(/^(sj_|sea_journey_)/i, "").trim();
  return cleaned
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
            <td bgcolor="#172b42" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:700;">SeaJourney</h1>
              <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">Welcome to your ${tierName} subscription</p>
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
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:#2e8bc0;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
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
            <td bgcolor="#172b42" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:700;">SeaJourney</h1>
              <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">Subscription upgraded</p>
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
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:#2e8bc0;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
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
            <td bgcolor="#172b42" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:700;">SeaJourney</h1>
              <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">Subscription change scheduled</p>
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
              <a href="${SITE_URL}/dashboard/subscription" style="display:inline-block;padding:12px 26px;background-color:#2e8bc0;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Manage Subscription</a>
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
            <td bgcolor="#172b42" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:700;">SeaJourney</h1>
              <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">Subscription cancelled</p>
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
              <a href="${SITE_URL}/dashboard/subscription" style="display:inline-block;padding:12px 26px;background-color:#2e8bc0;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Manage Subscription</a>
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
            <td bgcolor="#172b42" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:700;">SeaJourney</h1>
              <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">Subscription reactivated</p>
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
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:#2e8bc0;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
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
            <td bgcolor="#172b42" style="padding:24px 24px 18px;color:#ffffff;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:700;">SeaJourney</h1>
              <p style="margin:4px 0 0;font-size:12px;opacity:0.85;">Subscription updated</p>
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
              <a href="${SITE_URL}/dashboard" style="display:inline-block;padding:12px 26px;background-color:#2e8bc0;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;">Go to Dashboard</a>
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

