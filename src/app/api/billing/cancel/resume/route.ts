// app/api/billing/resume/route.ts
import { NextResponse } from 'next/server';
import { resumeSubscription } from '@/app/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscriptionId } = body || {};

    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'Missing subscriptionId' },
        { status: 400 },
      );
    }

    await resumeSubscription(subscriptionId);

    return NextResponse.json(
      { success: true },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[API /api/billing/resume] Error:', err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          'Failed to resume subscription. Please try again later.',
      },
      { status: 500 },
    );
  }
}
