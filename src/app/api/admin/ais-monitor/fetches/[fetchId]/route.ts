import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/applications/auth';
import { isUuid, monitorError, monitorJson } from '@/lib/ais/monitor/http';
import { getAisMonitorFetchDetail } from '@/lib/ais/monitor/queries';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ fetchId: string }> };

/** GET /api/admin/ais-monitor/fetches/[fetchId] — request detail + matching observation. DB only. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { fetchId } = await params;
  if (!isUuid(fetchId)) return monitorJson({ error: 'Invalid fetchId' }, 400);

  try {
    const detail = await getAisMonitorFetchDetail(fetchId);
    if (!detail) return monitorJson({ error: 'Request not found' }, 404);
    return monitorJson(detail);
  } catch (err) {
    return monitorError('fetch detail', err);
  }
}
