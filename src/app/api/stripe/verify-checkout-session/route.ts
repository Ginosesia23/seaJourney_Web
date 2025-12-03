// app/api/stripe/verify-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

// You can add this if you want to force Node, but it should be fine either way
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    console.log('[SERVER] Received verification request');
    
    let body;
    try {
      body = await req.json();
    } catch (jsonError: any) {
      console.error('[SERVER] Failed to parse request body:', jsonError);
      return NextResponse.json(
        { success: false, errorMessage: 'Invalid request body' },
        { status: 400 },
      );
    }

    const { sessionId } = body;

    if (!sessionId) {
      console.error('[SERVER] Missing sessionId in request');
      return NextResponse.json(
        { success: false, errorMessage: 'Missing sessionId' },
        { status: 400 },
      );
    }

    console.log('[SERVER] Retrieving Stripe session:', sessionId);

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    } catch (stripeError: any) {
      console.error('[SERVER] Stripe API error:', {
        message: stripeError?.message,
        type: stripeError?.type,
        code: stripeError?.code,
      });
      return NextResponse.json(
        {
          success: false,
          errorMessage: `Stripe error: ${stripeError?.message || 'Failed to retrieve session'}`,
        },
        { status: 500 },
      );
    }

    console.log('[SERVER] Stripe session retrieved:', {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      metadata: session.metadata,
    });

    const isPaid =
      session.status === 'complete' && session.payment_status === 'paid';

    if (!isPaid) {
      console.warn('[SERVER] Session not paid:', {
        status: session.status,
        payment_status: session.payment_status,
      });
      return NextResponse.json(
        {
          success: false,
          errorMessage: `Session not complete. status=${session.status}, payment_status=${session.payment_status}`,
        },
        { status: 200 },
      );
    }

    // Get tier from metadata (set during checkout session creation)
    const tier = (session.metadata?.tier as string | undefined) || 'premium';
    
    // Also get product info for additional context
    const productId = session.metadata?.productId as string | undefined;
    const productName = session.metadata?.productName as string | undefined;
    const userId = session.metadata?.userId as string | undefined;

    console.log('[SERVER] Verified payment:', {
      userId,
      tier,
      productId,
      productName,
    });

    return NextResponse.json(
      {
        success: true,
        tier,
        productId,
        productName,
        userId,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error('[SERVER] Unexpected error verifying checkout session:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return NextResponse.json(
      {
        success: false,
        errorMessage: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}
