import {
  getAisNavStatus,
  mapAisToDailyStatus,
  normalizeAisNavStatus,
} from '@/lib/ais/map-ais-to-state';
import {
  analyzeAisDailyState,
  type AisAnalyzeOptions,
  type AisDailyConfidence,
} from '@/lib/ais/analyze-daily-state';
import {
  geocodeCoordCacheKey,
  reverseGeocodeStructuredBatch,
} from '@/lib/geocoding/reverse-geocode';
import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import type { DailyStatus } from '@/lib/types';

/** Max total days a user can request (fetched in API chunks). */
export const AIS_HISTORY_MAX_DAYS = 365;

/** Datalastic `/vessel_history` allows at most ~31 days between from and to. */
export const AIS_DATALASTIC_MAX_DAY_SPAN = 31;

export type AisHistoryChangeType = 'new' | 'same' | 'conflict';

export type AisHistoryPositionSample = {
  /** UTC time of this AIS fix (ISO 8601). */
  timeUtc: string;
  /** Raw nav status string returned by Datalastic, untouched. */
  rawNavStatus: string | null;
  /** Canonical IMO label derived from `rawNavStatus`. */
  navStatus: string | null;
  speed: number | null;
  latitude: number | null;
  longitude: number | null;
  destination: string | null;
  /** Daily-state bucket this single sample would map to in isolation. */
  proposedState: DailyStatus;
  /** True if this is the position the day's `proposedState` was derived from. */
  isSelectedForDay: boolean;
};

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
  /** Confidence level emitted by the day-level analyzer. */
  confidence?: AisDailyConfidence;
  /** Human-readable reason for `proposedState`. */
  reason?: string;
  /** Total distance traveled across all fixes that day, NM. */
  distanceTraveledNm?: number;
  /** Max distance any fix is from the day's centroid, NM. */
  radiusOfMovementNm?: number;
  /** Mean of `position.speed` across all fixes (kn). */
  avgSpeed?: number | null;
  /** Peak `position.speed` across all fixes (kn). */
  maxSpeed?: number | null;
  /** Most-frequent canonical AIS nav status across the day. */
  dominantNavStatus?: string | null;
  /** Total time the vessel was actively in motion across the day (ms). */
  underwayDurationMs?: number;
  /**
   * Up to ~`MAX_SAMPLES_PER_DAY` raw AIS fixes for the day, evenly downsampled
   * across the 24h window when more positions were fetched. Used by the import
   * UI to surface the underlying data so users can verify the proposed state.
   */
  samples?: AisHistoryPositionSample[];
};

/** Cap per-day samples in the preview payload — keeps responses small. */
export const MAX_SAMPLES_PER_DAY = 48;

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

/**
 * Pick at most `maxSamples` indexes evenly spaced across `total` items.
 * Always includes the first and last index when total > 1. Returns indexes
 * in ascending order, with no duplicates.
 */
function pickSampleIndexes(total: number, maxSamples: number): number[] {
  if (total <= 0) return [];
  if (total <= maxSamples) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const indexes = new Set<number>();
  indexes.add(0);
  indexes.add(total - 1);
  const stride = (total - 1) / (maxSamples - 1);
  for (let i = 1; i < maxSamples - 1; i++) {
    indexes.add(Math.round(i * stride));
  }
  return Array.from(indexes).sort((a, b) => a - b);
}

