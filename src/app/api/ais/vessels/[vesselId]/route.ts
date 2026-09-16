import { NextRequest, NextResponse } from 'next/server';

import { getVesselAIS } from '@/lib/ais/ais-service';
import { getAisRefreshIntervalMinutes } from '@/lib/ais/constants';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { authenticateVesselAisReader } from '@/lib/vessel-ais-access';

type RouteParams = { params: Promise<{ vesselId: string }> };

/**
 * GET /api/ais/vessels/[vesselId]
 *
 * Returns centralised vessel AIS status. Refreshes from the provider only when
 * cached data is older than the adaptive interval:
 *   • underway  → 5 minutes
 *   • otherwise → 45 minutes
 *
 * Query params:
 *   force=1  — bypass cache and refresh from provider (still deduped via DB lock)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { vesselId } = await params;
    if (!vesselId) {
      return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
    }

    const authResult = await authenticateVesselAisReader(
      req,
      supabaseAdmin,
      vesselId,
    );
    if ('error' in authResult) return authResult.error;

    const force = new URL(req.url).searchParams.get('force') === '1';

    const snapshot = await getVesselAIS(vesselId, {
      force,
      refreshIfStale: true,
      triggerSource: force ? 'api:force' : 'api:get',
    });

    const fetchedMs = Date.parse(snapshot.fetchedAt);
    const ageMinutes = Number.isFinite(fetchedMs)
      ? Math.round((Date.now() - fetchedMs) / 60_000)
      : null;

    return NextResponse.json({
      vesselId: snapshot.vesselId,
      state: snapshot.state,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      speed: snapshot.speedKn,
      course: snapshot.course,
      heading: snapshot.heading,
      rawNavigationStatus: snapshot.rawNavigationStatus,
      providerTimestamp: snapshot.providerTimestamp,
      fetchedAt: snapshot.fetchedAt,
      stale: snapshot.stale,
      source: snapshot.source,
      refreshError: snapshot.refreshError ?? null,
      ageMinutes,
      refreshIntervalMinutes: getAisRefreshIntervalMinutes(snapshot.state),
      trackingEnabled: Boolean(authResult.vessel.ais_tracking_enabled),
    });
  } catch (err: unknown) {
    console.error('[AIS VESSEL GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
