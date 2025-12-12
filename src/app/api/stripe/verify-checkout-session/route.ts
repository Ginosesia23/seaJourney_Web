import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/supabase/server';
// If you decide to use a service-role client instead, you could import supabaseAdmin here.

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    console.log('[SERVER] Received verification request');
    console.log('[SERVER] Retrieving Stripe session:', sessionId);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    console.log('[SERVER] Stripe session retrieved:', {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      metadata: session.metadata,
      subscription: session.subscription
        ? typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as any).id
        : null,
      customer: session.customer
        ? typeof session.customer === 'string'
          ? session.customer
          : (session.customer as any).id
        : null,
    });

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { success: false, error: 'Payment not completed' },
        { status: 400 },
      );
    }

    const meta = session.metadata || {};
    const userId = meta.userId as string | undefined;
    const tier = (meta.tier || 'standard').toLowerCase();

    console.log('[SERVER] Verified payment:', {
      userId,
      tier,
      productId: meta.productId,
      productName: meta.productName,
    });

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as any)?.id || null;

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer as any)?.id || null;

    if (userId) {
      // You can switch this to a supabaseAdmin client (service role) if RLS bites you.
      const supabase = createSupabaseServerClient();

      const { data, error } = await supabase
        .from('users')
        .update({
          subscription_tier: tier,
          subscription_status: 'active',
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
        })
        .eq('id', userId)
        .select(
          'id, email, subscription_tier, subscription_status, stripe_subscription_id, stripe_customer_id',
        ); // returns updated rows

      if (error) {
        console.error(
          '[SERVER] Supabase update error in verify-checkout-session:',
          error,
        );
      } else {
        console.log('[SERVER] ✅ User row after update:', data);
        console.log(
          '[SERVER] ✅ User updated in verify-checkout-session:',
          { userId, tier, subscriptionId, customerId },
        );
      }
    } else {
      console.warn(
        '[SERVER] No userId in session.metadata, skipping DB update',
      );
    }

    // IMPORTANT: front-end should check `data.success`
    return NextResponse.json({
      success: true, // <- this is what your UI should look at
      status: 'success',
      tier,
      subscriptionId,
      customerId,
    });
  } catch (err: any) {
    console.error('[SERVER] Error verifying checkout session:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Payment not completed',
      },
      { status: 400 },
    );
  }
}
