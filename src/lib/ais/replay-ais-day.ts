/**
 * Admin day-replay for AIS wrong-state reports.
 *
 * Loads stored hourly samples for a vessel/crew day, rebuilds yesterday +
 * end-of-day location context, re-runs the same aggregator used in live sync,
 * and optionally re-resolves each sample with `resolveLiveSampleState` so an
 * admin can see why the day (and each hour) won.
 */

import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  aggregateCrewDailyState,
  type CrewAisSample,
  type CrewDailyStateAggregate,
} from '@/lib/ais/aggregate-crew-daily-state';
import {
  resolveLiveSampleState,
  type PreviousSample,
} from '@/lib/ais/resolve-live-sample-state';
import { findPlaceMemoryHint } from '@/lib/ais/place-memory';
import { reverseGeocodeStructured } from '@/lib/geocoding/reverse-geocode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { DailyStatus } from '@/lib/types';

export type AisDayReplayAccountType = 'vessel' | 'crew';

export type AisDayReplaySampleRow = {
  id: string;
  sampledAt: string;
  storedState: DailyStatus;
  navStatus: string | null;
  speedKn: number | null;
  lat: number | null;
  lon: number | null;
  /** Re-run of the live per-sample resolver (chronological). */
  resolved?: {
    state: DailyStatus;
    confidence: string;
    reason: string;
    distanceFromPreviousNm: number | null;
    positionChangedMeaningfully: boolean;
    placeMemory: {
      state: DailyStatus;
      distanceNm: number;
      source: string;
      visitCount: number;
      placeName?: string | null;
    } | null;
  };
};

export type AisDayReplayResult = {
  accountType: AisDayReplayAccountType;
  vesselId: string;
  subjectUserId: string;
  logDate: string;
  yesterdayIso: string;
  sampleSource: 'vessel_ais_state_samples' | 'crew_ais_state_samples';
  previousDay: {
    state: DailyStatus;
    lastLatitude: number | null;
    lastLongitude: number | null;
  } | null;
  locationContext: {
    endOfDayPlaceName: string | null;
    endOfDayInPopulatedArea: boolean;
  } | null;
  loggedState: DailyStatus | null;
  aggregate: {
    state: DailyStatus;
    reason: string;
    confidence: string;
    counts: Record<DailyStatus, number>;
    sampleCount: number;
    seaDayRuleFired: boolean;
    usedFallback: boolean;
    metrics: CrewDailyStateAggregate['metrics'] | null;
  } | null;
  samples: AisDayReplaySampleRow[];
};

type RawSample = {
  id: string;
  sampled_at: string;
  state: string;
  nav_status: string | null;
  speed_kn: number | null;
  lat: number | null;
  lon: number | null;
  raw_position: unknown;
};

