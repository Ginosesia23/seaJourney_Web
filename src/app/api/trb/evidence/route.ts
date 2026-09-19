import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { deleteEvidenceSchema } from '@/lib/trb/schemas';
import { removeEvidence, uploadEvidence } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const meta = clientMeta(req);
  try {
    const form = await req.formData();
    const taskProgressId = String(form.get('taskProgressId') || '');
    const description = form.get('description')
      ? String(form.get('description')).slice(0, 500)
      : null;
    const file = form.get('file');
    if (!taskProgressId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'taskProgressId and file are required' },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const row = await uploadEvidence(
      supabaseAdmin,
      auth.userId,
      taskProgressId,
      {
        buffer,
        filename: file.name || 'evidence.bin',
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      },
      description,
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json({ evidence: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
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
  const parsed = deleteEvidenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = clientMeta(req);
  try {
    await removeEvidence(supabaseAdmin, auth.userId, parsed.data.evidenceId, {
      actorUserId: auth.userId,
      actorEmail: auth.email,
      ip: meta.rawIp,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
