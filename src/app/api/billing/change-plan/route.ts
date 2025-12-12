// app/api/billing/change-plan/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type Stripe from 'stripe';

function tierFromPrice(price: Stripe.Price): string {
  return (price.metadata?.tier || '').toString().toLowerCase().trim() || 'standard';
}

async function scheduleDowngradeAtPeriodEnd(subscriptionId: string, newPriceId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const currentPeriodEnd = sub.current_period_end; // unix seconds
  const currentItems = sub.items.data.map((it) => ({
    price: (it.price as Stripe.Price).id,
    quantity: it.quantity ?? 1,
  }));

  // Create schedule if missing
  let scheduleId = sub.schedule as string | null;
  if (!scheduleId) {
    const created = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    scheduleId = created.id;
  }

  const updated = await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: 'release',
    phases: [
      // Keep current plan until period end
      {
        start_date: 'now',
        end_date: currentPeriodEnd,
        items: currentItems,
      },
      // Apply downgrade from next billing date
      {
        start_date: currentPeriodEnd,
        items: [{ price: newPriceId, quantity: 1 }],
      },
    ],
  });

  return { schedule: updated, effectiveAt: currentPeriodEnd, subscription: sub };
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

    // 3) Decide upgrade vs downgrade
    const isDowngrade = newAmount < currentAmount;
    const isSame = newPrice.id === currentPrice.id;

    if (isSame) {
      return NextResponse.json(
        { success: true, mode: 'no_change', message: 'Already on this plan.' },
        { status: 200 },
      );
    }

    // ---------- DOWNGRADE (schedule for period end) ----------
    if (isDowngrade) {
      const { effectiveAt } = await scheduleDowngradeAtPeriodEnd(subscriptionId, priceId);

      // Write pending change to DB so UI can display it
      // We try to locate user by userId (preferred) or by stripe_customer_id from subscription
      const stripeCustomerId = typeof currentSub.customer === 'string'
        ? currentSub.customer
        : (currentSub.customer as any)?.id;

      if (userId) {
        await supabaseAdmin
          .from('users')
          .update({
            pending_subscription_tier: targetTier,
            pending_change_effective_at: new Date(effectiveAt * 1000).toISOString(),
          })
          .eq('id', userId);
      } else if (stripeCustomerId) {
        await supabaseAdmin
          .from('users')
          .update({
            pending_subscription_tier: targetTier,
            pending_change_effective_at: new Date(effectiveAt * 1000).toISOString(),
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
          message: 'Downgrade scheduled for next billing date.',
        },
        { status: 200 },
      );
    }

    // ---------- UPGRADE (apply immediately with proration) ----------
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: currentItem.id, price: priceId }],
      proration_behavior: 'create_prorations',
      payment_behavior: 'pending_if_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    // Clear any pending downgrade if user upgraded again
    const stripeCustomerId = typeof updated.customer === 'string'
      ? updated.customer
      : (updated.customer as any)?.id;

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

    // If SCA is required, you may need to send client_secret / hosted invoice URL
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
