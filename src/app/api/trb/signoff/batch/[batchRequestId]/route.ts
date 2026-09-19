import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { getBatchRequestDetail } from '@/lib/trb/batch';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchRequestId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { batchRequestId } = await params;
  try {
    const detail = await getBatchRequestDetail(supabaseAdmin, {
      userId: auth.userId,
      batchRequestId,
    });
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    console.error('[TRB batch detail]', e);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}
