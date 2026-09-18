/**
 * Central vessel AIS service.
 *
 * Architecture:
 *   Datalastic (via AISProvider) → classify → Supabase (vessel_ais_status + ais_observations)
 *
 * All clients (web, mobile, cron) should call this module — never Datalastic directly.
 * One refresh per vessel regardless of how many crew/users are watching.
 */

import { classifyLiveAisSample } from '@/lib/ais/classify-state';
import {
  getNextAisCheckAt,
  isVesselDueForProviderFetch,
  nextStabilityTimestamps,
  type AisTrackingMode,
} from '@/lib/ais/adaptive-scheduler';
import {
  AIS_PROVIDER_STALE_AFTER_MS,
  AIS_REFRESH_LOCK_TTL_SECONDS,
  AIS_REFRESH_POLL_MS,
  AIS_REFRESH_WAIT_MS,
} from '@/lib/ais/constants';
import { isAisPositionStale } from '@/lib/ais/map-ais-to-state';
import { findPlaceMemoryHint } from '@/lib/ais/place-memory';
import { defaultAisProvider } from '@/lib/ais/provider/datalastic-provider';
import type {
  AISProvider,
  ClassifiedAisFix,
  VesselAisSnapshot,
  VesselAisStatusRow,
} from '@/lib/ais/provider/types';
import { reverseGeocodeStructured } from '@/lib/geocoding/reverse-geocode';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { DatalasticVesselPosition } from '@/lib/datalastic/client';

export type GetVesselAisOptions = {
  /**
   * When true, call the provider if next_ais_check_at is due.
   * Dashboard/API reads should leave this false so adaptive cron owns fetches.
   */
  refreshIfStale?: boolean;
  /** Always fetch from provider (manual sync / intentional admin refresh). */
  force?: boolean;
  /** Who triggered the request — stored in ais_fetch_log. */
  triggerSource?: string;
  /** Optional classification context for live stabilisation. */
  classificationContext?: {
    previousSample?: {
      state: DailyStatus;
      lat: number | null;
      lon: number | null;
      sampledAt: string;
    } | null;
    yesterdayAnchor?: {
      state: DailyStatus;
      lat: number | null;
      lon: number | null;
    } | null;
  };
  provider?: AISProvider;
};

function rowIsProviderDue(row: VesselAisStatusRow): boolean {
  return isVesselDueForProviderFetch(row.next_ais_check_at);
}

