/**
 * Central AIS timing configuration.
 * Do not hard-code refresh intervals elsewhere — import from here.
 *
 * Adaptive freshness:
 *   • Underway  → poll frequently so tracks / sea-service stay accurate
 *   • Stationary → poll less often to save AIS API cost
 */

import type { DailyStatus } from '@/lib/types';

/** Refresh while the vessel is classified as underway. */
export const AIS_REFRESH_INTERVAL_UNDERWAY_MINUTES = 5;

/**
 * Refresh while moored / at anchor / in yard / unknown.
 * Within the product range of ~30–60 minutes.
 */
export const AIS_REFRESH_INTERVAL_STATIONARY_MINUTES = 45;

/** @deprecated Prefer getAisRefreshIntervalMinutes(state). Alias of stationary. */
export const AIS_REFRESH_INTERVAL_MINUTES = AIS_REFRESH_INTERVAL_STATIONARY_MINUTES;

export const AIS_REFRESH_INTERVAL_UNDERWAY_MS =
  AIS_REFRESH_INTERVAL_UNDERWAY_MINUTES * 60 * 1000;

export const AIS_REFRESH_INTERVAL_STATIONARY_MS =
  AIS_REFRESH_INTERVAL_STATIONARY_MINUTES * 60 * 1000;

/** @deprecated Prefer getAisRefreshIntervalMs(state). */
export const AIS_REFRESH_INTERVAL_MS = AIS_REFRESH_INTERVAL_STATIONARY_MS;

/**
 * Cron runs at the shortest interval so underway vessels can be refreshed
 * promptly. Stationary vessels are skipped inside the AIS service when fresh.
 */
export const AIS_CRON_INTERVAL_MINUTES = AIS_REFRESH_INTERVAL_UNDERWAY_MINUTES;

/** How long a refresh lock is held while fetching from the provider. */
export const AIS_REFRESH_LOCK_TTL_SECONDS = 120;

/** Max time a concurrent caller waits for another refresh to finish. */
export const AIS_REFRESH_WAIT_MS = 8000;

export const AIS_REFRESH_POLL_MS = 400;

/** Provider position older than this is treated as stale for state updates. */
export const AIS_PROVIDER_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function isUnderwayAisState(
  state: DailyStatus | string | null | undefined,
): boolean {
  return state === 'underway';
}

/** Freshness window (minutes) based on last known SeaJourney AIS state. */
export function getAisRefreshIntervalMinutes(
  state: DailyStatus | string | null | undefined,
): number {
  return isUnderwayAisState(state)
    ? AIS_REFRESH_INTERVAL_UNDERWAY_MINUTES
    : AIS_REFRESH_INTERVAL_STATIONARY_MINUTES;
}

/** Freshness window (ms) based on last known SeaJourney AIS state. */
export function getAisRefreshIntervalMs(
  state: DailyStatus | string | null | undefined,
): number {
  return getAisRefreshIntervalMinutes(state) * 60 * 1000;
}

/**
 * Whether a cached AIS row is still within its adaptive freshness window.
 * Missing / invalid timestamps are treated as not fresh.
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
