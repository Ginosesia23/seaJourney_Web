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

    // For subscriptions, check both payment_status and session status
    // Session status can be 'complete' even if payment_status is not yet 'paid' (async processing)
    // Also check if subscription exists and is active
    const isPaymentComplete = 
      session.payment_status === 'paid' || 
      session.status === 'complete' ||
      (session.subscription && typeof session.subscription === 'object' && (session.subscription as any)?.status === 'active');

    if (!isPaymentComplete && session.status !== 'complete') {
      console.warn('[VERIFY] Payment not complete, aborting update:', {
        payment_status: session.payment_status,
        status: session.status,
        subscription_status: typeof session.subscription === 'object' ? (session.subscription as any)?.status : 'N/A',
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

    // Check if subscription was already updated by webhook
    // Retry a few times in case webhook is still processing
    let existingUser = null;
    let retries = 3;
    while (retries > 0) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('subscription_tier, subscription_status, stripe_subscription_id')
        .eq('id', userId)
        .single();
      
      existingUser = user;
      
      // If webhook already updated it and subscription is active, return success
      if (existingUser && existingUser.subscription_status === 'active') {
        // Check if subscription ID matches, or if it's null (webhook might not have set it yet)
        if (!existingUser.stripe_subscription_id || existingUser.stripe_subscription_id === subscriptionId) {
          console.log('[VERIFY] ✅ Subscription already active in database (updated by webhook)');
          return NextResponse.json({
            success: true,
            status: 'success',
            tier: existingUser.subscription_tier || tier,
            subscriptionId,
            customerId,
            productName: meta.productName,
            payment_status: session.payment_status,
            session_status: session.status,
            alreadyUpdated: true,
          });
        }
      }
      
      // If subscription is active but IDs don't match, still return success (webhook might have different ID)
      if (existingUser && existingUser.subscription_status === 'active') {
        console.log('[VERIFY] ✅ Subscription active (IDs may differ, but status is active)');
        return NextResponse.json({
          success: true,
          status: 'success',
          tier: existingUser.subscription_tier || tier,
          subscriptionId: existingUser.stripe_subscription_id || subscriptionId,
          customerId,
          productName: meta.productName,
          payment_status: session.payment_status,
          session_status: session.status,
          alreadyUpdated: true,
        });
      }
      
      // Wait a bit before retrying (webhook might still be processing)
      if (retries > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      retries--;
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
      // Don't fail if update fails - webhook might have already updated it
      // Retry checking if subscription is now active (webhook might be processing)
      let recheckUser = null;
      let retries = 3;
      while (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('subscription_tier, subscription_status, stripe_subscription_id')
          .eq('id', userId)
          .single();
        
        recheckUser = user;
        
        if (recheckUser && recheckUser.subscription_status === 'active') {
          console.log('[VERIFY] ✅ Subscription is active after recheck (webhook updated it)');
          return NextResponse.json({
            success: true,
            status: 'success',
            tier: recheckUser.subscription_tier || tier,
            subscriptionId: recheckUser.stripe_subscription_id || subscriptionId,
            customerId,
            productName: meta.productName,
            payment_status: session.payment_status,
            session_status: session.status,
            updatedByWebhook: true,
          });
        }
        retries--;
      }
      
      // If still not active after retries, but payment is complete, return success anyway
      // The webhook will eventually update it, and the user can refresh
      if (isPaymentComplete) {
        console.warn('[VERIFY] ⚠️ Payment complete but subscription not yet active in DB. Webhook may still be processing.');
        return NextResponse.json({
          success: true,
          status: 'pending',
          tier,
          subscriptionId,
          customerId,
          productName: meta.productName,
          payment_status: session.payment_status,
          session_status: session.status,
          warning: 'Payment verified but subscription update may be pending. Please refresh if needed.',
        });
      }
      
      // If payment is not complete, return error
      throw error;
    } else {
      console.log('[VERIFY] ✅ User row after update:', data);
    }

    // Also include productName from metadata if available
    const productName = meta.productName as string | undefined;

    return NextResponse.json({
      success: true,
      status: 'success',
      tier,
      subscriptionId,
      customerId,
      productName,
      payment_status: session.payment_status,
      session_status: session.status,
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
