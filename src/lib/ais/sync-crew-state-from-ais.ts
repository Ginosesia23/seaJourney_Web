/**
 * Live AIS state tracking for premium crew.
 *
 * Each hour, for every crew user that has opted in and has an active vessel
 * assignment, we:
 *   1. Fetch the latest AIS position for their vessel from Datalastic.
 *   2. Record it as a `crew_ais_state_samples` row for the crew's local
 *      "today" (we use server UTC — good enough for now).
 *   3. Re-aggregate all of today's samples via `aggregateCrewDailyState`,
 *      which delegates to `analyzeAisDailyState` — the same analyzer the AIS
 *      history import uses. It considers:
 *        * previous-day state + last-known coords (carry-forward if the
 *          vessel didn't move overnight),
 *        * ≥ 4-hour underway rule for the sea-day classification,
 *        * position clusters + distance moved between them,
 *        * speed / motion analysis,
 *        * reverse-geocoded end-of-day location (populated area?)
 *   4. Upsert the resulting state into `daily_state_logs` under the crew
 *      user's id with an `[AIS auto]` note prefix (never clobbering manual
 *      entries).
 *
 * Datalastic calls are deduplicated per vessel/MMSI within a single cron
 * pass so multiple crew on the same vessel only cost one API call.
 */

import { fetchVesselPosition, type DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  buildAisStateNote,
  getNormalizedAisNavStatus,
  isAisPositionStale,
  logDateForLiveAisSync,
} from '@/lib/ais/map-ais-to-state';
import {
  aggregateCrewDailyState,
  type CrewAisSample,
  type CrewDailyStateAggregate,
} from '@/lib/ais/aggregate-crew-daily-state';
import type { AisAnalyzeOptions } from '@/lib/ais/analyze-daily-state';
import {
  LIVE_SAMPLE_THRESHOLDS,
  resolveLiveSampleState,
  type PreviousSample,
} from '@/lib/ais/resolve-live-sample-state';
import {
  findPlaceMemoryHint,
  recordPlaceMemoryVisit,
} from '@/lib/ais/place-memory';
import { reverseGeocodeStructured } from '@/lib/geocoding/reverse-geocode';
import {
  ONBOARD_TOGGLE_LOG_NOTE,
  shouldForceOnLeaveFromOnboardTracker,
} from '@/lib/crew-rotation/onboard-leave-side-effects';
import { sendUserNotification } from '@/lib/notifications/send-user-notification';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  CREW_PREMIUM_PLUS_TIERS,
  hasActiveSubscription,
  VESSEL_MANAGED_FREE_TIERS,
} from '@/supabase/database/subscription-helpers';

export type CrewAisSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  userId: string;
  vesselId?: string | null;
  sampleId?: string | null;
  sampleState?: DailyStatus | null;
  aggregatedState?: DailyStatus | null;
  aggregatedReason?: string | null;
  sampleCount?: number;
  logDate?: string | null;
};

/**
 * Cached-per-cron-run Datalastic position, keyed by vessel id.
 * Prevents duplicate API calls for multiple crew on the same vessel.
 */
type PositionCache = Map<string, DatalasticVesselPosition | null>;

type CrewCandidate = {
  userId: string;
  vesselId: string;
  mmsi: string | null;
  imo: string | null;
};

/** Number of days of samples to keep. Older rows are trimmed by the cron. */
const SAMPLE_RETENTION_DAYS = 8;

/**
 * Sync a single crew user. If `position` is provided, we skip the Datalastic
 * call and use it (the batched cron uses this to dedupe by vessel). Otherwise
 * we fetch the position ourselves.
 */
