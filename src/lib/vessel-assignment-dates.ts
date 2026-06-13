/**
 * Shared assignment period rules for sea-time editing and AIS history import.
 * Assignment ranges use [start_date, end_date) — end_date is exclusive.
 */

export type AssignmentPeriod = {
  startDate: string;
  endDate: string | null;
};

export type DateRangeInclusive = {
  from: string;
  to: string;
};

function parseDateKey(dateKey: string): number {
  return Date.parse(`${dateKey}T12:00:00Z`);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(parseDateKey(dateKey));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** True when `date` falls in [start_date, end_date). */
export function isDateWithinAssignmentPeriod(
  date: string,
  assignment: AssignmentPeriod,
): boolean {
  if (date < assignment.startDate) return false;
  if (assignment.endDate && date >= assignment.endDate) return false;
  return true;
}

export function isDateWithinAnyAssignmentPeriod(
  date: string,
  assignments: AssignmentPeriod[],
): boolean {
  return assignments.some((a) => isDateWithinAssignmentPeriod(date, a));
}

/** Intersect inclusive [from, to] with assignment [start, end). */
export function intersectRangeWithAssignment(
  from: string,
  to: string,
  assignment: AssignmentPeriod,
): DateRangeInclusive | null {
  const segFrom = from > assignment.startDate ? from : assignment.startDate;
  let segTo = to;

  if (assignment.endDate) {
    const lastValid = addDaysToDateKey(assignment.endDate, -1);
    if (segFrom > lastValid) return null;
    if (segTo > lastValid) segTo = lastValid;
  }

  if (segFrom > segTo) return null;
  return { from: segFrom, to: segTo };
}

export function mergeInclusiveDateRanges(
  ranges: DateRangeInclusive[],
): DateRangeInclusive[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const merged: DateRangeInclusive[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    const nextDayAfterLast = addDaysToDateKey(last.to, 1);

    if (current.from <= nextDayAfterLast) {
      if (current.to > last.to) last.to = current.to;
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/** Segments of [from, to] that overlap any assignment period. */
export function getAssignmentSegmentsInRange(
  from: string,
  to: string,
  assignments: AssignmentPeriod[],
): DateRangeInclusive[] {
  const segments = assignments
    .map((a) => intersectRangeWithAssignment(from, to, a))
    .filter((s): s is DateRangeInclusive => s != null);

  return mergeInclusiveDateRanges(segments);
}

export function getEarliestAssignmentStart(assignments: AssignmentPeriod[]): string | null {
  if (assignments.length === 0) return null;
  return assignments.reduce(
    (earliest, a) => (a.startDate < earliest ? a.startDate : earliest),
    assignments[0].startDate,
  );
}

/** Latest importable date across assignments (respecting exclusive end). */
export function getLatestAssignmentEnd(assignments: AssignmentPeriod[]): string | null {
  if (assignments.length === 0) return null;

  let latest: string | null = null;
  for (const a of assignments) {
    const end = a.endDate ? addDaysToDateKey(a.endDate, -1) : todayDateKey();
    if (!latest || end > latest) latest = end;
  }
  return latest;
}

export function formatAssignmentPeriodLabel(assignment: AssignmentPeriod): string {
  const endLabel = assignment.endDate
    ? addDaysToDateKey(assignment.endDate, -1)
    : 'ongoing';
  return `${assignment.startDate} – ${endLabel}`;
}
