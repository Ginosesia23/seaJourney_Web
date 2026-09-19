import { NextRequest, NextResponse } from 'next/server';
import { requireBearerUser } from '@/lib/trb/auth';
import { hashTrbSignoffToken } from '@/lib/trb/tokens';
import { createEvidenceDownloadUrl } from '@/lib/trb/service';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** Short-lived signed URL for authorised evidence download. */
export async function GET(req: NextRequest) {
  const evidenceId = req.nextUrl.searchParams.get('evidenceId');
  const token = req.nextUrl.searchParams.get('token');

  if (!evidenceId) {
    return NextResponse.json({ error: 'evidenceId required' }, { status: 400 });
  }

  try {
    if (token) {
      // Touch hash so we never log the raw token; resolve via service.
      void hashTrbSignoffToken(token);
      const result = await createEvidenceDownloadUrl(supabaseAdmin, {
        mode: 'token',
        rawToken: token,
        evidenceId,
      });
      return NextResponse.json(result);
    }

    const auth = await requireBearerUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const result = await createEvidenceDownloadUrl(supabaseAdmin, {
      mode: 'candidate',
      userId: auth.userId,
      evidenceId,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Forbidden';
    const status = msg === 'Forbidden' || msg === 'Evidence not found' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
