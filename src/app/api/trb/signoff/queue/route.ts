import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { listBatchRequestsForSignerEmail } from '@/lib/trb/batch';
import { listSignoffsForSignerEmail } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!auth.email) {
    return NextResponse.json({ requests: [], serverTime: new Date().toISOString() });
  }
  const status = req.nextUrl.searchParams.get('status') || undefined;
  try {
    const [single, batch] = await Promise.all([
      listSignoffsForSignerEmail(supabaseAdmin, auth.email, { status }),
      listBatchRequestsForSignerEmail(supabaseAdmin, auth.email, { status }),
    ]);
    const requests = [
      ...single.map((r) => ({ ...r, resourceType: 'training_task' as const })),
      ...batch,
    ].sort(
      (a, b) =>
        new Date(String((b as { createdAt?: string }).createdAt)).getTime() -
        new Date(String((a as { createdAt?: string }).createdAt)).getTime(),
    );
    return NextResponse.json({
      requests,
      resourceType: 'training_signoff_queue',
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[TRB signer queue]', e);
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 });
  }
}
