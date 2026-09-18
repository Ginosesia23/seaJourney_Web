/**
 * Adaptive vessel-level AIS polling intervals and next-check scheduling.
 *
 * Polling is based on LIVE vessel AIS state (vessel_ais_status), NOT
 * qualifying_daily_state and NOT crew leave/onboard status.
 *
 * Crew on-leave never belongs here — leave only gates crew sea-service
 * credit in sync-crew-state-from-ais.
 *
 * Cron ticks every 5 minutes but only fetches vessels where
 * next_ais_check_at IS NULL OR next_ais_check_at <= now().
 */

import type { DailyStatus } from '@/lib/types';

/** Configurable provider poll intervals (minutes). */
export const AIS_POLL_INTERVALS = {
  underway: 5,
  transition: 5,
  unknown: 5,
  anchor: 30,
  moored: 60,
  port: 60,
  /** in-yard treated like moored for polling cost. */
  yard: 60,
} as const;

/** Keep fast polling this long after leaving underway before slowing down. */
export const AIS_STATE_STABILITY_MINUTES = 20;

/** Failure retry backoff (minutes), capped. */
export const AIS_FAILURE_RETRY_MINUTES = [5, 10, 30] as const;

export type AisTrackingMode =
  | 'fast'
  | 'normal'
  | 'slow'
  | 'transition'
  | 'failure_retry';

export type AisScheduleInput = {
  /** Latest live SeaJourney state from AIS. */
  currentState: DailyStatus | string | null | undefined;
  /** When currentState first became continuous (ISO). */
  stateStableSince?: string | null;
  /** Previous live state before this observation (for transition detection). */
  previousState?: DailyStatus | string | null;
  /** Consecutive provider failures (0 after success). */
  consecutiveFetchFailures?: number;
  nowMs?: number;
};

export type AisScheduleResult = {
  intervalMinutes: number;
  nextAisCheckAt: string;
  trackingMode: AisTrackingMode;
  scheduledReason: string;
};

function isStationary(state: string | null | undefined): boolean {
  // Vessel AIS states only — never crew leave (on-leave is not a vessel state).
  return (
    state === 'at-anchor' ||
    state === 'in-port' ||
    state === 'in-yard' ||
    state === 'moored'
  );
}

function isUnderwayLike(state: string | null | undefined): boolean {
  return state === 'underway';
}

/**
 * True while we should stay on fast polling after a recent state change
 * into a stationary state (underway → anchor/port noise protection).
 *
 * Uses state_stable_since — the clock resets whenever live state changes —
 * so successive anchor observations still stay fast until the window elapses.
 */
export function isInAisTransitionWindow(opts: {
  currentState: string | null | undefined;
  previousState?: string | null;
  stateStableSince?: string | null;
  nowMs?: number;
}): boolean {
  const nowMs = opts.nowMs ?? Date.now();
  const { currentState, stateStableSince } = opts;

  if (!currentState || currentState === 'underway') return false;
  if (!isStationary(currentState)) return false;

  if (!stateStableSince) {
    // No stability clock yet — keep fast until one is established.
    return true;
  }

  const stableMs = Date.parse(stateStableSince);
  if (!Number.isFinite(stableMs)) return true;

  return (nowMs - stableMs) / 60_000 < AIS_STATE_STABILITY_MINUTES;
}

/** Minutes until next provider fetch for this live state / failure count. */
export function getAisPollingIntervalMinutes(opts: AisScheduleInput): {
  intervalMinutes: number;
  trackingMode: AisTrackingMode;
  scheduledReason: string;
} {
  const failures = opts.consecutiveFetchFailures ?? 0;
  if (failures > 0) {
    const idx = Math.min(failures, AIS_FAILURE_RETRY_MINUTES.length) - 1;
    const intervalMinutes = AIS_FAILURE_RETRY_MINUTES[Math.max(0, idx)]!;
    return {
      intervalMinutes,
      trackingMode: 'failure_retry',
      scheduledReason: `failure_retry_${failures}`,
    };
  }

  const state = opts.currentState ?? null;

  if (isUnderwayLike(state)) {
    return {
      intervalMinutes: AIS_POLL_INTERVALS.underway,
      trackingMode: 'fast',
      scheduledReason: 'underway_fast',
    };
  }

  if (
    isInAisTransitionWindow({
      currentState: state,
      previousState: opts.previousState,
      stateStableSince: opts.stateStableSince,
      nowMs: opts.nowMs,
    })
  ) {
    return {
      intervalMinutes: AIS_POLL_INTERVALS.transition,
      trackingMode: 'transition',
      scheduledReason: 'transition_fast',
    };
  }

  if (state === 'at-anchor') {
    return {
      intervalMinutes: AIS_POLL_INTERVALS.anchor,
      trackingMode: 'normal',
      scheduledReason: 'anchor_normal',
    };
  }

  if (state === 'in-port') {
    return {
      intervalMinutes: AIS_POLL_INTERVALS.moored,
      trackingMode: 'slow',
      scheduledReason: 'moored_slow',
    };
  }

  if (state === 'in-yard') {
    return {
      intervalMinutes: AIS_POLL_INTERVALS.yard,
      trackingMode: 'slow',
      scheduledReason: 'yard_slow',
    };
  }

  // Unrecognised / missing vessel live state → poll frequently until known.
  // Intentionally does NOT special-case crew statuses (e.g. on-leave).
  return {
    intervalMinutes: AIS_POLL_INTERVALS.unknown,
    trackingMode: 'fast',
    scheduledReason: 'unknown_fast',
  };
}

