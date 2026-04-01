// src/app/api/billing/resume/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  resumeStripeSubscriptionForUser,
  ResumeSubscriptionError,
} from '@/lib/resume-stripe-subscription-for-user';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sub = await resumeStripeSubscriptionForUser(user.id);
    return NextResponse.json({ success: true, subscriptionId: sub.id });
  } catch (e: unknown) {
    if (e instanceof ResumeSubscriptionError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : 'Failed to resume subscription';
    console.error('[API /api/billing/resume]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
