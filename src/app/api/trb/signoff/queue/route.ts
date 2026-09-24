import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { listBatchRequestsForSigner } from '@/lib/trb/batch';
import { listSignoffsForSigner } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const status = req.nextUrl.searchParams.get('status') || undefined;
  try {
    const [single, batch] = await Promise.all([
      listSignoffsForSigner(supabaseAdmin, {
        email: auth.email,
        userId: auth.userId,
        status,
      }),
      listBatchRequestsForSigner(supabaseAdmin, {
        email: auth.email,
        userId: auth.userId,
        status,
      }),
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
