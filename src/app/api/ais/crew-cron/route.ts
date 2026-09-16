import { NextRequest, NextResponse } from 'next/server';

/**
 * Legacy crew-only cron path — forwards to the unified AIS cron.
 * Kept so existing Vercel cron URLs do not 404 during migration.
 */
export async function GET(req: NextRequest) {
  const { GET: unifiedCron } = await import('@/app/api/ais/cron/route');
  return unifiedCron(req);
}
