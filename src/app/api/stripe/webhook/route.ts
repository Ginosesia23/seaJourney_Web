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
  const userId = metadata.userId;
  const tier = (metadata.tier || 'standard').toLowerCase();
  const status = subscription.status; // trialing, active, past_due, canceled, etc.
  const customerId = subscription.customer as string;

  if (!userId) {
    console.warn(
      '[STRIPE WEBHOOK] Subscription has no userId in metadata, skipping update',
      { subscriptionId: subscription.id },
    );
    return;
  }

  let subscriptionStatus: string = 'inactive';

  if (status === 'active' || status === 'trialing') {
    subscriptionStatus = 'active';
  } else if (
    status === 'past_due' ||
    status === 'unpaid' ||
    status === 'incomplete'
  ) {
    subscriptionStatus = 'past_due';
  } else if (status === 'canceled' || status === 'incomplete_expired') {
    subscriptionStatus = 'canceled';
  }

  console.log('[STRIPE WEBHOOK] Updating user from subscription:', {
    userId,
    tier,
    status,
    subscriptionStatus,
    subscriptionId: subscription.id,
    customerId,
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
