import { NextRequest, NextResponse } from 'next/server';
import { clientMeta } from '@/lib/trb/auth';
import { captainDecisionSchema } from '@/lib/trb/schemas';
import { checkTrbRateLimit } from '@/lib/trb/rate-limit';
import { resolveSignoffToken, submitCaptainDecision } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const meta = clientMeta(req);
  const rlKey = `trb-resolve:${meta.rawIp || 'unknown'}`;
  const allowed = await checkTrbRateLimit(supabaseAdmin, {
    key: rlKey,
    limit: 30,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const result = await resolveSignoffToken(supabaseAdmin, token, {
      recordView: true,
      ip: meta.rawIp,
      userAgent: meta.userAgent,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: result.reason,
          status: 'status' in result ? result.status : undefined,
        },
        { status: 410 },
      );
    }
    return NextResponse.json({ ...result, serverTime: new Date().toISOString() });
  } catch (e) {
    console.error('[TRB resolve token]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Unable to resolve request' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const meta = clientMeta(req);
  const rlKey = `trb-decide:${meta.rawIp || 'unknown'}`;
  const allowed = await checkTrbRateLimit(supabaseAdmin, {
    key: rlKey,
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = captainDecisionSchema.safeParse({ ...body, token });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await submitCaptainDecision(
      supabaseAdmin,
      {
        rawToken: token,
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
        actorEmail: undefined,
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
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : e instanceof Error
          ? e.message
          : 'error';
    const status =
      code === 'invalid_token'
        ? 404
        : code === 'token_expired' || code === 'token_not_pending'
          ? 410
          : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
