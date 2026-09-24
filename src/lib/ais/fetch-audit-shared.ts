/**
 * Shared (pure, isomorphic) types + helpers for AIS provider request auditing.
 * No server imports — safe for self-tests and client components.
 */

/** Why a provider request happened. Stored in ais_fetch_log.trigger_source. */
export type AisTriggerSource =
  /** Cron tick found the vessel due by next_ais_check_at. */
  | 'adaptive_scheduler'
  /** Cron tick for a vessel in failure backoff (consecutive_fetch_failures > 0). */
  | 'retry'
  /** Intentional refresh by a SeaJourney admin. */
  | 'manual_admin'
  /** Intentional refresh by a signed-in non-admin user (manager Sync, ?force=1, previews). */
  | 'manual_user'
  /** Crew enabled Premium live tracking. */
  | 'premium_enabled'
  /** Entitlement recompute caused an immediate fetch. */
  | 'entitlement_refresh'
  /** Detected state change caused an immediate fetch. */
  | 'state_change'
  /** Vessel manager turned AIS tracking on. */
  | 'initial_tracking_start'
  /** Historical track import / passage map backfill (/vessel_history). */
  | 'history_import'
  /** Vessel registration lookup (/vessel_info, /vessel_find). */
  | 'vessel_lookup'
  | 'unknown';

export const AIS_TRIGGER_SOURCES: readonly AisTriggerSource[] = [
  'adaptive_scheduler',
  'retry',
  'manual_admin',
  'manual_user',
  'premium_enabled',
  'entitlement_refresh',
  'state_change',
  'initial_tracking_start',
  'history_import',
  'vessel_lookup',
  'unknown',
] as const;

export const AIS_TRIGGER_LABELS: Record<AisTriggerSource, string> = {
  adaptive_scheduler: 'Scheduler',
  retry: 'Retry',
  manual_admin: 'Manual (admin)',
  manual_user: 'Manual (user)',
  premium_enabled: 'Premium enabled',
  entitlement_refresh: 'Entitlement refresh',
  state_change: 'State change',
  initial_tracking_start: 'Tracking started',
  history_import: 'History import',
  vessel_lookup: 'Vessel lookup',
  unknown: 'Unknown',
};

/** Triggers representing an intentional human action (duplicates are expected). */
export const AIS_MANUAL_TRIGGERS: readonly AisTriggerSource[] = [
  'manual_admin',
  'manual_user',
  'initial_tracking_start',
  'premium_enabled',
];

export type AisProviderEndpoint = 'vessel' | 'vessel_history' | 'vessel_info' | 'vessel_find';

export function isAisTriggerSource(value: unknown): value is AisTriggerSource {
  return typeof value === 'string' && (AIS_TRIGGER_SOURCES as readonly string[]).includes(value);
}

/**
 * Map a trigger string (typed or legacy) to AisTriggerSource.
 * Legacy strings are only mapped when unambiguous — never guess.
 */
export function normalizeAisTriggerSource(raw: string | null | undefined): AisTriggerSource {
  if (!raw) return 'unknown';
  if (isAisTriggerSource(raw)) return raw;
  if (raw.startsWith('vessel-sync:cron')) return 'adaptive_scheduler';
  if (raw.startsWith('api:force')) return 'manual_user';
  if (raw.startsWith('crew-enable')) return 'premium_enabled';
  return 'unknown';
}

const MAX_ERROR_LENGTH = 500;

/**
 * Strip credentials / URLs from a provider error before it is persisted.
 * Datalastic authenticates via the `api-key` query parameter, so any URL is suspect.
 */
export function sanitiseProviderError(message: string | null | undefined): string | null {
  if (!message) return null;
  let out = String(message);
  out = out.replace(/(api[-_]?key|apikey|token|secret|authorization)\s*[=:]\s*[^\s&"',]+/gi, '$1=[redacted]');
  out = out.replace(/https?:\/\/[^\s"']+/gi, (url) => {
    const q = url.indexOf('?');
    return q === -1 ? url : `${url.slice(0, q)}?[redacted]`;
  });
  const envKey = typeof process !== 'undefined' ? process.env?.DATALASTIC_API_KEY : undefined;
  if (envKey && envKey.length >= 8) out = out.split(envKey).join('[redacted]');
  out = out.replace(/\s+/g, ' ').trim();
  return out.length > MAX_ERROR_LENGTH ? `${out.slice(0, MAX_ERROR_LENGTH - 1)}…` : out;
}

export function normalizeMmsiForLog(mmsi: string | null | undefined): string | null {
  if (!mmsi) return null;
  const digits = String(mmsi).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** Timing/outcome of one provider HTTP request (no payload, no URL). */
export type AisProviderRequestMeta = {
  endpoint: AisProviderEndpoint;
  requestedAt: string;
  completedAt: string;
  responseTimeMs: number;
  /** HTTP status, or null when no response was received (network error). */
  httpStatus: number | null;
  success: boolean;
  errorMessage: string | null;
  mmsi: string | null;
  /** Credits reported by provider; null = unknown. */
  providerCreditsUsed: number | null;
};

/** Context describing why a provider request is being made. */
export type AisRequestAuditContext = {
  vesselId?: string | null;
  triggerSource: AisTriggerSource;
  /** Call-site detail, e.g. route name. Never include secrets. */
  triggerDetail?: string | null;
  trackingMode?: string | null;
  scheduledReason?: string | null;
  /**
   * When provided, the HTTP layer hands request meta to the caller instead of
   * writing ais_fetch_log itself (used by refreshVesselAIS, which logs one
   * enriched row). The caller MUST then record the request.
   */
  onRequestComplete?: (meta: AisProviderRequestMeta) => void;
};

/** A persisted provider request row (ais_fetch_log, api rows). */
export type AisFetchResult = {
  id: string;
  vesselId: string | null;
  provider: string;
  endpoint: AisProviderEndpoint | null;
  mmsi: string | null;
  requestedAt: string;
  completedAt: string | null;
  success: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  providerCreditsUsed: number | null;
  triggerSource: AisTriggerSource;
  triggerDetail: string | null;
  trackingMode: string | null;
  scheduledReason: string | null;
  providerCalled: boolean;
};
