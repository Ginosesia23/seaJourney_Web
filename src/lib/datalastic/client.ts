/**
 * Datalastic Maritime API client.
 * Docs: https://datalastic.com/api-reference/
 */

import { splitHistoryDateRange } from '@/lib/ais/historical-import';

const DATALASTIC_BASE = 'https://api.datalastic.com/api/v0';

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

export async function fetchVesselHistory(params: {
  mmsi?: string | null;
  imo?: string | null;
  from: string;
  to: string;
}): Promise<DatalasticVesselPosition[]> {
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

  const url = `${DATALASTIC_BASE}/vessel_history?${search.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => ({}))) as DatalasticVesselHistoryResponse &
    Record<string, unknown>;

  if (!res.ok || body.meta?.success === false) {
    const msg = extractDatalasticErrorMessage(
      body,
      res.status,
      `Datalastic history request failed (${res.status})`,
    );
    throw new DatalasticApiError(msg, res.status);
  }

  const rawPositions = body.data?.positions ?? [];
  return rawPositions.map((p) =>
    normalizePositionFields(p as DatalasticVesselPosition & { navigation_status?: string | null }),
  );
}

/** Fetch history for long ranges by splitting into Datalastic-sized chunks. */
export async function fetchVesselHistoryRange(params: {
  mmsi?: string | null;
  imo?: string | null;
  from: string;
  to: string;
}): Promise<{ positions: DatalasticVesselPosition[]; requestCount: number }> {
  const chunks = splitHistoryDateRange(params.from, params.to);
  const allPositions: DatalasticVesselPosition[] = [];

  for (const chunk of chunks) {
    const positions = await fetchVesselHistory({
      mmsi: params.mmsi,
      imo: params.imo,
      from: chunk.from,
      to: chunk.to,
    });
    allPositions.push(...positions);
  }

  return { positions: allPositions, requestCount: chunks.length };
}

export async function fetchVesselPosition(params: {
  mmsi?: string | null;
  imo?: string | null;
  uuid?: string | null;
}): Promise<DatalasticVesselPosition> {
  const apiKey = getApiKey();
  const search = new URLSearchParams({ 'api-key': apiKey });

  if (params.mmsi) search.set('mmsi', params.mmsi.replace(/\D/g, ''));
  else if (params.imo) search.set('imo', params.imo.replace(/\D/g, ''));
  else if (params.uuid) search.set('uuid', params.uuid);
  else {
    throw new DatalasticApiError('MMSI, IMO, or Datalastic UUID is required', 400);
  }

  const url = `${DATALASTIC_BASE}/vessel?${search.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => ({}))) as DatalasticVesselResponse & {
    error?: string;
    message?: string;
  };

  if (!res.ok || body.meta?.success === false) {
    const msg =
      body.error ||
      body.message ||
      `Datalastic request failed (${res.status})`;
    throw new DatalasticApiError(msg, res.status);
  }

  if (!body.data) {
    throw new DatalasticApiError('No AIS data returned for this vessel', 404);
  }

  const raw = body.data as DatalasticVesselPosition & { navigation_status?: string | null };
  return normalizePositionFields(raw);
}

export async function fetchVesselInfo(params: {
  mmsi?: string | null;
  imo?: string | null;
  uuid?: string | null;
}): Promise<DatalasticVesselInfo> {
  const apiKey = getApiKey();
  const search = new URLSearchParams({ 'api-key': apiKey });

  if (params.mmsi) search.set('mmsi', params.mmsi.replace(/\D/g, ''));
  else if (params.imo) search.set('imo', params.imo.replace(/\D/g, ''));
  else if (params.uuid) search.set('uuid', params.uuid);
  else {
    throw new DatalasticApiError('MMSI, IMO, or Datalastic UUID is required', 400);
  }

  const url = `${DATALASTIC_BASE}/vessel_info?${search.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => ({}))) as DatalasticVesselInfoResponse &
    Record<string, unknown>;

  if (!res.ok || body.meta?.success === false) {
    const msg = extractDatalasticErrorMessage(
      body,
      res.status,
      `Datalastic vessel info request failed (${res.status})`,
    );
    throw new DatalasticApiError(msg, res.status);
  }

  if (!body.data?.name && !body.data?.mmsi && !body.data?.imo) {
    throw new DatalasticApiError('No vessel found for this MMSI or IMO', 404);
  }

  return body.data;
}

export type DatalasticVesselFindResponse = {
  data?: DatalasticVesselInfo[];
  meta?: { success?: boolean; endpoint?: string; message?: string; total?: number; next?: string };
};

const VESSEL_FIND_DEFAULT_LIMIT = 25;

export async function fetchVesselFind(params: {
  name: string;
  fuzzy?: boolean;
  limit?: number;
}): Promise<{ vessels: DatalasticVesselInfo[]; totalCount: number; truncated: boolean }> {
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

  const url = `${DATALASTIC_BASE}/vessel_find?${search.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => ({}))) as DatalasticVesselFindResponse &
    Record<string, unknown>;

  if (!res.ok || body.meta?.success === false) {
    const msg = extractDatalasticErrorMessage(
      body,
      res.status,
      `Datalastic vessel search failed (${res.status})`,
    );
    throw new DatalasticApiError(msg, res.status);
  }

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
