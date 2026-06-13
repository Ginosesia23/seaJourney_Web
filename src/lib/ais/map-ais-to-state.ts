import type { DailyStatus } from '@/lib/types';
import type { DatalasticVesselPosition } from '@/lib/datalastic/client';

const UNDERWAY_STATUSES = [
  'under way using engine',
  'under way sailing',
  'under way',
  'restricted manoeuvrability',
  'constrained by her draught',
  'not under command',
  'engaged in fishing',
  'engaged in dredging or underwater ops',
  'engaged in mine clearance',
  'engaged in towing',
  'engaged in pushing or towing',
];

/** Read nav status from Datalastic (field name varies by endpoint). */
export function getAisNavStatus(
  position: Pick<DatalasticVesselPosition, 'navigational_status' | 'navigation_status' | 'speed'>,
): string {
  return (position.navigational_status || position.navigation_status || '').trim();
}

/**
 * Map Datalastic navigational_status + speed to SeaJourney daily state.
 * on-leave and in-yard are never inferred from AIS — callers should skip
 * overwriting those manual states if desired.
 */
export function mapAisToDailyStatus(
  position: Pick<DatalasticVesselPosition, 'navigational_status' | 'navigation_status' | 'speed'>,
): DailyStatus {
  const statusRaw = getAisNavStatus(position).toLowerCase();
  const speed = typeof position.speed === 'number' ? position.speed : 0;

  if (statusRaw.includes('aground')) {
    return 'in-yard';
  }

  if (statusRaw.includes('moored') || statusRaw.includes('at berth')) {
    return 'in-port';
  }

  if (statusRaw.includes('at anchor') || statusRaw.includes('anchored')) {
    return 'at-anchor';
  }

  if (UNDERWAY_STATUSES.some((s) => statusRaw.includes(s))) {
    return speed >= 0.3 ? 'underway' : 'at-anchor';
  }

  // Fallback when status is missing or unknown
  if (speed >= 1) return 'underway';
  if (speed >= 0.3) return 'at-anchor';
  return 'in-port';
}

export function buildAisStateNote(
  position: Pick<
    DatalasticVesselPosition,
    'navigational_status' | 'navigation_status' | 'speed' | 'last_position_UTC'
  >,
): string {
  const parts = ['[AIS auto]'];
  const navStatus = getAisNavStatus(position);
  if (navStatus) {
    parts.push(navStatus);
  }
  if (typeof position.speed === 'number') {
    parts.push(`${position.speed.toFixed(1)} kn`);
  }
  if (position.last_position_UTC) {
    parts.push(`@ ${position.last_position_UTC}`);
  }
  return parts.join(' · ');
}

/** Ignore positions older than this when applying state. */
export const AIS_STALE_POSITION_MS = 6 * 60 * 60 * 1000;

export function getAisPositionTimestampMs(
  position: Pick<DatalasticVesselPosition, 'last_position_epoch' | 'last_position_UTC'>,
): number | null {
  if (position.last_position_epoch) {
    return position.last_position_epoch * 1000;
  }
  if (position.last_position_UTC) {
    const t = Date.parse(position.last_position_UTC);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export function isAisPositionStale(
  position: Pick<DatalasticVesselPosition, 'last_position_epoch' | 'last_position_UTC'>,
  nowMs = Date.now(),
): boolean {
  const ts = getAisPositionTimestampMs(position);
  if (ts == null) return false;
  return nowMs - ts > AIS_STALE_POSITION_MS;
}

export function logDateFromAisPosition(
  position: Pick<DatalasticVesselPosition, 'last_position_epoch' | 'last_position_UTC'>,
): string {
  const ts = getAisPositionTimestampMs(position);
  const d = ts != null ? new Date(ts) : new Date();
  return d.toISOString().slice(0, 10);
}

/**
 * Calendar date for live AIS state upserts. Prefer the client's local today
 * (same as `format(new Date(), 'yyyy-MM-dd')` on the dashboard); fall back to UTC.
 */
export function logDateForLiveAisSync(logDate?: string | null): string {
  if (logDate && /^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return logDate;
  }
  return new Date().toISOString().slice(0, 10);
}
