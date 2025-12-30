// src/app/api/billing/change-plan/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

function tierFromPrice(price: Stripe.Price): string {
  return ((price.metadata?.tier || "").toString().toLowerCase().trim() || "standard");
}

function getCurrentPhase(
  schedule: Stripe.SubscriptionSchedule,
): Stripe.SubscriptionSchedule.Phase | null {
  const now = Math.floor(Date.now() / 1000);
  const phases = schedule.phases || [];
  const active =
    phases.find((p) => {
      const startOk = (p.start_date ?? 0) <= now;
      const endOk = p.end_date ? now < p.end_date : true;
      return startOk && endOk;
    }) || null;

  return active || phases[phases.length - 1] || null;
}

async function scheduleDowngradeAtPeriodEnd(subscriptionId: string, newPriceId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const currentPeriodEnd = sub.current_period_end; // unix seconds

  let scheduleId: string;
  if (sub.schedule) {
    scheduleId = sub.schedule as string;
  } else {
    const created = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    scheduleId = created.id;
  }

  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const currentPhase = getCurrentPhase(schedule);

  if (!currentPhase) {
    throw new Error("Schedule has no phases; cannot schedule downgrade.");
  }

  const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
    {
      start_date: currentPhase.start_date,
      end_date: currentPeriodEnd,
      items: (currentPhase.items || []).map((it) => ({
        price: typeof it.price === "string" ? it.price : it.price.id,
        quantity: it.quantity ?? 1,
      })),
    },
    {
      start_date: currentPeriodEnd,
      items: [{ price: newPriceId, quantity: 1 }],
    },
  ];

  const updated = await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "release",
    phases,
  });

  return { schedule: updated, effectiveAt: currentPeriodEnd, scheduleId };
}

/**
 * Pick the subscription item that corresponds to the "plan"
 * by matching product ID against crew/vessel product IDs.
 */
