import { NextRequest, NextResponse } from 'next/server';

import { syncVesselStateFromAis } from '@/lib/ais/sync-vessel-state-from-ais';
import { normalizeAisNavStatus } from '@/lib/ais/map-ais-to-state';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  authenticateAisTrackingStatusReader,
  assertVesselManagerForVessel,
  authenticateVesselManager,
} from '@/lib/vessel-ais-access';

/**
 * GET /api/vessels/ais-tracking?vesselId=
 * PATCH /api/vessels/ais-tracking  { vesselId, enabled: boolean }
 */
export async function GET(req: NextRequest) {
  try {
    const vesselId = req.nextUrl.searchParams.get('vesselId');
    if (!vesselId) {
      return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
    }

    const vesselResult = await authenticateAisTrackingStatusReader(
      req,
      supabaseAdmin,
      vesselId,
    );
    if ('error' in vesselResult) return vesselResult.error;

    const v = vesselResult.vessel;
    return NextResponse.json({
      vesselId,
      enabled: !!v.ais_tracking_enabled,
      mmsi: v.mmsi ?? null,
      imo: v.imo ?? null,
      lastSyncAt: v.ais_last_sync_at ?? null,
      lastNavStatus: normalizeAisNavStatus(v.ais_last_nav_status) || null,
      lastSpeed: v.ais_last_speed ?? null,
      lastPositionAt: v.ais_last_position_at ?? null,
      lastError: v.ais_last_sync_error ?? null,
    });
  } catch (err: unknown) {
    console.error('[AIS TRACKING GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authResult = await authenticateVesselManager(req, supabaseAdmin);
    if ('error' in authResult) return authResult.error;

    const body = await req.json();
    const vesselId = body.vesselId as string | undefined;
    const enabled = body.enabled as boolean | undefined;
    const logDate = body.logDate as string | undefined;

    if (!vesselId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'vesselId and enabled (boolean) are required' },
        { status: 400 },
      );
    }

    const vesselResult = await assertVesselManagerForVessel(
      authResult.auth,
      vesselId,
      supabaseAdmin,
    );
    if ('error' in vesselResult) return vesselResult.error;

    const vessel = vesselResult.vessel;

    if (enabled && !vessel.mmsi && !vessel.imo) {
      return NextResponse.json(
        {
          error:
            'Add an MMSI number to your vessel profile before turning on AIS tracking.',
        },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('vessels')
      .update({ ais_tracking_enabled: enabled })
      .eq('id', vesselId)
      .select(
        'id, mmsi, imo, vessel_manager_id, ais_tracking_enabled, ais_last_sync_at, ais_last_nav_status, ais_last_speed, ais_last_position_at, ais_last_sync_error',
      )
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to update AIS tracking' },
        { status: 500 },
      );
    }

    let syncResult = null;
    if (enabled) {
      syncResult = await syncVesselStateFromAis(updated, {
        force: true,
        managerUserId: authResult.auth.userId,
        logDate,
      });
    }

    return NextResponse.json({
      vesselId,
      enabled: !!updated.ais_tracking_enabled,
      mmsi: updated.mmsi ?? null,
      lastSyncAt: updated.ais_last_sync_at ?? null,
      lastNavStatus: normalizeAisNavStatus(updated.ais_last_nav_status) || null,
      lastSpeed: updated.ais_last_speed ?? null,
      lastPositionAt: updated.ais_last_position_at ?? null,
      lastError: updated.ais_last_sync_error ?? null,
      sync: syncResult,
    });
  } catch (err: unknown) {
    console.error('[AIS TRACKING PATCH]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