export async function syncCrewStateFromAis(
  candidate: CrewCandidate,
  options?: {
    /** Precomputed position (skips Datalastic). Pass `null` to reject the sync. */
    position?: DatalasticVesselPosition | null;
    /** Override log date (defaults to server-side today). */
    logDate?: string | null;
  },
): Promise<CrewAisSyncResult> {
  const { userId, vesselId, mmsi, imo } = candidate;

  if (!mmsi && !imo) {
    return recordUserSyncError(userId, {
      ok: false,
      skipped: true,
      reason:
        'Active vessel has no MMSI or IMO on file — cannot fetch AIS position.',
      userId,
      vesselId,
    });
  }

  try {
    const logDate = logDateForLiveAisSync(options?.logDate);

    // If the crew already logged On Leave for today, do not fetch AIS or
    // overwrite their daily state. Tracking stays enabled — sync resumes
    // automatically once they log back on board.
    {
      const { data: todayLog } = await supabaseAdmin
        .from('daily_state_logs')
        .select('state')
        .eq('user_id', userId)
        .eq('vessel_id', vesselId)
        .eq('date', logDate)
        .maybeSingle();

      if ((todayLog?.state as string | undefined) === 'on-leave') {
        await supabaseAdmin
          .from('users')
          .update({
            ais_live_last_sync_at: new Date().toISOString(),
            ais_live_last_sync_error: null,
          })
          .eq('id', userId);

        return {
          ok: true,
          skipped: true,
          reason: 'Daily state is On Leave — AIS sync paused until back on board.',
          userId,
          vesselId,
        };
      }
    }

    // Onboard Tracker signed this crew off (leave period or active override).
    // Keep their daily log as on-leave — no AIS fetch needed while on leave.
    if (await shouldForceOnLeaveFromOnboardTracker(userId, vesselId, logDate)) {
      const { data: existingLeaveLog } = await supabaseAdmin
        .from('daily_state_logs')
        .select('id, state, notes')
        .eq('user_id', userId)
        .eq('vessel_id', vesselId)
        .eq('date', logDate)
        .maybeSingle();

      const alreadyOnLeave =
        existingLeaveLog?.state === 'on-leave' &&
        typeof existingLeaveLog.notes === 'string' &&
        existingLeaveLog.notes.startsWith('[onboard-toggle]');

      if (!alreadyOnLeave) {
        await supabaseAdmin.from('daily_state_logs').upsert(
          {
            user_id: userId,
            vessel_id: vesselId,
            date: logDate,
            state: 'on-leave',
            notes: ONBOARD_TOGGLE_LOG_NOTE,
          },
          { onConflict: 'user_id,vessel_id,date' },
        );
      }

      await supabaseAdmin
        .from('users')
        .update({
          ais_live_last_sync_at: new Date().toISOString(),
          ais_live_last_sync_error: null,
        })
        .eq('id', userId);

      return {
        ok: true,
        skipped: true,
        reason: 'Crew marked off board via Onboard Tracker — daily state kept as on-leave.',
        userId,
        vesselId,
      };
    }

    const position =
      options?.position !== undefined
        ? options.position
        : await fetchVesselPosition({ mmsi, imo });

    if (!position) {
      return recordUserSyncError(userId, {
        ok: false,
        skipped: true,
        reason: 'AIS provider returned no position for this vessel.',
        userId,
        vesselId,
      });
    }

    if (isAisPositionStale(position)) {
      return recordUserSyncError(userId, {
        ok: false,
        skipped: true,
        reason: 'Latest AIS position is older than 6 hours — sample skipped.',
        userId,
        vesselId,
      });
    }

    const navStatus = getNormalizedAisNavStatus(position) || null;
    const speedKn = typeof position.speed === 'number' ? position.speed : null;
    const lat = typeof position.lat === 'number' ? position.lat : null;
    const lon = typeof position.lon === 'number' ? position.lon : null;

    // 0. Load the previous most-recent sample BEFORE inserting the new one.
    //    We need its state AND its coordinates so `resolveLiveSampleState`
    //    can run its position-stability check (the primary anti-flip-flop
    //    heuristic). See resolve-live-sample-state.ts for the algorithm.
    const { data: prevSampleRow } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select('state, sampled_at, nav_status, lat, lon')
      .eq('user_id', userId)
      .eq('vessel_id', vesselId)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousSample: PreviousSample | null = prevSampleRow
      ? {
          state: prevSampleRow.state as DailyStatus,
          lat: (prevSampleRow.lat as number) ?? null,
          lon: (prevSampleRow.lon as number) ?? null,
          sampledAt: prevSampleRow.sampled_at as string,
        }
      : null;
    const previousSampleState = previousSample?.state ?? null;

    // Reverse-geocode the current position up front. The resolver uses it
    // as a tie-breaker when AIS is ambiguous and position stability isn't
    // enough (e.g. very first sample for a user, or after a big passage).
    const locationContext = await loadLocationContext(lat, lon);

    // Load yesterday's resolved state + last known coords BEFORE the
    // per-sample resolver so we can pass it in as the "yesterday anchor".
    // This is what lets the resolver lock today's samples to yesterday's
    // state when the vessel hasn't actually moved from yesterday's spot,
    // bypassing intra-day previous-sample flip-flops. Also reused as the
    // analyzer's `previousDay` context further down — one query, two uses.
    const previousDay = await loadPreviousDayContext(userId, vesselId, logDate);

    const placeMemory = await findPlaceMemoryHint({
      vesselId,
      lat,
      lon,
    });

    // Resolve the stabilized state for this fix. Unlike `mapAisToDailyStatus`
    // (which is a pure single-fix mapping) this considers previous position,
    // anchor-swing tolerance, geocoded context, yesterday's anchor, and
    // historical place memory to filter out drift noise.
    const resolution = resolveLiveSampleState({
      position,
      previousSample,
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

    if (
      resolution.state === 'at-anchor' ||
      resolution.state === 'in-port' ||
      resolution.state === 'in-yard'
    ) {
      void recordPlaceMemoryVisit({
        vesselId,
        lat,
        lon,
        state: resolution.state,
        placeName: locationContext?.endOfDayPlaceName ?? null,
      });
    }
    const state = resolution.state;

    console.log('[crew-ais-sync] resolved sample state', {
      userId,
      resolvedState: state,
      confidence: resolution.confidence,
      reason: resolution.reason,
      distanceNm: resolution.distanceFromPreviousNm,
      positionChangedMeaningfully: resolution.positionChangedMeaningfully,
      previousState: previousSampleState,
      speedKn,
      navStatus,
    });

    // 1. Insert an hourly sample. The `(user_id, date_trunc('hour', sampled_at))`
    //    unique index makes duplicate runs within the same hour raise 23505 —
    //    we treat that as a *soft* skip for the insert (samples are append-only
    //    and we never want to overwrite the historical record), but we still
    //    fall through to steps 2–4 so a manual "Sync now" ALWAYS re-aggregates
    //    and refreshes today's daily_state_log, even if we can't add a new
    //    hourly sample.
    const { data: sample, error: sampleError } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .insert({
        user_id: userId,
        vessel_id: vesselId,
        sample_date: logDate,
        sampled_at: new Date().toISOString(),
        ais_position_at: position.last_position_UTC ?? null,
        state,
        nav_status: navStatus,
        speed_kn: speedKn,
        lat,
        lon,
        raw_position: position as unknown as Record<string, unknown>,
      })
      .select('id')
      .maybeSingle();

    let alreadySampledThisHour = false;
    if (sampleError) {
      if ((sampleError as any).code === '23505') {
        alreadySampledThisHour = true;
      } else {
        throw sampleError;
      }
    }

    // 2. Load all of today's samples and aggregate into a daily state, using
    //    the same analyzer the AIS history import uses. We enrich the call with:
    //      * previousDay — yesterday's resolved state + last-known coords, so
    //        stationary states can carry forward when the vessel didn't move
    //        overnight (matches the anchor→port disambiguation heuristics).
    //      * locationContext — reverse-geocoded end-of-day place name +
    //        populated-area flag; disambiguates "anchored offshore" vs
    //        "moored in harbor" when AIS nav status is ambiguous.
    const { data: todaySamples, error: samplesLoadError } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select(
        'state, sampled_at, nav_status, speed_kn, lat, lon, raw_position',
      )
      .eq('user_id', userId)
      .eq('sample_date', logDate)
      .order('sampled_at', { ascending: true });

    if (samplesLoadError) throw samplesLoadError;

    const storedSamples: CrewAisSample[] = (todaySamples ?? []).map((s) => ({
      state: s.state as DailyStatus,
      sampledAt: s.sampled_at as string,
      navStatus: (s.nav_status as string) ?? null,
      speedKn: (s.speed_kn as number) ?? null,
      lat: (s.lat as number) ?? null,
      lon: (s.lon as number) ?? null,
      rawPosition: (s.raw_position as DatalasticVesselPosition) ?? null,
    }));

    // Include the freshly-fetched position as an in-memory sample too. When
    // the insert succeeded it's already in `storedSamples`; when it hit the
    // "already sampled this hour" 23505 conflict, adding it here still lets
    // the aggregator see the current data. This matches the preview endpoint
    // (which also runs on stored + synthetic fresh sample), so the sync's
    // verdict is always identical to what the debug panel shows.
    const freshSample: CrewAisSample = {
      state,
      sampledAt: new Date().toISOString(),
      navStatus,
      speedKn,
      lat,
      lon,
      rawPosition: position,
    };
    // De-duplicate by timestamp (`sampled_at` collides when the insert
    // succeeded a moment ago).
    const hasFreshAlready = storedSamples.some(
      (s) => Math.abs(Date.parse(s.sampledAt) - Date.parse(freshSample.sampledAt)) < 2000,
    );
    const asAggregatorInput: CrewAisSample[] = hasFreshAlready
      ? storedSamples
      : [...storedSamples, freshSample];

    // `previousDay` was loaded above (before the per-sample resolver call)
    // so we could pass it in as the yesterday-anchor. Reuse the same object
    // here for the daily aggregate — no need to double-query.
    const aggregate: CrewDailyStateAggregate = aggregateCrewDailyState(
      asAggregatorInput,
      { previousDay, locationContext },
    );

    console.log('[crew-ais-sync]', {
      userId,
      logDate,
      storedSampleCount: storedSamples.length,
      addedFreshSample: !hasFreshAlready,
      freshMappedState: state,
      freshNavStatus: navStatus,
      aggregateState: aggregate.state,
      aggregateReason: aggregate.reason,
      alreadySampledThisHour,
    });

    // 3. Upsert `daily_state_logs` under the CREW user (not the manager). We
    //    only overwrite if the crew hasn't already set a different state manually
    //    for today — check for existing note prefixes to avoid clobbering user
    //    intent. Manual entries have no `[AIS auto]` prefix.
    const noteBase = buildAisStateNote(position);
    const underwayHoursFromMetrics = aggregate.metrics?.underwayDurationMs
      ? (aggregate.metrics.underwayDurationMs / (60 * 60 * 1000)).toFixed(1)
      : null;
    const noteExtras: string[] = [];
    noteExtras.push(`daily: ${aggregate.state}`);
    noteExtras.push(`${aggregate.sampleCount} samples`);
    if (underwayHoursFromMetrics) noteExtras.push(`${underwayHoursFromMetrics}h underway`);
    if (aggregate.seaDayRuleFired) noteExtras.push('sea day ≥ 4h');
    if (locationContext?.endOfDayPlaceName)
      noteExtras.push(`@${locationContext.endOfDayPlaceName}`);
    const aggregatedNote = `${noteBase} · ${noteExtras.join(' · ')}`;

    const { data: existingLog } = await supabaseAdmin
      .from('daily_state_logs')
      .select('id, state, notes')
      .eq('user_id', userId)
      .eq('vessel_id', vesselId)
      .eq('date', logDate)
      .maybeSingle();

    const isManuallyOverridden =
      existingLog &&
      typeof existingLog.notes === 'string' &&
      !existingLog.notes.startsWith('[AIS');

    console.log('[crew-ais-sync] daily_state_log guard', {
      existingLogFound: !!existingLog,
      existingState: existingLog?.state ?? null,
      existingNotes: existingLog?.notes ?? null,
      isManuallyOverridden,
      willUpsert: !isManuallyOverridden,
      newState: aggregate.state,
    });

    if (!isManuallyOverridden) {
      const isUnderway = aggregate.state === 'underway';
      const { data: upserted, error: upsertError } = await supabaseAdmin
        .from('daily_state_logs')
        .upsert(
          {
            user_id: userId,
            vessel_id: vesselId,
            date: logDate,
            state: aggregate.state,
            ...(isUnderway ? { is_part_of_active_passage: false } : {}),
            notes: aggregatedNote,
          },
          { onConflict: 'user_id,vessel_id,date' },
        )
        .select('id, state, notes')
        .maybeSingle();

      if (upsertError) throw upsertError;
      console.log('[crew-ais-sync] daily_state_log upsert result', {
        upsertedId: upserted?.id ?? null,
        upsertedState: upserted?.state ?? null,
      });
    }

    // 4. Bookkeeping on the users row.
    await supabaseAdmin
      .from('users')
      .update({
        ais_live_last_sync_at: new Date().toISOString(),
        ais_live_last_sync_error: null,
      })
      .eq('id', userId);

    // 5. State-change detection → push notification.
    //    Only when:
    //      * the RESOLVED state (position-stability aware) differs from the
    //        previous sample's state — not the raw single-fix mapping, so
    //        anchor-drift SOG noise never triggers a notification;
    //      * we actually recorded a new sample this hour (no notification
    //        on re-aggregation-only "Sync now" refreshes);
    //      * we had a previous sample to compare against;
    //      * `shouldNotifyForTransition` agrees — this suppresses label
    //        flips that aren't backed by real vessel movement (see below).
    //    Fire-and-forget — notification failures don't fail the sync.
    if (
      !alreadySampledThisHour &&
      previousSampleState &&
      previousSampleState !== state &&
      shouldNotifyForTransition({
        previousState: previousSampleState,
        newState: state,
        resolutionConfidence: resolution.confidence,
        distanceNm: resolution.distanceFromPreviousNm,
        speedKn,
      })
    ) {
      void notifyCrewOfStateChange({
        userId,
        vesselId,
        previousState: previousSampleState,
        newState: state,
        placeName: locationContext?.endOfDayPlaceName ?? null,
        speedKn,
      });
    } else if (
      !alreadySampledThisHour &&
      previousSampleState &&
      previousSampleState !== state
    ) {
      console.log('[crew-ais-sync] suppressed state-change notification', {
        userId,
        transition: `${previousSampleState} → ${state}`,
        reason: 'below movement/confidence threshold',
        confidence: resolution.confidence,
        distanceNm: resolution.distanceFromPreviousNm,
      });
    }

    return {
      ok: true,
      userId,
      vesselId,
      sampleId: (sample?.id as string) ?? null,
      sampleState: state,
      aggregatedState: aggregate.state,
      aggregatedReason: aggregate.reason,
      sampleCount: aggregate.sampleCount,
      logDate,
      reason: alreadySampledThisHour
        ? 'Already sampled this hour — re-aggregated today from stored samples.'
        : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Crew AIS sync failed';
    return recordUserSyncError(userId, {
      ok: false,
      reason: message,
      userId,
      vesselId,
    });
  }
}

/**
 * Decide whether a transition is real enough to buzz the user's phone.
 *
 * We only get here when the resolved state changed AND we recorded a new
 * hourly sample. This is the last-mile guard against "junk" transitions:
 *
 *   • Transitions BETWEEN stationary states (at-anchor ↔ in-port) that
 *     aren't accompanied by real movement are almost always geo/label
 *     flips (same location, different geocoder verdict). Suppressed.
 *   • Transitions TO underway when the vessel hasn't actually moved and
 *     isn't going fast are drift noise. Suppressed.
 *   • Transitions FROM underway to a stationary state are always real —
 *     the vessel just arrived somewhere.
 *   • Transitions to/from in-yard (aground) are AIS-confirmed and always
 *     material.
 */
function shouldNotifyForTransition(args: {
  previousState: DailyStatus;
  newState: DailyStatus;
  resolutionConfidence: string;
  distanceNm: number | null;
  speedKn: number | null;
}): boolean {
  const { previousState, newState, distanceNm, speedKn } = args;

  const isStationary = (s: DailyStatus) =>
    s === 'at-anchor' || s === 'in-port' || s === 'in-yard';

  // in-yard transitions are AIS-confirmed (nav code 6) — always notify.
  if (previousState === 'in-yard' || newState === 'in-yard') return true;

  // Arrived: any → stationary. Always material — the vessel just settled.
  if (previousState === 'underway' && isStationary(newState)) return true;

  // Departed: stationary → underway. Need real movement OR real speed to
  // filter drift noise. If we have no distance info (first sample), trust
  // the resolver's decision (it already required nav-status or speed).
  if (isStationary(previousState) && newState === 'underway') {
    if (distanceNm == null) return true;
    if (distanceNm > LIVE_SAMPLE_THRESHOLDS.SAME_LOCATION_RADIUS_NM) return true;
    if ((speedKn ?? 0) >= LIVE_SAMPLE_THRESHOLDS.UNAMBIGUOUS_UNDERWAY_KN) return true;
    return false;
  }

  // Stationary ↔ stationary (at-anchor ↔ in-port). Only notify if the
  // vessel actually moved to a new spot (e.g. weighed anchor and moored).
  if (isStationary(previousState) && isStationary(newState)) {
    if (distanceNm == null) return false;
    return distanceNm > LIVE_SAMPLE_THRESHOLDS.SAME_LOCATION_RADIUS_NM;
  }

  return true;
}

/**
 * Send a push notification when the crew's vessel transitions between states
 * (e.g. at-anchor → underway). Never throws — failures are logged.
 *
 * Copy is deliberately concise so it fits on a lock-screen: "M/Y Meridian is
 * now underway (was at anchor)". The `metadata` payload lets the mobile app
 * deep-link into the vessel's current-state page on tap.
 */
async function notifyCrewOfStateChange(args: {
  userId: string;
  vesselId: string;
  previousState: DailyStatus;
  newState: DailyStatus;
  placeName: string | null;
  speedKn: number | null;
}): Promise<void> {
  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('name')
    .eq('id', args.vesselId)
    .maybeSingle();
  const vesselName = (vessel?.name as string) || 'Your vessel';

  const nowLabel = HUMAN_STATE_LABELS[args.newState] ?? args.newState;
  const prevLabel = HUMAN_STATE_LABELS[args.previousState] ?? args.previousState;
  const speedPart =
    args.newState === 'underway' && args.speedKn != null && args.speedKn > 0
      ? ` at ${args.speedKn.toFixed(1)} kn`
      : '';
  const placePart = args.placeName ? ` near ${args.placeName}` : '';

  const title = 'Vessel state changed';
  const body = `${vesselName} is now ${nowLabel}${speedPart}${placePart} (was ${prevLabel}).`;

  console.log('[crew-ais-sync] notifying state change', {
    userId: args.userId,
    vesselId: args.vesselId,
    transition: `${args.previousState} → ${args.newState}`,
  });

  await sendUserNotification({
    userId: args.userId,
    title,
    body,
    kind: 'ais_state_change',
    metadata: {
      vesselId: args.vesselId,
      vesselName,
      previousState: args.previousState,
      newState: args.newState,
      speedKn: args.speedKn,
      placeName: args.placeName,
      // Deep-link hint for the mobile app.
      route: '/dashboard/current',
    },
  });
}

/** Human-readable labels for the daily-state enum. */
const HUMAN_STATE_LABELS: Record<DailyStatus, string> = {
  underway: 'underway',
  'at-anchor': 'at anchor',
  'in-port': 'moored',
  'in-yard': 'in yard',
  'on-leave': 'on leave',
};

/**
 * Load the crew user's daily_state_log for the day before `logDate` and, if
 * present, its final coordinates from the latest sample of that day. Used by
 * the analyzer to carry forward stationary states when the vessel hasn't
 * moved overnight.
 */
async function loadPreviousDayContext(
  userId: string,
  vesselId: string,
  logDate: string,
): Promise<AisAnalyzeOptions['previousDay']> {
  const yesterday = new Date(`${logDate}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  const { data: log } = await supabaseAdmin
    .from('daily_state_logs')
    .select('state')
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .eq('date', yesterdayIso)
    .maybeSingle();

  if (!log) return null;

  const { data: lastSample } = await supabaseAdmin
    .from('crew_ais_state_samples')
    .select('lat, lon')
    .eq('user_id', userId)
    .eq('sample_date', yesterdayIso)
    .order('sampled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    state: log.state as DailyStatus,
    lastLatitude: (lastSample?.lat as number) ?? null,
    lastLongitude: (lastSample?.lon as number) ?? null,
  };
}

/**
 * Reverse-geocode the current position for `locationContext`. Best-effort:
 * on failure we return `null` and the analyzer will simply skip the
 * "populated area" heuristic (which is optional).
 */
async function loadLocationContext(
  lat: number | null,
  lon: number | null,
): Promise<AisAnalyzeOptions['locationContext']> {
  if (lat == null || lon == null) return null;
  try {
    const geo = await reverseGeocodeStructured(lat, lon);
    if (!geo) return null;
    return {
      endOfDayPlaceName: geo.label ?? null,
      endOfDayInPopulatedArea: geo.inPopulatedArea === true,
    };
  } catch (err) {
    console.warn('[crew-ais-sync] reverse geocode failed', err);
    return null;
  }
}

async function recordUserSyncError(
  userId: string,
  result: CrewAisSyncResult,
): Promise<CrewAisSyncResult> {
  await supabaseAdmin
    .from('users')
    .update({
      ais_live_last_sync_at: new Date().toISOString(),
      ais_live_last_sync_error: result.reason ?? null,
    })
    .eq('id', userId);
  return result;
}

/**
 * Run the crew AIS sync for every opted-in Premium/Professional crew user
 * who currently has an active vessel assignment on a vessel with an MMSI/IMO.
 *
 * Datalastic calls are deduplicated by vessel id — so 20 crew on M/Y Meridian
 * only cost one API call per cron pass.
 */
export async function syncAllEnabledCrewAis(): Promise<CrewAisSyncResult[]> {
  const candidates = await loadEligibleCrewCandidates();
  const results: CrewAisSyncResult[] = [];
  const positionCache: PositionCache = new Map();

  for (const candidate of candidates) {
    const cacheKey = candidate.vesselId;
    let position = positionCache.get(cacheKey);
    if (position === undefined) {
      try {
        position = await fetchVesselPosition({
          mmsi: candidate.mmsi,
          imo: candidate.imo,
        });
      } catch (err) {
        console.warn(
          '[crew-ais-cron] Datalastic fetch failed for vessel',
          candidate.vesselId,
          err,
        );
        position = null;
      }
      positionCache.set(cacheKey, position);
    }

    results.push(
      await syncCrewStateFromAis(candidate, { position }),
    );
  }

  // Trim old samples (best-effort — don't fail the whole cron on error).
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - SAMPLE_RETENTION_DAYS);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    await supabaseAdmin
      .from('crew_ais_state_samples')
      .delete()
      .lt('sample_date', cutoffDate);
  } catch (err) {
    console.warn('[crew-ais-cron] sample retention cleanup failed', err);
  }

  return results;
}

/**
 * Load every opted-in crew user with an active `vessel_assignments` row whose
 * vessel has an MMSI or IMO. Uses admin queries so RLS doesn't hide anything.
 */
async function loadEligibleCrewCandidates(): Promise<CrewCandidate[]> {
  // 1. Users who have opted in and are on a paid crew tier.
  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end',
    )
    .eq('ais_live_tracking_enabled', true)
    .in('role', ['crew', 'captain']);

  if (usersError) {
    console.error('[crew-ais-cron] user lookup failed', usersError);
    return [];
  }

  const eligibleUserIds: string[] = [];
  for (const u of users ?? []) {
    const tier = (u.subscription_tier as string | null | undefined)?.toLowerCase().trim() || 'free';
    if (VESSEL_MANAGED_FREE_TIERS.has(tier)) continue;
    if (!CREW_PREMIUM_PLUS_TIERS.has(tier)) continue;
    if (!hasActiveSubscription(u)) continue;
    eligibleUserIds.push(u.id as string);
  }

  if (eligibleUserIds.length === 0) return [];

  // 2. Active vessel assignment per user (end_date null or in the future).
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: assignments, error: assignErr } = await supabaseAdmin
    .from('vessel_assignments')
    .select('user_id, vessel_id, start_date, end_date')
    .in('user_id', eligibleUserIds)
    .or(`end_date.is.null,end_date.gte.${todayIso}`)
    .order('start_date', { ascending: false });

  if (assignErr) {
    console.error('[crew-ais-cron] assignments lookup failed', assignErr);
    return [];
  }

  const activeVesselByUser = new Map<string, string>();
  for (const row of assignments ?? []) {
    const uid = row.user_id as string;
    const vid = row.vessel_id as string;
    if (!activeVesselByUser.has(uid)) activeVesselByUser.set(uid, vid);
  }

  const vesselIds = Array.from(new Set(activeVesselByUser.values()));
  if (vesselIds.length === 0) return [];

  // 3. Vessel MMSI/IMO in one query.
  const { data: vessels, error: vesselErr } = await supabaseAdmin
    .from('vessels')
    .select('id, mmsi, imo')
    .in('id', vesselIds);

  if (vesselErr) {
    console.error('[crew-ais-cron] vessels lookup failed', vesselErr);
    return [];
  }

  const vesselById = new Map<string, { mmsi: string | null; imo: string | null }>();
  for (const v of vessels ?? []) {
    vesselById.set(v.id as string, {
      mmsi: (v.mmsi as string) || null,
      imo: (v.imo as string) || null,
    });
  }

  const out: CrewCandidate[] = [];
  for (const [userId, vesselId] of activeVesselByUser) {
    const v = vesselById.get(vesselId);
    if (!v) continue;
    if (!v.mmsi && !v.imo) continue;
    out.push({ userId, vesselId, mmsi: v.mmsi, imo: v.imo });
  }
  return out;
}

export function formatCrewAisSyncSummary(result: CrewAisSyncResult): string {
  if (result.ok && result.aggregatedState && result.logDate) {
    return `Set ${result.logDate} to ${result.aggregatedState} (${result.sampleCount ?? 0} samples)`;
  }
  if (result.skipped && result.reason) return result.reason;
  return result.reason || 'Crew AIS sync failed';
}
