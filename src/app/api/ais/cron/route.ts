import { NextRequest, NextResponse } from 'next/server';

import { syncAllEnabledAisVessels } from '@/lib/ais/sync-vessel-state-from-ais';

/**
 * GET /api/ais/cron
 * Intended for Vercel cron / external scheduler. Requires CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await syncAllEnabledAisVessels();
    return NextResponse.json({
      synced: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => !r.ok && !r.skipped).length,
      results,
    });
  } catch (err: unknown) {
    console.error('[AIS CRON]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron sync failed' },
      { status: 500 },
    );
  }
}
