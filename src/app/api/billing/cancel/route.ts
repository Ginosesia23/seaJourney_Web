// app/api/billing/cancel/route.ts
import { NextResponse } from 'next/server';
import { cancelSubscription } from '@/app/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscriptionId, cancelAtPeriodEnd } = body || {};

    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'Missing subscriptionId' },
        { status: 400 },
      );
    }

    // default to false if not provided
    const effectiveCancelAtPeriodEnd =
      typeof cancelAtPeriodEnd === 'boolean' ? cancelAtPeriodEnd : false;

    await cancelSubscription(subscriptionId, effectiveCancelAtPeriodEnd);

    return NextResponse.json(
      { success: true },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[API /api/billing/cancel] Error:', err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          'Failed to cancel subscription. Please try again later.',
      },
      { status: 500 },
    );
  }
}
