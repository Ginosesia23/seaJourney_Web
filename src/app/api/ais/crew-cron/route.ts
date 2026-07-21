import { NextRequest, NextResponse } from 'next/server';

import { syncAllEnabledCrewAis } from '@/lib/ais/sync-crew-state-from-ais';

/**
 * GET /api/ais/crew-cron
 *
 * Vercel cron entry point for the crew live-AIS tracker. Requires
 * `Authorization: Bearer ${CRON_SECRET}`. Runs `syncAllEnabledCrewAis`
 * which:
 *   * lists all opted-in Premium/Professional crew,
 *   * batches Datalastic lookups per vessel,
 *   * records an hourly sample per crew user,
 *   * re-aggregates today's samples and updates `daily_state_logs`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await syncAllEnabledCrewAis();
    return NextResponse.json({
      synced: results.filter((r) => r.ok && !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => !r.ok && !r.skipped).length,
      results,
    });
  } catch (err: unknown) {
    console.error('[CREW AIS CRON]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Crew AIS cron failed' },
      { status: 500 },
    );
  }
}