function pickPlanItem(
  sub: Stripe.Subscription,
  crewProductId: string,
  vesselProductId: string,
) {
  const items = sub.items.data;

  // 1) prefer item whose product matches known product ids
  const byProduct = items.find((it) => {
    const price = it.price as Stripe.Price;
    const prod = price.product as any;
    const prodId = typeof prod === "string" ? prod : prod?.id;
    return prodId === crewProductId || prodId === vesselProductId;
  });

  // 2) else any item with metadata.tier
  const byTierMeta = items.find((it) => {
    const price = it.price as Stripe.Price;
    return !!(price.metadata as any)?.tier;
  });

  // 3) else fallback first item
  return byProduct || byTierMeta || items[0] || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscriptionId, priceId, userId } = body || {};

    if (!subscriptionId || !priceId) {
      return NextResponse.json(
        { error: "Missing subscriptionId or priceId" },
        { status: 400 },
      );
    }

    const crewProductId = (process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID || "").trim();
    const vesselProductId = (process.env.STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID || "").trim();

    if (!crewProductId || !vesselProductId) {
      return NextResponse.json(
        { error: "Missing STRIPE_SUBSCRIPTION_PRODUCT_ID or STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID" },
        { status: 500 },
      );
    }

    // 1) Load current subscription with expanded prices
    const currentSub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price.product"],
    });

    const stripeCustomerId =
      typeof currentSub.customer === "string"
        ? currentSub.customer
        : (currentSub.customer as any)?.id;

    const currentItem = pickPlanItem(
      currentSub as Stripe.Subscription,
      crewProductId,
      vesselProductId,
    );

    if (!currentItem) {
      return NextResponse.json(
        { error: "Could not determine current subscription item" },
        { status: 400 },
      );
    }

    const currentPrice = currentItem.price as Stripe.Price;
    const currentProduct = currentPrice.product as any;
    const currentProductId = typeof currentProduct === "string" ? currentProduct : currentProduct?.id;

    // 2) Load target price (expand product so we can validate product family)
    const newPrice = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    });

    const newProduct = newPrice.product as any;
    const newProductId = typeof newProduct === "string" ? newProduct : newProduct?.id;

    // Prevent switching between crew/vessel products accidentally
    const currentIsVessel = currentProductId === vesselProductId;
    const newIsVessel = newProductId === vesselProductId;

    const currentIsCrew = currentProductId === crewProductId;
    const newIsCrew = newProductId === crewProductId;

    if ((currentIsVessel && !newIsVessel) || (currentIsCrew && !newIsCrew)) {
      return NextResponse.json(
        {
          error:
            "You cannot switch between crew and vessel products using change-plan. Create a new subscription for the other product.",
          debug: { currentProductId, newProductId },
        },
        { status: 400 },
      );
    }

    const currentAmount = currentPrice.unit_amount ?? 0;
    const newAmount = newPrice.unit_amount ?? 0;

    const currentTier = tierFromPrice(currentPrice);
    const targetTier = tierFromPrice(newPrice);

    const isSame = newPrice.id === currentPrice.id;
    if (isSame) {
      return NextResponse.json(
        { success: true, mode: "no_change", message: "Already on this plan." },
        { status: 200 },
      );
    }

    // IMPORTANT: downgrade/upgrade decision based on the PLAN item (not an addon)
    const isDowngrade = newAmount < currentAmount;

    console.log("[CHANGE-PLAN] decision:", {
      subscriptionId,
      stripeCustomerId,
      currentPriceId: currentPrice.id,
      currentProductId,
      currentTier,
      currentAmount,
      newPriceId: newPrice.id,
      newProductId,
      targetTier,
      newAmount,
      isDowngrade,
      pickedItemId: currentItem.id,
    });

    // ---------- DOWNGRADE (schedule for period end) ----------
    if (isDowngrade) {
      const { effectiveAt, scheduleId } = await scheduleDowngradeAtPeriodEnd(
        subscriptionId,
        priceId,
      );

      // Save pending change to DB for UI
      const pendingUpdate = {
        pending_subscription_tier: targetTier,
        pending_change_effective_at: new Date(effectiveAt * 1000).toISOString(),
      };

      if (userId) {
        await supabaseAdmin.from("users").update(pendingUpdate).eq("id", userId);
      } else if (stripeCustomerId) {
        await supabaseAdmin
          .from("users")
          .update(pendingUpdate)
          .eq("stripe_customer_id", stripeCustomerId);
      }

      return NextResponse.json(
        {
          success: true,
          mode: "downgrade_scheduled",
          currentTier,
          targetTier,
          effectiveAt,
          scheduleId,
          message: "Downgrade scheduled for next billing date.",
        },
        { status: 200 },
      );
    }

    // ---------- UPGRADE (apply immediately with proration) ----------
    // If there is a schedule, release it first so it doesn't override the upgrade
    if (currentSub.schedule) {
      await stripe.subscriptionSchedules.release(currentSub.schedule as string);
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: currentItem.id, price: priceId }],
      proration_behavior: "create_prorations",
      payment_behavior: "pending_if_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });

    // Clear any pending downgrade (user changed mind)
    const clearPending = {
      pending_subscription_tier: null,
      pending_change_effective_at: null,
    };

    if (userId) {
      await supabaseAdmin.from("users").update(clearPending).eq("id", userId);
    } else if (stripeCustomerId) {
      await supabaseAdmin
        .from("users")
        .update(clearPending)
        .eq("stripe_customer_id", stripeCustomerId);
    }

    const latestInvoice = updated.latest_invoice as Stripe.Invoice | null;
    const pi = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;

    return NextResponse.json(
      {
        success: true,
        mode: "upgrade_applied",
        currentTier,
        targetTier,
        subscriptionStatus: updated.status,
        invoice: latestInvoice
          ? {
              id: latestInvoice.id,
              status: latestInvoice.status,
              hosted_invoice_url: latestInvoice.hosted_invoice_url,
            }
          : null,
        paymentIntent: pi
          ? {
              id: pi.id,
              status: pi.status,
              client_secret: pi.client_secret,
            }
          : null,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("[API /api/billing/change-plan] Error:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Failed to change subscription plan. Please try again later.",
      },
      { status: 500 },
    );
  }
}
