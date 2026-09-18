/**
 * Central AIS timing / calculation configuration.
 * Adaptive poll intervals live in adaptive-scheduler.ts — import from there
 * or via the re-exports below for backward compatibility.
 */

export {
  AIS_POLL_INTERVALS,
  AIS_STATE_STABILITY_MINUTES,
  AIS_FAILURE_RETRY_MINUTES,
  AIS_REFRESH_INTERVAL_UNDERWAY_MINUTES,
  AIS_REFRESH_INTERVAL_STATIONARY_MINUTES,
  AIS_REFRESH_INTERVAL_MINUTES,
  AIS_REFRESH_INTERVAL_UNDERWAY_MS,
  AIS_REFRESH_INTERVAL_STATIONARY_MS,
  AIS_REFRESH_INTERVAL_MS,
  AIS_CRON_INTERVAL_MINUTES,
  getAisPollingIntervalMinutes,
  getNextAisCheckAt,
  isVesselDueForProviderFetch,
  isAisCacheFresh,
  getAisRefreshIntervalMinutes,
  getAisRefreshIntervalMs,
  isInAisTransitionWindow,
  type AisTrackingMode,
  type AisScheduleResult,
} from '@/lib/ais/adaptive-scheduler';

/** How long a refresh lock is held while fetching from the provider. */
export const AIS_REFRESH_LOCK_TTL_SECONDS = 120;

/** Max time a concurrent caller waits for another refresh to finish. */
export const AIS_REFRESH_WAIT_MS = 8000;

export const AIS_REFRESH_POLL_MS = 400;

/** Provider position older than this is treated as stale for state updates. */
export const AIS_PROVIDER_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Daily duration aggregation version. Bump when rebuild-from-observations
 * semantics change so historical rows can be recalculated selectively.
 */
export const AIS_DAILY_CALCULATION_VERSION = 1;

/**
 * ≥4h underway within a calendar day qualifies the day as underway sea service.
 * Matches analyzeAisDailyState / MCA-style rule (14_400 seconds).
 */
export const UNDERWAY_DAILY_QUALIFICATION_SECONDS = 4 * 60 * 60;

/**
 * Max trusted gap between consecutive AIS observations for duration credit.
 * 4 hours — comfortably above moored/port 60-minute polling.
 */
export const MAX_AIS_INTERVAL_SECONDS = 4 * 60 * 60;

/** Cap implied speed when accumulating distance (GPS jump filter). */
export const MAX_AIS_DISTANCE_SPEED_KN = 40;

/** Cron due-vessel batch size (scalable for hundreds of tracked vessels). */
export const AIS_CRON_BATCH_SIZE = 75;

/** Max concurrent provider refreshes within a cron batch. */
export const AIS_CRON_CONCURRENCY = 5;

export function isUnderwayAisState(
  state: string | null | undefined,
): boolean {
  return state === 'underway';
}
