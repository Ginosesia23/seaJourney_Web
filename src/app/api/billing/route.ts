// app/api/billing/route.ts
import { NextResponse } from 'next/server';
import {
  getStripeProducts,
  getUserStripeSubscription,
} from '@/app/actions';

export async function GET(req: Request) {
  console.log(
    '[API /api/billing] Has STRIPE_SECRET_KEY?',
    !!process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.slice(0, 8) + '...' : 'undefined'
  );

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json(
      { error: 'Missing email parameter' },
      { status: 400 },
    );
  }

  try {
    const subscriptionData = await getUserStripeSubscription(email);
    const stripePrices = await getStripeProducts();

    return NextResponse.json(
      { subscriptionData, stripePrices },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[API /api/billing] Error:', err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          'Failed to load billing data. Please try again later.',
      },
      { status: 500 },
    );
  }
}
