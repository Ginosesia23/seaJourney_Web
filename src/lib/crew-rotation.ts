/**
 * Crew rotation math — shared between:
 *
 *   - the rotation editor (/dashboard/crew-rotation)
 *   - the crew page (/dashboard/crew) onboard toggle
 *   - the sync route (/api/crew-rotation/sync)
 *
 * Pure functions only — no React / Supabase dependencies — so server
 * and client can use the same logic and produce identical answers.
 *
 * Concepts:
 *   - An ON period (length `onValue` × `onUnit`) is followed by an
 *     OFF period (length `offValue` × `offUnit`); this cycle repeats
 *     indefinitely from `startDate`.
 *   - An optional `endDate` extends the FIRST on-board period only.
 *     After `endDate`, a single OFF period of the configured length
 *     runs, then normal cycling resumes. This is useful when a crew
 *     member's initial onboard stint is longer than later cycles.
 */

import { addDays, addMonths, addWeeks, differenceInDays, format, parseISO, startOfDay } from 'date-fns';

import type { CrewRotation, RotationUnit } from './types';

/** Schema shape used by server-side code that reads from the DB directly
 *  (snake_case columns). Keep in sync with the `crew_rotations` table. */
export interface CrewRotationRow {
  on_value: number;
  on_unit: RotationUnit;
  off_value: number;
  off_unit: RotationUnit;
  start_date: string;
  end_date?: string | null;
}

export type RotationStatus = 'on' | 'off' | 'not-started';

function advanceBy(date: Date, value: number, unit: RotationUnit): Date {
  if (unit === 'days') return addDays(date, value);
  if (unit === 'weeks') return addWeeks(date, value);
  return addMonths(date, value);
}

/**
 * Convert a server-side (snake_case) row into the client-side
 * (camelCase) shape. Server callers can use either: pass a row in
 * via `getRotationStatus(normaliseRotation(row), today)`.
 */
export function normaliseRotation(row: CrewRotationRow): {
  onValue: number;
  onUnit: RotationUnit;
  offValue: number;
  offUnit: RotationUnit;
  startDate: string;
  endDate?: string | null;
} {
  return {
    onValue: row.on_value,
    onUnit: row.on_unit,
    offValue: row.off_value,
    offUnit: row.off_unit,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
  };
}

/**
 * Determine whether a crew member is in their ON or OFF rotation on
 * a given date. Returns `'not-started'` for dates before the rotation
 * begins.
 *
 * Accepts either the camelCase `CrewRotation` (client) or a partial
 * shape with the same keys (anything with `onValue`, `onUnit`,
 * `offValue`, `offUnit`, `startDate`, optional `endDate`).
 */
export function getRotationStatus(
  rotation: Pick<
    CrewRotation,
    'onValue' | 'onUnit' | 'offValue' | 'offUnit' | 'startDate' | 'endDate'
  >,
  checkDate: Date,
): RotationStatus {
  const ref = startOfDay(parseISO(rotation.startDate));
  const check = startOfDay(checkDate);
  if (check < ref) return 'not-started';

  if (rotation.endDate) {
    // Extended first ON period: days from startDate..endDate (inclusive) are ON.
    const firstOnEnd = addDays(startOfDay(parseISO(rotation.endDate)), 1);
    if (check < firstOnEnd) return 'on';

    const firstOffEnd = advanceBy(firstOnEnd, rotation.offValue, rotation.offUnit);
    if (check < firstOffEnd) return 'off';

    // Resume normal cycling from firstOffEnd.
    let cycleStart = firstOffEnd;
    for (let i = 0; i < 2000; i++) {
      const onEnd = advanceBy(cycleStart, rotation.onValue, rotation.onUnit);
      const offEnd = advanceBy(onEnd, rotation.offValue, rotation.offUnit);
      if (check >= cycleStart && check < onEnd) return 'on';
      if (check >= onEnd && check < offEnd) return 'off';
      cycleStart = offEnd;
    }
    return 'on';
  }

  let cycleStart = ref;
  for (let i = 0; i < 2000; i++) {
    const onEnd = advanceBy(cycleStart, rotation.onValue, rotation.onUnit);
    const offEnd = advanceBy(onEnd, rotation.offValue, rotation.offUnit);
    if (check >= cycleStart && check < onEnd) return 'on';
    if (check >= onEnd && check < offEnd) return 'off';
    cycleStart = offEnd;
  }
  return 'on';
}

