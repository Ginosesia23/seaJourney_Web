/**
 * Server-only data access for the admin AIS Monitor.
 *
 * Reads ONLY from Supabase (ais_fetch_log, vessel_ais_status, ais_observations,
 * vessels_public_identity) via service-role RPCs and bounded, paginated
 * queries. This module must never import the Datalastic client or the AIS
 * service — opening or refreshing the monitor must not cause provider calls.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasVesselAisTrackingTier } from '@/lib/vessel-ais-tier';
import { hasActiveSubscription, hasCrewAisLiveTrackingTier } from '@/supabase/database/subscription-helpers';
import {
  normalizeAisTriggerSource,
  normalizeMmsiForLog,
  sanitiseProviderError,
  type AisProviderEndpoint,
} from '@/lib/ais/fetch-audit-shared';
import {
  AIS_MONITOR_MAX_PAGE_SIZE,
  AIS_MONITOR_THRESHOLDS,
  computeAdaptiveSavings,
  computeAisMonitorAlerts,
  computeAisMonitorHealth,
  emptyRequestStats,
  isLikelyLegitimateDuplicate,
  logFilterConstraints,
  rangeWindow,
  successRatePercent,
  utcDayStart,
  utcMonthStart,
} from '@/lib/ais/monitor/metrics';
import type {
  AisMonitorAttentionReason,
  AisMonitorAttentionVessel,
  AisMonitorConsumer,
  AisMonitorConsumers,
  AisMonitorDuplicate,
  AisMonitorFetchDetail,
  AisMonitorFetchPage,
  AisMonitorFetchRow,
  AisMonitorLogFilter,
  AisMonitorObservation,
  AisMonitorRange,
  AisMonitorRequestStats,
  AisMonitorSchedulerHealth,
  AisMonitorSummary,
  AisMonitorTimeseries,
  AisMonitorTimeseriesPoint,
  AisMonitorTopVessel,
  AisMonitorTriggerBreakdownRow,
  AisMonitorVesselDetail,
  AisMonitorVesselIdentity,
  AisMonitorVesselsResponse,
} from '@/lib/ais/monitor/types';

export class AisMonitorQueryError extends Error {
  readonly hint: string | null;

  constructor(message: string, hint: string | null = null) {
    super(message);
    this.name = 'AisMonitorQueryError';
    this.hint = hint;
  }
}

const MIGRATION_HINT = 'Apply sql/add-ais-fetch-log-monitoring.sql to enable the AIS Monitor.';

function fail(context: string, error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? 'Unknown database error';
  const missing =
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST204' ||
    error?.code === '42703' ||
    error?.code === '42883' ||
    /does not exist|Could not find the/i.test(message);
  throw new AisMonitorQueryError(`${context}: ${message}`, missing ? MIGRATION_HINT : null);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

const ENDPOINTS: readonly AisProviderEndpoint[] = ['vessel', 'vessel_history', 'vessel_info', 'vessel_find'];

function toEndpoint(v: unknown): AisProviderEndpoint | null {
  return typeof v === 'string' && (ENDPOINTS as readonly string[]).includes(v)
    ? (v as AisProviderEndpoint)
    : null;
}

// ─── Identity (public fields only) ──────────────────────────────────────────

export async function loadVesselIdentities(
  ids: (string | null | undefined)[],
): Promise<Map<string, AisMonitorVesselIdentity>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  const out = new Map<string, AisMonitorVesselIdentity>();
  if (unique.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from('vessels_public_identity')
    .select('id, name, mmsi, imo, flag, type')
    .in('id', unique.slice(0, 500));
  if (error) fail('vessel identity lookup', error);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.id);
    out.set(id, {
      id,
      name: str(row.name),
      mmsi: str(row.mmsi),
      imo: str(row.imo),
      flag: str(row.flag),
      type: str(row.type),
    });
  }
  return out;
}

async function searchVesselIdsByName(term: string): Promise<string[]> {
  const escaped = term.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data, error } = await supabaseAdmin
    .from('vessels_public_identity')
    .select('id')
    .ilike('name', `%${escaped}%`)
    .limit(50);
  if (error) fail('vessel search', error);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function vesselIdsByMmsi(mmsi: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('vessels_public_identity')
    .select('id')
    .eq('mmsi', mmsi)
    .limit(20);
  if (error) fail('mmsi lookup', error);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

// ─── RPC wrappers ───────────────────────────────────────────────────────────

export async function getRequestStats(
  from: string,
  to: string,
  vesselId: string | null = null,
): Promise<AisMonitorRequestStats> {
  const { data, error } = await supabaseAdmin.rpc('admin_ais_monitor_request_stats', {
    p_from: from,
    p_to: to,
    p_vessel_id: vesselId,
  });
  if (error) fail('request stats', error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return emptyRequestStats();
  const total = num(row.total);
  const succeeded = num(row.succeeded);
  return {
    total,
    succeeded,
    failed: num(row.failed),
    successRate: successRatePercent(succeeded, total),
    avgResponseMs: numOrNull(row.avg_response_ms),
    p95ResponseMs: numOrNull(row.p95_response_ms),
    rateLimited: num(row.rate_limited),
    authFailed: num(row.auth_failed),
    serverErrors: num(row.server_errors),
    networkErrors: num(row.network_errors),
    distinctVessels: num(row.distinct_vessels),
    lastRequestAt: str(row.last_request_at),
    lastSuccessAt: str(row.last_success_at),
  };
}

export async function getSchedulerHealth(): Promise<AisMonitorSchedulerHealth> {
  const t = AIS_MONITOR_THRESHOLDS;
  const { data, error } = await supabaseAdmin.rpc('admin_ais_monitor_scheduler_health', {
    p_overdue_minutes: t.overdueMinutes,
    p_far_overdue_minutes: t.farOverdueMinutes,
  });
  if (error) fail('scheduler health', error);
  const row = ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;
  return {
    eligible: num(row.eligible),
    enabled: num(row.enabled),
    enabledNeverScheduled: num(row.enabled_never_scheduled),
    due: num(row.due),
    overdue: num(row.overdue),
    farOverdue: num(row.far_overdue),
    failing: num(row.failing),
    failing5Plus: num(row.failing_5plus),
    modes: {
      fast: num(row.mode_fast),
      normal: num(row.mode_normal),
      slow: num(row.mode_slow),
      transition: num(row.mode_transition),
      failure_retry: num(row.mode_failure_retry),
    },
    lastSchedulerRequestAt: str(row.last_scheduler_request_at),
    thresholds: { overdueMinutes: t.overdueMinutes, farOverdueMinutes: t.farOverdueMinutes },
  };
}

export async function getTimeseriesPoints(
  from: string,
  to: string,
  bucket: 'hour' | 'day',
  vesselId: string | null = null,
): Promise<AisMonitorTimeseriesPoint[]> {
  const { data, error } = await supabaseAdmin.rpc('admin_ais_monitor_timeseries', {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
    p_vessel_id: vesselId,
  });
  if (error) fail('timeseries', error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    bucketStart: String(r.bucket_start),
    total: num(r.total),
    succeeded: num(r.succeeded),
    failed: num(r.failed),
    avgResponseMs: numOrNull(r.avg_response_ms),
  }));
}

async function getTriggerBreakdown(from: string, to: string): Promise<AisMonitorTriggerBreakdownRow[]> {
  const { data, error } = await supabaseAdmin.rpc('admin_ais_monitor_trigger_breakdown', {
    p_from: from,
    p_to: to,
  });
  if (error) fail('trigger breakdown', error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    triggerSource: normalizeAisTriggerSource(str(r.trigger_source)),
    endpoint: toEndpoint(r.endpoint) ?? 'vessel',
    total: num(r.total),
    failed: num(r.failed),
  }));
}

async function getSavings(windowDays: number) {
  const { from, to } = rangeWindow(windowDays <= 7 ? '7d' : '30d');
  const { data, error } = await supabaseAdmin.rpc('admin_ais_monitor_savings', {
    p_from: from,
    p_to: to,
  });
  if (error) fail('savings', error);
  const row = ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;
  return computeAdaptiveSavings({
    trackedVesselDays: num(row.tracked_vessel_days),
    actualRequests: num(row.actual_requests),
    windowDays,
  });
}

// ─── Summary ────────────────────────────────────────────────────────────────

export async function getAisMonitorSummary(): Promise<AisMonitorSummary> {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const last24From = new Date(nowMs - 24 * 3_600_000).toISOString();

  const [today, last1h, last24h, month, scheduler, savings, triggers24h] = await Promise.all([
    getRequestStats(utcDayStart(nowMs), now),
    getRequestStats(new Date(nowMs - 3_600_000).toISOString(), now),
    getRequestStats(last24From, now),
    getRequestStats(utcMonthStart(nowMs), now),
    getSchedulerHealth(),
    getSavings(30),
    getTriggerBreakdown(last24From, now),
  ]);

  const alerts = computeAisMonitorAlerts({ last1h, last24h, scheduler, nowMs });
  return {
    generatedAt: now,
    health: computeAisMonitorHealth({ alerts, last24h, scheduler }),
    today,
    last1h,
    last24h,
    month,
    scheduler,
    alerts,
    savings,
    triggers24h,
    cost: {
      available: false,
      reason:
        'Datalastic does not report per-request credits and no pricing source is configured, so cost is not estimated.',
    },
  };
}

export async function getAisMonitorTimeseries(
  range: AisMonitorRange,
  vesselId: string | null,
): Promise<AisMonitorTimeseries> {
  const w = rangeWindow(range);
  return {
    range,
    bucket: w.bucket,
    from: w.from,
    to: w.to,
    vesselId,
    points: await getTimeseriesPoints(w.from, w.to, w.bucket, vesselId),
  };
}

// ─── Vessels: top consumers, attention list, duplicates ─────────────────────

export async function getAisMonitorVessels(range: AisMonitorRange): Promise<AisMonitorVesselsResponse> {
  const t = AIS_MONITOR_THRESHOLDS;
  const w = rangeWindow(range);
  const dupFrom = new Date(Math.max(Date.parse(w.from), Date.now() - 7 * 86_400_000)).toISOString();

  const [topRes, attentionRes, dupRes] = await Promise.all([
    supabaseAdmin.rpc('admin_ais_monitor_top_vessels', { p_from: w.from, p_to: w.to, p_limit: 10 }),
    supabaseAdmin.rpc('admin_ais_monitor_attention_vessels', {
      p_far_overdue_minutes: t.farOverdueMinutes,
      p_rapid_window_minutes: t.rapidWindowMinutes,
      p_rapid_threshold: t.rapidThreshold,
      p_limit: 25,
    }),
    supabaseAdmin.rpc('admin_ais_monitor_duplicates', {
      p_from: dupFrom,
      p_to: w.to,
      p_window_seconds: t.duplicateWindowSeconds,
      p_limit: 50,
    }),
  ]);
  if (topRes.error) fail('top vessels', topRes.error);
  if (attentionRes.error) fail('attention vessels', attentionRes.error);
  if (dupRes.error) fail('duplicates', dupRes.error);

  const topRows = (topRes.data ?? []) as Record<string, unknown>[];
  const attentionRows = (attentionRes.data ?? []) as Record<string, unknown>[];
  const dupRows = (dupRes.data ?? []) as Record<string, unknown>[];

  const identities = await loadVesselIdentities([
    ...topRows.map((r) => str(r.vessel_id)),
    ...attentionRows.map((r) => str(r.vessel_id)),
    ...dupRows.map((r) => str(r.vessel_id)),
  ]);

  const topConsumers: AisMonitorTopVessel[] = topRows.map((r) => {
    const vesselId = str(r.vessel_id);
    const total = num(r.total);
    const succeeded = num(r.succeeded);
    return {
      vesselId,
      vessel: vesselId ? (identities.get(vesselId) ?? null) : null,
      total,
      succeeded,
      failed: num(r.failed),
      successRate: successRatePercent(succeeded, total),
      avgResponseMs: numOrNull(r.avg_response_ms),
      lastRequestAt: str(r.last_request_at),
      lastSuccessAt: str(r.last_success_at),
    };
  });

  const attention: AisMonitorAttentionVessel[] = attentionRows.map((r) => {
    const vesselId = String(r.vessel_id);
    return {
      vesselId,
      vessel: identities.get(vesselId) ?? null,
      reason: String(r.reason) as AisMonitorAttentionReason,
      nextAisCheckAt: str(r.next_ais_check_at),
      consecutiveFetchFailures: num(r.consecutive_fetch_failures),
      trackingMode: str(r.ais_tracking_mode),
      lastSuccessfulFetchAt: str(r.last_successful_fetch_at),
      requestsInWindow: numOrNull(r.requests_in_window),
    };
  });

  const duplicates: AisMonitorDuplicate[] = dupRows.map((r) => {
    const vesselId = String(r.vessel_id);
    const triggerSource = normalizeAisTriggerSource(str(r.trigger_source));
    const previousTriggerSource = normalizeAisTriggerSource(str(r.previous_trigger_source));
    const previousSuccess = typeof r.previous_success === 'boolean' ? r.previous_success : null;
    return {
      fetchId: String(r.fetch_id),
      previousFetchId: str(r.previous_fetch_id),
      vesselId,
      vessel: identities.get(vesselId) ?? null,
      requestedAt: String(r.requested_at),
      previousRequestedAt: String(r.previous_requested_at),
      secondsApart: num(r.seconds_apart),
      triggerSource,
      previousTriggerSource,
      likelyLegitimate: isLikelyLegitimateDuplicate({
        triggerSource,
        previousTriggerSource,
        previousSuccess,
      }),
    };
  });

  return {
    range,
    from: w.from,
    to: w.to,
    topConsumers,
    attention,
    duplicates,
    thresholds: {
      duplicateWindowSeconds: t.duplicateWindowSeconds,
      rapidWindowMinutes: t.rapidWindowMinutes,
      rapidThreshold: t.rapidThreshold,
      farOverdueMinutes: t.farOverdueMinutes,
    },
  };
}

// ─── Fetch log ──────────────────────────────────────────────────────────────

const FETCH_COLUMNS =
  'id, vessel_id, provider, endpoint, mmsi, requested_at, completed_at, success, response_status, response_time_ms, error_message, provider_credits_used, trigger_source, trigger_detail, tracking_mode, scheduled_reason, provider_called';

function mapFetchRow(
  r: Record<string, unknown>,
  identities: Map<string, AisMonitorVesselIdentity>,
): AisMonitorFetchRow {
  const vesselId = str(r.vessel_id);
  const identity = vesselId ? identities.get(vesselId) : undefined;
  return {
    id: String(r.id),
    vesselId,
    provider: str(r.provider) ?? 'datalastic',
    endpoint: toEndpoint(r.endpoint),
    mmsi: str(r.mmsi),
    requestedAt: String(r.requested_at),
    completedAt: str(r.completed_at),
    success: r.success === true,
    httpStatus: numOrNull(r.response_status),
    responseTimeMs: numOrNull(r.response_time_ms),
    errorMessage: sanitiseProviderError(str(r.error_message)),
    providerCreditsUsed: numOrNull(r.provider_credits_used),
    triggerSource: normalizeAisTriggerSource(str(r.trigger_source)),
    triggerDetail: str(r.trigger_detail),
    trackingMode: str(r.tracking_mode),
    scheduledReason: str(r.scheduled_reason),
    providerCalled: r.provider_called !== false,
    vessel: identity ? { id: identity.id, name: identity.name } : null,
  };
}

export type AisMonitorFetchQuery = {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  filter: AisMonitorLogFilter;
  vesselId?: string | null;
  vesselSearch?: string | null;
  mmsi?: string | null;
};

export async function getAisMonitorFetches(q: AisMonitorFetchQuery): Promise<AisMonitorFetchPage> {
  const page = Math.max(1, Math.floor(q.page));
  const pageSize = Math.min(AIS_MONITOR_MAX_PAGE_SIZE, Math.max(1, Math.floor(q.pageSize)));
  const empty: AisMonitorFetchPage = { rows: [], total: 0, page, pageSize, from: q.from, to: q.to };

  let query = supabaseAdmin
    .from('ais_fetch_log')
    .select(FETCH_COLUMNS, { count: 'exact' })
    .eq('cached_or_api', 'api')
    .gte('requested_at', q.from)
    .lt('requested_at', q.to);

  const c = logFilterConstraints(q.filter);
  if (c.success !== undefined) query = query.eq('success', c.success);
  if (c.triggers) query = query.in('trigger_source', c.triggers);

  if (q.vesselId) query = query.eq('vessel_id', q.vesselId);

  const search = q.vesselSearch?.trim();
  if (search) {
    const ids = await searchVesselIdsByName(search.slice(0, 80));
    if (ids.length === 0) return empty;
    query = query.in('vessel_id', ids);
  }

  const mmsi = normalizeMmsiForLog(q.mmsi);
  if (q.mmsi && !mmsi) return empty;
  if (mmsi) {
    const ids = await vesselIdsByMmsi(mmsi);
    query = ids.length
      ? query.or(`mmsi.eq.${mmsi},vessel_id.in.(${ids.join(',')})`)
      : query.eq('mmsi', mmsi);
  }

  const offset = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order('requested_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) fail('fetch log', error);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const identities = await loadVesselIdentities(rows.map((r) => str(r.vessel_id)));
  return {
    rows: rows.map((r) => mapFetchRow(r, identities)),
    total: count ?? rows.length,
    page,
    pageSize,
    from: q.from,
    to: q.to,
  };
}

export async function getAisMonitorFetchDetail(fetchId: string): Promise<AisMonitorFetchDetail | null> {
  const { data, error } = await supabaseAdmin
    .from('ais_fetch_log')
    .select(FETCH_COLUMNS)
    .eq('id', fetchId)
    .eq('cached_or_api', 'api')
    .maybeSingle();
  if (error) fail('fetch detail', error);
  if (!data) return null;

  const raw = data as unknown as Record<string, unknown>;
  const vesselId = str(raw.vessel_id);
  const identities = await loadVesselIdentities([vesselId]);
  const fetch = mapFetchRow(raw, identities);

  let observation: AisMonitorObservation | null = null;
  if (vesselId && fetch.success && (fetch.endpoint ?? 'vessel') === 'vessel') {
    // The observation is written between the provider response and the log insert.
    const windowEnd = new Date(Date.parse(fetch.requestedAt) + 2 * 60_000).toISOString();
    const { data: obs, error: obsError } = await supabaseAdmin
      .from('ais_observations')
      .select(
        'id, fetched_at, provider_timestamp, seajourney_state, speed_kn, course, heading, latitude, longitude, raw_navigation_status',
      )
      .eq('vessel_id', vesselId)
      .gte('fetched_at', fetch.requestedAt)
      .lte('fetched_at', windowEnd)
      .order('fetched_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (obsError) fail('observation lookup', obsError);
    if (obs) {
      const o = obs as Record<string, unknown>;
      observation = {
        id: String(o.id),
        fetchedAt: String(o.fetched_at),
        providerTimestamp: str(o.provider_timestamp),
        state: str(o.seajourney_state),
        speedKn: numOrNull(o.speed_kn),
        course: numOrNull(o.course),
        heading: numOrNull(o.heading),
        latitude: numOrNull(o.latitude),
        longitude: numOrNull(o.longitude),
        rawNavigationStatus: str(o.raw_navigation_status),
      };
    }
  }

  const consumers = vesselId
    ? await getAisMonitorConsumers(vesselId, { id: fetch.id, requestedAt: fetch.requestedAt, success: fetch.success })
    : null;

  return { fetch, vessel: vesselId ? (identities.get(vesselId) ?? null) : null, observation, consumers };
}

// ─── Data consumers ─────────────────────────────────────────────────────────

/** Crew/vessel syncs read the cache from the latest fetch; cap attribution so a stalled vessel doesn't sweep in days of samples. */
const CONSUMER_ATTRIBUTION_MAX_MS = 3 * 60 * 60_000;
const CONSUMER_MAX_ACCOUNTS = 200;

