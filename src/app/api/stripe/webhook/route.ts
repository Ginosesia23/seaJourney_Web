// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { mapPriceToTier } from '@/lib/billing';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { updateUserProfile } from '@/supabase/database/queries';

// ✅ Force Node.js runtime
export const runtime = 'nodejs';
// Optional, avoids any caching weirdness
export const dynamic = 'force-dynamic';

// --- Stripe setup ---

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  console.error('[STRIPE WEBHOOK] Missing STRIPE_SECRET_KEY');
}

if (!webhookSecret) {
  console.error('[STRIPE WEBHOOK] Missing STRIPE_WEBHOOK_SECRET');
}

const stripe = new Stripe(stripeSecretKey || '', {
  apiVersion: '2024-06-20',
});

// --- Simple GET so you can test the route in a browser ---

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Stripe webhook endpoint' });
}

// --- MAIN WEBHOOK HANDLER (POST) ---

export async function POST(req: NextRequest) {
  if (!webhookSecret || !stripeSecretKey) {
    console.error('[STRIPE WEBHOOK] Missing Stripe env vars');
    return new NextResponse('Stripe configuration error', { status: 500 });
  }

  let event: Stripe.Event;

  // 🔑 Read the raw body as text (Stripe is fine with a raw string)
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  console.log('[STRIPE WEBHOOK] Debug:', {
    hasSignature: !!signature,
    bodyLength: body.length,
    secretPrefix: webhookSecret.slice(0, 8),
    nodeEnv: process.env.NODE_ENV,
  });

  try {
    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }

    // ✅ Normal path: verify signature
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('[STRIPE WEBHOOK] ❌ Signature verification failed:', err?.message);

    // 👇 DEV-ONLY FALLBACK:
    // In development, if signature verification fails but you still want to test
    // the rest of your webhook logic, we can parse the JSON directly.
    if (process.env.NODE_ENV === 'development') {
      try {
        console.warn(
          '[STRIPE WEBHOOK] ⚠️ DEV MODE: Falling back to JSON.parse(body) for testing.',
        );
        const json = JSON.parse(body);
        event = json as Stripe.Event;
      } catch (jsonErr: any) {
        console.error('[STRIPE WEBHOOK] ❌ Also failed to parse JSON body:', jsonErr?.message);
        return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
      }
    } else {
      // In production, we **must** require valid signature
      return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }
  }

  console.log('[STRIPE WEBHOOK] ✅ Received event:', event.type);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event);
        break;

      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;

      default:
        // Ignore other event types for now
        break;
    }
  } catch (err) {
    console.error('[STRIPE WEBHOOK] ❌ Error handling event', event.type, err);
    return new NextResponse('Webhook handler error', { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---- SUBSCRIPTION HANDLER ----

async function handleSubscriptionChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  // Try to get user_id from subscription metadata first
  let userId = subscription.metadata?.user_id;
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;

  // If no user_id in metadata, try to get it from customer email
  if (!userId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);

      if (typeof customer !== 'string' && customer.email) {
        const { data: userData, error } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', customer.email)
          .maybeSingle();

        if (error) {
          console.error('[STRIPE WEBHOOK] Supabase user lookup error:', error);
        }

        if (userData?.id) {
          userId = userData.id;
          console.log('[STRIPE WEBHOOK] Found user by email:', {
            email: customer.email,
            userId,
          });
        }
      }
    } catch (error) {
      console.error('[STRIPE WEBHOOK] Error looking up user by customer:', error);
    }
  }

  if (!userId) {
    console.warn('[STRIPE WEBHOOK] Subscription event without user_id', {
      eventType: event.type,
      subscriptionId,
      customerId,
    });
    return;
  }

  const stripeStatus = subscription.status; // 'active', 'trialing', 'past_due', 'canceled', etc.
  const cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  const items = subscription.items?.data ?? [];
  const primaryItem = items[0];
  const priceId = primaryItem?.price?.id;

  const tier = priceId ? await mapPriceToTier(priceId) : 'free';

  type AppStatus = 'free' | 'active' | 'cancelling' | 'expired';
  let appStatus: AppStatus = 'free';

  if (stripeStatus === 'active' || stripeStatus === 'trialing') {
    appStatus = cancelAtPeriodEnd ? 'cancelling' : 'active';
  } else if (stripeStatus === 'canceled') {
    appStatus = 'expired';
  } else if (stripeStatus === 'incomplete' || stripeStatus === 'incomplete_expired') {
    appStatus = 'free';
  } else {
    // 'past_due', 'unpaid', etc – your call
    appStatus = 'active';
  }

  console.log('[STRIPE WEBHOOK] Subscription event', {
    eventType: event.type,
    userId,
    stripeStatus,
    appStatus,
    tier,
    cancelAtPeriodEnd,
    currentPeriodEnd,
  });

  await updateUserSubscriptionInDatabase({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: stripeStatus === 'canceled' ? null : subscriptionId,
    tier: appStatus === 'expired' || appStatus === 'free' ? 'free' : tier,
    status: appStatus,
    cancelAtPeriodEnd,
    currentPeriodEnd,
  });
}

// ---- DB UPDATE ----

type SubscriptionStatus = 'free' | 'active' | 'cancelling' | 'expired';

interface UpdateArgs {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  tier: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
}

async function updateUserSubscriptionInDatabase(args: UpdateArgs) {
  try {
    console.log('[STRIPE WEBHOOK] Updating user subscription in database:', {
      userId: args.userId,
      tier: args.tier,
      status: args.status,
    });

    let subscriptionStatus: string;
    if (args.status === 'active') {
      subscriptionStatus = 'active';
    } else if (args.status === 'cancelling') {
      subscriptionStatus = 'cancelling';
    } else if (args.status === 'expired') {
      subscriptionStatus = 'inactive';
    } else {
      subscriptionStatus = 'inactive'; // 'free'
    }

    let normalizedTier = args.tier.toLowerCase();
    if (normalizedTier === 'professional') {
      normalizedTier = 'pro';
    }

    await updateUserProfile(supabaseAdmin, args.userId, {
      subscriptionTier: normalizedTier,
      subscriptionStatus,
    });

    console.log('[STRIPE WEBHOOK] ✅ Successfully updated user subscription:', {
      userId: args.userId,
      tier: normalizedTier,
      status: subscriptionStatus,
    });
  } catch (error: any) {
    console.error('[STRIPE WEBHOOK] ❌ Error updating user subscription:', {
      userId: args.userId,
      error: error?.message,
      stack: error?.stack,
    });
    throw error;
  }
}

// ---- CHECKOUT COMPLETED HANDLER ----

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  console.log('[STRIPE WEBHOOK] Checkout session completed:', {
    sessionId: session.id,
    customerEmail: session.customer_email,
    clientReferenceId: session.client_reference_id,
  });

  if (session.subscription && session.client_reference_id) {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string,
      );

      if (!subscription.metadata?.user_id && session.client_reference_id) {
        await stripe.subscriptions.update(subscription.id, {
          metadata: {
            ...subscription.metadata,
            user_id: session.client_reference_id,
          },
        });
        console.log('[STRIPE WEBHOOK] ✅ Set user_id metadata on subscription');
      }
    } catch (error) {
      console.error('[STRIPE WEBHOOK] Error updating subscription metadata:', error);
    }
  }
}
