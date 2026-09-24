import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { enrolSchema } from '@/lib/trb/schemas';
import {
  enrolUser,
  listActivePrograms,
  listUserEnrollments,
} from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function loadViewerProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return { isAdmin: data?.role === 'admin' };
}

export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const profile = await loadViewerProfile(auth.userId);
    const [programs, enrollments] = await Promise.all([
      listActivePrograms(supabaseAdmin, {
        userId: auth.userId,
        email: auth.email,
        isAdmin: profile.isAdmin,
      }),
      listUserEnrollments(supabaseAdmin, auth.userId),
    ]);
    return NextResponse.json({
      programs,
      enrollments,
      // Never expose allowlist; only whether MCA pilot is visible to this user
      mcaPilotVisible: programs.some((p) => p.isMcaPilot),
    });
  } catch (e) {
    console.error('[TRB list]', e);
    return NextResponse.json({ error: 'Failed to load programmes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = enrolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = clientMeta(req);
  const profile = await loadViewerProfile(auth.userId);
  try {
    const result = await enrolUser(
      supabaseAdmin,
      auth.userId,
      {
        programVersionId: parsed.data.programVersionId,
        programCode: parsed.data.programCode || 'SJ-PILOT-MCA-OOW-YACHTS',
        consent: parsed.data.consent,
        actorEmail: auth.email,
        isAdmin: profile.isAdmin,
      },
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Enrolment failed';
    console.error('[TRB enrol]', msg);
    const status =
      msg.includes('not authorised') || msg.includes('not enabled') ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
