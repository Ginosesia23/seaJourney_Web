import { NextRequest, NextResponse } from 'next/server';

import {
  isAisPositionStale,
  logDateForLiveAisSync,
  logDateFromAisPosition,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';
import { fetchVesselPosition } from '@/lib/datalastic/client';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  assertVesselManagerForVessel,
  authenticateVesselManager,
} from '@/lib/vessel-ais-access';

/**
 * GET /api/ais/preview?vesselId=
 * Live Datalastic fetch for debugging — does not write state logs.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateVesselManager(req, supabaseAdmin);
    if ('error' in authResult) return authResult.error;

    const vesselId = req.nextUrl.searchParams.get('vesselId');
    if (!vesselId) {
      return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
    }

    const vesselResult = await assertVesselManagerForVessel(
      authResult.auth,
      vesselId,
      supabaseAdmin,
    );
    if ('error' in vesselResult) return vesselResult.error;

    const vessel = vesselResult.vessel;
    if (!vessel.mmsi && !vessel.imo) {
      return NextResponse.json(
        { error: 'Add an MMSI or IMO on the vessel profile first.' },
        { status: 400 },
      );
    }

    const position = await fetchVesselPosition({
      mmsi: vessel.mmsi,
      imo: vessel.imo,
    });

    const mappedState = mapAisToDailyStatus(position);
    const logDate = logDateForLiveAisSync(req.nextUrl.searchParams.get('logDate'));
    const positionLogDate = logDateFromAisPosition(position);
    const isStale = isAisPositionStale(position);

    return NextResponse.json({
      vesselId,
      query: {
        mmsi: vessel.mmsi ?? null,
        imo: vessel.imo ?? null,
      },
      fetchedAt: new Date().toISOString(),
      isStale,
      mappedState,
      logDate,
      positionLogDate,
      position,
    });
  } catch (err: unknown) {
    console.error('[AIS PREVIEW]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AIS preview failed' },
      { status: 500 },
    );
  }
}
