/**
 * Datalastic Maritime API client.
 * Docs: https://datalastic.com/api-reference/
 *
 * Every HTTP request goes through datalasticGet(), which records one
 * ais_fetch_log row (cached_or_api = 'api') per request — either directly, or
 * via audit.onRequestComplete when the caller writes an enriched row itself.
 * Request URLs are never logged: they contain the api-key query parameter.
 */

import { splitHistoryDateRange } from '@/lib/ais/historical-import';
import { recordAisProviderRequest } from '@/lib/ais/fetch-audit';
import type {
  AisProviderEndpoint,
  AisProviderRequestMeta,
  AisRequestAuditContext,
} from '@/lib/ais/fetch-audit-shared';

const DATALASTIC_BASE = 'https://api.datalastic.com/api/v0';

export type DatalasticAuditContext = AisRequestAuditContext;

export type DatalasticVesselPosition = {
  uuid?: string | null;
  name?: string | null;
  mmsi?: string | null;
  imo?: string | null;
  lat?: number | null;
  lon?: number | null;
  speed?: number | null;
  course?: number | null;
  heading?: number | null;
  /** Datalastic v0 `/vessel` often uses this key */
  navigation_status?: string | null;
  /** Some endpoints/docs use this spelling */
  navigational_status?: string | null;
  destination?: string | null;
  last_position_epoch?: number | null;
  last_position_UTC?: string | null;
};

export type DatalasticVesselResponse = {
  data: DatalasticVesselPosition;
  meta?: { success?: boolean; endpoint?: string };
};

export type DatalasticVesselInfo = {
  uuid?: string | null;
  name?: string | null;
  name_ais?: string | null;
  mmsi?: string | null;
  imo?: string | null;
  country_iso?: string | null;
  country_name?: string | null;
  callsign?: string | null;
  type?: string | null;
  type_specific?: string | null;
  gross_tonnage?: number | null;
  deadweight?: number | null;
  length?: number | null;
  breadth?: number | null;
  draught_avg?: number | null;
  draught_max?: number | null;
  year_built?: string | number | null;
  home_port?: string | null;
};

export type DatalasticVesselInfoResponse = {
  data: DatalasticVesselInfo;
  meta?: { success?: boolean; endpoint?: string; message?: string };
};

export class DatalasticApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DatalasticApiError';
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.DATALASTIC_API_KEY;
  if (!key) {
    throw new DatalasticApiError('DATALASTIC_API_KEY is not configured', 500);
  }
  return key;
}

export type DatalasticVesselHistoryResponse = {
  data: {
    uuid?: string | null;
    name?: string | null;
    mmsi?: string | null;
    imo?: string | null;
    positions?: Array<DatalasticVesselPosition & Record<string, unknown>>;
  };
  meta?: { success?: boolean; endpoint?: string };
};

function normalizePositionFields(
  raw: DatalasticVesselPosition & { navigation_status?: string | null },
): DatalasticVesselPosition {
  const navigationalStatus = raw.navigational_status ?? raw.navigation_status ?? null;
  return {
    ...raw,
    navigational_status: navigationalStatus,
    navigation_status: navigationalStatus,
  };
}

function extractDatalasticErrorMessage(
  body: Record<string, unknown>,
  status: number,
  fallback: string,
): string {
  const meta = body.meta as { message?: string; success?: boolean } | undefined;
  if (meta?.message) return meta.message;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (typeof body.message === 'string' && body.message) return body.message;
  return fallback || `Datalastic request failed (${status})`;
}

type DatalasticFailure = { message: string; status: number };

async function finishAudit(
  meta: AisProviderRequestMeta,
  audit: DatalasticAuditContext | undefined,
): Promise<void> {
  if (audit?.onRequestComplete) {
    try {
      audit.onRequestComplete(meta);
    } catch (e) {
      console.warn('[datalastic] onRequestComplete threw', e instanceof Error ? e.message : e);
    }
    return;
  }
  await recordAisProviderRequest({
    providerCalled: true,
    meta,
    vesselId: audit?.vesselId ?? null,
    triggerSource: audit?.triggerSource ?? 'unknown',
    triggerDetail: audit?.triggerDetail ?? null,
    trackingMode: audit?.trackingMode ?? null,
    scheduledReason: audit?.scheduledReason ?? null,
  });
}

