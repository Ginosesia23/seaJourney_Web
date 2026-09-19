import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { getEnrollmentDetail } from '@/lib/trb/service';
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
    const detail = await getEnrollmentDetail(
      supabaseAdmin,
      auth.userId,
      enrollmentId,
    );
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    console.error('[TRB enrollment detail]', e);
    return NextResponse.json({ error: 'Failed to load enrolment' }, { status: 500 });
  }
}
