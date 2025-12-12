// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type StripeType from 'stripe';

export const runtime = 'nodejs'; // we need raw body support

async function updateUserFromSubscription(subscription: StripeType.Subscription) {
  const metadata = subscription.metadata || {};
  let userId = (metadata.userId as string | undefined) || null;
  const customerId = subscription.customer as string;

  // 1) Resolve userId (metadata preferred, fallback via stripe_customer_id)
  if (!userId && customerId) {
    console.log(
      '[STRIPE WEBHOOK] No userId in metadata, trying stripe_customer_id lookup',
      { customerId },
    );

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (error) {
      console.error('[STRIPE WEBHOOK] Error looking up user by stripe_customer_id:', error);
    } else if (user) {
      userId = user.id;
      console.log('[STRIPE WEBHOOK] Found user from stripe_customer_id lookup:', userId);
    } else {
      console.warn('[STRIPE WEBHOOK] No user found for stripe_customer_id', customerId);
    }
  }

  if (!userId) {
    console.warn(
      '[STRIPE WEBHOOK] Subscription has no userId and no matching stripe_customer_id, skipping update',
      { subscriptionId: subscription.id },
    );
    return;
  }

  // 2) Safely extract tier from subscription item price/product metadata
  const firstItem = subscription.items?.data?.[0];
  if (!firstItem) {
    console.warn('[STRIPE WEBHOOK] Subscription has no items, skipping update', {
      subscriptionId: subscription.id,
      userId,
    });
    return;
  }

  const price = firstItem.price as StripeType.Price | null;
  const product = (price?.product as StripeType.Product | string | null) ?? null;

  console.log('[STRIPE WEBHOOK] Tier source debug:', {
    subId: subscription.id,
    priceId: price?.id,
    priceMetaTier: price?.metadata?.tier,
    productIsString: typeof product === 'string',
    productMetaTier: typeof product !== 'string' && product ? product.metadata?.tier : null,
    metadataTier: metadata.tier,
    envPriceStandard: !!process.env.STRIPE_PRICE_STANDARD_ID,
    envPricePremium: !!process.env.STRIPE_PRICE_PREMIUM_ID,
    envPricePro: !!process.env.STRIPE_PRICE_PRO_ID,
  });
  

  let tier =
  (
    (metadata.tier as string | undefined) ||
    (price?.metadata?.tier as string | undefined) ||
    (typeof product !== 'string' && product ? (product.metadata?.tier as string | undefined) : undefined) ||
    ''
  )
    .toLowerCase()
    .trim() || 'standard';

  // ✅ fallback: infer tier from known price IDs if metadata missing
  // ✅ fallback: infer tier from known price IDs if metadata missing
  if (!tier || tier === 'standard') {
    const priceId = price?.id || '';

    const standardId = process.env.STRIPE_PRICE_STANDARD_ID;
    const premiumId = process.env.STRIPE_PRICE_PREMIUM_ID;
    const proId = process.env.STRIPE_PRICE_PRO_ID;

    const map: Record<string, string> = {};
    if (standardId) map[standardId] = 'standard';
    if (premiumId) map[premiumId] = 'premium';
    if (proId) map[proId] = 'professional';

    const mapped = map[priceId];
    if (mapped) {
      tier = mapped;
      console.log('[STRIPE WEBHOOK] Tier fallback matched priceId:', { priceId, tier });
    } else {
      console.log('[STRIPE WEBHOOK] Tier fallback did NOT match priceId:', {
        priceId,
        knownPriceIds: Object.keys(map),
      });
    }
  }

  const status = subscription.status;
  let subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'inactive' = 'inactive';

  if (status === 'active' || status === 'trialing') {
    subscriptionStatus = 'active';
  } else if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') {
    subscriptionStatus = 'past_due';
  } else if (status === 'canceled' || status === 'incomplete_expired') {
    subscriptionStatus = 'canceled';
  }

  // 3) ✅ Idempotency guard (skip if already applied)
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('users')
    .select('stripe_subscription_id, subscription_status, subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  if (existingErr) {
    console.error('[STRIPE WEBHOOK] Guard lookup error:', existingErr);
    // continue anyway
  } else if (
    existing &&
    existing.stripe_subscription_id === subscription.id &&
    (existing.subscription_tier || '').toLowerCase() === tier &&
    (existing.subscription_status || '').toLowerCase() === subscriptionStatus
  ) {
    console.log('[STRIPE WEBHOOK] 🔁 Guard: subscription already applied, skipping update', {
      userId,
      subscriptionId: subscription.id,
      tier,
      subscriptionStatus,
    });
    return;
  }

  console.log('[STRIPE WEBHOOK] updateUserFromSubscription:', {
    userId,
    tier,
    stripeStatus: status,
    subscriptionStatus,
    subscriptionId: subscription.id,
    customerId,
    priceId: price?.id,
    priceNickname: price?.nickname,
    priceMetadataTier: price?.metadata?.tier,
  });

  // 4) Write to DB (service role => no RLS issues)
  const { data: updated, error } = await supabaseAdmin
    .from('users')
    .update({
      subscription_tier: tier,
      subscription_status: subscriptionStatus,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
    })
    .eq('id', userId)
    .select('id, email, subscription_tier, subscription_status, stripe_subscription_id, stripe_customer_id');

  if (error) {
    console.error('[STRIPE WEBHOOK] Supabase update error:', error);
  } else {
    console.log('[STRIPE WEBHOOK] ✅ User updated successfully:', updated);
  }
}

export async function POST(req: NextRequest) {
  console.log('================ WEBHOOK HIT ================');
  console.log('[STRIPE WEBHOOK] Incoming request to /api/stripe/webhook');

  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('[STRIPE WEBHOOK] Using webhook secret prefix:', webhookSecret?.slice(0, 8));

  if (!sig || !webhookSecret) {
    console.error('[STRIPE WEBHOOK] Missing stripe-signature or STRIPE_WEBHOOK_SECRET', {
      hasSig: !!sig,
      hasSecret: !!webhookSecret,
    });
    return new NextResponse('Bad Request', { status: 400 });
  }

  const rawBody = await req.text();
  let event: StripeType.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('[STRIPE WEBHOOK] ❌ Signature verification failed:', err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log('[STRIPE WEBHOOK] ✅ Event received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as StripeType.Checkout.Session;

        const metadata = session.metadata || {};
        const userId = metadata.userId;
        const tier = (metadata.tier || 'standard').toLowerCase();

        const subscriptionId = session.subscription as string | null;
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : (session.customer as StripeType.Customer | null)?.id || null;

        console.log('[STRIPE WEBHOOK] checkout.session.completed payload:', {
          userId,
          tier,
          subscriptionId,
          customerId,
          payment_status: session.payment_status,
          status: session.status,
        });

        // Optional: You can update here too, but since your verify-checkout-session does it,
        // and subscription.updated will also arrive, it’s okay to leave this as logging only.
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const partial = event.data.object as StripeType.Subscription;

          console.log(`[STRIPE WEBHOOK] Handling ${event.type} for subscription ${partial.id}`);
        
          // ✅ IMPORTANT: re-fetch full subscription with expanded price + product
          const full = await stripe.subscriptions.retrieve(partial.id, {
            expand: ['items.data.price.product'],
          });
        
          await updateUserFromSubscription(full as StripeType.Subscription);
          break;
        }
        
      default:
        console.log('[STRIPE WEBHOOK] Ignoring event type:', event.type);
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err: any) {
    console.error('[STRIPE WEBHOOK] ❌ Handler error:', err);
    // To avoid retry storms, still return 200
    return new NextResponse('OK', { status: 200 });
  }
}
