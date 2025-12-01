// app/api/stripe/verify-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

// You can add this if you want to force Node, but it should be fine either way
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, errorMessage: 'Missing sessionId' },
        { status: 400 },
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    console.log('[SERVER] Stripe session:', {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
    });

    const isPaid =
      session.status === 'complete' && session.payment_status === 'paid';

    if (!isPaid) {
      return NextResponse.json(
        {
          success: false,
          errorMessage: `Session not complete. status=${session.status}, payment_status=${session.payment_status}`,
        },
        { status: 200 },
      );
    }

    // We set this when creating the checkout session (e.g. 'premium' | 'signoff')
    const tier = (session.metadata?.tier as string | undefined) || 'premium';

    return NextResponse.json(
      {
        success: true,
        tier,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error('[SERVER] Error verifying checkout session:', error);
    return NextResponse.json(
      {
        success: false,
        errorMessage: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}
