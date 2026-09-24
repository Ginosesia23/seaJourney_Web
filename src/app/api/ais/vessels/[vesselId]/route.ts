import { NextRequest, NextResponse } from 'next/server';

import { getVesselAIS } from '@/lib/ais/ais-service';
import { getAisRefreshIntervalMinutes } from '@/lib/ais/constants';
import type { AisTriggerSource } from '@/lib/ais/fetch-audit-shared';
import {
  formatUnderwayDuration,
  getDailyAisSummaryDto,
} from '@/lib/ais/daily-summary';
import { logDateForLiveAisSync } from '@/lib/ais/map-ais-to-state';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { authenticateVesselAisReader } from '@/lib/vessel-ais-access';

type RouteParams = { params: Promise<{ vesselId: string }> };

/**
 * GET /api/ais/vessels/[vesselId]
 *
 * Returns:
 *   • current — central vessel_ais_status (live fix)
 *   • today — vessel_daily_ais_summary (duration-based sea-service qualification)
 *
 * Query: force=1 | date=yyyy-MM-dd
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

    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';
    const dateParam = url.searchParams.get('date');
    const todayKey = logDateForLiveAisSync(dateParam);

    // Normal reads are cache-only — adaptive cron owns provider fetches.
    // Only force=1 (intentional refresh) bypasses next_ais_check_at.
    let triggerSource: AisTriggerSource | 'api:get' = 'api:get';
    if (force) {
      const { data: actor } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', authResult.userId)
        .maybeSingle();
      triggerSource =
        String(actor?.role ?? '').toLowerCase() === 'admin' ? 'manual_admin' : 'manual_user';
    }
    const snapshot = await getVesselAIS(vesselId, {
      force,
      refreshIfStale: false,
      triggerSource,
      triggerDetail: force ? 'api:force' : undefined,
    });

    const today = await getDailyAisSummaryDto(vesselId, todayKey);

    const fetchedMs = Date.parse(snapshot.fetchedAt);
    const ageMinutes = Number.isFinite(fetchedMs)
      ? Math.round((Date.now() - fetchedMs) / 60_000)
      : null;

    return NextResponse.json({
      vesselId: snapshot.vesselId,
      // Flat fields kept for existing clients / cards
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
      nextAisCheckAt: snapshot.nextAisCheckAt ?? null,
      aisTrackingMode: snapshot.aisTrackingMode ?? null,
      trackingEnabled: Boolean(authResult.vessel.ais_tracking_enabled),
      /** Central provider polling is active (vessel plan and/or Premium crew). */
      trackingActive: Boolean(
        authResult.vessel.ais_provider_poll_enabled ??
          authResult.vessel.ais_tracking_enabled,
      ),
      current: {
        state: snapshot.state,
        latitude: snapshot.latitude,
        longitude: snapshot.longitude,
        speed: snapshot.speedKn,
        course: snapshot.course,
        heading: snapshot.heading,
        rawNavigationStatus: snapshot.rawNavigationStatus,
        fetchedAt: snapshot.fetchedAt,
        providerTimestamp: snapshot.providerTimestamp,
        stale: snapshot.stale,
        source: snapshot.source,
        nextAisCheckAt: snapshot.nextAisCheckAt ?? null,
        aisTrackingMode: snapshot.aisTrackingMode ?? null,
      },
      today: today
        ? {
            date: today.date,
            currentState: today.currentState,
            qualifyingDailyState: today.qualifyingDailyState,
            underwaySeconds: today.underwaySeconds,
            anchorSeconds: today.anchorSeconds,
            mooredSeconds: today.mooredSeconds,
            portSeconds: today.portSeconds,
            unknownSeconds: today.unknownSeconds,
            distanceNm: today.distanceNm,
            underwayQualified: today.underwayQualified,
            isFinal: today.isFinal,
            observationCount: today.observationCount,
            underwayLabel: formatUnderwayDuration(today.underwaySeconds),
          }
        : null,
    });
  } catch (err: unknown) {
    console.error('[AIS VESSEL GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