function rowToSnapshot(
  row: VesselAisStatusRow,
  source: 'cache' | 'datalastic',
  stale: boolean,
): VesselAisSnapshot {
  return {
    vesselId: row.vessel_id,
    state: row.seajourney_state,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    speedKn: row.speed_kn != null ? Number(row.speed_kn) : null,
    course: row.course != null ? Number(row.course) : null,
    heading: row.heading != null ? Number(row.heading) : null,
    rawNavigationStatus: row.raw_navigation_status,
    provider: row.provider,
    providerTimestamp: row.provider_timestamp,
    fetchedAt: row.fetched_at,
    stale,
    source,
    refreshError: row.refresh_error,
    rawPosition: row.raw_position,
    nextAisCheckAt: row.next_ais_check_at ?? null,
    aisTrackingMode: row.ais_tracking_mode ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logAisFetch(opts: {
  vesselId: string;
  provider: string;
  success: boolean;
  responseStatus?: number;
  cachedOrApi: 'cache' | 'api';
  errorMessage?: string | null;
  triggerSource?: string;
  trackingMode?: string | null;
  scheduledReason?: string | null;
}): Promise<void> {
  void supabaseAdmin.from('ais_fetch_log').insert({
    vessel_id: opts.vesselId,
    provider: opts.provider,
    success: opts.success,
    response_status: opts.responseStatus ?? null,
    cached_or_api: opts.cachedOrApi,
    error_message: opts.errorMessage ?? null,
    trigger_source: opts.triggerSource ?? null,
    tracking_mode: opts.trackingMode ?? null,
    scheduled_reason: opts.scheduledReason ?? null,
  });
}

async function scheduleNextCheck(opts: {
  vesselId: string;
  currentState: DailyStatus | string;
  previousState?: DailyStatus | string | null;
  existing?: VesselAisStatusRow | null;
  success: boolean;
  failures?: number;
}): Promise<{
  nextAisCheckAt: string;
  trackingMode: AisTrackingMode;
  scheduledReason: string;
  stateStableSince: string;
  lastStateChangeAt: string;
  consecutiveFetchFailures: number;
}> {
  const nowIso = new Date().toISOString();
  const failures = opts.success
    ? 0
    : (opts.failures ?? (opts.existing?.consecutive_fetch_failures ?? 0) + 1);

  const stability = nextStabilityTimestamps({
    previousState: opts.previousState ?? opts.existing?.seajourney_state,
    newState: opts.currentState as DailyStatus,
    previousStableSince: opts.existing?.state_stable_since,
    previousChangeAt: opts.existing?.last_state_change_at,
    nowIso,
  });

  const schedule = getNextAisCheckAt({
    currentState: opts.currentState,
    previousState: opts.previousState ?? opts.existing?.seajourney_state,
    stateStableSince: stability.stateStableSince,
    consecutiveFetchFailures: failures,
  });

  return {
    nextAisCheckAt: schedule.nextAisCheckAt,
    trackingMode: schedule.trackingMode,
    scheduledReason: schedule.scheduledReason,
    stateStableSince: stability.stateStableSince,
    lastStateChangeAt: stability.lastStateChangeAt,
    consecutiveFetchFailures: failures,
  };
}

async function tryAcquireRefreshLock(vesselId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('try_acquire_vessel_ais_refresh_lock', {
    p_vessel_id: vesselId,
    p_ttl_seconds: AIS_REFRESH_LOCK_TTL_SECONDS,
  });
  if (error) {
    console.error('[ais-service] lock acquire failed', vesselId, error);
    return false;
  }
  return data === true;
}

async function releaseRefreshLock(vesselId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('release_vessel_ais_refresh_lock', {
    p_vessel_id: vesselId,
  });
  if (error) {
    console.warn('[ais-service] lock release failed', vesselId, error);
  }
}

async function waitForPeerRefresh(
  vesselId: string,
  previousFetchedAt: string | null,
): Promise<VesselAisStatusRow | null> {
  const deadline = Date.now() + AIS_REFRESH_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(AIS_REFRESH_POLL_MS);
    const latest = await getLatestAIS(vesselId);
    if (!latest) continue;
    if (!previousFetchedAt || latest.fetched_at !== previousFetchedAt) {
      return latest;
    }
  }
  return getLatestAIS(vesselId);
}

async function loadVesselLookup(vesselId: string): Promise<{
  mmsi: string | null;
  imo: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('vessels')
    .select('mmsi, imo')
    .eq('id', vesselId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    mmsi: (data.mmsi as string | null) ?? null,
    imo: (data.imo as string | null) ?? null,
  };
}

async function buildClassificationContext(
  vesselId: string,
  raw: DatalasticVesselPosition,
  override?: GetVesselAisOptions['classificationContext'],
): Promise<ClassifiedAisFix> {
  const lat = typeof raw.lat === 'number' ? raw.lat : null;
  const lon = typeof raw.lon === 'number' ? raw.lon : null;

  let locationContext:
    | { endOfDayPlaceName?: string | null; endOfDayInPopulatedArea?: boolean }
    | undefined;
  if (lat != null && lon != null) {
    try {
      const geo = await reverseGeocodeStructured(lat, lon);
      if (geo) {
        locationContext = {
          endOfDayPlaceName: geo.label ?? null,
          endOfDayInPopulatedArea: geo.inPopulatedArea === true,
        };
      }
    } catch {
      locationContext = undefined;
    }
  }

  const placeMemory = await findPlaceMemoryHint({ vesselId, lat, lon });

  return classifyLiveAisSample({
    position: raw,
    previousSample: override?.previousSample ?? null,
    yesterdayAnchor: override?.yesterdayAnchor ?? null,
    placeMemory,
    locationContext,
  });
}

async function persistAisRefresh(opts: {
  vesselId: string;
  classified: ClassifiedAisFix;
  providerName: string;
  refreshError?: string | null;
  existing?: VesselAisStatusRow | null;
}): Promise<VesselAisStatusRow> {
  const { vesselId, classified, providerName, refreshError, existing } = opts;
  const pos = classified.position;
  const now = new Date().toISOString();

  const schedule = await scheduleNextCheck({
    vesselId,
    currentState: classified.seajourneyState,
    previousState: existing?.seajourney_state,
    existing,
    success: true,
  });

  const statusPayload = {
    vessel_id: vesselId,
    latitude: pos.latitude,
    longitude: pos.longitude,
    speed_kn: pos.speedKn,
    course: pos.course,
    heading: pos.heading,
    raw_navigation_status: classified.rawNavigationStatus,
    seajourney_state: classified.seajourneyState,
    provider: providerName,
    provider_timestamp: pos.providerTimestamp,
    fetched_at: now,
    updated_at: now,
    raw_position: pos.raw as unknown as Record<string, unknown>,
    refresh_error: refreshError ?? null,
    next_ais_check_at: schedule.nextAisCheckAt,
    ais_tracking_mode: schedule.trackingMode,
    last_state_change_at: schedule.lastStateChangeAt,
    state_stable_since: schedule.stateStableSince,
    last_successful_fetch_at: now,
    consecutive_fetch_failures: 0,
  };

  const { data: statusRow, error: statusError } = await supabaseAdmin
    .from('vessel_ais_status')
    .upsert(statusPayload, { onConflict: 'vessel_id' })
    .select('*')
    .single();

  if (statusError) throw statusError;

  let observationId: string | null = null;
  const { data: insertedObs, error: obsError } = await supabaseAdmin
    .from('ais_observations')
    .insert({
      vessel_id: vesselId,
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed_kn: pos.speedKn,
      course: pos.course,
      heading: pos.heading,
      raw_navigation_status: classified.rawNavigationStatus,
      seajourney_state: classified.seajourneyState,
      provider: providerName,
      provider_timestamp: pos.providerTimestamp,
      fetched_at: now,
      raw_position: pos.raw as unknown as Record<string, unknown>,
    })
    .select(
      'id, vessel_id, latitude, longitude, speed_kn, seajourney_state, provider_timestamp, fetched_at',
    )
    .maybeSingle();

  if (obsError && (obsError as { code?: string }).code === '23505') {
    const { data: existingObs } = await supabaseAdmin
      .from('ais_observations')
      .select(
        'id, vessel_id, latitude, longitude, speed_kn, seajourney_state, provider_timestamp, fetched_at',
      )
      .eq('vessel_id', vesselId)
      .eq('provider_timestamp', pos.providerTimestamp)
      .maybeSingle();
    if (existingObs) {
      observationId = existingObs.id as string;
      try {
        const { processAisObservationForDailySummary } = await import(
          '@/lib/ais/daily-summary'
        );
        await processAisObservationForDailySummary(
          existingObs as import('@/lib/ais/daily-summary').AisObservationRow,
        );
      } catch (e) {
        console.warn('[ais-service] daily summary (dup obs) failed', vesselId, e);
      }
    }
  } else if (obsError) {
    console.warn('[ais-service] observation insert failed', vesselId, obsError);
  } else if (insertedObs) {
    observationId = insertedObs.id as string;
    try {
      const { processAisObservationForDailySummary } = await import(
        '@/lib/ais/daily-summary'
      );
      await processAisObservationForDailySummary(
        insertedObs as import('@/lib/ais/daily-summary').AisObservationRow,
      );
    } catch (e) {
      console.warn('[ais-service] daily summary failed', vesselId, e);
    }
  }

  void observationId;

  void supabaseAdmin
    .from('vessels')
    .update({
      ais_last_sync_at: now,
      ais_last_sync_error: refreshError ?? null,
      ais_last_nav_status: classified.rawNavigationStatus,
      ais_last_speed: pos.speedKn,
      ais_last_position_at: pos.providerTimestamp,
    })
    .eq('id', vesselId);

  return statusRow as VesselAisStatusRow;
}

async function persistFetchFailureSchedule(
  vesselId: string,
  existing: VesselAisStatusRow | null,
  errorMessage: string,
): Promise<VesselAisStatusRow | null> {
  const schedule = await scheduleNextCheck({
    vesselId,
    currentState: existing?.seajourney_state ?? 'at-anchor',
    previousState: existing?.seajourney_state,
    existing,
    success: false,
  });

  const payload = {
    next_ais_check_at: schedule.nextAisCheckAt,
    ais_tracking_mode: schedule.trackingMode,
    consecutive_fetch_failures: schedule.consecutiveFetchFailures,
    refresh_error: errorMessage,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data } = await supabaseAdmin
      .from('vessel_ais_status')
      .update(payload)
      .eq('vessel_id', vesselId)
      .select('*')
      .maybeSingle();
    return (data as VesselAisStatusRow | null) ?? {
      ...existing,
      ...payload,
    };
  }

  // No prior status — still create a schedule stub so cron backs off.
  const { data } = await supabaseAdmin
    .from('vessel_ais_status')
    .upsert(
      {
        vessel_id: vesselId,
        seajourney_state: 'at-anchor',
        provider: 'datalastic',
        fetched_at: new Date().toISOString(),
        ...payload,
      },
      { onConflict: 'vessel_id' },
    )
    .select('*')
    .maybeSingle();
  return (data as VesselAisStatusRow | null) ?? null;
}

