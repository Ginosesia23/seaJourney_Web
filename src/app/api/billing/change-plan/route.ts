// app/api/billing/change-plan/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type Stripe from 'stripe';

function tierFromPrice(price: Stripe.Price): string {
  return (
    (price.metadata?.tier || '').toString().toLowerCase().trim() || 'standard'
  );
}

/**
 * Find the phase that is active "now".
 * Stripe phases have start_date/end_date as unix seconds.
 */
function getCurrentPhase(schedule: Stripe.SubscriptionSchedule): Stripe.SubscriptionSchedule.Phase | null {
  const now = Math.floor(Date.now() / 1000);
  const phases = schedule.phases || [];
  // active phase: start_date <= now < end_date (or end_date null)
  const active =
    phases.find((p) => {
      const startOk = (p.start_date ?? 0) <= now;
      const endOk = p.end_date ? now < p.end_date : true;
      return startOk && endOk;
    }) || null;

  // fallback to last phase if none matched
  return active || phases[phases.length - 1] || null;
}

export async function scheduleDowngradeAtPeriodEnd(
  subscriptionId: string,
  newPriceId: string,
) {
  // 1) Load subscription (need current_period_end + schedule)
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const currentPeriodEnd = sub.current_period_end; // unix seconds

  // 2) Get schedule id if it exists, else create it
  let scheduleId: string;

  if (sub.schedule) {
    scheduleId = sub.schedule as string;
  } else {
    const created = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    scheduleId = created.id;
  }

  // 3) Fetch schedule and find the active phase
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const currentPhase = getCurrentPhase(schedule);

  if (!currentPhase) {
    throw new Error('Schedule has no phases; cannot schedule downgrade.');
  }

  // 4) Build a clean 2-phase schedule:
  //    - keep CURRENT phase items until current_period_end
  //    - apply downgrade from current_period_end
  const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
    {
      start_date: currentPhase.start_date, // ✅ DO NOT CHANGE THIS
      end_date: currentPeriodEnd,
      items: (currentPhase.items || []).map((it) => ({
        price: typeof it.price === 'string' ? it.price : it.price.id,
        quantity: it.quantity ?? 1,
      })),
    },
    {
      start_date: currentPeriodEnd,
      items: [{ price: newPriceId, quantity: 1 }],
    },
  ];

  // 5) Update schedule
  const updated = await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: 'release',
    phases,
  });

  return { schedule: updated, effectiveAt: currentPeriodEnd, scheduleId };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscriptionId, priceId, userId } = body || {};

    if (!subscriptionId || !priceId) {
      return NextResponse.json(
        { error: 'Missing subscriptionId or priceId' },
        { status: 400 },
      );
    }

    // 1) Load current subscription and current price (expanded)
    const currentSub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });

    const currentItem = currentSub.items.data[0];
    const currentPrice = currentItem?.price as Stripe.Price | undefined;

    if (!currentPrice) {
      return NextResponse.json(
        { error: 'Could not determine current subscription price' },
        { status: 400 },
      );
    }

    // 2) Load target price
    const newPrice = await stripe.prices.retrieve(priceId);

    const currentAmount = currentPrice.unit_amount ?? 0;
    const newAmount = newPrice.unit_amount ?? 0;

    const currentTier = tierFromPrice(currentPrice);
    const targetTier = tierFromPrice(newPrice);

    const isDowngrade = newAmount < currentAmount;
    const isSame = newPrice.id === currentPrice.id;

    if (isSame) {
      return NextResponse.json(
        { success: true, mode: 'no_change', message: 'Already on this plan.' },
        { status: 200 },
      );
    }

    const stripeCustomerId =
      typeof currentSub.customer === 'string'
        ? currentSub.customer
        : (currentSub.customer as any)?.id;

    // ---------- DOWNGRADE (schedule for period end) ----------
    if (isDowngrade) {
      const { effectiveAt, scheduleId } = await scheduleDowngradeAtPeriodEnd(
        subscriptionId,
        priceId,
      );

      // Save pending change to DB for UI
      if (userId) {
        await supabaseAdmin
          .from('users')
          .update({
            pending_subscription_tier: targetTier,
            pending_change_effective_at: new Date(
              effectiveAt * 1000,
            ).toISOString(),
          })
          .eq('id', userId);
      } else if (stripeCustomerId) {
        await supabaseAdmin
          .from('users')
          .update({
            pending_subscription_tier: targetTier,
            pending_change_effective_at: new Date(
              effectiveAt * 1000,
            ).toISOString(),
          })
          .eq('stripe_customer_id', stripeCustomerId);
      }

      return NextResponse.json(
        {
          success: true,
          mode: 'downgrade_scheduled',
          currentTier,
          targetTier,
          effectiveAt, // unix seconds
          scheduleId,
          message: 'Downgrade scheduled for next billing date.',
        },
        { status: 200 },
      );
    }

    // ---------- UPGRADE (apply immediately with proration) ----------
    // ✅ If there is a schedule, release it first so it doesn't override the upgrade
    if (currentSub.schedule) {
      await stripe.subscriptionSchedules.release(currentSub.schedule as string);
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: currentItem.id, price: priceId }],
      proration_behavior: 'create_prorations',
      payment_behavior: 'pending_if_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Clear any pending downgrade (user changed mind)
    if (userId) {
      await supabaseAdmin
        .from('users')
        .update({
          pending_subscription_tier: null,
          pending_change_effective_at: null,
        })
        .eq('id', userId);
    } else if (stripeCustomerId) {
      await supabaseAdmin
        .from('users')
        .update({
          pending_subscription_tier: null,
          pending_change_effective_at: null,
        })
        .eq('stripe_customer_id', stripeCustomerId);
    }

    const latestInvoice = updated.latest_invoice as Stripe.Invoice | null;
    const pi = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;

    return NextResponse.json(
      {
        success: true,
        mode: 'upgrade_applied',
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
    console.error('[API /api/billing/change-plan] Error:', err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          'Failed to change subscription plan. Please try again later.',
      },
      { status: 500 },
    );
  }
}