export interface RotationSegment {
  start: Date;
  end: Date;
  status: 'on' | 'off';
}

/**
 * Walk the rotation pattern within a range and return contiguous
 * segments (ON/OFF blocks). Used for the calendar strip on the
 * rotation page.
 */
export function getRotationSegments(
  rotation: CrewRotation,
  rangeStart: Date,
  rangeEnd: Date,
): RotationSegment[] {
  const ref = startOfDay(parseISO(rotation.startDate));
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const segments: RotationSegment[] = [];

  if (end <= start) return segments;

  // Rotation hasn't started anywhere in this range → all OFF.
  if (ref >= end) {
    segments.push({ start, end, status: 'off' });
    return segments;
  }

  let cursor = start;
  if (ref > start) {
    segments.push({ start, end: ref, status: 'off' });
    cursor = ref;
  }

  while (cursor < end) {
    const status = getRotationStatus(rotation, cursor);
    if (status === 'not-started') {
      cursor = addDays(cursor, 1);
      continue;
    }

    // Advance day-by-day until the status flips, to find the
    // boundary of the current phase.
    let phaseEnd = end;
    let scan = addDays(cursor, 1);
    while (scan < end) {
      const scanStatus = getRotationStatus(rotation, scan);
      if (scanStatus !== status) {
        phaseEnd = scan;
        break;
      }
      scan = addDays(scan, 1);
    }

    segments.push({ start: cursor, end: phaseEnd, status });
    cursor = phaseEnd;
  }

  return segments;
}

/**
 * Find the next date (strictly after `fromDate`) where the rotation
 * status flips (on→off or off→on). Used to compute when a manual
 * override should "expire" — i.e. when the rotation naturally
 * schedules the next state change and the sync can resume control.
 *
 * Returns `null` if no transition is found within a generous lookahead
 * window (covers ~10 years; if a rotation legitimately runs longer
 * than that we'd want a different model anyway).
 */
