import { addYears, endOfDay, parse, parseISO, startOfDay } from 'date-fns';

import { isAisSourcedPassage } from '@/lib/passages/ais-logbook-link';
import { timeRangeOverlapsLeave, type LeavePeriod } from '@/lib/passages-map/filter-by-leave-periods';
import type { PassageLog, VesselAssignment } from '@/lib/types';

export type LogbookPassageRow = Pick<
  PassageLog,
  'vessel_id' | 'start_time' | 'end_time' | 'source' | 'ais_fingerprint' | 'track_data' | 'distance_nm'
>;

export function passageDistanceNm(row: { distance_nm?: number | null }): number {
  const nm = Number(row.distance_nm);
  return Number.isFinite(nm) && nm > 0 ? nm : 0;
}

function isAisLinkedPassage(passage: LogbookPassageRow): boolean {
  return Boolean(
    passage.ais_fingerprint ||
      isAisSourcedPassage(passage.source) ||
      (passage.track_data as { aisFingerprint?: string } | null)?.aisFingerprint,
  );
}

export function passageOverlapsAssignment(
  passage: LogbookPassageRow,
  assignment: Pick<VesselAssignment, 'vesselId' | 'startDate' | 'endDate'>,
): boolean {
  if (assignment.vesselId !== passage.vessel_id) return false;
  const assignStart = startOfDay(parse(assignment.startDate, 'yyyy-MM-dd', new Date()));
  const assignEnd = assignment.endDate
    ? endOfDay(parse(assignment.endDate, 'yyyy-MM-dd', new Date()))
    : endOfDay(addYears(new Date(), 50));
  const pStart = startOfDay(parseISO(passage.start_time));
  const pEnd = endOfDay(parseISO(passage.end_time));
  return pStart.getTime() <= assignEnd.getTime() && pEnd.getTime() >= assignStart.getTime();
}

export function filterPassagesForCrewAssignments<T extends LogbookPassageRow>(
  passages: T[],
  assignments: Array<Pick<VesselAssignment, 'vesselId' | 'startDate' | 'endDate'>>,
): T[] {
  if (assignments.length === 0) return [];
  const assignedVesselIds = new Set(assignments.map((a) => a.vesselId));
  return passages.filter((passage) => {
    if (isAisLinkedPassage(passage)) return assignedVesselIds.has(passage.vessel_id);
    return assignments.some((assignment) => passageOverlapsAssignment(passage, assignment));
  });
}

export function filterPassagesOutsideLeave<T extends LogbookPassageRow>(
  passages: T[],
  leaveByVessel: Map<string, LeavePeriod[]>,
): T[] {
  if (leaveByVessel.size === 0) return passages;
  return passages.filter((passage) => {
    const leave = leaveByVessel.get(passage.vessel_id) ?? [];
    if (leave.length === 0) return true;
    return !timeRangeOverlapsLeave(passage.start_time, passage.end_time, leave);
  });
}
