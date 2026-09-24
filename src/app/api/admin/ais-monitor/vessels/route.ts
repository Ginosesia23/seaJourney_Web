import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/applications/auth';
import { monitorError, monitorJson } from '@/lib/ais/monitor/http';
import { isAisMonitorRange } from '@/lib/ais/monitor/metrics';
import { getAisMonitorVessels } from '@/lib/ais/monitor/queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ais-monitor/vessels?range=24h|7d|30d
 * Top consumers, vessels needing attention, possible duplicate fetches. DB only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const rangeParam = req.nextUrl.searchParams.get('range') ?? '24h';
  if (!isAisMonitorRange(rangeParam)) {
    return monitorJson({ error: 'range must be 24h, 7d or 30d' }, 400);
  }

  try {
    return monitorJson(await getAisMonitorVessels(rangeParam));
  } catch (err) {
    return monitorError('vessels', err);
  }
}