export function getNextAisCheckAt(
  opts: AisScheduleInput,
): AisScheduleResult {
  const nowMs = opts.nowMs ?? Date.now();
  const { intervalMinutes, trackingMode, scheduledReason } =
    getAisPollingIntervalMinutes({ ...opts, nowMs });
  return {
    intervalMinutes,
    trackingMode,
    scheduledReason,
    nextAisCheckAt: new Date(nowMs + intervalMinutes * 60_000).toISOString(),
  };
}

/**
 * Whether the provider may be called now according to the adaptive schedule.
 * NULL next_ais_check_at ⇒ due (new vessel / never scheduled).
 */
export function isVesselDueForProviderFetch(
  nextAisCheckAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (nextAisCheckAt == null || nextAisCheckAt === '') return true;
  const t = Date.parse(nextAisCheckAt);
  if (!Number.isFinite(t)) return true;
  return t <= nowMs;
}

/** Update stability clocks when a new live state is observed. */
export function nextStabilityTimestamps(opts: {
  previousState: DailyStatus | string | null | undefined;
  newState: DailyStatus | string;
  previousStableSince?: string | null;
  previousChangeAt?: string | null;
  nowIso?: string;
}): { lastStateChangeAt: string; stateStableSince: string } {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  if (opts.previousState !== opts.newState) {
    return {
      lastStateChangeAt: nowIso,
      stateStableSince: nowIso,
    };
  }
  return {
    lastStateChangeAt: opts.previousChangeAt ?? nowIso,
    stateStableSince: opts.previousStableSince ?? nowIso,
  };
}

// ─── Backward-compatible aliases (older 5/45 freshness helpers) ─────────────

/** @deprecated Use AIS_POLL_INTERVALS.underway */
export const AIS_REFRESH_INTERVAL_UNDERWAY_MINUTES = AIS_POLL_INTERVALS.underway;
/** @deprecated Use AIS_POLL_INTERVALS.anchor as typical stationary */
export const AIS_REFRESH_INTERVAL_STATIONARY_MINUTES = AIS_POLL_INTERVALS.anchor;
/** @deprecated */
export const AIS_REFRESH_INTERVAL_MINUTES = AIS_POLL_INTERVALS.anchor;
export const AIS_REFRESH_INTERVAL_UNDERWAY_MS =
  AIS_POLL_INTERVALS.underway * 60 * 1000;
export const AIS_REFRESH_INTERVAL_STATIONARY_MS =
  AIS_POLL_INTERVALS.anchor * 60 * 1000;
/** @deprecated */
export const AIS_REFRESH_INTERVAL_MS = AIS_REFRESH_INTERVAL_STATIONARY_MS;
export const AIS_CRON_INTERVAL_MINUTES = AIS_POLL_INTERVALS.underway;

export function getAisRefreshIntervalMinutes(
  state: DailyStatus | string | null | undefined,
): number {
  return getAisPollingIntervalMinutes({ currentState: state }).intervalMinutes;
}

export function getAisRefreshIntervalMs(
  state: DailyStatus | string | null | undefined,
): number {
  return getAisRefreshIntervalMinutes(state) * 60 * 1000;
}

/**
 * @deprecated Prefer isVesselDueForProviderFetch(next_ais_check_at).
 * Kept for UI display hints only.
 */
export function isAisCacheFresh(
  fetchedAt: string | null | undefined,
  state: DailyStatus | string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!fetchedAt) return false;
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < getAisRefreshIntervalMs(state);
}
