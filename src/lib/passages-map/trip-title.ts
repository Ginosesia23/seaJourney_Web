/**
 * Build a short premium trip title for fly-to toasts / voyage cards,
 * e.g. "Cagliari → Olbia · 14h".
 */

import { passagePortLabel } from './nearest-port';

export type TripTitleInput = {
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  distanceNm?: number;
  geometry?: GeoJSON.Geometry | null;
  /** Precomputed "Palma → Antibes" when the caller already has it. */
  routeLabel?: string | null;
};

export function buildTripTitle(input: TripTitleInput): string {
  const route =
    input.routeLabel?.trim() ||
    routeLabelFromGeometry(input.geometry) ||
    'Open-sea passage';
  const duration = formatDurationCompact(input.durationMs, input.startTime, input.endTime);
  if (duration) return `${route} · ${duration}`;
  if (typeof input.distanceNm === 'number' && Number.isFinite(input.distanceNm)) {
    const nm =
      input.distanceNm < 10
        ? input.distanceNm.toFixed(1)
        : String(Math.round(input.distanceNm));
    return `${route} · ${nm} NM`;
  }
  return route;
}

function routeLabelFromGeometry(geom?: GeoJSON.Geometry | null): string | null {
  if (!geom) return null;
  let start: [number, number] | null = null;
  let end: [number, number] | null = null;
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
    const c = geom.coordinates as [number, number][];
    if (c.length) {
      start = c[0]!;
      end = c[c.length - 1]!;
    }
  } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
    const lines = geom.coordinates as [number, number][][];
    if (lines[0]?.length) start = lines[0]![0]!;
    const last = lines[lines.length - 1];
    if (last?.length) end = last[last.length - 1]!;
  }
  if (!start || !end) return null;
  return passagePortLabel(start[1], start[0], end[1], end[0]);
}

export function formatDurationCompact(
  durationMs?: number,
  startTime?: string,
  endTime?: string,
): string | null {
  let ms = durationMs;
  if ((ms == null || !Number.isFinite(ms) || ms <= 0) && startTime && endTime) {
    const a = Date.parse(startTime);
    const b = Date.parse(endTime);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) ms = b - a;
  }
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;

  const totalMinutes = Math.round(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes - days * 24 * 60 - hours * 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes >= 15 && hours < 6 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)}m`;
}
