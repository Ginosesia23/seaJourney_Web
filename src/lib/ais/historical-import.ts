import {
  getAisNavStatus,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';
import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import type { DailyStatus } from '@/lib/types';

/** Max total days a user can request (fetched in API chunks). */
export const AIS_HISTORY_MAX_DAYS = 365;

/** Datalastic `/vessel_history` allows at most ~31 days between from and to. */
export const AIS_DATALASTIC_MAX_DAY_SPAN = 31;

export type AisHistoryChangeType = 'new' | 'same' | 'conflict';

export type AisHistoryPreviewDay = {
  date: string;
  proposedState: DailyStatus;
  existingState: DailyStatus | null;
  changeType: AisHistoryChangeType;
  navStatus: string | null;
  speed: number | null;
  latitude: number | null;
  longitude: number | null;
  destination: string | null;
  locationName: string | null;
  positionCount: number;
};

export type AisHistoryPreviewSummary = {
  totalDays: number;
  newDays: number;
  sameDays: number;
  conflictDays: number;
  positionCount: number;
  outsideAssignmentDays?: number;
};

export type PositionWithTime = DatalasticVesselPosition & { timestampMs: number };

function parseCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Human-readable coordinates from the last AIS fix of the day. */
export function formatAisCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const latDir = latitude >= 0 ? 'N' : 'S';
  const lonDir = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lonDir}`;
}

export function formatAisDestination(destination: string | null | undefined): string | null {
  if (!destination?.trim()) return null;
  return destination.trim();
}

/** Primary table label: geocoded place, then AIS destination — never coordinates. */
export function getAisLocationDisplayName(
  day: Pick<AisHistoryPreviewDay, 'locationName' | 'destination'>,
): string | null {
  if (day.locationName?.trim()) return day.locationName.trim();
  return formatAisDestination(day.destination);
}

export function getAisLocationTooltipLines(
  day: Pick<
    AisHistoryPreviewDay,
    'latitude' | 'longitude' | 'destination' | 'locationName'
  >,
): string[] {
  const lines: string[] = [];
  const coords = formatAisCoordinates(day.latitude, day.longitude);
  if (coords) lines.push(coords);

  const destination = formatAisDestination(day.destination);
  if (destination && destination !== day.locationName?.trim()) {
    lines.push(`AIS destination: ${destination}`);
  }

  return lines;
}

export function parseHistoryPosition(
  raw: Record<string, unknown>,
): PositionWithTime | null {
  const navigationalStatus =
    (raw.navigational_status as string | null | undefined) ??
    (raw.navigation_status as string | null | undefined) ??
    null;

  let timestampMs: number | null = null;
  if (typeof raw.last_position_epoch === 'number') {
    timestampMs = raw.last_position_epoch * 1000;
  } else if (typeof raw.last_position_UTC === 'string') {
    const t = Date.parse(raw.last_position_UTC);
    timestampMs = Number.isFinite(t) ? t : null;
  }

  if (timestampMs == null) return null;

  const lat =
    parseCoordinate(raw.lat) ??
    parseCoordinate(raw.latitude) ??
    parseCoordinate(raw.lat_deg);
  const lon =
    parseCoordinate(raw.lon) ??
    parseCoordinate(raw.longitude) ??
    parseCoordinate(raw.lon_deg);

  const destination =
    typeof raw.destination === 'string' && raw.destination.trim()
      ? raw.destination.trim()
      : null;

  return {
    ...(raw as DatalasticVesselPosition),
    lat,
    lon,
    navigational_status: navigationalStatus,
    navigation_status: navigationalStatus,
    speed: typeof raw.speed === 'number' ? raw.speed : null,
    destination,
    timestampMs,
  };
}

/** Map UTC epoch to local calendar date (client timezone offset in minutes, east-of-UTC positive). */
export function localDateKeyFromUtcMs(
  utcMs: number,
  timezoneOffsetMinutes: number,
): string {
  const localMs = utcMs + timezoneOffsetMinutes * 60 * 1000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function validateHistoryDateRange(
  fromDate: string,
  toDate: string,
): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return { ok: false, error: 'Dates must be YYYY-MM-DD' };
  }
  if (fromDate > toDate) {
    return { ok: false, error: 'Start date must be on or before end date' };
  }

  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  const daySpan = Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;

  if (daySpan > AIS_HISTORY_MAX_DAYS) {
    return {
      ok: false,
      error: `Date range cannot exceed ${AIS_HISTORY_MAX_DAYS} days`,
    };
  }

  return { ok: true };
}

/** `yyyy-MM` key for the month containing `date`. */
export function monthKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return monthKeyFromDate(d);
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

/** First/last day of a calendar month; caps `to` at today when importing the current month. */
export function getMonthDateRange(
  monthKey: string,
  capAtToday = true,
): { from: string; to: string; monthKey: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const from = `${monthKey}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  let to = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

  if (capAtToday) {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (to > todayKey) to = todayKey;
  }

  return { from, to, monthKey };
}

