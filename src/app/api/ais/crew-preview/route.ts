import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { fetchVesselPosition, type DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  getAisNavStatus,
  isAisPositionStale,
  logDateForLiveAisSync,
  logDateFromAisPosition,
  mapAisToDailyStatus,
  normalizeAisNavStatus,
} from '@/lib/ais/map-ais-to-state';
import {
  aggregateCrewDailyState,
  type CrewAisSample,
} from '@/lib/ais/aggregate-crew-daily-state';
import {
  resolveLiveSampleState,
  type PreviousSample,
} from '@/lib/ais/resolve-live-sample-state';
import { findPlaceMemoryHint } from '@/lib/ais/place-memory';
import { reverseGeocodeStructured } from '@/lib/geocoding/reverse-geocode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasCrewAisLiveTrackingTier } from '@/supabase/database/subscription-helpers';
import type { DailyStatus } from '@/lib/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * GET /api/ais/crew-preview
 *
 * Live Datalastic fetch for a crew user's active vessel, plus all the
 * context that gets fed into `analyzeAisDailyState` (previous-day state +
 * end-of-day geocode). Read-only — does not record a sample or write
 * `daily_state_logs`. Used by the temporary crew AIS debug panel.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end',
      )
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!hasCrewAisLiveTrackingTier(profile)) {
      return NextResponse.json({ error: 'Premium/Professional crew required' }, { status: 402 });
    }

    // Resolve the crew user's currently-active vessel (source of truth =
    // vessel_assignments, not users.active_vessel_id).
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: assignments } = await supabaseAdmin
      .from('vessel_assignments')
      .select('vessel_id')
      .eq('user_id', user.id)
      .or(`end_date.is.null,end_date.gte.${todayIso}`)
      .order('start_date', { ascending: false })
      .limit(1);

    const vesselId = assignments?.[0]?.vessel_id as string | undefined;
    if (!vesselId) {
      return NextResponse.json(
        { error: 'No active vessel assignment.' },
        { status: 400 },
      );
    }

    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('id, name, mmsi, imo')
      .eq('id', vesselId)
      .maybeSingle();
    if (!vessel || (!vessel.mmsi && !vessel.imo)) {
      return NextResponse.json(
        { error: 'Active vessel has no MMSI or IMO on file.' },
        { status: 400 },
      );
    }

    // Live Datalastic fetch (does not record).
    const position = await fetchVesselPosition({
      mmsi: vessel.mmsi as string | null,
      imo: vessel.imo as string | null,
    });
    const mappedState = mapAisToDailyStatus(position);
    const logDate = logDateForLiveAisSync(req.nextUrl.searchParams.get('logDate'));
    const positionLogDate = logDateFromAisPosition(position);
    const isStale = isAisPositionStale(position);

    // Yesterday's context that the analyzer would use.
    const yesterday = new Date(`${logDate}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayIso = yesterday.toISOString().slice(0, 10);

    const { data: prevLog } = await supabaseAdmin
      .from('daily_state_logs')
      .select('state, notes')
      .eq('user_id', user.id)
      .eq('vessel_id', vesselId)
      .eq('date', yesterdayIso)
      .maybeSingle();

    const { data: prevLastSample } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select('lat, lon, sampled_at, state, nav_status')
      .eq('user_id', user.id)
      .eq('sample_date', yesterdayIso)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousDay = prevLog
      ? {
          date: yesterdayIso,
          state: prevLog.state as DailyStatus,
          notes: (prevLog.notes as string) ?? null,
          lastLatitude: (prevLastSample?.lat as number) ?? null,
          lastLongitude: (prevLastSample?.lon as number) ?? null,
        }
      : null;

    // Today's stored samples so the analyst can see history in context.
    const { data: todaySamples } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select('id, sampled_at, state, nav_status, speed_kn, lat, lon, raw_position')
      .eq('user_id', user.id)
      .eq('sample_date', logDate)
      .order('sampled_at', { ascending: true });

    // Reverse-geocode the current position (best-effort).
    let locationContext = null as {
      endOfDayPlaceName: string | null;
      endOfDayInPopulatedArea: boolean;
    } | null;
    if (typeof position.lat === 'number' && typeof position.lon === 'number') {
      try {
        const geo = await reverseGeocodeStructured(position.lat, position.lon);
        if (geo) {
          locationContext = {
            endOfDayPlaceName: geo.label ?? null,
            endOfDayInPopulatedArea: geo.inPopulatedArea === true,
          };
        }
      } catch (err) {
        console.warn('[crew-ais-preview] geocode failed', err);
      }
    }

    const rawNavStatus = getAisNavStatus(position);
    const normalisedNavStatus = normalizeAisNavStatus(rawNavStatus) || null;

    // Load the most recent sample overall (may be from an earlier day) so
    // the resolver has a previous-position anchor for its stability check.
    // Mirror what `syncCrewStateFromAis` reads.
    const { data: latestSampleAny } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select('state, sampled_at, lat, lon')
      .eq('user_id', user.id)
      .eq('vessel_id', vesselId)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousSampleForResolver: PreviousSample | null = latestSampleAny
      ? {
          state: latestSampleAny.state as DailyStatus,
          lat: (latestSampleAny.lat as number) ?? null,
          lon: (latestSampleAny.lon as number) ?? null,
          sampledAt: latestSampleAny.sampled_at as string,
        }
      : null;

    // Same stabilized state the live sync would record for this fix, so the
    // debug panel can show exactly why a state was chosen (and whether a
    // notification would fire). Pass yesterday's state + last-known coords
    // as the yesterday-anchor so the "locked to yesterday" tier is exercised
    // in preview too — mirrors `syncCrewStateFromAis`. Also load place
    // memory so returning to a known marina shows up in the reason string.
    const placeMemory = await findPlaceMemoryHint({
      vesselId,
      lat: typeof position.lat === 'number' ? position.lat : null,
      lon: typeof position.lon === 'number' ? position.lon : null,
    });

    const resolution = resolveLiveSampleState({
      position,
      previousSample: previousSampleForResolver,
      yesterdayAnchor: previousDay
        ? {
            state: previousDay.state,
            lat: previousDay.lastLatitude,
            lon: previousDay.lastLongitude,
          }
        : null,
      placeMemory,
      locationContext,
    });

    // Run the aggregator on the stored samples + a synthetic sample for the
    // just-fetched position, so the panel shows the exact verdict + reason
    // that today would resolve to right now (does not persist anything).
    const aggregatorSamples: CrewAisSample[] = [
      ...(todaySamples ?? []).map((s: any) => ({
        state: s.state as DailyStatus,
        sampledAt: s.sampled_at as string,
        navStatus: (s.nav_status as string) ?? null,
        speedKn: (s.speed_kn as number) ?? null,
        lat: (s.lat as number) ?? null,
        lon: (s.lon as number) ?? null,
        rawPosition: (s.raw_position as DatalasticVesselPosition) ?? null,
      })),
      {
        state: mappedState as DailyStatus,
        sampledAt: new Date().toISOString(),
        navStatus: normalisedNavStatus,
        speedKn: typeof position.speed === 'number' ? position.speed : null,
        lat: typeof position.lat === 'number' ? position.lat : null,
        lon: typeof position.lon === 'number' ? position.lon : null,
        rawPosition: position,
      },
    ];
    const aggregate = aggregateCrewDailyState(aggregatorSamples, {
      previousDay: previousDay
        ? {
            state: previousDay.state,
            lastLatitude: previousDay.lastLatitude,
            lastLongitude: previousDay.lastLongitude,
          }
        : null,
      locationContext,
    });

    return NextResponse.json({
      vesselId,
      vesselName: (vessel.name as string) ?? null,
      query: {
        mmsi: vessel.mmsi ?? null,
        imo: vessel.imo ?? null,
      },
      fetchedAt: new Date().toISOString(),
      isStale,
      mappedState,
      resolvedState: {
        state: resolution.state,
        confidence: resolution.confidence,
        reason: resolution.reason,
        distanceFromPreviousNm: resolution.distanceFromPreviousNm,
        positionChangedMeaningfully: resolution.positionChangedMeaningfully,
      },
      placeMemory,
      previousSampleForResolver,
      logDate,
      positionLogDate,
      position,
      normalisedNavStatus,
      rawNavStatus: rawNavStatus || null,
      previousDay,
      locationContext,
      aggregate: {
        state: aggregate.state,
        reason: aggregate.reason,
        confidence: aggregate.confidence,
        counts: aggregate.counts,
        sampleCount: aggregate.sampleCount,
        seaDayRuleFired: aggregate.seaDayRuleFired,
        usedFallback: aggregate.usedFallback,
        metrics: aggregate.metrics ?? null,
      },
      todaySamples: (todaySamples ?? []).map((s: any) => ({
        id: s.id,
        sampledAt: s.sampled_at,
        state: s.state,
        navStatus: s.nav_status,
        speedKn: s.speed_kn,
        lat: s.lat,
        lon: s.lon,
      })),
    });
  } catch (err: unknown) {
    console.error('[CREW AIS PREVIEW]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AIS preview failed' },
      { status: 500 },
    );
  }
}
