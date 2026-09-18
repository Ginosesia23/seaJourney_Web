import { NextRequest, NextResponse } from 'next/server';

import { syncAllEnabledCrewAis } from '@/lib/ais/sync-crew-state-from-ais';
import { syncAllEnabledAisVessels } from '@/lib/ais/sync-vessel-state-from-ais';

/**
 * GET /api/ais/cron
 *
 * Unified scheduled AIS job (Vercel cron every 5 minutes).
 * 1. Vessel-manager tracking → only vessels with next_ais_check_at due
 * 2. Crew live tracking → samples from central AIS cache (no extra provider calls)
 *
 * Adaptive intervals: underway/unknown/transition 5m, anchor 30m, moored/port 60m.
 * Requires CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const vesselResults = await syncAllEnabledAisVessels();
    const crewResults = await syncAllEnabledCrewAis();

    return NextResponse.json({
      vessel: {
        synced: vesselResults.filter((r) => r.ok).length,
        skipped: vesselResults.filter((r) => r.skipped).length,
        failed: vesselResults.filter((r) => !r.ok && !r.skipped).length,
        results: vesselResults,
      },
      crew: {
        synced: crewResults.filter((r) => r.ok).length,
        skipped: crewResults.filter((r) => r.skipped).length,
        failed: crewResults.filter((r) => !r.ok && !r.skipped).length,
        results: crewResults,
      },
    });
  } catch (err: unknown) {
    console.error('[AIS CRON]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron sync failed' },
      { status: 500 },
    );
  }
}
