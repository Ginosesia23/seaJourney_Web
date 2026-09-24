import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { authenticatedCaptainDecisionSchema } from '@/lib/trb/schemas';
import {
  getSignoffRequestDetailAsSigner,
  submitSignoffDecisionAsSigner,
} from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { requestId } = await params;
  const meta = clientMeta(req);
  try {
    const detail = await getSignoffRequestDetailAsSigner(
      supabaseAdmin,
      { userId: auth.userId, requestId },
      {
        recordView: true,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ...detail, serverTime: new Date().toISOString() });
  } catch (e) {
    console.error('[TRB signoff request detail]', e);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { requestId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = authenticatedCaptainDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(), code: 'validation_error' },
      { status: 400 },
    );
  }
  const meta = clientMeta(req);
  try {
    const result = await submitSignoffDecisionAsSigner(
      supabaseAdmin,
      auth.userId,
      {
        requestId,
        decision: parsed.data.decision,
        signerName: parsed.data.signerName,
        signerRank: parsed.data.signerRank,
        signerCocNumber: parsed.data.signerCocNumber,
        signerIssuingAuthority: parsed.data.signerIssuingAuthority,
        signerDeclaration: parsed.data.signerDeclaration,
        decisionNotes: parsed.data.decisionNotes,
        officialBookStatus: parsed.data.officialBookStatus,
        officialBookNotes: parsed.data.officialBookNotes,
      },
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json({
      ok: true,
      result,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Submit failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : msg;
    const status =
      code === 'forbidden' || msg === 'Forbidden'
        ? 403
        : code === 'not_found'
          ? 404
          : code === 'token_expired' || code === 'token_not_pending'
            ? 410
            : code === 'invalid_token'
              ? 404
              : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
