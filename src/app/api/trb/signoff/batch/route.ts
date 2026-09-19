import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import {
  batchRequestSignoffSchema,
  cancelBatchSignoffSchema,
} from '@/lib/trb/schemas';
import {
  cancelBatchSignoffRequest,
  createBatchSignoffRequest,
  listEligibleSignersForBatch,
  listEligibleTasksForBatch,
} from '@/lib/trb/batch';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const enrollmentId = req.nextUrl.searchParams.get('enrollmentId');
  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollmentId is required' }, { status: 400 });
  }
  const taskProgressIds = req.nextUrl.searchParams.getAll('taskProgressId');
  try {
    if (taskProgressIds.length) {
      const result = await listEligibleSignersForBatch(
        supabaseAdmin,
        auth.userId,
        enrollmentId,
        taskProgressIds,
      );
      return NextResponse.json({ ...result, serverTime: new Date().toISOString() });
    }
    const result = await listEligibleTasksForBatch(
      supabaseAdmin,
      auth.userId,
      enrollmentId,
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : undefined;
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = batchRequestSignoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten(), code: 'validation_error' }, { status: 400 });
  }
  const meta = clientMeta(req);
  try {
    const result = await createBatchSignoffRequest(
      supabaseAdmin,
      auth.userId,
      {
        enrollmentId: parsed.data.enrollmentId,
        taskProgressIds: parsed.data.taskProgressIds,
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
    return NextResponse.json({ ...result, serverTime: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : undefined;
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = cancelBatchSignoffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = clientMeta(req);
  try {
    await cancelBatchSignoffRequest(
      supabaseAdmin,
      auth.userId,
      parsed.data.batchRequestId,
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json({ ok: true, serverTime: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cancel failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : undefined;
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
