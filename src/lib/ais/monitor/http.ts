import { NextResponse } from 'next/server';

import { AisMonitorQueryError } from '@/lib/ais/monitor/queries';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function monitorJson<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function monitorError(context: string, err: unknown): NextResponse {
  if (err instanceof AisMonitorQueryError) {
    console.error(`[ais-monitor] ${context}`, err.message);
    return monitorJson(
      { error: 'AIS Monitor query failed', hint: err.hint },
      err.hint ? 503 : 500,
    );
  }
  console.error(`[ais-monitor] ${context}`, err);
  return monitorJson({ error: 'Internal server error' }, 500);
}
