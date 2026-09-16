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
  AIS_PROVIDER_STALE_AFTER_MS,
  AIS_REFRESH_LOCK_TTL_SECONDS,
  AIS_REFRESH_POLL_MS,
  AIS_REFRESH_WAIT_MS,
  getAisRefreshIntervalMinutes,
  isAisCacheFresh,
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
  /** Bypass freshness window and fetch from provider when stale. Default true. */
  refreshIfStale?: boolean;
  /** Always fetch from provider (manual sync / cron). */
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

function rowIsFresh(row: Pick<VesselAisStatusRow, 'fetched_at' | 'seajourney_state'>): boolean {
  return isAisCacheFresh(row.fetched_at, row.seajourney_state);
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
}): Promise<void> {
  void supabaseAdmin.from('ais_fetch_log').insert({
    vessel_id: opts.vesselId,
    provider: opts.provider,
    success: opts.success,
    response_status: opts.responseStatus ?? null,
    cached_or_api: opts.cachedOrApi,
    error_message: opts.errorMessage ?? null,
    trigger_source: opts.triggerSource ?? null,
  });
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
}): Promise<VesselAisStatusRow> {
  const { vesselId, classified, providerName, refreshError } = opts;
  const pos = classified.position;
  const now = new Date().toISOString();

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
  };

  const { data: statusRow, error: statusError } = await supabaseAdmin
    .from('vessel_ais_status')
    .upsert(statusPayload, { onConflict: 'vessel_id' })
    .select('*')
    .single();

  if (statusError) throw statusError;

  const { error: obsError } = await supabaseAdmin.from('ais_observations').insert({
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
  });

  if (obsError && (obsError as { code?: string }).code !== '23505') {
    console.warn('[ais-service] observation insert failed', vesselId, obsError);
  }

  // Keep vessels.* sync metadata in sync for legacy UI paths.
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
    if (peerResult && rowIsFresh(peerResult)) {
      await logAisFetch({
        vesselId,
        provider: peerResult.provider,
        success: true,
        cachedOrApi: 'cache',
        triggerSource: `${triggerSource}:peer-wait`,
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
      });
      return rowToSnapshot(existing, 'cache', !rowIsFresh(existing));
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
      await logAisFetch({
        vesselId,
        provider: provider.name,
        success: false,
        cachedOrApi: 'api',
        errorMessage: 'Missing MMSI/IMO',
        triggerSource,
      });
      if (existing) {
        return rowToSnapshot(
          existing,
          'cache',
          true,
        );
      }
      throw new Error('Vessel has no MMSI or IMO on file.');
    }

    const providerResult = await provider.getVesselPosition(lookup);

    if (!providerResult.ok || !providerResult.position) {
      await logAisFetch({
        vesselId,
        provider: provider.name,
        success: false,
        responseStatus: providerResult.responseStatus,
        cachedOrApi: 'api',
        errorMessage: providerResult.errorMessage ?? 'Provider error',
        triggerSource,
      });
      if (existing) {
        const staleRow = {
          ...existing,
          refresh_error: providerResult.errorMessage ?? 'Provider unavailable',
        };
        return rowToSnapshot(staleRow, 'cache', true);
      }
      throw new Error(providerResult.errorMessage ?? 'AIS provider unavailable');
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
      });
      if (existing) {
        return rowToSnapshot(
          { ...existing, refresh_error: staleMsg },
          'cache',
          true,
        );
      }
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
    });

    await logAisFetch({
      vesselId,
      provider: provider.name,
      success: true,
      responseStatus: providerResult.responseStatus ?? 200,
      cachedOrApi: 'api',
      triggerSource,
    });

    return rowToSnapshot(saved, 'datalastic', false);
  } finally {
    await releaseRefreshLock(vesselId);
  }
}

/**
 * Primary entry point for clients.
 * Returns cached data when fresh; otherwise refreshes from provider.
 */
export async function getVesselAIS(
  vesselId: string,
  options: GetVesselAisOptions = {},
): Promise<VesselAisSnapshot> {
  const refreshIfStale = options.refreshIfStale !== false;
  const force = options.force === true;
  const existing = await getLatestAIS(vesselId);

  // Adaptive freshness: underway → 5 min, stationary → 45 min.
  if (existing && !force && rowIsFresh(existing)) {
    await logAisFetch({
      vesselId,
      provider: existing.provider,
      success: true,
      cachedOrApi: 'cache',
      triggerSource: options.triggerSource ?? 'get',
    });
    return rowToSnapshot(existing, 'cache', false);
  }

  if (!refreshIfStale && !force) {
    if (existing) {
      return rowToSnapshot(existing, 'cache', !rowIsFresh(existing));
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

export { AIS_REFRESH_INTERVAL_MINUTES, AIS_REFRESH_INTERVAL_MS } from '@/lib/ais/constants';
export {
  getAisRefreshIntervalMinutes,
  getAisRefreshIntervalMs,
  isAisCacheFresh,
} from '@/lib/ais/constants';
