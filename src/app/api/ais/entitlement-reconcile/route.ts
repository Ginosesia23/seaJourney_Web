import { NextRequest, NextResponse } from 'next/server';

import { reconcileVesselAisEntitlements } from '@/lib/ais/vessel-ais-entitlement';

/**
 * GET /api/ais/entitlement-reconcile
 *
 * Safety-net job (every ~4 hours). Recalculates AIS entitlement from
 * authoritative sources and repairs drifted ais_provider_poll_enabled.
 * Never calls Datalastic.
 *
 * Requires CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await reconcileVesselAisEntitlements({ limit: 200 });
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: unknown) {
    console.error('[AIS ENTITLEMENT RECONCILE]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reconcile failed' },
      { status: 500 },
    );
  }
}
