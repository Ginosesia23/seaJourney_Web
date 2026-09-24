/**
 * Server-only writer for AIS provider request audit rows (ais_fetch_log).
 *
 * Every real provider HTTP request produces exactly one row with
 * cached_or_api = 'api'. Rows never contain request URLs (the Datalastic
 * api-key is a query parameter), API keys or raw provider payloads.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  normalizeMmsiForLog,
  sanitiseProviderError,
  type AisProviderEndpoint,
  type AisProviderRequestMeta,
  type AisTriggerSource,
} from '@/lib/ais/fetch-audit-shared';

export type RecordAisProviderRequestInput = {
  provider?: string;
  vesselId?: string | null;
  triggerSource: AisTriggerSource;
  triggerDetail?: string | null;
  trackingMode?: string | null;
  scheduledReason?: string | null;
  /** Outcome to persist; may differ from meta.success (e.g. HTTP 200 with a stale fix). */
  success?: boolean;
  errorMessage?: string | null;
} & (
  | { providerCalled: true; meta: AisProviderRequestMeta }
  | { providerCalled: false; endpoint: AisProviderEndpoint; mmsi?: string | null }
);

function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST204' || error.code === '42703' || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? '');
}

/** Insert one provider audit row. Never throws — logging must not break AIS. */
export async function recordAisProviderRequest(input: RecordAisProviderRequestInput): Promise<void> {
  const nowIso = new Date().toISOString();
  const row = input.providerCalled
    ? {
        requested_at: input.meta.requestedAt,
        completed_at: input.meta.completedAt,
        response_time_ms: Math.max(0, Math.round(input.meta.responseTimeMs)),
        response_status: input.meta.httpStatus,
        endpoint: input.meta.endpoint,
        mmsi: normalizeMmsiForLog(input.meta.mmsi),
        provider_credits_used: input.meta.providerCreditsUsed,
        success: input.success ?? input.meta.success,
        error_message: sanitiseProviderError(input.errorMessage ?? input.meta.errorMessage),
      }
    : {
        requested_at: nowIso,
        completed_at: nowIso,
        response_time_ms: null,
        response_status: null,
        endpoint: input.endpoint,
        mmsi: normalizeMmsiForLog(input.mmsi),
        provider_credits_used: null,
        success: input.success ?? false,
        error_message: sanitiseProviderError(input.errorMessage),
      };

  const legacy = {
    vessel_id: input.vesselId ?? null,
    provider: input.provider ?? 'datalastic',
    requested_at: row.requested_at,
    success: row.success,
    response_status: row.response_status,
    cached_or_api: 'api' as const,
    error_message: row.error_message,
    trigger_source: input.triggerSource,
    tracking_mode: input.trackingMode ?? null,
    scheduled_reason: input.scheduledReason ?? null,
  };

  try {
    const { error } = await supabaseAdmin.from('ais_fetch_log').insert({
      ...legacy,
      completed_at: row.completed_at,
      response_time_ms: row.response_time_ms,
      endpoint: row.endpoint,
      mmsi: row.mmsi,
      provider_credits_used: row.provider_credits_used,
      provider_called: input.providerCalled,
      trigger_detail: input.triggerDetail ?? null,
    });
    if (!error) return;
    if (isMissingColumnError(error)) {
      // Monitoring migration not applied yet — keep the pre-existing audit row.
      const { error: legacyError } = await supabaseAdmin.from('ais_fetch_log').insert(legacy);
      if (legacyError) console.warn('[fetch-audit] legacy insert failed', legacyError.message);
      return;
    }
    console.warn('[fetch-audit] insert failed', error.message);
  } catch (e) {
    console.warn('[fetch-audit] insert threw', e instanceof Error ? e.message : e);
  }
}
