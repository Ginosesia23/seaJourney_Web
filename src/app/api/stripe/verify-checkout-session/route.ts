import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/supabase/server'; // or supabaseAdmin

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
        { ok: false, error: 'Payment not completed' },
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

    // 🔥 NEW: extract subscription + customer IDs
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as any)?.id || null;

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer as any)?.id || null;

    // 🔥 NEW: update Supabase user
    if (userId) {
      const supabase = createSupabaseServerClient(); // or supabaseAdmin

      const { error } = await supabase
        .from('users')
        .update({
          subscription_tier: tier,
          subscription_status: 'active',
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
        })
        .eq('id', userId);

      if (error) {
        console.error(
          '[SERVER] Supabase update error in verify-checkout-session:',
          error,
        );
      } else {
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

    // whatever you already return to the client
    return NextResponse.json({
      ok: true,
      tier,
    });
  } catch (err: any) {
    console.error('[SERVER] Error verifying checkout session:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Verification failed' },
      { status: 500 },
    );
  }
}
