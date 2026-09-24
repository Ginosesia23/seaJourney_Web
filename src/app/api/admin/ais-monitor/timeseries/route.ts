import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/applications/auth';
import { isUuid, monitorError, monitorJson } from '@/lib/ais/monitor/http';
import { isAisMonitorRange } from '@/lib/ais/monitor/metrics';
import { getAisMonitorTimeseries } from '@/lib/ais/monitor/queries';

export const dynamic = 'force-dynamic';

/** GET /api/admin/ais-monitor/timeseries?range=24h|7d|30d&vesselId= — DB only. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const params = req.nextUrl.searchParams;
  const rangeParam = params.get('range') ?? '24h';
  if (!isAisMonitorRange(rangeParam)) {
    return monitorJson({ error: 'range must be 24h, 7d or 30d' }, 400);
  }
  const vesselId = params.get('vesselId');
  if (vesselId && !isUuid(vesselId)) {
    return monitorJson({ error: 'Invalid vesselId' }, 400);
  }

  try {
    return monitorJson(await getAisMonitorTimeseries(rangeParam, vesselId || null));
  } catch (err) {
    return monitorError('timeseries', err);
  }
}
