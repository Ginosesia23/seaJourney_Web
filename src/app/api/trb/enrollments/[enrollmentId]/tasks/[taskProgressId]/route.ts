import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { getTaskDetail } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ enrollmentId: string; taskProgressId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { enrollmentId, taskProgressId } = await params;
  try {
    const detail = await getTaskDetail(
      supabaseAdmin,
      auth.userId,
      enrollmentId,
      taskProgressId,
    );
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    console.error('[TRB task detail]', e);
    return NextResponse.json({ error: 'Failed to load task' }, { status: 500 });
  }
}
