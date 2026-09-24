import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { deleteEnrollment, getEnrollmentDetail } from '@/lib/trb/service';
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

/**
 * Permanently delete the caller's enrolment and all related progress,
 * evidence files, sign-off requests, sign-offs, batches, and audit rows.
 * Password confirmation is enforced client-side (re-auth) before calling this.
 */
export async function DELETE(
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
    const result = await deleteEnrollment(
      supabaseAdmin,
      auth.userId,
      enrollmentId,
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json({
      ok: true,
      ...result,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    console.error('[TRB enrollment delete]', err);
    if (err.code === 'not_found' || err.message === 'Enrolment not found') {
      return NextResponse.json(
        { error: 'Enrolment not found', code: 'not_found' },
        { status: 404 },
      );
    }
    if (err.code === 'forbidden' || err.message === 'Forbidden') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'forbidden' },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete enrolment', code: 'delete_failed' },
      { status: 500 },
    );
  }
}