export function getNextRotationTransition(
  rotation: Pick<
    CrewRotation,
    'onValue' | 'onUnit' | 'offValue' | 'offUnit' | 'startDate' | 'endDate'
  >,
  fromDate: Date,
): Date | null {
  const startStatus = getRotationStatus(rotation, fromDate);
  // If the rotation hasn't started yet, the "transition" is its start date.
  if (startStatus === 'not-started') {
    const ref = startOfDay(parseISO(rotation.startDate));
    return ref > fromDate ? ref : null;
  }

  // Walk forward day-by-day until status flips. Cap at ~10 years.
  const MAX_DAYS = 366 * 10;
  let cursor = addDays(startOfDay(fromDate), 1);
  for (let i = 0; i < MAX_DAYS; i++) {
    const s = getRotationStatus(rotation, cursor);
    if (s !== 'not-started' && s !== startStatus) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

/**
 * Short pretty label for a rotation pattern, e.g. "4w on / 4w off"
 * or "10d on / 5d off". Used in badges / toggle hints.
 */
export function formatRotationShort(
  rotation: Pick<CrewRotation, 'onValue' | 'onUnit' | 'offValue' | 'offUnit'>,
): string {
  const unitAbbrev = (u: RotationUnit) => (u === 'days' ? 'd' : u === 'weeks' ? 'w' : 'mo');
  return `${rotation.onValue}${unitAbbrev(rotation.onUnit)} on / ${rotation.offValue}${unitAbbrev(rotation.offUnit)} off`;
}

/** Notes prefix for leave periods auto-created from the Onboard Tracker
 *  sign-off toggle. Used to recognise and close them on sign-on. */
export const ONBOARD_TOGGLE_LEAVE_MARKER = '[onboard-toggle]';

/** How long a manual sign-off override lasts — effectively until the
 *  manager toggles the crew member back on-board. */
export function manualSignOffOverrideUntil(from: Date = new Date()): Date {
  return addDays(startOfDay(from), 365 * 10);
}

export interface OffBoardLeavePeriod {
  crewUserId: string;
  startDate: string;
  endDate: string;
  notes?: string | null;
}

/** Build a per-crew set of YYYY-MM-DD keys for all recorded leave periods
 *  (matches the Crew page leave-period source of truth). */
export function buildLeaveDatesByUser(
  periods: OffBoardLeavePeriod[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of periods) {
    if (!p.startDate || !p.endDate) continue;
    try {
      const start = startOfDay(parseISO(p.startDate));
      const end = startOfDay(parseISO(p.endDate));
      if (start > end) continue;
      let cursor = start;
      while (cursor <= end) {
        const key = format(cursor, 'yyyy-MM-dd');
        const set = map.get(p.crewUserId);
        if (set) set.add(key);
        else map.set(p.crewUserId, new Set([key]));
        cursor = addDays(cursor, 1);
      }
    } catch {
      // skip malformed rows
    }
  }
  return map;
}

/** Build a per-crew set of YYYY-MM-DD keys for days recorded as
 *  off-board via the Onboard Tracker sign-off toggle. */
export function buildOffBoardDatesByUser(
  periods: OffBoardLeavePeriod[],
  marker: string = ONBOARD_TOGGLE_LEAVE_MARKER,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of periods) {
    if (!p.notes?.startsWith(marker)) continue;
    if (!p.startDate || !p.endDate) continue;
    try {
      const start = startOfDay(parseISO(p.startDate));
      const end = startOfDay(parseISO(p.endDate));
      if (start > end) continue;
      let cursor = start;
      while (cursor <= end) {
        const key = format(cursor, 'yyyy-MM-dd');
        const set = map.get(p.crewUserId);
        if (set) set.add(key);
        else map.set(p.crewUserId, new Set([key]));
        cursor = addDays(cursor, 1);
      }
    } catch {
      // skip malformed rows
    }
  }
  return map;
}

export interface CrewDaysOwedPeriod {
  crewUserId: string;
  startDate: string;
  endDate: string;
  scope?: 'rotation_block' | 'until_return';
}

/** Last calendar day of the current ON block in the rotation. */
export function getEndOfOnBlock(
  rotation: Pick<
    CrewRotation,
    'onValue' | 'onUnit' | 'offValue' | 'offUnit' | 'startDate' | 'endDate'
  >,
  checkDate: Date,
): Date | null {
  if (getRotationStatus(rotation, checkDate) !== 'on') return null;
  let cursor = startOfDay(checkDate);
  for (let i = 0; i < 366 * 5; i++) {
    const next = addDays(cursor, 1);
    if (getRotationStatus(rotation, next) !== 'on') return cursor;
    cursor = next;
  }
  return cursor;
}

/** Build per-crew owed-day keys — only days where the rotation says ON
 *  but the crew member was recorded as owing time to the vessel. */
export function buildOwedDatesByUser(
  periods: CrewDaysOwedPeriod[],
  rotationForCrew: (crewUserId: string) => Pick<
    CrewRotation,
    'onValue' | 'onUnit' | 'offValue' | 'offUnit' | 'startDate' | 'endDate'
  > | null,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of periods) {
    if (!p.startDate || !p.endDate) continue;
    const rotation = rotationForCrew(p.crewUserId);
    if (!rotation) continue;
    try {
      const start = startOfDay(parseISO(p.startDate));
      const end = startOfDay(parseISO(p.endDate));
      if (start > end) continue;
      let cursor = start;
      while (cursor <= end) {
        if (getRotationStatus(rotation, cursor) === 'on') {
          const key = format(cursor, 'yyyy-MM-dd');
          const set = map.get(p.crewUserId);
          if (set) set.add(key);
          else map.set(p.crewUserId, new Set([key]));
        }
        cursor = addDays(cursor, 1);
      }
    } catch {
      // skip malformed rows
    }
  }
  return map;
}

/** Last day included when counting an assignment — mirrors the Crew page. */
export function getAssignmentEffectiveEnd(
  assignmentEndDate: string | null | undefined,
  referenceDate: Date = new Date(),
): Date {
  const today = startOfDay(referenceDate);
  if (!assignmentEndDate) return today;
  try {
    const end = startOfDay(parseISO(assignmentEndDate));
    return end > today ? today : end;
  } catch {
    return today;
  }
}

/** Count calendar days a period overlaps an assignment window (inclusive). */
export function countDaysInRange(
  periodStart: string,
  periodEnd: string,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  try {
    const start = startOfDay(parseISO(periodStart));
    const end = startOfDay(parseISO(periodEnd));
    const clampedStart = start < rangeStart ? rangeStart : start;
    const clampedEnd = end > rangeEnd ? rangeEnd : end;
    if (clampedStart > clampedEnd) return 0;
    return differenceInDays(clampedEnd, clampedStart) + 1;
  } catch {
    return 0;
  }
}

