// app/api/billing/resume/route.ts
import { NextResponse } from 'next/server';
import { resumeMySubscription } from '@/app/actions';

export async function POST() {
  try {
    const subscription = await resumeMySubscription();
    return NextResponse.json({ success: true, subscriptionId: subscription.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to resume subscription' },
      { status: err?.status || 500 },
    );
  }
}