/**
 * Single choke point for Datalastic HTTP. Times the request, validates the
 * body, records the audit row, then returns the body or throws DatalasticApiError.
 */
async function datalasticGet<TBody>(opts: {
  endpoint: AisProviderEndpoint;
  search: URLSearchParams;
  mmsi: string | null;
  audit?: DatalasticAuditContext;
  validate: (res: Response, body: TBody) => DatalasticFailure | null;
}): Promise<TBody> {
  const url = `${DATALASTIC_BASE}/${opts.endpoint}?${opts.search.toString()}`;
  const startedMs = Date.now();
  const requestedAt = new Date(startedMs).toISOString();

  const buildMeta = (
    httpStatus: number | null,
    success: boolean,
    errorMessage: string | null,
  ): AisProviderRequestMeta => {
    const endMs = Date.now();
    return {
      endpoint: opts.endpoint,
      requestedAt,
      completedAt: new Date(endMs).toISOString(),
      responseTimeMs: endMs - startedMs,
      httpStatus,
      success,
      errorMessage,
      mmsi: opts.mmsi,
      providerCreditsUsed: null,
    };
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    await finishAudit(buildMeta(null, false, message), opts.audit);
    throw err;
  }

  const body = (await res.json().catch(() => ({}))) as TBody;
  const failure = opts.validate(res, body);
  await finishAudit(buildMeta(res.status, !failure, failure?.message ?? null), opts.audit);
  if (failure) throw new DatalasticApiError(failure.message, failure.status);
  return body;
}

export async function fetchVesselHistory(
  params: {
    mmsi?: string | null;
    imo?: string | null;
    from: string;
    to: string;
  },
  audit?: DatalasticAuditContext,
): Promise<DatalasticVesselPosition[]> {
  const apiKey = getApiKey();
  const search = new URLSearchParams({
    'api-key': apiKey,
    from: params.from,
    to: params.to,
  });

  if (params.mmsi) search.set('mmsi', params.mmsi.replace(/\D/g, ''));
  else if (params.imo) search.set('imo', params.imo.replace(/\D/g, ''));
  else {
    throw new DatalasticApiError('MMSI or IMO is required', 400);
  }

  const body = await datalasticGet<DatalasticVesselHistoryResponse & Record<string, unknown>>({
    endpoint: 'vessel_history',
    search,
    mmsi: params.mmsi ?? null,
    audit,
    validate: (res, b) =>
      !res.ok || b.meta?.success === false
        ? {
            message: extractDatalasticErrorMessage(
              b,
              res.status,
              `Datalastic history request failed (${res.status})`,
            ),
            status: res.status,
          }
        : null,
  });

  const rawPositions = body.data?.positions ?? [];
  return rawPositions.map((p) =>
    normalizePositionFields(p as DatalasticVesselPosition & { navigation_status?: string | null }),
  );
}

