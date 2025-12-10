// app/api/billing/change-plan/route.ts
import { NextResponse } from 'next/server';
import { changeSubscriptionPlan } from '@/app/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscriptionId, priceId } = body || {};

    if (!subscriptionId || !priceId) {
      return NextResponse.json(
        { error: 'Missing subscriptionId or priceId' },
        { status: 400 },
      );
    }

    await changeSubscriptionPlan(subscriptionId, priceId);

    return NextResponse.json(
      { success: true },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[API /api/billing/change-plan] Error:', err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          'Failed to change subscription plan. Please try again later.',
      },
      { status: 500 },
    );
  }
}
