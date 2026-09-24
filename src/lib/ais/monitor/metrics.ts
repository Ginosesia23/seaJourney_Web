/**
 * Pure calculations for the admin AIS Monitor (alerts, health, savings,
 * duplicate classification, time windows). No I/O — unit-testable.
 */

import {
  AIS_MANUAL_TRIGGERS,
  type AisTriggerSource,
} from '@/lib/ais/fetch-audit-shared';
import { AIS_POLL_INTERVALS } from '@/lib/ais/adaptive-scheduler';
import type {
  AisMonitorAlert,
  AisMonitorHealthStatus,
  AisMonitorLogFilter,
  AisMonitorRange,
  AisMonitorRequestStats,
  AisMonitorSavings,
  AisMonitorSchedulerHealth,
} from '@/lib/ais/monitor/types';

/** Fixed-schedule baseline: one live-position pull every 5 minutes = 288/day. */
export const AIS_FIXED_BASELINE_INTERVAL_MINUTES = 5;
export const AIS_FIXED_BASELINE_PULLS_PER_DAY = (24 * 60) / AIS_FIXED_BASELINE_INTERVAL_MINUTES;

export const AIS_MONITOR_THRESHOLDS = {
  /** Scheduler health. */
  overdueMinutes: 15,
  farOverdueMinutes: 60,
  /** Fastest adaptive interval is 5 min (12/hour); >15/hour means extra pulls. */
  rapidWindowMinutes: 60,
  rapidThreshold: 15,
  /** Duplicate detection window for live-position pulls. */
  duplicateWindowSeconds: 60,
  /** Alerts. */
  consecutiveFailures: 5,
  failureRatePercent: 10,
  failureRateCriticalPercent: 50,
  failureRateMinSample1h: 10,
  failureRateMinSample24h: 20,
  /** Slowest adaptive interval is 60 min — allow 1.5× before alarming. */
  noSuccessMinutes: Math.round(AIS_POLL_INTERVALS.moored * 1.5),
  /** Cron ticks every 5 min; no scheduler pull for 30 min while vessels are due = stalled. */
  schedulerStallMinutes: 30,
} as const;

export const AIS_MONITOR_MAX_LOG_WINDOW_DAYS = 90;
export const AIS_MONITOR_MAX_PAGE_SIZE = 100;

export function successRatePercent(succeeded: number, total: number): number | null {
  if (!total) return null;
  return Math.round((succeeded / total) * 1000) / 10;
}

export function emptyRequestStats(): AisMonitorRequestStats {
  return {
    total: 0,
    succeeded: 0,
    failed: 0,
    successRate: null,
    avgResponseMs: null,
    p95ResponseMs: null,
    rateLimited: 0,
    authFailed: 0,
    serverErrors: 0,
    networkErrors: 0,
    distinctVessels: 0,
    lastRequestAt: null,
    lastSuccessAt: null,
  };
}

function minutesSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 60_000;
}

export type AisMonitorAlertInput = {
  last1h: AisMonitorRequestStats;
  last24h: AisMonitorRequestStats;
  scheduler: AisMonitorSchedulerHealth;
  nowMs?: number;
};

/**
 * Derive current alert conditions. Structured (id, severity, dedupeKey) so a
 * future notifier (email/push/Slack) can consume the same list.
 */
