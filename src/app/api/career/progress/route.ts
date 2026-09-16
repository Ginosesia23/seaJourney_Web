import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/applications/auth';
import { assertCareerProgressAccess } from '@/lib/applications/career-access.server';
import { loadPublishedMilestonesForUser } from '@/lib/applications/load-milestone-progress';
import { assertCanViewCrewSharedData } from '@/lib/vessel-crew-access.server';

/**
 * GET /api/career/progress — career ladder overview
 * - Own progress: requires career_progress feature access
 * - ?crewUserId=: vessel (approved access) or admin viewing shared crew progress
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const crewUserId = req.nextUrl.searchParams.get('crewUserId');
    const targetUserId = crewUserId || auth.userId;

    if (crewUserId && crewUserId !== auth.userId) {
      const shared = await assertCanViewCrewSharedData(auth.userId, crewUserId);
      if ('error' in shared) return shared.error;
    } else {
      const access = await assertCareerProgressAccess(auth.userId);
      if ('error' in access) return access.error;
    }

    const result = await loadPublishedMilestonesForUser(targetUserId);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[career/progress GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
