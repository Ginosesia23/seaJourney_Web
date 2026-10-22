import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import { findSeaServiceDateConflicts } from '@/lib/crew-record-documents.server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { assertVesselCanAttachCrewRecord } from '@/lib/vessel-crew-access.server';

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function ymd(v: string): string | null {
  const match = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * GET /api/crew-record-documents/conflicts
 * ?crewUserId=&vesselId=&startDate=&endDate=&excludeId=
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const crewUserId = req.nextUrl.searchParams.get('crewUserId')?.trim() || '';
    const vesselId = req.nextUrl.searchParams.get('vesselId')?.trim() || '';
    const startDate = ymd(req.nextUrl.searchParams.get('startDate') ?? '');
    const endDate = ymd(req.nextUrl.searchParams.get('endDate') ?? '');
    const excludeId = req.nextUrl.searchParams.get('excludeId')?.trim() || null;

    if (!looksLikeUuid(crewUserId)) {
      return NextResponse.json({ error: 'crewUserId is required' }, { status: 400 });
    }
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 },
      );
    }
    if (endDate < startDate) {
      return NextResponse.json(
        { error: 'End date must be on or after the start date' },
        { status: 400 },
      );
    }

    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', auth.userId)
      .maybeSingle();
    const role = String(actor?.role || '').toLowerCase();

    if (role !== 'admin' && auth.userId !== crewUserId) {
      if (!looksLikeUuid(vesselId)) {
        return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
      }
      const access = await assertVesselCanAttachCrewRecord(
        auth.userId,
        crewUserId,
        vesselId,
      );
      if ('error' in access) return access.error;
    }

    const conflicts = await findSeaServiceDateConflicts({
      crewUserId,
      startDate,
      endDate,
      vesselId: looksLikeUuid(vesselId) ? vesselId : null,
      excludeDocumentId: excludeId && looksLikeUuid(excludeId) ? excludeId : null,
    });

    return NextResponse.json({
      conflicts,
      blocking: conflicts.filter((c) => c.countsTowardCareer),
    });
  } catch (e) {
    console.error('[crew-record-documents/conflicts GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