/** Fetch history for long ranges by splitting into Datalastic-sized chunks. */
export async function fetchVesselHistoryRange(
  params: {
    mmsi?: string | null;
    imo?: string | null;
    from: string;
    to: string;
  },
  audit?: DatalasticAuditContext,
): Promise<{ positions: DatalasticVesselPosition[]; requestCount: number }> {
  const chunks = splitHistoryDateRange(params.from, params.to);
  const allPositions: DatalasticVesselPosition[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const positions = await fetchVesselHistory(
      {
        mmsi: params.mmsi,
        imo: params.imo,
        from: chunk.from,
        to: chunk.to,
      },
      audit,
    );
    for (const p of positions) {
      // Chunks overlap by 1 day — drop exact duplicates from the seam.
      const key = [
        p.last_position_UTC ?? p.last_position_epoch ?? '',
        p.lat ?? '',
        p.lon ?? '',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      allPositions.push(p);
    }
  }

  return { positions: allPositions, requestCount: chunks.length };
}

export async function fetchVesselPosition(
  params: {
    mmsi?: string | null;
    imo?: string | null;
    uuid?: string | null;
  },
  audit?: DatalasticAuditContext,
): Promise<DatalasticVesselPosition> {
  const apiKey = getApiKey();
  const search = new URLSearchParams({ 'api-key': apiKey });

  if (params.mmsi) search.set('mmsi', params.mmsi.replace(/\D/g, ''));
  else if (params.imo) search.set('imo', params.imo.replace(/\D/g, ''));
  else if (params.uuid) search.set('uuid', params.uuid);
  else {
    throw new DatalasticApiError('MMSI, IMO, or Datalastic UUID is required', 400);
  }

  const body = await datalasticGet<
    DatalasticVesselResponse & { error?: string; message?: string }
  >({
    endpoint: 'vessel',
    search,
    mmsi: params.mmsi ?? null,
    audit,
    validate: (res, b) => {
      if (!res.ok || b.meta?.success === false) {
        return {
          message: b.error || b.message || `Datalastic request failed (${res.status})`,
          status: res.status,
        };
      }
      if (!b.data) return { message: 'No AIS data returned for this vessel', status: 404 };
      return null;
    },
  });

  const raw = body.data as DatalasticVesselPosition & { navigation_status?: string | null };
  return normalizePositionFields(raw);
}

export async function fetchVesselInfo(
  params: {
    mmsi?: string | null;
    imo?: string | null;
    uuid?: string | null;
  },
  audit?: DatalasticAuditContext,
): Promise<DatalasticVesselInfo> {
  const apiKey = getApiKey();
  const search = new URLSearchParams({ 'api-key': apiKey });

  if (params.mmsi) search.set('mmsi', params.mmsi.replace(/\D/g, ''));
  else if (params.imo) search.set('imo', params.imo.replace(/\D/g, ''));
  else if (params.uuid) search.set('uuid', params.uuid);
  else {
    throw new DatalasticApiError('MMSI, IMO, or Datalastic UUID is required', 400);
  }

  const body = await datalasticGet<DatalasticVesselInfoResponse & Record<string, unknown>>({
    endpoint: 'vessel_info',
    search,
    mmsi: params.mmsi ?? null,
    audit,
    validate: (res, b) => {
      if (!res.ok || b.meta?.success === false) {
        return {
          message: extractDatalasticErrorMessage(
            b,
            res.status,
            `Datalastic vessel info request failed (${res.status})`,
          ),
          status: res.status,
        };
      }
      if (!b.data?.name && !b.data?.mmsi && !b.data?.imo) {
        return { message: 'No vessel found for this MMSI or IMO', status: 404 };
      }
      return null;
    },
  });

  return body.data;
}

export type DatalasticVesselFindResponse = {
  data?: DatalasticVesselInfo[];
  meta?: { success?: boolean; endpoint?: string; message?: string; total?: number; next?: string };
};

const VESSEL_FIND_DEFAULT_LIMIT = 25;

export async function fetchVesselFind(
  params: {
    name: string;
    fuzzy?: boolean;
    limit?: number;
  },
  audit?: DatalasticAuditContext,
): Promise<{ vessels: DatalasticVesselInfo[]; totalCount: number; truncated: boolean }> {
  const trimmedName = params.name.trim();
  if (trimmedName.length < 3) {
    throw new DatalasticApiError('Vessel name must be at least 3 characters', 400);
  }

  const apiKey = getApiKey();
  const search = new URLSearchParams({
    'api-key': apiKey,
    name: trimmedName,
    fuzzy: params.fuzzy === false ? '0' : '1',
  });

  const body = await datalasticGet<DatalasticVesselFindResponse & Record<string, unknown>>({
    endpoint: 'vessel_find',
    search,
    mmsi: null,
    audit,
    validate: (res, b) =>
      !res.ok || b.meta?.success === false
        ? {
            message: extractDatalasticErrorMessage(
              b,
              res.status,
              `Datalastic vessel search failed (${res.status})`,
            ),
            status: res.status,
          }
        : null,
  });

  const allVessels = body.data ?? [];
  const limit = params.limit ?? VESSEL_FIND_DEFAULT_LIMIT;
  const vessels = allVessels.slice(0, limit);
  const totalCount = typeof body.meta?.total === 'number' ? body.meta.total : allVessels.length;

  return {
    vessels,
    totalCount,
    truncated: allVessels.length > vessels.length || Boolean(body.meta?.next),
  };
}
