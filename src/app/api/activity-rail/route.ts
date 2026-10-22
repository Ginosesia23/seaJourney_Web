import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import { buildActivityRail } from '@/lib/activity-rail.server';

/**
 * GET /api/activity-rail
 * Attention items for the signed-in account: overdue, upcoming, missing, issues.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const payload = await buildActivityRail(auth.userId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[activity-rail]', error);
    return NextResponse.json(
      { error: 'Failed to load activity rail' },
      { status: 500 },
    );
  }
}
