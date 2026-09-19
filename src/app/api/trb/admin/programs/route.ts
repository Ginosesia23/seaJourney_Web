import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBearerUser } from '@/lib/trb/auth';
import {
  createDraftProgram,
  listProgramsForAdmin,
  requireTrbAdmin,
} from '@/lib/trb/admin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const createSchema = z.object({
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  programmeType: z.string().max(80).optional(),
  issuingBody: z.string().max(120).optional(),
  recognitionStatus: z.string().max(80).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const adminCheck = await requireTrbAdmin(supabaseAdmin, auth.userId);
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
    );
  }
  try {
    const programs = await listProgramsForAdmin(supabaseAdmin);
    return NextResponse.json({
      programs,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[TRB admin programs]', e);
    return NextResponse.json({ error: 'Failed to list programmes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const adminCheck = await requireTrbAdmin(supabaseAdmin, auth.userId);
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createDraftProgram(supabaseAdmin, parsed.data);
    return NextResponse.json({
      ...result,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
