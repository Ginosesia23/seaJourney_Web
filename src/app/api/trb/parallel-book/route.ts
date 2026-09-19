import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { parallelBookSchema } from '@/lib/trb/schemas';
import { upsertParallelBookConfirmation } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = parallelBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = clientMeta(req);
  try {
    const result = await upsertParallelBookConfirmation(
      supabaseAdmin,
      {
        taskProgressId: parsed.data.taskProgressId,
        reporterRole: 'candidate',
        candidateId: auth.userId,
        reportedByUserId: auth.userId,
        reportedByEmail: auth.email,
        officialBookStatus: parsed.data.officialBookStatus,
        officialBookSignedAt: parsed.data.officialBookSignedAt,
        officialBookSignerName: parsed.data.officialBookSignerName,
        officialBookSignerRank: parsed.data.officialBookSignerRank,
        candidateDeclaration: parsed.data.candidateDeclaration,
        notes: parsed.data.notes,
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
    const msg = e instanceof Error ? e.message : 'Update failed';
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
