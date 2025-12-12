// app/api/stripe/verify-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    console.log('[VERIFY] Received verification request');
    console.log('[VERIFY] Retrieving Stripe session:', sessionId);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as any)?.id || null;

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer as any)?.id || null;

    console.log('[VERIFY] Stripe session retrieved:', {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      metadata: session.metadata,
      subscriptionId,
      customerId,
    });

    if (session.payment_status !== 'paid') {
      console.warn('[VERIFY] Payment status is not paid, aborting update:', {
        payment_status: session.payment_status,
        status: session.status,
      });

      return NextResponse.json(
        { success: false, error: 'Payment not completed' },
        { status: 400 },
      );
    }

    const meta = session.metadata || {};
    const userId = meta.userId as string | undefined;
    const tier = (meta.tier || 'standard').toLowerCase();

    console.log('[VERIFY] Verified payment metadata:', {
      userId,
      tier,
      productId: meta.productId,
      productName: meta.productName,
    });

    if (!userId) {
      console.warn(
        '[VERIFY] No userId in session.metadata, skipping DB update',
      );

      return NextResponse.json({
        success: true,
        status: 'success',
        tier,
        subscriptionId,
        customerId,
        warning: 'No userId in session metadata, user row not updated',
      });
    }

    // Use supabaseAdmin (service role) so we bypass RLS and always hit the row
    console.log('[VERIFY] Updating user in Supabase:', {
      userId,
      tier,
      subscriptionId,
      customerId,
    });

    const { data, error } = await supabaseAdmin
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
      );

    if (error) {
      console.error(
        '[VERIFY] Supabase update error in verify-checkout-session:',
        error,
      );
    } else {
      console.log('[VERIFY] ✅ User row after update:', data);
    }

    return NextResponse.json({
      success: true,
      status: 'success',
      tier,
      subscriptionId,
      customerId,
    });
  } catch (err: any) {
    console.error('[VERIFY] ❌ Error verifying checkout session:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Payment not completed',
      },
      { status: 400 },
    );
  }
}