export function computeAisMonitorAlerts(input: AisMonitorAlertInput): AisMonitorAlert[] {
  const t = AIS_MONITOR_THRESHOLDS;
  const nowMs = input.nowMs ?? Date.now();
  const { last1h, last24h, scheduler } = input;
  const alerts: AisMonitorAlert[] = [];

  if (scheduler.failing5Plus > 0) {
    alerts.push({
      id: 'consecutive_failures',
      severity: 'warning',
      title: `${t.consecutiveFailures}+ consecutive failures`,
      message: `${scheduler.failing5Plus} vessel(s) have failed ${t.consecutiveFailures} or more provider fetches in a row.`,
      dedupeKey: 'ais:consecutive_failures',
      metric: scheduler.failing5Plus,
    });
  }

  if (last1h.rateLimited > 0 || last24h.rateLimited > 0) {
    const recent = last1h.rateLimited > 0;
    alerts.push({
      id: 'rate_limited',
      severity: recent ? 'critical' : 'warning',
      title: 'Provider rate limiting (HTTP 429)',
      message: recent
        ? `${last1h.rateLimited} request(s) were rate limited in the last hour.`
        : `${last24h.rateLimited} request(s) were rate limited in the last 24 hours.`,
      dedupeKey: 'ais:rate_limited',
      metric: recent ? last1h.rateLimited : last24h.rateLimited,
    });
  }

  if (last24h.authFailed > 0) {
    alerts.push({
      id: 'auth_failed',
      severity: 'critical',
      title: 'Provider authentication failures (401/403)',
      message: `${last24h.authFailed} request(s) were rejected as unauthorised in the last 24 hours. Check the provider API key and plan.`,
      dedupeKey: 'ais:auth_failed',
      metric: last24h.authFailed,
    });
  }

  const rate1h = last1h.total >= t.failureRateMinSample1h ? (last1h.failed / last1h.total) * 100 : null;
  const rate24h =
    last24h.total >= t.failureRateMinSample24h ? (last24h.failed / last24h.total) * 100 : null;
  const failRate = rate1h ?? rate24h;
  if (failRate != null && failRate > t.failureRatePercent) {
    alerts.push({
      id: 'high_failure_rate',
      severity: failRate > t.failureRateCriticalPercent ? 'critical' : 'warning',
      title: `Failure rate above ${t.failureRatePercent}%`,
      message: `${Math.round(failRate)}% of provider requests failed in the last ${rate1h != null ? 'hour' : '24 hours'}.`,
      dedupeKey: 'ais:high_failure_rate',
      metric: Math.round(failRate),
    });
  }

  if (scheduler.enabled > 0) {
    const sinceSuccess = minutesSince(last24h.lastSuccessAt, nowMs);
    if (sinceSuccess == null || sinceSuccess > t.noSuccessMinutes) {
      alerts.push({
        id: 'no_recent_success',
        severity: 'critical',
        title: 'No successful provider requests',
        message:
          sinceSuccess == null
            ? `No successful AIS provider request in the last 24 hours while ${scheduler.enabled} vessel(s) are enabled.`
            : `Last successful provider request was ${Math.round(sinceSuccess)} minutes ago (threshold ${t.noSuccessMinutes}).`,
        dedupeKey: 'ais:no_recent_success',
        metric: sinceSuccess == null ? null : Math.round(sinceSuccess),
      });
    }

    const sinceScheduler = minutesSince(scheduler.lastSchedulerRequestAt, nowMs);
    if (scheduler.due > 0 && (sinceScheduler == null || sinceScheduler > t.schedulerStallMinutes)) {
      alerts.push({
        id: 'scheduler_stalled',
        severity: 'critical',
        title: 'Scheduler may be stalled',
        message: `${scheduler.due} vessel(s) are due but no scheduler request has been logged for ${
          sinceScheduler == null ? 'over 7 days' : `${Math.round(sinceScheduler)} minutes`
        }. Check the /api/ais/cron job.`,
        dedupeKey: 'ais:scheduler_stalled',
        metric: sinceScheduler == null ? null : Math.round(sinceScheduler),
      });
    }
  }

  if (scheduler.farOverdue > 0) {
    alerts.push({
      id: 'far_overdue',
      severity: 'warning',
      title: 'Vessels far past next check',
      message: `${scheduler.farOverdue} vessel(s) are more than ${scheduler.thresholds.farOverdueMinutes} minutes past next_ais_check_at.`,
      dedupeKey: 'ais:far_overdue',
      metric: scheduler.farOverdue,
    });
  }

  return alerts;
}

export function computeAisMonitorHealth(opts: {
  alerts: AisMonitorAlert[];
  last24h: AisMonitorRequestStats;
  scheduler: AisMonitorSchedulerHealth;
}): AisMonitorHealthStatus {
  if (opts.scheduler.enabled === 0 && opts.last24h.total === 0) return 'idle';
  if (
    opts.alerts.some(
      (a) =>
        a.severity === 'critical' &&
        (a.id === 'no_recent_success' || a.id === 'auth_failed' || a.id === 'scheduler_stalled'),
    )
  ) {
    return 'down';
  }
  if (opts.alerts.some((a) => a.severity === 'critical' || a.severity === 'warning')) {
    return 'degraded';
  }
  return 'healthy';
}