function displayName(u: Record<string, unknown>): string | null {
  const full = `${str(u.first_name) ?? ''} ${str(u.last_name) ?? ''}`.trim();
  return full || str(u.username);
}

/**
 * Accounts that consume a vessel's central AIS data: the vessel manager
 * (vessel plan → daily logs from vessel samples) and assigned crew (Premium
 * live tracking → crew samples). When `fetch` is given, samples recorded
 * between that fetch and the next successful one are attributed to it.
 */
export async function getAisMonitorConsumers(
  vesselId: string,
  fetch?: { id: string; requestedAt: string; success: boolean } | null,
): Promise<AisMonitorConsumers> {
  const nowMs = Date.now();
  const asOfDate = (fetch ? new Date(fetch.requestedAt) : new Date(nowMs)).toISOString().slice(0, 10);

  let fetchWindow: { from: string; to: string } | null = null;
  if (fetch?.success) {
    const { data: next, error: nextError } = await supabaseAdmin
      .from('ais_fetch_log')
      .select('requested_at')
      .eq('vessel_id', vesselId)
      .eq('cached_or_api', 'api')
      .eq('success', true)
      .neq('id', fetch.id)
      .gt('requested_at', fetch.requestedAt)
      .order('requested_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextError) fail('next fetch lookup', nextError);
    const fromMs = Date.parse(fetch.requestedAt);
    const capMs = Math.min(fromMs + CONSUMER_ATTRIBUTION_MAX_MS, nowMs);
    const nextMs = next?.requested_at ? Date.parse(String(next.requested_at)) : NaN;
    fetchWindow = {
      from: fetch.requestedAt,
      to: new Date(Number.isFinite(nextMs) ? Math.min(nextMs, capMs) : capMs).toISOString(),
    };
  }

  const [vesselRes, assignRes] = await Promise.all([
    supabaseAdmin
      .from('vessels')
      .select('vessel_manager_id, ais_tracking_enabled, ais_provider_poll_enabled')
      .eq('id', vesselId)
      .maybeSingle(),
    supabaseAdmin
      .from('vessel_assignments')
      .select('user_id, start_date, end_date')
      .eq('vessel_id', vesselId)
      .or(`end_date.is.null,end_date.gte.${asOfDate}`)
      .limit(CONSUMER_MAX_ACCOUNTS),
  ]);
  if (vesselRes.error) fail('vessel lookup', vesselRes.error);
  if (assignRes.error) fail('assignments lookup', assignRes.error);

  const managerId = str(vesselRes.data?.vessel_manager_id);
  const vesselOptIn = vesselRes.data?.ais_tracking_enabled === true;
  const vesselPolled = vesselRes.data?.ais_provider_poll_enabled === true;
  const crewIds = new Set(
    ((assignRes.data ?? []) as Record<string, unknown>[])
      .filter((a) => !a.start_date || String(a.start_date) <= asOfDate)
      .map((a) => String(a.user_id))
      .filter((id) => id !== managerId),
  );
  const assignedIds = new Set(crewIds);

  // Evidence: who actually recorded samples from this fetch (or ever, for last-sample).
  const windowSamples = new Set<string>();
  let vesselSampleInWindow = false;
  if (fetchWindow) {
    const [crewSamples, vesselSamples] = await Promise.all([
      supabaseAdmin
        .from('crew_ais_state_samples')
        .select('user_id')
        .eq('vessel_id', vesselId)
        .gte('sampled_at', fetchWindow.from)
        .lt('sampled_at', fetchWindow.to)
        .limit(1000),
      supabaseAdmin
        .from('vessel_ais_state_samples')
        .select('id', { count: 'exact', head: true })
        .eq('vessel_id', vesselId)
        .gte('sampled_at', fetchWindow.from)
        .lt('sampled_at', fetchWindow.to),
    ]);
    if (crewSamples.error) fail('crew samples lookup', crewSamples.error);
    if (vesselSamples.error) fail('vessel samples lookup', vesselSamples.error);
    for (const s of crewSamples.data ?? []) windowSamples.add(String((s as Record<string, unknown>).user_id));
    vesselSampleInWindow = (vesselSamples.count ?? 0) > 0;
    for (const id of windowSamples) if (id !== managerId) crewIds.add(id);
  }

  const userIds = [...(managerId ? [managerId] : []), ...crewIds].slice(0, CONSUMER_MAX_ACCOUNTS);
  if (userIds.length === 0) {
    return { vesselId, asOfDate, fetchWindow, accounts: [], receivingCount: 0, usedThisFetchCount: fetchWindow ? 0 : null };
  }

  const crewList = userIds.filter((id) => id !== managerId);
  const [usersRes, leaveRes, lastSamplesRes, lastVesselSampleRes] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, username, email, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, ais_live_tracking_enabled',
      )
      .in('id', userIds),
    crewList.length
      ? supabaseAdmin
          .from('daily_state_logs')
          .select('user_id')
          .eq('vessel_id', vesselId)
          .eq('date', asOfDate)
          .eq('state', 'on-leave')
          .in('user_id', crewList)
      : Promise.resolve({ data: [], error: null }),
    crewList.length
      ? supabaseAdmin
          .from('crew_ais_state_samples')
          .select('user_id, sampled_at')
          .eq('vessel_id', vesselId)
          .in('user_id', crewList)
          .order('sampled_at', { ascending: false })
          .limit(Math.max(50, crewList.length * 5))
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from('vessel_ais_state_samples')
      .select('sampled_at')
      .eq('vessel_id', vesselId)
      .order('sampled_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (usersRes.error) fail('users lookup', usersRes.error);
  if (leaveRes.error) fail('leave lookup', leaveRes.error);
  if (lastSamplesRes.error) fail('last samples lookup', lastSamplesRes.error);
  if (lastVesselSampleRes.error) fail('last vessel sample lookup', lastVesselSampleRes.error);

  const onLeave = new Set(((leaveRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.user_id)));
  const lastSample = new Map<string, string>();
  for (const r of (lastSamplesRes.data ?? []) as Record<string, unknown>[]) {
    const id = String(r.user_id);
    if (!lastSample.has(id)) lastSample.set(id, String(r.sampled_at));
  }
  const users = new Map(((usersRes.data ?? []) as Record<string, unknown>[]).map((u) => [String(u.id), u]));

  const accounts: AisMonitorConsumer[] = [];
  for (const id of userIds) {
    const u = users.get(id);
    if (!u) continue;
    const base = {
      userId: id,
      name: displayName(u),
      email: str(u.email),
      role: str(u.role),
      subscriptionTier: str(u.subscription_tier),
    };

    if (id === managerId) {
      // The vessel sync writes the manager's daily logs whenever the vessel is polled,
      // whether polling is funded by the vessel plan or by Premium crew.
      const receiving = vesselPolled || vesselOptIn;
      accounts.push({
        ...base,
        relationship: 'vessel_manager',
        usage: vesselOptIn && hasVesselAisTrackingTier(u) ? 'vessel_plan' : 'vessel_daily_logs',
        receiving,
        reason: receiving ? null : 'Vessel is not being polled',
        usedThisFetch: fetchWindow ? receiving && vesselSampleInWindow : null,
        lastSampleAt: receiving ? str(lastVesselSampleRes.data?.sampled_at) : null,
      });
      continue;
    }

    const assigned = assignedIds.has(id);
    const trackingOn = u.ais_live_tracking_enabled === true;
    const tierOk = hasCrewAisLiveTrackingTier(u) && hasActiveSubscription(u);
    const leave = onLeave.has(id);
    const receiving = assigned && trackingOn && tierOk && !leave;
    const reason = receiving
      ? null
      : !assigned
        ? 'No longer assigned to this vessel'
        : !tierOk
          ? 'Plan does not include live AIS'
          : !trackingOn
            ? 'Live AIS tracking turned off'
            : 'On leave';
    accounts.push({
      ...base,
      relationship: assigned ? 'assigned_crew' : 'former_crew',
      usage: 'crew_live_tracking',
      receiving,
      reason,
      usedThisFetch: fetchWindow ? windowSamples.has(id) : null,
      lastSampleAt: lastSample.get(id) ?? null,
    });
  }

  accounts.sort(
    (a, b) =>
      Number(b.usedThisFetch ?? false) - Number(a.usedThisFetch ?? false) ||
      Number(b.receiving) - Number(a.receiving) ||
      Number(b.relationship === 'vessel_manager') - Number(a.relationship === 'vessel_manager') ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  );

  return {
    vesselId,
    asOfDate,
    fetchWindow,
    accounts,
    receivingCount: accounts.filter((a) => a.receiving).length,
    usedThisFetchCount: fetchWindow ? accounts.filter((a) => a.usedThisFetch).length : null,
  };
}

// ─── Vessel detail ──────────────────────────────────────────────────────────

export async function getAisMonitorVesselDetail(
  vesselId: string,
  range: AisMonitorRange,
): Promise<AisMonitorVesselDetail | null> {
  const identities = await loadVesselIdentities([vesselId]);
  const vessel = identities.get(vesselId);
  if (!vessel) return null;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const w = rangeWindow(range, nowMs);

  const [flagsRes, statusRes, today, last7d, timeseries, consumers] = await Promise.all([
    supabaseAdmin
      .from('vessels')
      .select('ais_provider_poll_enabled, ais_tracking_enabled')
      .eq('id', vesselId)
      .maybeSingle(),
    supabaseAdmin
      .from('vessel_ais_status')
      .select(
        'seajourney_state, ais_tracking_mode, next_ais_check_at, last_successful_fetch_at, last_state_change_at, state_stable_since, consecutive_fetch_failures, fetched_at, provider_timestamp, refresh_error',
      )
      .eq('vessel_id', vesselId)
      .maybeSingle(),
    getRequestStats(utcDayStart(nowMs), now, vesselId),
    getRequestStats(new Date(nowMs - 7 * 86_400_000).toISOString(), now, vesselId),
    getTimeseriesPoints(w.from, w.to, w.bucket, vesselId),
    getAisMonitorConsumers(vesselId),
  ]);
  if (flagsRes.error) fail('vessel flags', flagsRes.error);
  if (statusRes.error) fail('vessel AIS status', statusRes.error);

  const flags = (flagsRes.data ?? {}) as Record<string, unknown>;
  const s = statusRes.data as Record<string, unknown> | null;

  return {
    vessel,
    pollingEnabled: flags.ais_provider_poll_enabled === true,
    trackingOptIn: flags.ais_tracking_enabled === true,
    status: s
      ? {
          state: str(s.seajourney_state),
          trackingMode: str(s.ais_tracking_mode),
          nextAisCheckAt: str(s.next_ais_check_at),
          lastSuccessfulFetchAt: str(s.last_successful_fetch_at),
          lastStateChangeAt: str(s.last_state_change_at),
          stateStableSince: str(s.state_stable_since),
          consecutiveFetchFailures: num(s.consecutive_fetch_failures),
          fetchedAt: str(s.fetched_at),
          providerTimestamp: str(s.provider_timestamp),
          refreshError: sanitiseProviderError(str(s.refresh_error)),
        }
      : null,
    today,
    last7d,
    timeseries,
    consumers,
  };
}
