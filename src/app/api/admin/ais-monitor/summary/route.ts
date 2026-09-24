import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/applications/auth';
import { monitorError, monitorJson } from '@/lib/ais/monitor/http';
import { getAisMonitorSummary } from '@/lib/ais/monitor/queries';

export const dynamic = 'force-dynamic';

/** GET /api/admin/ais-monitor/summary — KPIs, scheduler health, alerts, savings. DB only. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  try {
    return monitorJson(await getAisMonitorSummary());
  } catch (err) {
    return monitorError('summary', err);
  }
}
