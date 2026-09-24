import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBearerUser } from '@/lib/trb/auth';
import {
  grantTrbSignoffAuthority,
  listVesselTrbAuthorities,
  listVesselTrbAuthorityCandidates,
  revokeTrbSignoffAuthority,
} from '@/lib/trb/authority';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const grantSchema = z.object({
  vesselId: z.string().uuid(),
  userId: z.string().uuid(),
  validUntil: z.string().datetime().optional().nullable(),
  programId: z.string().uuid().optional().nullable(),
  programVersionId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const revokeSchema = z.object({
  authorityId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const vesselId = req.nextUrl.searchParams.get('vesselId');
  if (!vesselId) {
    return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
  }
  const includeRevoked = req.nextUrl.searchParams.get('includeRevoked') === '1';
  const candidates = req.nextUrl.searchParams.get('candidates') === '1';
  try {
    if (candidates) {
      const list = await listVesselTrbAuthorityCandidates(
        supabaseAdmin,
        auth.userId,
        vesselId,
      );
      return NextResponse.json({
        candidates: list,
        serverTime: new Date().toISOString(),
      });
    }
    const authorities = await listVesselTrbAuthorities(
      supabaseAdmin,
      auth.userId,
      vesselId,
      { includeRevoked },
    );
    return NextResponse.json({
      authorities,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : undefined;
    const status = code === 'forbidden' || msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(), code: 'validation_error' },
      { status: 400 },
    );
  }
  try {
    const result = await grantTrbSignoffAuthority(supabaseAdmin, auth.userId, {
      vesselId: parsed.data.vesselId,
      userId: parsed.data.userId,
      validUntil: parsed.data.validUntil,
      programId: parsed.data.programId,
      programVersionId: parsed.data.programVersionId,
      notes: parsed.data.notes,
    });
    return NextResponse.json({
      ...result,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Grant failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : undefined;
    const status = code === 'forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(), code: 'validation_error' },
      { status: 400 },
    );
  }
  try {
    const result = await revokeTrbSignoffAuthority(supabaseAdmin, auth.userId, {
      authorityId: parsed.data.authorityId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ...result, serverTime: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Revoke failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : undefined;
    const status = code === 'forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
