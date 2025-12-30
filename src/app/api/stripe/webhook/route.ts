// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import type StripeType from "stripe";
import { stripe } from "@/lib/stripe";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; // needed for raw body

const resend = new Resend(process.env.RESEND_API_KEY!);

const SITE_URL = process.env.SITE_URL || "https://www.seajourney.co.uk";
const BILLING_FROM =
  process.env.BILLING_FROM_EMAIL || "SeaJourney <team@seajourney.co.uk>";

/**
 * --------------------------
 * Email idempotency helpers
 * --------------------------
 */
async function emailAlreadySent(stripeEventId: string) {
  const { data, error } = await supabaseAdmin
    .from("webhook_email_logs")
    .select("stripe_event_id")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if (error) console.warn("[EMAIL] webhook_email_logs lookup error:", error);
  return !!data;
}

async function markEmailSent(args: {
  stripe_event_id: string;
  email_type: string;
  user_id?: string | null;
  to_email?: string | null;
}) {
  const { error } = await supabaseAdmin.from("webhook_email_logs").insert({
    stripe_event_id: args.stripe_event_id,
    email_type: args.email_type,
    user_id: args.user_id ?? null,
    to_email: args.to_email ?? null,
  });

  if (error) console.warn("[EMAIL] Failed to insert webhook_email_logs row:", error);
}

/**
 * ----------------------------------------
 * Subscription → DB sync (source of truth)
 * ----------------------------------------
 * This is what fixes “Stripe upgraded, UI still old”
 */
function normalizeTier(raw: string | undefined | null) {
  const t = (raw || "").toLowerCase().trim();
  return t || "standard";
}

function mapStripeStatusToAppStatus(
  stripeStatus: StripeType.Subscription.Status,
): "active" | "past_due" | "canceled" | "inactive" {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "incomplete")
    return "past_due";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "canceled";
  return "inactive";
}

async function lookupUserIdByCustomer(customerId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    console.error("[STRIPE WEBHOOK] Error looking up user by stripe_customer_id:", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Extract tier from subscription item:
 * Prefer price.metadata.tier (best), fallback to nickname.
 */
function extractTierFromSubscription(sub: StripeType.Subscription) {
  const item = sub.items?.data?.[0];
  const price = (item?.price as StripeType.Price | undefined) || undefined;

  const tierFromPriceMeta = (price?.metadata as any)?.tier as string | undefined;
  const tierFromNickname = price?.nickname || undefined;

  return normalizeTier(tierFromPriceMeta || tierFromNickname || sub.metadata?.tier);
}

async function syncUserFromSubscription(sub: StripeType.Subscription) {
  const customerId = sub.customer as string;
  let userId = (sub.metadata?.userId as string | undefined) || null;

  // Fallback: resolve userId via stripe_customer_id if metadata.userId missing
  if (!userId && customerId) {
    userId = await lookupUserIdByCustomer(customerId);
  }

  if (!userId) {
    console.warn("[STRIPE WEBHOOK] No userId resolved for subscription, skipping sync", {
      subscriptionId: sub.id,
      customerId,
    });
    return;
  }

  const tier = extractTierFromSubscription(sub);
  const appStatus = mapStripeStatusToAppStatus(sub.status);

  const currentPeriodEndIso = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  // Idempotency guard
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("users")
    .select(
      "stripe_subscription_id, stripe_customer_id, subscription_tier, subscription_status, cancel_at_period_end, current_period_end",
    )
    .eq("id", userId)
    .maybeSingle();

  if (existingErr) console.error("[STRIPE WEBHOOK] Guard lookup error:", existingErr);

  if (
    existing &&
    existing.stripe_subscription_id === sub.id &&
    (existing.stripe_customer_id || "") === customerId &&
    (existing.subscription_tier || "").toLowerCase() === tier &&
    (existing.subscription_status || "").toLowerCase() === appStatus &&
    !!existing.cancel_at_period_end === !!sub.cancel_at_period_end &&
    (existing.current_period_end || null) === currentPeriodEndIso
  ) {
    console.log("[STRIPE WEBHOOK] 🔁 Sync guard: already up to date", {
      userId,
      subscriptionId: sub.id,
      tier,
      appStatus,
    });
    return;
  }

  console.log("[STRIPE WEBHOOK] ✅ Syncing subscription → DB", {
    userId,
    customerId,
    subscriptionId: sub.id,
    stripeStatus: sub.status,
    appStatus,
    tier,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: sub.current_period_end,
  });

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscription_tier: tier,
      subscription_status: appStatus,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      current_period_end: currentPeriodEndIso,
    })
    .eq("id", userId);

  if (error) {
    console.error("[STRIPE WEBHOOK] DB sync error:", error);
  } else {
    console.log("[STRIPE WEBHOOK] ✅ DB sync complete", { userId, tier, appStatus });
  }
}

