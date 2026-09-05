import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/applications/auth';
import { assertCareerProgressAccess } from '@/lib/applications/career-access.server';
import { loadPublishedMilestonesForUser } from '@/lib/applications/load-milestone-progress';

/**
 * GET /api/career/progress — career ladder overview for signed-in crew
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const access = await assertCareerProgressAccess(auth.userId);
    if ('error' in access) return access.error;

    const result = await loadPublishedMilestonesForUser(auth.userId);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[career/progress GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
