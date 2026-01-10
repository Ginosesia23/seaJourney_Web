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
  eventType: "created" | "updated" | "deleted" | "upgraded" | "downgraded";
  effectiveDate?: string | null;
}) {
  const tierName = formatTierName(args.tier);
  const previousTierName = args.previousTier ? formatTierName(args.previousTier) : null;

  let subject = "";
  let html = "";

  switch (args.eventType) {
    case "created":
      subject = `Welcome to SeaJourney ${tierName} Plan! 🎉`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Welcome to SeaJourney!</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #333; margin-top: 0;">Your subscription is active</h2>
            <p style="color: #666; font-size: 16px;">
              Thank you for subscribing to the <strong>${tierName}</strong> plan. Your subscription is now active and you have full access to all features.
            </p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Plan:</strong> ${tierName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Status:</strong> Active</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Go to Dashboard
              </a>
            </div>
            <p style="color: #999; font-size: 14px; margin-top: 30px;">
              If you have any questions, please don't hesitate to contact our support team.
            </p>
          </div>
          <div style="background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} SeaJourney. All rights reserved.</p>
          </div>
        </div>
      `;
      break;

    case "upgraded":
      subject = `Your SeaJourney subscription has been upgraded! ⬆️`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Subscription Upgraded!</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #333; margin-top: 0;">Your plan has been upgraded</h2>
            <p style="color: #666; font-size: 16px;">
              Great news! Your subscription has been upgraded from <strong>${previousTierName || "your previous plan"}</strong> to <strong>${tierName}</strong>.
            </p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Previous Plan:</strong> ${previousTierName || "N/A"}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>New Plan:</strong> ${tierName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Status:</strong> Active</p>
            </div>
            <p style="color: #666; font-size: 16px;">
              Your upgrade is effective immediately. You now have access to all features included in your new plan.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/dashboard" style="background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Go to Dashboard
              </a>
            </div>
          </div>
          <div style="background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} SeaJourney. All rights reserved.</p>
          </div>
        </div>
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
      subject = `Your SeaJourney subscription change is scheduled ⬇️`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Subscription Change Scheduled</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #333; margin-top: 0;">Your plan change is scheduled</h2>
            <p style="color: #666; font-size: 16px;">
              Your subscription will change from <strong>${previousTierName || "your current plan"}</strong> to <strong>${tierName}</strong> on <strong>${effectiveDateText}</strong>.
            </p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Current Plan:</strong> ${previousTierName || "N/A"}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>New Plan:</strong> ${tierName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Effective Date:</strong> ${effectiveDateText}</p>
            </div>
            <p style="color: #666; font-size: 16px;">
              You'll continue to have access to your current plan features until ${effectiveDateText}. After that, your plan will change to ${tierName}.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/dashboard/subscription" style="background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Manage Subscription
              </a>
            </div>
          </div>
          <div style="background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} SeaJourney. All rights reserved.</p>
          </div>
        </div>
      `;
      break;

    case "deleted":
      subject = `Your SeaJourney subscription has been cancelled`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #434343 0%, #000000 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Subscription Cancelled</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #333; margin-top: 0;">Your subscription has been cancelled</h2>
            <p style="color: #666; font-size: 16px;">
              We're sorry to see you go. Your <strong>${tierName}</strong> subscription has been cancelled.
            </p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Plan:</strong> ${tierName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Status:</strong> Cancelled</p>
            </div>
            <p style="color: #666; font-size: 16px;">
              You'll continue to have access to your subscription features until the end of your current billing period. After that, your account will be moved to the free plan.
            </p>
            <p style="color: #666; font-size: 16px;">
              If you change your mind, you can reactivate your subscription at any time from your dashboard.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/dashboard/subscription" style="background: #434343; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Manage Subscription
              </a>
            </div>
          </div>
          <div style="background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} SeaJourney. All rights reserved.</p>
          </div>
        </div>
      `;
      break;

    case "updated":
      // Generic update (fallback)
      subject = `Your SeaJourney subscription has been updated`;
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Subscription Updated</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #333; margin-top: 0;">Your subscription has been updated</h2>
            <p style="color: #666; font-size: 16px;">
              Your subscription plan has been updated to <strong>${tierName}</strong>.
            </p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #333;"><strong>Plan:</strong> ${tierName}</p>
              <p style="margin: 10px 0 0 0; color: #333;"><strong>Status:</strong> Active</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Go to Dashboard
              </a>
            </div>
          </div>
          <div style="background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} SeaJourney. All rights reserved.</p>
          </div>
        </div>
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

