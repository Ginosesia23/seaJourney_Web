import { format as formatDate } from 'date-fns';

/**
 * Represents an assignment range (start date required, end date optional =
 * currently onboard).
 */
export interface AssignmentRangeInput {
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}

export interface LeavePeriodInput {
  startDate: string;
  endDate: string;
}

export interface PresetPeriod {
  startDate: Date;
  endDate: Date;
  label: string;
}

/** Parse a date string (yyyy-MM-dd or ISO) to a midnight Date in local tz. */
function normalize(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(new Date().setHours(0, 0, 0, 0));
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Compute preset date ranges between leave periods for a crew assignment.
 *
 * Given an assignment window and one or more leave periods (from manual crew
 * leave records, from the state logs, or both), returns the non-leave windows
 * that fall inside the assignment:
 *   - Before the first leave (if assignment starts earlier)
 *   - Between consecutive leaves
 *   - After the last leave (up to today or assignment end)
 *
 * Labels are pre-formatted for display in a preset picker.
 */
export function computePeriodsBetweenLeave(
  assignment: AssignmentRangeInput | null | undefined,
  ...leaveSources: Array<ReadonlyArray<LeavePeriodInput> | null | undefined>
): PresetPeriod[] {
  if (!assignment || !assignment.startDate) return [];

  const allLeavePeriods: LeavePeriodInput[] = [];
  for (const src of leaveSources) {
    if (!src) continue;
    for (const p of src) {
      if (p?.startDate && p?.endDate) {
        allLeavePeriods.push({ startDate: p.startDate, endDate: p.endDate });
      }
    }
  }
  if (allLeavePeriods.length === 0) return [];

  const sorted = [...allLeavePeriods].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
  const assignmentStart = normalize(assignment.startDate);
  const assignmentEnd = normalize(assignment.endDate ?? undefined);
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const effectiveEnd = assignmentEnd > today ? today : assignmentEnd;

  const periods: PresetPeriod[] = [];

  const firstStart = normalize(sorted[0].startDate);
  if (assignmentStart < firstStart) {
    const periodEnd = new Date(firstStart);
    periodEnd.setDate(periodEnd.getDate() - 1);
    periodEnd.setHours(0, 0, 0, 0);
    if (periodEnd >= assignmentStart) {
      periods.push({
        startDate: assignmentStart,
        endDate: periodEnd,
        label: `Before first leave (${formatDate(assignmentStart, 'MMM dd')} - ${formatDate(periodEnd, 'MMM dd, yyyy')})`,
      });
    }
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = normalize(sorted[i].endDate);
    const nextStart = normalize(sorted[i + 1].startDate);
    const periodStart = new Date(currentEnd);
    periodStart.setDate(periodStart.getDate() + 1);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(nextStart);
    periodEnd.setDate(periodEnd.getDate() - 1);
    periodEnd.setHours(0, 0, 0, 0);
    if (periodStart <= periodEnd) {
      periods.push({
        startDate: periodStart,
        endDate: periodEnd,
        label: `Between leave (${formatDate(periodStart, 'MMM dd')} - ${formatDate(periodEnd, 'MMM dd, yyyy')})`,
      });
    }
  }

  const lastEnd = normalize(sorted[sorted.length - 1].endDate);
  const afterStart = new Date(lastEnd);
  afterStart.setDate(afterStart.getDate() + 1);
  afterStart.setHours(0, 0, 0, 0);
  if (afterStart <= effectiveEnd) {
    periods.push({
      startDate: afterStart,
      endDate: effectiveEnd,
      label: `After last leave (${formatDate(afterStart, 'MMM dd')} - ${formatDate(effectiveEnd, 'MMM dd, yyyy')})`,
    });
  }

  return periods;
}