/** Load the latest stored AIS status row for a vessel (no provider call). */
export async function getLatestAIS(vesselId: string): Promise<VesselAisStatusRow | null> {
  const { data, error } = await supabaseAdmin
    .from('vessel_ais_status')
    .select('*')
    .eq('vessel_id', vesselId)
    .maybeSingle();
  if (error) {
    console.error('[ais-service] getLatestAIS failed', vesselId, error);
    return null;
  }
  return (data as VesselAisStatusRow | null) ?? null;
}

/**
 * Fetch from provider, classify, persist observation + latest status.
 * Uses a Postgres refresh lock to prevent duplicate concurrent provider calls.
 *
 * This is the ONLY path that should call the AIS provider for live vessel
 * tracking. Callers must use getVesselAIS({ force }) or getVesselAIS({ refreshIfStale })
 * — never call the Datalastic client directly for central AIS updates.
 */
export async function refreshVesselAIS(
  vesselId: string,
  options: GetVesselAisOptions = {},
): Promise<VesselAisSnapshot> {
  const provider = options.provider ?? defaultAisProvider;
  const triggerSource = options.triggerSource ?? 'refresh';
  const existing = await getLatestAIS(vesselId);
  const previousFetchedAt = existing?.fetched_at ?? null;

  const acquired = await tryAcquireRefreshLock(vesselId);
  if (!acquired) {
    const peerResult = await waitForPeerRefresh(vesselId, previousFetchedAt);
    if (peerResult && !rowIsProviderDue(peerResult)) {
      await logAisFetch({
        vesselId,
        provider: peerResult.provider,
        success: true,
        cachedOrApi: 'cache',
        triggerSource: `${triggerSource}:peer-wait`,
        trackingMode: peerResult.ais_tracking_mode,
        scheduledReason: 'peer_wait_cache',
      });
      return rowToSnapshot(peerResult, 'cache', false);
    }
    if (existing) {
      await logAisFetch({
        vesselId,
        provider: existing.provider,
        success: true,
        cachedOrApi: 'cache',
        triggerSource: `${triggerSource}:lock-busy`,
        trackingMode: existing.ais_tracking_mode,
        scheduledReason: 'lock_busy_cache',
      });
      return rowToSnapshot(existing, 'cache', rowIsProviderDue(existing));
    }
    return {
      vesselId,
      state: 'at-anchor',
      latitude: null,
      longitude: null,
      speedKn: null,
      course: null,
      heading: null,
      rawNavigationStatus: null,
      provider: provider.name,
      providerTimestamp: null,
      fetchedAt: new Date().toISOString(),
      stale: true,
      source: 'cache',
      refreshError: 'AIS refresh in progress — no cached data yet.',
    };
  }

  try {
    const lookup = await loadVesselLookup(vesselId);
    if (!lookup || (!lookup.mmsi && !lookup.imo)) {
      const msg = 'Missing MMSI/IMO';
      await logAisFetch({
        vesselId,
        provider: provider.name,
        success: false,
        cachedOrApi: 'api',
        errorMessage: msg,
        triggerSource,
        scheduledReason: 'missing_identity',
      });
      const scheduled = await persistFetchFailureSchedule(vesselId, existing, msg);
      if (scheduled) return rowToSnapshot(scheduled, 'cache', true);
      throw new Error('Vessel has no MMSI or IMO on file.');
    }

    const providerResult = await provider.getVesselPosition(lookup);

    if (!providerResult.ok || !providerResult.position) {
      const msg = providerResult.errorMessage ?? 'Provider error';
      await logAisFetch({
        vesselId,
        provider: provider.name,
        success: false,
        responseStatus: providerResult.responseStatus,
        cachedOrApi: 'api',
        errorMessage: msg,
        triggerSource,
        trackingMode: 'failure_retry',
        scheduledReason: 'failure_retry',
      });
      const scheduled = await persistFetchFailureSchedule(vesselId, existing, msg);
      if (scheduled) return rowToSnapshot(scheduled, 'cache', true);
      throw new Error(msg);
    }

    const raw = providerResult.position.raw;
    if (isAisPositionStale(raw)) {
      const staleMsg = 'AIS position is stale (>6h); stored fix not updated.';
      await logAisFetch({
        vesselId,
        provider: provider.name,
        success: false,
        responseStatus: providerResult.responseStatus,
        cachedOrApi: 'api',
        errorMessage: staleMsg,
        triggerSource,
        scheduledReason: 'stale_provider_fix',
      });
      // Still advance schedule (treat as soft failure) so we don't hammer.
      const scheduled = await persistFetchFailureSchedule(
        vesselId,
        existing,
        staleMsg,
      );
      if (scheduled) return rowToSnapshot(scheduled, 'cache', true);
      throw new Error(staleMsg);
    }

    const classified = await buildClassificationContext(
      vesselId,
      raw,
      options.classificationContext,
    );

    const saved = await persistAisRefresh({
      vesselId,
      classified,
      providerName: provider.name,
      existing,
    });

    await logAisFetch({
      vesselId,
      provider: provider.name,
      success: true,
      responseStatus: providerResult.responseStatus ?? 200,
      cachedOrApi: 'api',
      triggerSource,
      trackingMode: saved.ais_tracking_mode,
      scheduledReason: saved.ais_tracking_mode
        ? `${saved.ais_tracking_mode}_fetch`
        : 'provider_fetch',
    });

    return rowToSnapshot(saved, 'datalastic', false);
  } finally {
    await releaseRefreshLock(vesselId);
  }
}