export async function buildHistoricalImportPreview(
  positions: PositionWithTime[],
  existingLogs: Map<string, DailyStatus>,
  fromDate: string,
  toDate: string,
  timezoneOffsetMinutes: number,
): Promise<{ days: AisHistoryPreviewDay[]; summary: AisHistoryPreviewSummary }> {
  const byDate = new Map<string, PositionWithTime[]>();

  for (const pos of positions) {
    const dateKey = localDateKeyFromUtcMs(pos.timestampMs, timezoneOffsetMinutes);
    if (dateKey < fromDate || dateKey > toDate) continue;
    const list = byDate.get(dateKey) ?? [];
    list.push(pos);
    byDate.set(dateKey, list);
  }

  const sortedDates = [...byDate.keys()].sort();

  // Pre-sort each day's positions and capture end-of-day coords so we can
  // batch-geocode them upfront. The geocoder result feeds into both the
  // analyzer (as `locationContext`, used to disambiguate "moored in port"
  // from "anchored offshore") and the day's `locationName` UI display.
  const endOfDayCoords: Array<{ lat: number; lon: number }> = [];
  const dateToCoordKey = new Map<string, string>();
  for (const date of sortedDates) {
    const dayPositions = byDate.get(date)!;
    dayPositions.sort((a, b) => a.timestampMs - b.timestampMs);
    const last = dayPositions[dayPositions.length - 1];
    if (last && last.lat != null && last.lon != null) {
      endOfDayCoords.push({ lat: last.lat, lon: last.lon });
      dateToCoordKey.set(date, geocodeCoordCacheKey(last.lat, last.lon));
    }
  }
  const geocodeByCoordKey =
    endOfDayCoords.length > 0
      ? await reverseGeocodeStructuredBatch(endOfDayCoords)
      : new Map();

  const days: AisHistoryPreviewDay[] = [];
  let newDays = 0;
  let sameDays = 0;
  let conflictDays = 0;
  let positionCount = 0;

  let previousDay: {
    state: DailyStatus;
    lastLatitude: number | null;
    lastLongitude: number | null;
  } | null = null;

  for (const date of sortedDates) {
    const dayPositions = byDate.get(date)!;
    positionCount += dayPositions.length;

    const last = dayPositions[dayPositions.length - 1];
    const lastIndex = dayPositions.length - 1;

    const coordKey = dateToCoordKey.get(date);
    const geocode = coordKey ? geocodeByCoordKey.get(coordKey) ?? null : null;
    const placeName = geocode?.label ?? null;
    // The geocoder's `inPopulatedArea` is true only when BigDataCloud
    // resolved the position to a specific city/locality (NOT just a
    // country/region). That makes it a much stricter signal of "vessel is in
    // a populated coastal area" than checking the label format.
    const locationContext: AisAnalyzeOptions['locationContext'] = geocode
      ? {
          endOfDayPlaceName: placeName,
          endOfDayInPopulatedArea: geocode.inPopulatedArea === true,
        }
      : null;

    const analysis = analyzeAisDailyState(dayPositions, { previousDay, locationContext });
    const proposedState = analysis.state;
    const existingState = existingLogs.get(date) ?? null;

    let changeType: AisHistoryChangeType = 'new';
    if (existingState) {
      changeType = existingState === proposedState ? 'same' : 'conflict';
    }

    if (changeType === 'new') newDays += 1;
    else if (changeType === 'same') sameDays += 1;
    else conflictDays += 1;

    // Build a downsampled samples array so the UI can show "what came in" for
    // this date. We keep first + last + evenly-spaced picks in between, plus
    // the position the day's state was derived from.
    const sampleIndexes = pickSampleIndexes(dayPositions.length, MAX_SAMPLES_PER_DAY);
    if (!sampleIndexes.includes(lastIndex)) sampleIndexes.push(lastIndex);
    sampleIndexes.sort((a, b) => a - b);

    const samples: AisHistoryPositionSample[] = sampleIndexes.map((idx) => {
      const p = dayPositions[idx];
      const rawStatus = getAisNavStatus(p);
      return {
        timeUtc: new Date(p.timestampMs).toISOString(),
        rawNavStatus: rawStatus || null,
        navStatus: normalizeAisNavStatus(rawStatus) || null,
        speed: typeof p.speed === 'number' ? p.speed : null,
        latitude: p.lat ?? null,
        longitude: p.lon ?? null,
        destination: p.destination?.trim() || null,
        proposedState: mapAisToDailyStatus(p),
        isSelectedForDay: idx === lastIndex,
      };
    });

    const lastNavRaw = getAisNavStatus(last);
    days.push({
      date,
      proposedState,
      existingState,
      changeType,
      navStatus: normalizeAisNavStatus(lastNavRaw) || null,
      speed: last.speed ?? null,
      latitude: last.lat ?? null,
      longitude: last.lon ?? null,
      destination: last.destination?.trim() || null,
      locationName: placeName,
      positionCount: dayPositions.length,
      confidence: analysis.confidence,
      reason: analysis.reason,
      distanceTraveledNm: analysis.metrics.distanceTraveledNm,
      radiusOfMovementNm: analysis.metrics.radiusOfMovementNm,
      avgSpeed: analysis.metrics.avgSpeed,
      maxSpeed: analysis.metrics.maxSpeed,
      dominantNavStatus: analysis.metrics.dominantNavStatus,
      underwayDurationMs: analysis.metrics.underwayDurationMs,
      samples,
    });

    previousDay = {
      state: proposedState,
      lastLatitude: last.lat ?? null,
      lastLongitude: last.lon ?? null,
    };
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
