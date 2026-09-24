import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/applications/auth';
import { isUuid, monitorError, monitorJson } from '@/lib/ais/monitor/http';
import { clampLogWindow, isAisMonitorLogFilter } from '@/lib/ais/monitor/metrics';
import { getAisMonitorFetches } from '@/lib/ais/monitor/queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ais-monitor/fetches
 *   ?page=1&pageSize=25&filter=all|success|failed|scheduler|manual|retry
 *   &from=ISO&to=ISO (max 90 days, default last 7)
 *   &vesselId=uuid&vessel=name&mmsi=digits
 * Paginated provider request log. DB only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const p = req.nextUrl.searchParams;
  const filter = p.get('filter') ?? 'all';
  if (!isAisMonitorLogFilter(filter)) {
    return monitorJson({ error: 'Invalid filter' }, 400);
  }
  const vesselId = p.get('vesselId');
  if (vesselId && !isUuid(vesselId)) {
    return monitorJson({ error: 'Invalid vesselId' }, 400);
  }
  const { from, to } = clampLogWindow(p.get('from'), p.get('to'));

  try {
    return monitorJson(
      await getAisMonitorFetches({
        from,
        to,
        page: Number(p.get('page') ?? '1') || 1,
        pageSize: Number(p.get('pageSize') ?? '25') || 25,
        filter,
        vesselId: vesselId || null,
        vesselSearch: p.get('vessel'),
        mmsi: p.get('mmsi'),
      }),
    );
  } catch (err) {
    return monitorError('fetches', err);
  }
}