/**
 * Primary entry point for clients.
 *
 * Default: return cached vessel_ais_status (dashboard must NOT defeat the
 * adaptive scheduler). Pass force=true for intentional provider refresh.
 * Pass refreshIfStale=true for cron/due workers to fetch when next_ais_check_at is due.
 *
 * ALL provider calls (cron, manual Sync, Premium enable, ?force=1) go through
 * refreshVesselAIS → try_acquire_vessel_ais_refresh_lock. On success/failure the
 * adaptive scheduler updates next_ais_check_at (including backoff).
 */
export async function getVesselAIS(
  vesselId: string,
  options: GetVesselAisOptions = {},
): Promise<VesselAisSnapshot> {
  const refreshIfStale = options.refreshIfStale === true;
  const force = options.force === true;
  const existing = await getLatestAIS(vesselId);

  const notDue = existing && !rowIsProviderDue(existing);

  if (existing && !force && (notDue || !refreshIfStale)) {
    await logAisFetch({
      vesselId,
      provider: existing.provider,
      success: true,
      cachedOrApi: 'cache',
      triggerSource: options.triggerSource ?? 'get',
      trackingMode: existing.ais_tracking_mode,
      scheduledReason: notDue ? 'before_next_check' : 'cache_only',
    });
    return rowToSnapshot(existing, 'cache', rowIsProviderDue(existing));
  }

  if (!refreshIfStale && !force) {
    if (existing) {
      return rowToSnapshot(existing, 'cache', rowIsProviderDue(existing));
    }
    return {
      vesselId,
      state: 'at-anchor',
      latitude: null,
      longitude: null,
      speedKn: null,
      course: null,
      heading: null,
      rawNavigationStatus: null,
      provider: defaultAisProvider.name,
      providerTimestamp: null,
      fetchedAt: new Date().toISOString(),
      stale: true,
      source: 'cache',
      refreshError: 'No AIS data recorded for this vessel yet.',
    };
  }

  return refreshVesselAIS(vesselId, options);
}

