import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
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
    const requests = await listSignoffsForSignerEmail(supabaseAdmin, auth.email, {
      status,
    });
    return NextResponse.json({
      requests,
      resourceType: 'training_task',
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[TRB signer queue]', e);
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 });
  }
}