/** Split a range into chunks that each satisfy Datalastic's one-month limit. */
export function splitHistoryDateRange(
  fromDate: string,
  toDate: string,
  maxDaySpan = AIS_DATALASTIC_MAX_DAY_SPAN,
): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let chunkStart = fromDate;

  while (chunkStart <= toDate) {
    const startMs = Date.parse(`${chunkStart}T00:00:00Z`);
    const maxEndMs = startMs + maxDaySpan * 24 * 60 * 60 * 1000;
    const maxEndDate = new Date(maxEndMs).toISOString().slice(0, 10);
    const chunkEnd = maxEndDate > toDate ? toDate : maxEndDate;

    chunks.push({ from: chunkStart, to: chunkEnd });

    if (chunkEnd >= toDate) break;

    const nextStartMs = Date.parse(`${chunkEnd}T00:00:00Z`) + 24 * 60 * 60 * 1000;
    chunkStart = new Date(nextStartMs).toISOString().slice(0, 10);
  }

  return chunks;
}

export function buildHistoricalImportPreview(
  positions: PositionWithTime[],
  existingLogs: Map<string, DailyStatus>,
  fromDate: string,
  toDate: string,
  timezoneOffsetMinutes: number,
): { days: AisHistoryPreviewDay[]; summary: AisHistoryPreviewSummary } {
  const byDate = new Map<string, PositionWithTime[]>();

  for (const pos of positions) {
    const dateKey = localDateKeyFromUtcMs(pos.timestampMs, timezoneOffsetMinutes);
    if (dateKey < fromDate || dateKey > toDate) continue;
    const list = byDate.get(dateKey) ?? [];
    list.push(pos);
    byDate.set(dateKey, list);
  }

  const days: AisHistoryPreviewDay[] = [];
  let newDays = 0;
  let sameDays = 0;
  let conflictDays = 0;
  let positionCount = 0;

  for (const date of [...byDate.keys()].sort()) {
    const dayPositions = byDate.get(date)!;
    dayPositions.sort((a, b) => a.timestampMs - b.timestampMs);
    positionCount += dayPositions.length;

    const last = dayPositions[dayPositions.length - 1];
    const proposedState = mapAisToDailyStatus(last);
    const existingState = existingLogs.get(date) ?? null;

    let changeType: AisHistoryChangeType = 'new';
    if (existingState) {
      changeType = existingState === proposedState ? 'same' : 'conflict';
    }

    if (changeType === 'new') newDays += 1;
    else if (changeType === 'same') sameDays += 1;
    else conflictDays += 1;

    days.push({
      date,
      proposedState,
      existingState,
      changeType,
      navStatus: getAisNavStatus(last) || null,
      speed: last.speed ?? null,
      latitude: last.lat ?? null,
      longitude: last.lon ?? null,
      destination: last.destination?.trim() || null,
      locationName: null,
      positionCount: dayPositions.length,
    });
  }

  return {
    days,
    summary: {
      totalDays: days.length,
      newDays,
      sameDays,
      conflictDays,
      positionCount,
    },
  };
}

export function buildAisHistoryImportNote(navStatus: string | null, speed: number | null): string {
  const parts = ['[AIS import]'];
  if (navStatus) parts.push(navStatus);
  if (speed != null) parts.push(`${speed.toFixed(1)} kn`);
  return parts.join(' · ');
}