/**
 * -----------------------
 * Webhook handler
 * -----------------------
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error("[STRIPE WEBHOOK] Missing stripe-signature or STRIPE_WEBHOOK_SECRET", {
      hasSig: !!sig,
      hasSecret: !!webhookSecret,
    });
    return new NextResponse("Bad Request", { status: 400 });
  }

  const rawBody = await req.text();
  let event: StripeType.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("[STRIPE WEBHOOK] ❌ Signature verification failed:", err?.message);
    return new NextResponse(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  console.log("[STRIPE WEBHOOK] ✅ Event received:", event.type, "id:", event.id);

  try {
    switch (event.type) {
      /**
       * 1) Persist customer/subscription mapping ASAP
       * This enables invoice events to find the user.
       */
      case "checkout.session.completed": {
        const session = event.data.object as StripeType.Checkout.Session;
        const metadata = session.metadata || {};

        const userId = metadata.userId as string | undefined;
        const tier = normalizeTier((metadata.tier as string | undefined) || "standard");

        const subscriptionId = (session.subscription as string) || null;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : (session.customer as StripeType.Customer | null)?.id || null;

        console.log("[STRIPE WEBHOOK] checkout.session.completed:", {
          userId,
          tier,
          subscriptionId,
          customerId,
          payment_status: session.payment_status,
        });

        if (!userId || !customerId) {
          console.warn("[STRIPE WEBHOOK] Missing userId/customerId, cannot persist mapping.", {
            userId,
            customerId,
          });
          break;
        }

        const { error } = await supabaseAdmin
          .from("users")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_tier: tier,
          })
          .eq("id", userId);

        if (error) console.error("[STRIPE WEBHOOK] Failed to store mapping:", error);
        else console.log("[STRIPE WEBHOOK] ✅ Stored customer/subscription mapping for user:", userId);

        break;
      }

      /**
       * 2) This is the key fix for “upgrade works in Stripe but DB/UI not updated”
       */
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const partial = event.data.object as StripeType.Subscription;

        // ✅ Re-fetch full subscription with expanded item price + product
        const full = await stripe.subscriptions.retrieve(partial.id, {
          expand: ["items.data.price.product"],
        });

        await syncUserFromSubscription(full as StripeType.Subscription);
        break;
      }

      /**
       * 3) invoice.paid -> send email (optional) + idempotent
       * You can ALSO set subscription_status active here if you want it tied to payment.
       */
      case "invoice.paid": {
        if (await emailAlreadySent(event.id)) {
          console.log("[EMAIL] Skipping duplicate invoice.paid email:", event.id);
          break;
        }

        const invoice = event.data.object as StripeType.Invoice;
        const customerId = invoice.customer as string;

        if (!customerId) {
          console.warn("[EMAIL] invoice.paid missing customer id");
          await markEmailSent({ stripe_event_id: event.id, email_type: "invoice.paid" });
          break;
        }

        const { data: userRow, error: userErr } = await supabaseAdmin
          .from("users")
          .select("id, email, subscription_tier")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (userErr) console.error("[EMAIL] DB lookup error:", userErr);

        if (!userRow?.email) {
          console.warn("[EMAIL] No user/email found for customer:", customerId);
          // Avoid retry spam
          await markEmailSent({
            stripe_event_id: event.id,
            email_type: "invoice.paid",
            user_id: userRow?.id ?? null,
            to_email: null,
          });
          break;
        }

        const tier = userRow.subscription_tier || "your plan";

        try {
          const result = await resend.emails.send({
            from: BILLING_FROM,
            to: [userRow.email],
            subject: "Your SeaJourney subscription is active ✅",
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>Subscription active</h2>
                <p>Your <b>${tier}</b> subscription is now active.</p>
                <p><a href="${SITE_URL}/dashboard">Go to your dashboard</a></p>
                <p style="color:#777; font-size: 12px;">
                  If you didn’t make this purchase, please contact support.
                </p>
              </div>
            `,
          });

          console.log("[EMAIL] ✅ Resend result:", result);

          await markEmailSent({
            stripe_event_id: event.id,
            email_type: "invoice.paid",
            user_id: userRow.id,
            to_email: userRow.email,
          });
        } catch (err) {
          console.error("[EMAIL] ❌ Resend send failed:", err);
          // still mark as sent? I prefer NOT to mark if it failed, so retries can re-attempt.
        }

        break;
      }

      default:
        console.log("[STRIPE WEBHOOK] Ignoring event type:", event.type);
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err: any) {
    console.error("[STRIPE WEBHOOK] ❌ Handler error:", err);
    // Return 200 to avoid retry storms while debugging
    return new NextResponse("OK", { status: 200 });
  }
}
