/**
 * DTOs for the admin AIS API Monitor (/admin/ais-monitor).
 * Pure types — shared by admin API routes and the dashboard UI.
 */

import type {
  AisFetchResult,
  AisProviderEndpoint,
  AisTriggerSource,
} from '@/lib/ais/fetch-audit-shared';

export type AisMonitorRange = '24h' | '7d' | '30d';

export type AisMonitorLogFilter = 'all' | 'success' | 'failed' | 'scheduler' | 'manual' | 'retry';

export type AisMonitorRequestStats = {
  total: number;
  succeeded: number;
  failed: number;
  /** 0–100, null when total = 0. */
  successRate: number | null;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
  rateLimited: number;
  authFailed: number;
  serverErrors: number;
  networkErrors: number;
  distinctVessels: number;
  lastRequestAt: string | null;
  lastSuccessAt: string | null;
};

export type AisMonitorTrackingModeCounts = {
  fast: number;
  normal: number;
  slow: number;
  transition: number;
  failure_retry: number;
};

export type AisMonitorSchedulerHealth = {
  /** Vessels with MMSI/IMO opted in via vessel plan flag or cached entitlement. */
  eligible: number;
  /** vessels.ais_provider_poll_enabled — what the cron actually polls. */
  enabled: number;
  enabledNeverScheduled: number;
  due: number;
  overdue: number;
  farOverdue: number;
  failing: number;
  failing5Plus: number;
  modes: AisMonitorTrackingModeCounts;
  /** Approximation: latest provider request with trigger adaptive_scheduler / retry. */
  lastSchedulerRequestAt: string | null;
  thresholds: { overdueMinutes: number; farOverdueMinutes: number };
};

export type AisMonitorAlertSeverity = 'critical' | 'warning' | 'info';

export type AisMonitorAlertId =
  | 'consecutive_failures'
  | 'rate_limited'
  | 'auth_failed'
  | 'high_failure_rate'
  | 'no_recent_success'
  | 'scheduler_stalled'
  | 'far_overdue';

export type AisMonitorAlert = {
  id: AisMonitorAlertId;
  severity: AisMonitorAlertSeverity;
  title: string;
  message: string;
  /** Stable key so a future notifier can de-duplicate deliveries. */
  dedupeKey: string;
  metric: number | null;
};

export type AisMonitorSavings = {
  /** Always an approximation — there is no entitlement history table. */
  approximate: true;
  basis: string;
  windowDays: number;
  fixedIntervalMinutes: number;
  trackedVesselDays: number;
  fixedIntervalRequests: number;
  actualRequests: number;
  avoidedRequests: number;
  /** Whole percent, null when there is no baseline. */
  savingsPercent: number | null;
};

export type AisMonitorTriggerBreakdownRow = {
  triggerSource: AisTriggerSource;
  endpoint: AisProviderEndpoint;
  total: number;
  failed: number;
};

export type AisMonitorHealthStatus = 'healthy' | 'degraded' | 'down' | 'idle';

export type AisMonitorSummary = {
  generatedAt: string;
  health: AisMonitorHealthStatus;
  today: AisMonitorRequestStats;
  last1h: AisMonitorRequestStats;
  last24h: AisMonitorRequestStats;
  month: AisMonitorRequestStats;
  scheduler: AisMonitorSchedulerHealth;
  alerts: AisMonitorAlert[];
  savings: AisMonitorSavings;
  triggers24h: AisMonitorTriggerBreakdownRow[];
  cost: { available: false; reason: string };
};

export type AisMonitorTimeseriesPoint = {
  bucketStart: string;
  total: number;
  succeeded: number;
  failed: number;
  avgResponseMs: number | null;
};

export type AisMonitorTimeseries = {
  range: AisMonitorRange;
  bucket: 'hour' | 'day';
  from: string;
  to: string;
  vesselId: string | null;
  points: AisMonitorTimeseriesPoint[];
};

/** Public vessel identity only (vessels_public_identity). */
export type AisMonitorVesselIdentity = {
  id: string;
  name: string | null;
  mmsi: string | null;
  imo: string | null;
  flag: string | null;
  type: string | null;
};

export type AisMonitorTopVessel = {
  vesselId: string | null;
  vessel: AisMonitorVesselIdentity | null;
  total: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  avgResponseMs: number | null;
  lastRequestAt: string | null;
  lastSuccessAt: string | null;
};

export type AisMonitorAttentionReason = 'far_overdue' | 'failing' | 'rapid_refetch';

export type AisMonitorAttentionVessel = {
  vesselId: string;
  vessel: AisMonitorVesselIdentity | null;
  reason: AisMonitorAttentionReason;
  nextAisCheckAt: string | null;
  consecutiveFetchFailures: number;
  trackingMode: string | null;
  lastSuccessfulFetchAt: string | null;
  requestsInWindow: number | null;
};

export type AisMonitorDuplicate = {
  fetchId: string;
  previousFetchId: string | null;
  vesselId: string;
  vessel: AisMonitorVesselIdentity | null;
  requestedAt: string;
  previousRequestedAt: string;
  secondsApart: number;
  triggerSource: AisTriggerSource;
  previousTriggerSource: AisTriggerSource;
  likelyLegitimate: boolean;
};

export type AisMonitorVesselsResponse = {
  range: AisMonitorRange;
  from: string;
  to: string;
  topConsumers: AisMonitorTopVessel[];
  attention: AisMonitorAttentionVessel[];
  duplicates: AisMonitorDuplicate[];
  thresholds: {
    duplicateWindowSeconds: number;
    rapidWindowMinutes: number;
    rapidThreshold: number;
    farOverdueMinutes: number;
  };
};

export type AisMonitorFetchRow = AisFetchResult & {
  vessel: Pick<AisMonitorVesselIdentity, 'id' | 'name'> | null;
};

export type AisMonitorFetchPage = {
  rows: AisMonitorFetchRow[];
  total: number;
  page: number;
  pageSize: number;
  from: string;
  to: string;
};

export type AisMonitorObservation = {
  id: string;
  fetchedAt: string;
  providerTimestamp: string | null;
  state: string | null;
  speedKn: number | null;
  course: number | null;
  heading: number | null;
  latitude: number | null;
  longitude: number | null;
  rawNavigationStatus: string | null;
};

export type AisMonitorFetchDetail = {
  fetch: AisMonitorFetchRow;
  vessel: AisMonitorVesselIdentity | null;
  observation: AisMonitorObservation | null;
};

export type AisMonitorVesselStatus = {
  state: string | null;
  trackingMode: string | null;
  nextAisCheckAt: string | null;
  lastSuccessfulFetchAt: string | null;
  lastStateChangeAt: string | null;
  stateStableSince: string | null;
  consecutiveFetchFailures: number;
  fetchedAt: string | null;
  providerTimestamp: string | null;
  refreshError: string | null;
};

export type AisMonitorVesselDetail = {
  vessel: AisMonitorVesselIdentity;
  pollingEnabled: boolean;
  trackingOptIn: boolean;
  status: AisMonitorVesselStatus | null;
  today: AisMonitorRequestStats;
  last7d: AisMonitorRequestStats;
  timeseries: AisMonitorTimeseriesPoint[];
};
