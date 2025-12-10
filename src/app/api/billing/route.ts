// app/api/billing/route.ts
import { NextResponse } from 'next/server';
import {
  getStripeProducts,
  getUserStripeSubscription,
} from '@/app/actions';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json(
      { error: 'Missing email parameter' },
      { status: 400 },
    );
  }

  try {
    // Fetch Stripe subscription based on user email
    const subscriptionData = await getUserStripeSubscription(email);

    // Fetch available Stripe prices / plans
    const stripePrices = await getStripeProducts();

    return NextResponse.json(
      {
        subscriptionData,
        stripePrices,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[API /api/billing] Error:', err);
    return NextResponse.json(
      {
        error:
          err?.message || 'Failed to load billing data. Please try again later.',
      },
      { status: 500 },
    );
  }
}