function yesterdayIsoFrom(logDate: string): string {
  const d = new Date(`${logDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function positionFromSample(s: RawSample): DatalasticVesselPosition | null {
  const raw = s.raw_position;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as DatalasticVesselPosition;
  }
  if (
    typeof s.lat !== 'number' ||
    !Number.isFinite(s.lat) ||
    typeof s.lon !== 'number' ||
    !Number.isFinite(s.lon)
  ) {
    return null;
  }
  return {
    lat: s.lat,
    lon: s.lon,
    speed: typeof s.speed_kn === 'number' ? s.speed_kn : undefined,
    navigational_status: s.nav_status ?? undefined,
    last_position_UTC: s.sampled_at,
  };
}

function toCrewSample(s: RawSample): CrewAisSample {
  return {
    state: s.state as DailyStatus,
    sampledAt: s.sampled_at,
    navStatus: s.nav_status,
    speedKn: s.speed_kn,
    lat: s.lat,
    lon: s.lon,
    rawPosition: positionFromSample(s),
  };
}

async function loadSamples(opts: {
  accountType: AisDayReplayAccountType;
  vesselId: string;
  subjectUserId: string;
  logDate: string;
}): Promise<{ rows: RawSample[]; source: AisDayReplayResult['sampleSource'] }> {
  if (opts.accountType === 'crew') {
    const { data, error } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select('id, sampled_at, state, nav_status, speed_kn, lat, lon, raw_position')
      .eq('user_id', opts.subjectUserId)
      .eq('vessel_id', opts.vesselId)
      .eq('sample_date', opts.logDate)
      .order('sampled_at', { ascending: true });
    if (error) throw error;
    return {
      rows: (data || []) as RawSample[],
      source: 'crew_ais_state_samples',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('vessel_ais_state_samples')
    .select('id, sampled_at, state, nav_status, speed_kn, lat, lon, raw_position')
    .eq('vessel_id', opts.vesselId)
    .eq('sample_date', opts.logDate)
    .order('sampled_at', { ascending: true });
  if (error) throw error;
  return {
    rows: (data || []) as RawSample[],
    source: 'vessel_ais_state_samples',
  };
}

async function loadPreviousDay(opts: {
  accountType: AisDayReplayAccountType;
  vesselId: string;
  subjectUserId: string;
  logDate: string;
}): Promise<AisDayReplayResult['previousDay']> {
  const yesterdayIso = yesterdayIsoFrom(opts.logDate);

  const { data: prevLog } = await supabaseAdmin
    .from('daily_state_logs')
    .select('state')
    .eq('user_id', opts.subjectUserId)
    .eq('vessel_id', opts.vesselId)
    .eq('date', yesterdayIso)
    .maybeSingle();

  if (!prevLog?.state) return null;

  const sampleTable =
    opts.accountType === 'crew' ? 'crew_ais_state_samples' : 'vessel_ais_state_samples';
  let prevSampleQuery = supabaseAdmin
    .from(sampleTable)
    .select('lat, lon')
    .eq('sample_date', yesterdayIso)
    .order('sampled_at', { ascending: false })
    .limit(1);

  if (opts.accountType === 'crew') {
    prevSampleQuery = prevSampleQuery
      .eq('user_id', opts.subjectUserId)
      .eq('vessel_id', opts.vesselId);
  } else {
    prevSampleQuery = prevSampleQuery.eq('vessel_id', opts.vesselId);
  }

  const { data: prevSample } = await prevSampleQuery.maybeSingle();

  return {
    state: prevLog.state as DailyStatus,
    lastLatitude: (prevSample?.lat as number) ?? null,
    lastLongitude: (prevSample?.lon as number) ?? null,
  };
}

async function loadLoggedState(opts: {
  subjectUserId: string;
  vesselId: string;
  logDate: string;
}): Promise<DailyStatus | null> {
  const { data } = await supabaseAdmin
    .from('daily_state_logs')
    .select('state')
    .eq('user_id', opts.subjectUserId)
    .eq('vessel_id', opts.vesselId)
    .eq('date', opts.logDate)
    .maybeSingle();
  return (data?.state as DailyStatus) ?? null;
}

async function buildLocationContext(
  last: CrewAisSample | undefined,
): Promise<AisDayReplayResult['locationContext']> {
  if (last?.lat == null || last?.lon == null) return null;
  try {
    const geo = await reverseGeocodeStructured(last.lat, last.lon);
    if (!geo) return null;
    return {
      endOfDayPlaceName: geo.label ?? null,
      endOfDayInPopulatedArea: geo.inPopulatedArea === true,
    };
  } catch {
    return null;
  }
}

/**
 * Compact snapshot stored on the report at submit time so triage still has
 * an explanation if samples later age out.
 */
export function buildDetectionSnapshot(aggregate: CrewDailyStateAggregate | null) {
  if (!aggregate) {
    return {
      sampleCount: 0,
      state: null as DailyStatus | null,
      reason: 'No AIS samples for this day.',
      confidence: 'low' as const,
      seaDayRuleFired: false,
      usedFallback: false,
      metrics: null,
      counts: null,
    };
  }
  return {
    sampleCount: aggregate.sampleCount,
    state: aggregate.state,
    reason: aggregate.reason,
    confidence: aggregate.confidence,
    seaDayRuleFired: aggregate.seaDayRuleFired,
    usedFallback: aggregate.usedFallback,
    metrics: aggregate.metrics
      ? {
          positionCount: aggregate.metrics.positionCount,
          distanceTraveledNm: aggregate.metrics.distanceTraveledNm,
          radiusOfMovementNm: aggregate.metrics.radiusOfMovementNm,
          avgSpeed: aggregate.metrics.avgSpeed,
          maxSpeed: aggregate.metrics.maxSpeed,
          dominantNavStatus: aggregate.metrics.dominantNavStatus,
          underwayDurationMs: aggregate.metrics.underwayDurationMs,
          stationaryClusterCount: aggregate.metrics.stationaryClusterCount,
          clusterTransitionNm: aggregate.metrics.clusterTransitionNm,
        }
      : null,
    counts: aggregate.counts,
  };
}

export async function computeDetectionSnapshotForDay(opts: {
  accountType: AisDayReplayAccountType;
  vesselId: string;
  subjectUserId: string;
  logDate: string;
}) {
  const { rows } = await loadSamples(opts);
  if (rows.length === 0) {
    return buildDetectionSnapshot(null);
  }
  const crewSamples = rows.map(toCrewSample);
  const previousDay = await loadPreviousDay(opts);
  const locationContext = await buildLocationContext(crewSamples[crewSamples.length - 1]);
  const aggregate = aggregateCrewDailyState(crewSamples, {
    previousDay,
    locationContext: locationContext ?? undefined,
  });
  return buildDetectionSnapshot(aggregate);
}

export async function replayAisDay(opts: {
  accountType: AisDayReplayAccountType;
  vesselId: string;
  subjectUserId: string;
  logDate: string;
  /** When true, re-run resolveLiveSampleState chronologically (slower; place memory per sample). */
  resolveSamples?: boolean;
}): Promise<AisDayReplayResult> {
  const yesterdayIso = yesterdayIsoFrom(opts.logDate);
  const [{ rows, source }, previousDay, loggedState] = await Promise.all([
    loadSamples(opts),
    loadPreviousDay(opts),
    loadLoggedState(opts),
  ]);

  const crewSamples = rows.map(toCrewSample);
  const locationContext = await buildLocationContext(crewSamples[crewSamples.length - 1]);

  const aggregate =
    crewSamples.length > 0
      ? aggregateCrewDailyState(crewSamples, {
          previousDay,
          locationContext: locationContext ?? undefined,
        })
      : null;

  const samples: AisDayReplaySampleRow[] = [];
  let previousForResolver: PreviousSample | null = null;

  // Seed previous sample from the last yesterday fix when available.
  if (opts.resolveSamples && previousDay) {
    const sampleTable =
      opts.accountType === 'crew' ? 'crew_ais_state_samples' : 'vessel_ais_state_samples';
    let q = supabaseAdmin
      .from(sampleTable)
      .select('state, lat, lon, sampled_at')
      .eq('sample_date', yesterdayIso)
      .order('sampled_at', { ascending: false })
      .limit(1);
    if (opts.accountType === 'crew') {
      q = q.eq('user_id', opts.subjectUserId).eq('vessel_id', opts.vesselId);
    } else {
      q = q.eq('vessel_id', opts.vesselId);
    }
    const { data: seed } = await q.maybeSingle();
    if (seed?.state) {
      previousForResolver = {
        state: seed.state as DailyStatus,
        lat: (seed.lat as number) ?? null,
        lon: (seed.lon as number) ?? null,
        sampledAt: seed.sampled_at as string,
      };
    }
  }

  for (const row of rows) {
    const base: AisDayReplaySampleRow = {
      id: row.id,
      sampledAt: row.sampled_at,
      storedState: row.state as DailyStatus,
      navStatus: row.nav_status,
      speedKn: row.speed_kn != null ? Number(row.speed_kn) : null,
      lat: row.lat != null ? Number(row.lat) : null,
      lon: row.lon != null ? Number(row.lon) : null,
    };

    if (opts.resolveSamples) {
      const position = positionFromSample(row);
      if (position) {
        const placeMemory = await findPlaceMemoryHint({
          vesselId: opts.vesselId,
          lat: typeof position.lat === 'number' ? position.lat : null,
          lon: typeof position.lon === 'number' ? position.lon : null,
        });
        const resolution = resolveLiveSampleState({
          position,
          previousSample: previousForResolver,
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
        base.resolved = {
          state: resolution.state,
          confidence: resolution.confidence,
          reason: resolution.reason,
          distanceFromPreviousNm: resolution.distanceFromPreviousNm,
          positionChangedMeaningfully: resolution.positionChangedMeaningfully,
          placeMemory: placeMemory
            ? {
                state: placeMemory.state,
                distanceNm: placeMemory.distanceNm,
                source: placeMemory.source,
                visitCount: placeMemory.visitCount,
                placeName: placeMemory.placeName ?? null,
              }
            : null,
        };
        previousForResolver = {
          state: resolution.state,
          lat: typeof position.lat === 'number' ? position.lat : null,
          lon: typeof position.lon === 'number' ? position.lon : null,
          sampledAt: row.sampled_at,
        };
      }
    }

    samples.push(base);
  }

  return {
    accountType: opts.accountType,
    vesselId: opts.vesselId,
    subjectUserId: opts.subjectUserId,
    logDate: opts.logDate,
    yesterdayIso,
    sampleSource: source,
    previousDay,
    locationContext,
    loggedState,
    aggregate: aggregate
      ? {
          state: aggregate.state,
          reason: aggregate.reason,
          confidence: aggregate.confidence,
          counts: aggregate.counts,
          sampleCount: aggregate.sampleCount,
          seaDayRuleFired: aggregate.seaDayRuleFired,
          usedFallback: aggregate.usedFallback,
          metrics: aggregate.metrics ?? null,
        }
      : null,
    samples,
  };
}