/**
 * Savings vs a fixed 5-minute schedule. trackedVesselDays is approximated from
 * (vessel, UTC day) pairs with ≥1 live-position request — no entitlement history.
 */
export function computeAdaptiveSavings(opts: {
  trackedVesselDays: number;
  actualRequests: number;
  windowDays: number;
}): AisMonitorSavings {
  const tracked = Math.max(0, opts.trackedVesselDays);
  const fixed = Math.round(tracked * AIS_FIXED_BASELINE_PULLS_PER_DAY);
  const actual = Math.max(0, Math.round(opts.actualRequests));
  const avoided = Math.max(0, fixed - actual);
  return {
    approximate: true,
    basis:
      'Estimated: tracked vessel-days are inferred from days with at least one live-position request (no entitlement history is stored).',
    windowDays: opts.windowDays,
    fixedIntervalMinutes: AIS_FIXED_BASELINE_INTERVAL_MINUTES,
    trackedVesselDays: Math.round(tracked * 10) / 10,
    fixedIntervalRequests: fixed,
    actualRequests: actual,
    avoidedRequests: avoided,
    savingsPercent: fixed > 0 ? Math.round((avoided / fixed) * 100) : null,
  };
}

/** A near-duplicate is expected when a human action or a failure precedes it. */
export function isLikelyLegitimateDuplicate(opts: {
  triggerSource: AisTriggerSource;
  previousTriggerSource: AisTriggerSource;
  previousSuccess: boolean | null;
}): boolean {
  return (
    AIS_MANUAL_TRIGGERS.includes(opts.triggerSource) ||
    AIS_MANUAL_TRIGGERS.includes(opts.previousTriggerSource) ||
    opts.previousSuccess === false
  );
}

export function isAisMonitorRange(value: unknown): value is AisMonitorRange {
  return value === '24h' || value === '7d' || value === '30d';
}

export function isAisMonitorLogFilter(value: unknown): value is AisMonitorLogFilter {
  return (
    value === 'all' ||
    value === 'success' ||
    value === 'failed' ||
    value === 'scheduler' ||
    value === 'manual' ||
    value === 'retry'
  );
}

export function rangeWindow(
  range: AisMonitorRange,
  nowMs: number = Date.now(),
): { from: string; to: string; bucket: 'hour' | 'day'; days: number } {
  const to = new Date(nowMs);
  if (range === '24h') {
    return {
      from: new Date(nowMs - 24 * 3_600_000).toISOString(),
      to: to.toISOString(),
      bucket: 'hour',
      days: 1,
    };
  }
  const days = range === '7d' ? 7 : 30;
  const startOfToday = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return {
    from: new Date(startOfToday - (days - 1) * 86_400_000).toISOString(),
    to: to.toISOString(),
    bucket: 'day',
    days,
  };
}

export function utcDayStart(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export function utcMonthStart(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Clamp a user-supplied [from, to) window to at most AIS_MONITOR_MAX_LOG_WINDOW_DAYS. */
export function clampLogWindow(
  fromRaw: string | null,
  toRaw: string | null,
  nowMs: number = Date.now(),
): { from: string; to: string } {
  const toMs = toRaw && Number.isFinite(Date.parse(toRaw)) ? Math.min(Date.parse(toRaw), nowMs + 60_000) : nowMs + 60_000;
  const defaultFrom = toMs - 7 * 86_400_000;
  let fromMs = fromRaw && Number.isFinite(Date.parse(fromRaw)) ? Date.parse(fromRaw) : defaultFrom;
  const minFrom = toMs - AIS_MONITOR_MAX_LOG_WINDOW_DAYS * 86_400_000;
  if (fromMs < minFrom) fromMs = minFrom;
  if (fromMs >= toMs) fromMs = toMs - 86_400_000;
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

/** Log filter → trigger_source / success constraints. */
export function logFilterConstraints(filter: AisMonitorLogFilter): {
  success?: boolean;
  triggers?: AisTriggerSource[];
} {
  switch (filter) {
    case 'success':
      return { success: true };
    case 'failed':
      return { success: false };
    case 'scheduler':
      return { triggers: ['adaptive_scheduler', 'retry'] };
    case 'manual':
      return { triggers: ['manual_admin', 'manual_user'] };
    case 'retry':
      return { triggers: ['retry'] };
    default:
      return {};
  }
}
