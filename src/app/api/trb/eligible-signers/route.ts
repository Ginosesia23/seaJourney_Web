import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { listEligibleSignersForTask } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const taskProgressId = req.nextUrl.searchParams.get('taskProgressId');
  if (!taskProgressId) {
    return NextResponse.json(
      { error: 'taskProgressId is required' },
      { status: 400 },
    );
  }
  try {
    const result = await listEligibleSignersForTask(
      supabaseAdmin,
      auth.userId,
      taskProgressId,
    );
    return NextResponse.json({
      ...result,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
