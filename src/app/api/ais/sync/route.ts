import { NextRequest, NextResponse } from 'next/server';

import { syncVesselStateFromAis } from '@/lib/ais/sync-vessel-state-from-ais';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  assertVesselManagerForVessel,
  authenticateVesselManager,
} from '@/lib/vessel-ais-access';

/**
 * POST /api/ais/sync
 * Body: { vesselId: string }
 * Manually poll Datalastic and apply today's state (requires AIS tracking on).
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateVesselManager(req, supabaseAdmin);
    if ('error' in authResult) return authResult.error;

    const body = await req.json();
    const vesselId = body.vesselId as string | undefined;
    const logDate = body.logDate as string | undefined;
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
    if (!vessel.ais_tracking_enabled) {
      return NextResponse.json(
        { error: 'Turn on AIS tracking before syncing' },
        { status: 400 },
      );
    }

    const result = await syncVesselStateFromAis(vessel, {
      force: true,
      managerUserId: authResult.auth.userId,
      logDate,
    });

    return NextResponse.json({ result });
  } catch (err: unknown) {
    console.error('[AIS SYNC POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