/** Day-count breakdown for a crew member's onboard tracker summary. */
export interface CrewOnboardSummary {
  /** First day included in the count (assignment start). */
  assignmentStart: string | null;
  /** Last day included (usually today). */
  throughDate: string;
  /** Calendar days on assignment (inclusive). */
  totalAssignmentDays: number;
  /** Physically on the vessel — not signed off and not a days-owed day. */
  daysOnBoard: number;
  /** Signed off / on leave (recorded off-board days, excluding days owed). */
  daysOnLeave: number;
  /** Signed off while the rotation said on board. */
  daysOwedToVessel: number;
  /** On board while the rotation said off board (extra time worked). */
  daysVesselOwesCrew: number;
  /** Days the rotation pattern marked as on board. */
  rotationOnDays: number;
  /** Days the rotation pattern marked as off board (scheduled leave). */
  rotationOffDays: number;
  /** Off vessel per rotation, without a separate sign-off record. */
  scheduledLeaveDays: number;
}

/**
 * Count onboard / leave / owed days for one crew member from their
 * assignment start through the effective end date (matches Crew page).
 */
export function computeCrewOnboardSummary(input: {
  assignmentStart: string | null;
  assignmentEndDate?: string | null;
  rotation: Pick<
    CrewRotation,
    'onValue' | 'onUnit' | 'offValue' | 'offUnit' | 'startDate' | 'endDate'
  > | null;
  /** All vessel leave periods for this crew member (Crew page source). */
  leavePeriods?: Array<{ startDate: string; endDate: string }>;
  owedDates?: Set<string>;
  referenceDate?: Date;
  /** Used to detect working through a scheduled off day (today only). */
  currentlyOnboard?: boolean;
}): CrewOnboardSummary {
  const effectiveEnd = getAssignmentEffectiveEnd(
    input.assignmentEndDate,
    input.referenceDate,
  );
  const throughIso = format(effectiveEnd, 'yyyy-MM-dd');
  const empty: CrewOnboardSummary = {
    assignmentStart: input.assignmentStart,
    throughDate: throughIso,
    totalAssignmentDays: 0,
    daysOnBoard: 0,
    daysOnLeave: 0,
    daysOwedToVessel: 0,
    daysVesselOwesCrew: 0,
    rotationOnDays: 0,
    rotationOffDays: 0,
    scheduledLeaveDays: 0,
  };

  if (!input.assignmentStart) return empty;

  let rangeStart: Date;
  try {
    rangeStart = startOfDay(parseISO(input.assignmentStart));
  } catch {
    return empty;
  }
  if (rangeStart > effectiveEnd) return empty;

  const owed = input.owedDates ?? new Set<string>();
  const leavePeriods = input.leavePeriods ?? [];
  const leaveDates = new Set<string>();
  for (const period of leavePeriods) {
    try {
      const start = startOfDay(parseISO(period.startDate));
      const end = startOfDay(parseISO(period.endDate));
      if (start > end) continue;
      let cursor = start < rangeStart ? rangeStart : start;
      const periodEnd = end > effectiveEnd ? effectiveEnd : end;
      while (cursor <= periodEnd) {
        leaveDates.add(format(cursor, 'yyyy-MM-dd'));
        cursor = addDays(cursor, 1);
      }
    } catch {
      // skip malformed rows
    }
  }

  const summary = {
    ...empty,
    totalAssignmentDays: differenceInDays(effectiveEnd, rangeStart) + 1,
    daysOnLeave: leavePeriods.reduce(
      (sum, period) =>
        sum + countDaysInRange(period.startDate, period.endDate, rangeStart, effectiveEnd),
      0,
    ),
  };

  let cursor = rangeStart;
  while (cursor <= effectiveEnd) {
    const key = format(cursor, 'yyyy-MM-dd');

    const rotationStatus = input.rotation
      ? getRotationStatus(input.rotation, cursor)
      : null;

    if (rotationStatus === 'on') summary.rotationOnDays++;
    else if (rotationStatus === 'off') summary.rotationOffDays++;

    if (owed.has(key)) {
      summary.daysOwedToVessel++;
    } else if (leaveDates.has(key)) {
      // Leave days are counted via leavePeriods sum for Crew-page parity.
    } else if (rotationStatus === 'off') {
      const isToday = cursor.getTime() === effectiveEnd.getTime();
      if (isToday && input.currentlyOnboard) {
        summary.daysOnBoard++;
        summary.daysVesselOwesCrew++;
      } else {
        summary.scheduledLeaveDays++;
      }
    } else {
      summary.daysOnBoard++;
    }

    cursor = addDays(cursor, 1);
  }

  return summary;
}
