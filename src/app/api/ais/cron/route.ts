import { NextRequest, NextResponse } from 'next/server';

import { syncAllEnabledCrewAis } from '@/lib/ais/sync-crew-state-from-ais';
import { syncAllEnabledAisVessels } from '@/lib/ais/sync-vessel-state-from-ais';

/**
 * GET /api/ais/cron
 *
 * Unified scheduled AIS job (Vercel cron every 30 minutes).
 * 1. Vessel-manager tracking → daily_state_logs for vessel accounts
 * 2. Crew live tracking → daily_state_logs per crew user
 *
 * Both paths use the central AIS service (one provider fetch per vessel).
 * Cron ticks every 5 minutes; adaptive freshness skips stationary vessels
 * that were fetched within the last 45 minutes.
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
