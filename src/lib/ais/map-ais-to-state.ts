import type { DailyStatus } from '@/lib/types';
import type { DatalasticVesselPosition } from '@/lib/datalastic/client';

/**
 * Canonical IMO AIS Navigational Status labels (ITU-R M.1371-5, codes 0–15).
 * Used for display, vessel-row persistence, and log notes — gives a stable,
 * professional surface regardless of how Datalastic spells the source field.
 */
export const AIS_NAV_STATUS_LABELS: Record<number, string> = {
  0: 'Underway using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted maneuverability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Underway sailing',
  9: 'Reserved (HSC)',
  10: 'Reserved (WIG)',
  11: 'Power-driven vessel towing astern',
  12: 'Power-driven vessel pushing ahead or towing alongside',
  13: 'Reserved',
  14: 'AIS-SART (active)',
  15: 'Undefined',
};

/** AIS statuses that imply the vessel is operationally moving / on watch. */
const UNDERWAY_CANONICAL = new Set<string>([
  AIS_NAV_STATUS_LABELS[0], // Underway using engine
  AIS_NAV_STATUS_LABELS[2], // Not under command
  AIS_NAV_STATUS_LABELS[3], // Restricted maneuverability
  AIS_NAV_STATUS_LABELS[4], // Constrained by draught
  AIS_NAV_STATUS_LABELS[7], // Engaged in fishing
  AIS_NAV_STATUS_LABELS[8], // Underway sailing
  AIS_NAV_STATUS_LABELS[11], // Towing astern
  AIS_NAV_STATUS_LABELS[12], // Pushing ahead / towing alongside
]);

const STRING_TO_CANONICAL: Array<{ test: (s: string) => boolean; label: string }> = [
  { test: (s) => /aground/.test(s), label: AIS_NAV_STATUS_LABELS[6] },
  {
    test: (s) => /moored|at\s*berth|alongside/.test(s),
    label: AIS_NAV_STATUS_LABELS[5],
  },
  { test: (s) => /at\s*anchor|anchored|anchor/.test(s), label: AIS_NAV_STATUS_LABELS[1] },
  { test: (s) => /not\s*under\s*command/.test(s), label: AIS_NAV_STATUS_LABELS[2] },
  {
    test: (s) => /restricted\s*man[eo]+uvr?ability|restricted\s*maneuv/.test(s),
    label: AIS_NAV_STATUS_LABELS[3],
  },
  {
    test: (s) => /constrained\s*by(\s*her)?\s*draught|deep\s*draught/.test(s),
    label: AIS_NAV_STATUS_LABELS[4],
  },
  { test: (s) => /engaged\s*in\s*fishing|fishing\s*vessel/.test(s), label: AIS_NAV_STATUS_LABELS[7] },
  { test: (s) => /sailing/.test(s), label: AIS_NAV_STATUS_LABELS[8] },
  { test: (s) => /towing\s*astern/.test(s), label: AIS_NAV_STATUS_LABELS[11] },
  {
    test: (s) =>
      /pushing\s*ahead|towing\s*alongside|push(\s|ing)|tow(\s|ing)/.test(s),
    label: AIS_NAV_STATUS_LABELS[12],
  },
  {
    test: (s) => /under\s*way\s*using\s*engine|using\s*engine|under\s*power|underway/.test(s),
    label: AIS_NAV_STATUS_LABELS[0],
  },
  { test: (s) => /sart|epirb|mob/.test(s), label: AIS_NAV_STATUS_LABELS[14] },
  { test: (s) => /undefined|unknown|^15$/.test(s), label: AIS_NAV_STATUS_LABELS[15] },
];

/** Read nav status from Datalastic (field name varies by endpoint), unprocessed. */
export function getAisNavStatus(
  position: Pick<DatalasticVesselPosition, 'navigational_status' | 'navigation_status' | 'speed'>,
): string {
  const raw = position.navigational_status ?? position.navigation_status;
  if (raw == null) return '';
  return String(raw).trim();
}

/**
 * Normalise a raw AIS navigational status (string or numeric code 0–15) to
 * the canonical IMO label. Falls back to a Title-Cased version of the source
 * string when no rule matches (so unknown statuses still surface cleanly).
 */
export function normalizeAisNavStatus(
  raw: string | number | null | undefined,
): string {
  if (raw == null) return '';

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return AIS_NAV_STATUS_LABELS[raw] || `Status ${raw}`;
  }

  const trimmed = String(raw).trim();
  if (!trimmed) return '';

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && AIS_NAV_STATUS_LABELS[numeric]) {
    return AIS_NAV_STATUS_LABELS[numeric];
  }

  const lc = trimmed.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const match = STRING_TO_CANONICAL.find((r) => r.test(lc));
  if (match) return match.label;

  return trimmed
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/** Read & normalise nav status from a Datalastic position payload. */
export function getNormalizedAisNavStatus(
  position: Pick<DatalasticVesselPosition, 'navigational_status' | 'navigation_status' | 'speed'>,
): string {
  return normalizeAisNavStatus(getAisNavStatus(position));
}

/**
 * Map Datalastic navigational_status + speed to SeaJourney daily state.
 * on-leave and in-yard are never inferred from AIS — callers should skip
 * overwriting those manual states if desired.
 */
export function mapAisToDailyStatus(
  position: Pick<DatalasticVesselPosition, 'navigational_status' | 'navigation_status' | 'speed'>,
): DailyStatus {
  const canonical = getNormalizedAisNavStatus(position);
  const speed = typeof position.speed === 'number' ? position.speed : 0;

  if (canonical === AIS_NAV_STATUS_LABELS[6]) {
    return 'in-yard';
  }

  if (canonical === AIS_NAV_STATUS_LABELS[5]) {
    return 'in-port';
  }

  if (canonical === AIS_NAV_STATUS_LABELS[1]) {
    return 'at-anchor';
  }

  if (UNDERWAY_CANONICAL.has(canonical)) {
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
  const navStatus = getNormalizedAisNavStatus(position);
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