/** Whether provider timestamp is older than the staleness threshold. */
export function isProviderFixStale(providerTimestamp: string | null | undefined): boolean {
  if (!providerTimestamp) return true;
  const t = Date.parse(providerTimestamp);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > AIS_PROVIDER_STALE_AFTER_MS;
}

/**
 * Vessel ids with AIS tracking enabled that are due for a provider fetch.
 * Uses DB filter on next_ais_check_at (indexed).
 */
export async function listDueAisVesselIds(limit = 75): Promise<string[]> {
  const nowIso = new Date().toISOString();

  const { data: enabled, error: enabledErr } = await supabaseAdmin
    .from('vessels')
    .select('id')
    .eq('ais_provider_poll_enabled', true);

  if (enabledErr) {
    console.error('[ais-service] listDue enabled lookup failed', enabledErr);
    return [];
  }

  const enabledIds = ((enabled ?? []) as { id: string }[]).map((v) => v.id);
  if (enabledIds.length === 0) return [];

  const { data: statusRows, error: statusErr } = await supabaseAdmin
    .from('vessel_ais_status')
    .select('vessel_id, next_ais_check_at')
    .in('vessel_id', enabledIds);

  if (statusErr) {
    console.error('[ais-service] listDue status lookup failed', statusErr);
    return enabledIds.slice(0, limit);
  }

  const statusByVessel = new Map<string, string | null>();
  for (const row of (statusRows ?? []) as {
    vessel_id: string;
    next_ais_check_at: string | null;
  }[]) {
    statusByVessel.set(row.vessel_id, row.next_ais_check_at);
  }

  const due: string[] = [];
  for (const id of enabledIds) {
    if (!statusByVessel.has(id)) {
      due.push(id); // never scheduled
      continue;
    }
    if (isVesselDueForProviderFetch(statusByVessel.get(id), Date.parse(nowIso))) {
      due.push(id);
    }
  }

  // Prefer vessels with earliest next_ais_check_at
  due.sort((a, b) => {
    const ta = statusByVessel.get(a);
    const tb = statusByVessel.get(b);
    if (ta == null && tb == null) return 0;
    if (ta == null) return -1;
    if (tb == null) return 1;
    return Date.parse(ta) - Date.parse(tb);
  });

  return due.slice(0, limit);
}

export {
  AIS_REFRESH_INTERVAL_MINUTES,
  AIS_REFRESH_INTERVAL_MS,
  getAisRefreshIntervalMinutes,
  getAisRefreshIntervalMs,
  isAisCacheFresh,
  isVesselDueForProviderFetch,
  getNextAisCheckAt,
} from '@/lib/ais/constants';
