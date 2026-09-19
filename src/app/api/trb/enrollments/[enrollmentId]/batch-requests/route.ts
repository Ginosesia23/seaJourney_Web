import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { listBatchRequestsForCrew } from '@/lib/trb/batch';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { enrollmentId } = await params;
  try {
    const requests = await listBatchRequestsForCrew(
      supabaseAdmin,
      auth.userId,
      enrollmentId,
    );
    return NextResponse.json({
      requests,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    const status = msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
