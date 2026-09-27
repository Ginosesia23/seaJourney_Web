import { NextRequest, NextResponse } from 'next/server';

import { runDailyPassageSummaries } from '@/lib/notifications/daily-passage-summary';

/**
 * GET /api/cron/daily-passage-summary
 *
 * Daily (Vercel cron, 20:00 UTC) push summarising each tracked crew
 * member's last 24 hours at sea. Reads stored AIS samples only.
 * `?dryRun=1` computes without sending. Requires CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
    const results = await runDailyPassageSummaries({ dryRun });
    return NextResponse.json({
      dryRun,
      sent: results.filter((r) => r.status === 'sent').length,
      skippedShort: results.filter((r) => r.status === 'skipped_short').length,
      skippedDuplicate: results.filter((r) => r.status === 'skipped_duplicate').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    });
  } catch (err: unknown) {
    console.error('[daily-passage-summary cron]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Daily passage summary failed' },
      { status: 500 },
    );
  }
}
