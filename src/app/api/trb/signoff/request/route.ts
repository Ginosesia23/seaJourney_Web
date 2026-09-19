import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { cancelSignoffSchema, requestSignoffSchema } from '@/lib/trb/schemas';
import {
  cancelPendingSignoffRequest,
  createSignoffRequest,
} from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = requestSignoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = clientMeta(req);
  try {
    const result = await createSignoffRequest(
      supabaseAdmin,
      auth.userId,
      {
        taskProgressId: parsed.data.taskProgressId,
        signerName: parsed.data.signerName,
        signerEmail: parsed.data.signerEmail,
        optionalMessage: parsed.data.optionalMessage,
        allowExternalInvite: parsed.data.allowExternalInvite,
        idempotencyKey: parsed.data.idempotencyKey,
      },
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json({
      ...result,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = cancelSignoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = clientMeta(req);
  try {
    await cancelPendingSignoffRequest(
      supabaseAdmin,
      auth.userId,
      parsed.data.taskProgressId,
      parsed.data.requestId,
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cancel failed';
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
