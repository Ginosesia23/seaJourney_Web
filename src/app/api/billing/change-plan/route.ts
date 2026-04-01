// src/app/api/billing/change-plan/route.ts
import { NextResponse } from 'next/server';
import { executeSubscriptionPlanChange } from '@/lib/subscription-plan-change';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscriptionId, priceId, userId } = body || {};

    if (!subscriptionId || !priceId) {
      return NextResponse.json(
        { error: 'Missing subscriptionId or priceId' },
        { status: 400 },
      );
    }

    const result = await executeSubscriptionPlanChange({
      subscriptionId,
      priceId,
      userId,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to change subscription plan.';
    console.error('[API /api/billing/change-plan] Error:', err);
    return NextResponse.json(
      { error: message || 'Failed to change subscription plan. Please try again later.' },
      { status: 500 },
    );
  }
}
