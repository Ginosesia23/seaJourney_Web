import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/applications/auth';
import { isUuid, monitorError, monitorJson } from '@/lib/ais/monitor/http';
import { isAisMonitorRange } from '@/lib/ais/monitor/metrics';
import { getAisMonitorVesselDetail } from '@/lib/ais/monitor/queries';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ vesselId: string }> };

/** GET /api/admin/ais-monitor/vessels/[vesselId]?range=24h|7d|30d — DB only. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { vesselId } = await params;
  if (!isUuid(vesselId)) return monitorJson({ error: 'Invalid vesselId' }, 400);

  const rangeParam = req.nextUrl.searchParams.get('range') ?? '7d';
  if (!isAisMonitorRange(rangeParam)) {
    return monitorJson({ error: 'range must be 24h, 7d or 30d' }, 400);
  }

  try {
    const detail = await getAisMonitorVesselDetail(vesselId, rangeParam);
    if (!detail) return monitorJson({ error: 'Vessel not found' }, 404);
    return monitorJson(detail);
  } catch (err) {
    return monitorError('vessel detail', err);
  }
}
