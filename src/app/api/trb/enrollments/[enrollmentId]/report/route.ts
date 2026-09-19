import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { buildAuditReport } from '@/lib/trb/service';
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
  const meta = clientMeta(req);
  try {
    const report = await buildAuditReport(
      supabaseAdmin,
      auth.userId,
      enrollmentId,
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Report failed';
    const status = msg === 'Enrollment not found' ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
