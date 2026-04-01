import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendSubscriptionEmail } from '@/lib/subscription-emails';
import type Stripe from 'stripe';

function tierFromPrice(price: Stripe.Price): string {
  return ((price.metadata?.tier || '').toString().toLowerCase().trim() || 'standard');
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
  const currentPeriodEnd = sub.current_period_end;

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
    throw new Error('Schedule has no phases; cannot schedule downgrade.');
  }

  const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
    {
      start_date: currentPhase.start_date,
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

  const updated = await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: 'release',
    phases,
  });

  return { schedule: updated, effectiveAt: currentPeriodEnd, scheduleId };
}

function pickPlanItem(
  sub: Stripe.Subscription,
  crewProductId: string,
  vesselProductId: string,
) {
  const items = sub.items.data;

  const byProduct = items.find((it) => {
    const price = it.price as Stripe.Price;
    const prod = price.product as { id?: string } | string;
    const prodId = typeof prod === 'string' ? prod : prod?.id;
    return prodId === crewProductId || prodId === vesselProductId;
  });

  const byTierMeta = items.find((it) => {
    const price = it.price as Stripe.Price;
    return !!(price.metadata as { tier?: string })?.tier;
  });

  return byProduct || byTierMeta || items[0] || null;
}

export type SubscriptionPlanChangeResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: { error: string; debug?: unknown } };

/**
 * Shared Stripe plan change (crew or vessel product family), used by /api/billing/change-plan and admin tools.
 */
export async function executeSubscriptionPlanChange(params: {
  subscriptionId: string;
  priceId: string;
  userId?: string | null;
}): Promise<SubscriptionPlanChangeResult> {
  const { subscriptionId, priceId, userId } = params;

  const crewProductId = (process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID || '').trim();
  const vesselProductId = (process.env.STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID || '').trim();

  if (!crewProductId || !vesselProductId) {
    return {
      ok: false,
      status: 500,
      body: {
        error:
          'Missing STRIPE_SUBSCRIPTION_PRODUCT_ID or STRIPE_VESSEL_SUBSCRIPTION_PRODUCT_ID',
      },
    };
  }

  const currentSub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });

  const stripeCustomerId =
    typeof currentSub.customer === 'string'
      ? currentSub.customer
      : (currentSub.customer as Stripe.Customer)?.id;

  const currentItem = pickPlanItem(
    currentSub as Stripe.Subscription,
    crewProductId,
    vesselProductId,
  );

  if (!currentItem) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Could not determine current subscription item' },
    };
  }

  const currentPrice = currentItem.price as Stripe.Price;
  const currentProduct = currentPrice.product as { id?: string } | string;
  const currentProductId =
    typeof currentProduct === 'string' ? currentProduct : currentProduct?.id;

  const newPrice = await stripe.prices.retrieve(priceId, {
    expand: ['product'],
  });

  const newProduct = newPrice.product as { id?: string } | string;
  const newProductId = typeof newProduct === 'string' ? newProduct : newProduct?.id;

  const currentIsVessel = currentProductId === vesselProductId;
  const newIsVessel = newProductId === vesselProductId;
  const currentIsCrew = currentProductId === crewProductId;
  const newIsCrew = newProductId === crewProductId;

  if ((currentIsVessel && !newIsVessel) || (currentIsCrew && !newIsCrew)) {
    return {
      ok: false,
      status: 400,
      body: {
        error:
          'You cannot switch between crew and vessel products using change-plan. Create a new subscription for the other product.',
        debug: { currentProductId, newProductId },
      },
    };
  }

  const currentAmount = currentPrice.unit_amount ?? 0;
  const newAmount = newPrice.unit_amount ?? 0;
  const currentTier = tierFromPrice(currentPrice);
  const targetTier = tierFromPrice(newPrice);

  if (newPrice.id === currentPrice.id) {
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        mode: 'no_change',
        message: 'Already on this plan.',
        currentTier,
        targetTier,
      },
    };
  }

  const isDowngrade = newAmount < currentAmount;

  if (isDowngrade) {
    const { effectiveAt, scheduleId } = await scheduleDowngradeAtPeriodEnd(
      subscriptionId,
      priceId,
    );

    const pendingUpdate = {
      pending_subscription_tier: targetTier,
      pending_change_effective_at: new Date(effectiveAt * 1000).toISOString(),
    };

    let userEmail: string | null = null;
    if (userId) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
      userEmail = userData?.email || null;
      await supabaseAdmin.from('users').update(pendingUpdate).eq('id', userId);
    } else if (stripeCustomerId) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle();
      userEmail = userData?.email || null;
      await supabaseAdmin
        .from('users')
        .update(pendingUpdate)
        .eq('stripe_customer_id', stripeCustomerId);
    }

    if (userEmail) {
      await sendSubscriptionEmail({
        toEmail: userEmail,
        tier: targetTier,
        previousTier: currentTier,
        eventType: 'downgraded',
        effectiveDate: new Date(effectiveAt * 1000).toISOString(),
      });
    }

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        mode: 'downgrade_scheduled',
        currentTier,
        targetTier,
        effectiveAt,
        scheduleId,
        message: 'Downgrade scheduled for next billing date.',
      },
    };
  }

  if (currentSub.schedule) {
    await stripe.subscriptionSchedules.release(currentSub.schedule as string);
  }

  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: currentItem.id, price: priceId }],
    proration_behavior: 'create_prorations',
    payment_behavior: 'pending_if_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });

  const clearPending = {
    pending_subscription_tier: null,
    pending_change_effective_at: null,
  };

  let userEmail: string | null = null;
  if (userId) {
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    userEmail = userData?.email || null;
    await supabaseAdmin.from('users').update(clearPending).eq('id', userId);
  } else if (stripeCustomerId) {
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    userEmail = userData?.email || null;
    await supabaseAdmin
      .from('users')
      .update(clearPending)
      .eq('stripe_customer_id', stripeCustomerId);
  }

  if (userEmail) {
    await sendSubscriptionEmail({
      toEmail: userEmail,
      tier: targetTier,
      previousTier: currentTier,
      eventType: 'upgraded',
    });
  }

  const latestInvoice = updated.latest_invoice as Stripe.Invoice | null;
  const pi = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;

  return {
    ok: true,
    status: 200,
    body: {
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
  };
}
