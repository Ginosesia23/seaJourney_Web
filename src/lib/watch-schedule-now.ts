import { format } from 'date-fns';

import type { WatchAssignment, WatchSchedule } from '@/lib/watch-schedule-types';

export type OnWatchNow = {
  userId: string;
  userName: string;
  userPosition: string | null;
  startHour: number;
  endHour: number;
  scheduleId: string | null;
  scheduleName: string;
};

/** Watch blocks covering `now` on an active (date-range) schedule. */
export function assignmentsOnWatchNow(
  schedules: WatchSchedule[],
  now = new Date(),
): OnWatchNow[] {
  const date = format(now, 'yyyy-MM-dd');
  const hour = now.getHours() + now.getMinutes() / 60;
  const out: OnWatchNow[] = [];
  const seen = new Set<string>();

  for (const schedule of schedules) {
    if (schedule.startDate > date || schedule.endDate < date) continue;
    for (const assignment of schedule.assignments) {
      if (assignment.date !== date) continue;
      if (hour < assignment.startHour || hour >= assignment.endHour) continue;
      const key = `${assignment.userId}:${assignment.startHour}:${assignment.endHour}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        userId: assignment.userId,
        userName: assignment.userName,
        userPosition: assignment.userPosition ?? null,
        startHour: assignment.startHour,
        endHour: assignment.endHour,
        scheduleId: schedule.id ?? null,
        scheduleName: schedule.name,
      });
    }
  }

  out.sort(
    (a, b) =>
      a.startHour - b.startHour || a.userName.localeCompare(b.userName),
  );
  return out;
}

export function parseWatchScheduleRow(row: Record<string, unknown>): WatchSchedule {
  return {
    id: row.id as string,
    vesselId: row.vessel_id as string,
    createdBy: row.created_by as string,
    name: row.name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    watchSystem: row.watch_system as WatchSchedule['watchSystem'],
    shifts: (row.shifts as WatchSchedule['shifts']) ?? [],
    assignments: (row.assignments as WatchAssignment[]) ?? [],
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  };
}

export function fmtWatchHour(h: number): string {
  const actual = h === 24 ? 0 : h;
  return `${String(actual).padStart(2, '0')}:00`;
}
