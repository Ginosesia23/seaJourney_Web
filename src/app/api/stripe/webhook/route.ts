// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/supabase/server';
import type StripeType from 'stripe';

export const runtime = 'nodejs'; // important for raw body

async function updateUserFromSubscription(
  subscription: StripeType.Subscription,
) {
  const supabase = createSupabaseServerClient();

  const metadata = subscription.metadata || {};
  let userId = metadata.userId || null;
  const customerId = subscription.customer as string;

  // 👉 Fallback: look up user by stripe_customer_id
  if (!userId && customerId) {
    console.log(
      '[STRIPE WEBHOOK] No userId in metadata, trying stripe_customer_id lookup...',
      { customerId },
    );

    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (error) {
      console.error(
        '[STRIPE WEBHOOK] Error looking up user by stripe_customer_id:',
        error,
      );
    } else if (user) {
      userId = user.id;
      console.log(
        '[STRIPE WEBHOOK] Found user from stripe_customer_id lookup:',
        userId,
      );
    } else {
      console.warn(
        '[STRIPE WEBHOOK] No user found for stripe_customer_id',
        customerId,
      );
    }
  }

  if (!userId) {
    console.warn(
      '[STRIPE WEBHOOK] Subscription has no userId and no matching stripe_customer_id, skipping update',
      { subscriptionId: subscription.id },
    );
    return;
  }

  // Derive tier from price / metadata
  const item = subscription.items.data[0];
  const price = item.price as StripeType.Price;
  const product = price.product as StripeType.Product | string;

  let tier =
    (metadata.tier ||
      price.metadata?.tier ||
      (typeof product !== 'string' ? product.metadata?.tier : '') ||
      '')?.toLowerCase() || 'standard';

  const status = subscription.status;
  let subscriptionStatus = 'inactive';

  if (status === 'active' || status === 'trialing') {
    subscriptionStatus = 'active';
  } else if (
    status === 'past_due' ||
    status === 'unpaid' ||
    status === 'incomplete'
  ) {
    subscriptionStatus = 'past_due';
  } else if (
    status === 'canceled' ||
    status === 'incomplete_expired'
  ) {
    subscriptionStatus = 'canceled';
  }

  console.log('[STRIPE WEBHOOK] updateUserFromSubscription:', {
    userId,
    tier,
    stripeStatus: status,
    subscriptionStatus,
    subscriptionId: subscription.id,
    customerId,
    priceId: price.id,
    priceNickname: price.nickname,
    priceMetadataTier: price.metadata?.tier,
  });

  const { error } = await supabase
    .from('users')
    .update({
      subscription_tier: tier,
      subscription_status: subscriptionStatus,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
    })
    .eq('id', userId);

  if (error) {
    console.error('[STRIPE WEBHOOK] Supabase update error:', error);
  } else {
    console.log('[STRIPE WEBHOOK] ✅ User updated successfully');
  }
}


export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error(
      '[STRIPE WEBHOOK] Missing stripe-signature header or webhook secret',
    );
    return new NextResponse('Bad Request', { status: 400 });
  }

  const rawBody = await req.text();

  let event: StripeType.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error(
      '[STRIPE WEBHOOK] ❌ Signature verification failed:',
      err.message,
    );
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

        console.log('[STRIPE WEBHOOK] checkout.session.completed payload:', {
          userId,
          tier,
          subscriptionId,
          payment_status: session.payment_status,
          status: session.status,
        });

        if (!userId) {
          console.warn(
            '[STRIPE WEBHOOK] Session has no userId metadata, skipping DB update',
          );
          break;
        }

        if (session.payment_status !== 'paid') {
          console.warn(
            '[STRIPE WEBHOOK] Session not fully paid, skipping premium grant',
          );
          break;
        }

        const supabase = createSupabaseServerClient();

        const { error } = await supabase
          .from('users')
          .update({
            subscription_tier: tier,
            subscription_status: 'active',
            stripe_subscription_id: subscriptionId,
          })
          .eq('id', userId);

        if (error) {
          console.error(
            '[STRIPE WEBHOOK] Supabase update error (session completed):',
            error,
          );
        } else {
          console.log(
            '[STRIPE WEBHOOK] ✅ User updated from checkout.session.completed',
          );
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data
          .object as StripeType.Subscription;

        console.log(
          `[STRIPE WEBHOOK] Handling ${event.type} for subscription ${subscription.id}`,
        );

        // Use helper that is defensive about metadata
        await updateUserFromSubscription(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data
          .object as StripeType.Subscription;
        console.log(
          '[STRIPE WEBHOOK] customer.subscription.deleted:',
          subscription.id,
        );

        // Mark as cancelled if we have userId
        const userId = subscription.metadata?.userId;
        if (userId) {
          const supabase = createSupabaseServerClient();
          const { error } = await supabase
            .from('users')
            .update({
              subscription_status: 'canceled',
            })
            .eq('id', userId);

          if (error) {
            console.error(
              '[STRIPE WEBHOOK] Supabase update error (subscription.deleted):',
              error,
            );
          }
        } else {
          console.warn(
            '[STRIPE WEBHOOK] Subscription.deleted has no userId metadata, skipping DB update',
          );
        }
        break;
      }

      default:
        console.log(
          '[STRIPE WEBHOOK] Ignoring event type:',
          event.type,
        );
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err: any) {
    console.error('[STRIPE WEBHOOK] ❌ Handler error:', err);
    // Important: still return 200 so Stripe doesn't keep retrying forever
    return new NextResponse('Handler error', { status: 200 });
  }
}
