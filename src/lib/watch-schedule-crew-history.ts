import { format, parseISO, startOfDay } from 'date-fns';

import type { WatchAssignment, WatchSchedule } from '@/lib/watch-schedule-types';

export type ScheduledWatchStatus = 'past' | 'today' | 'upcoming';

export interface CrewScheduledWatchEntry {
  id: string;
  scheduleId: string;
  scheduleName: string;
  vesselId: string;
  vesselName: string;
  date: string;
  startHour: number;
  endHour: number;
  durationHours: number;
  shiftName: string | null;
  userPosition: string | null;
  scheduleStartDate: string;
  scheduleEndDate: string;
  status: ScheduledWatchStatus;
}

export interface ScheduledWatchMonthBucket {
  monthKey: string;
  monthLabel: string;
  watches: number;
  hours: number;
  daysWorked: number;
  entries: CrewScheduledWatchEntry[];
}

export interface CrewScheduledWatchSummary {
  totalWatches: number;
  pastWatches: number;
  upcomingWatches: number;
  totalHours: number;
  pastHours: number;
  totalDaysWorked: number;
  entries: CrewScheduledWatchEntry[];
  months: ScheduledWatchMonthBucket[];
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthKeyFromDate(dateStr: string): string {
  const d = parseISO(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key: string): string {
  const [y, m] = key.split('-');
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${MONTH_LABELS[idx]} ${y}`;
}

function statusForDate(dateStr: string, today: Date): ScheduledWatchStatus {
  try {
    const day = startOfDay(parseISO(dateStr));
    if (day.getTime() < today.getTime()) return 'past';
    if (day.getTime() > today.getTime()) return 'upcoming';
    return 'today';
  } catch {
    return 'past';
  }
}

/** Flatten every watch block assigned to this crew member across saved schedules. */
export function flattenCrewScheduledWatches(
  schedules: WatchSchedule[],
  userId: string,
  vesselNames: Record<string, string>,
  today: Date = startOfDay(new Date()),
): CrewScheduledWatchEntry[] {
  const entries: CrewScheduledWatchEntry[] = [];

  for (const schedule of schedules) {
    if (!schedule.id) continue;
    const vesselName = vesselNames[schedule.vesselId] ?? 'Unknown vessel';

    for (const assignment of schedule.assignments) {
      if (assignment.userId !== userId) continue;
      entries.push({
        id: assignment.id,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        vesselId: schedule.vesselId,
        vesselName,
        date: assignment.date,
        startHour: assignment.startHour,
        endHour: assignment.endHour,
        durationHours: assignment.endHour - assignment.startHour,
        shiftName: assignment.shiftName ?? null,
        userPosition: assignment.userPosition ?? null,
        scheduleStartDate: schedule.startDate,
        scheduleEndDate: schedule.endDate,
        status: statusForDate(assignment.date, today),
      });
    }
  }

  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.startHour !== b.startHour) return b.startHour - a.startHour;
    return a.scheduleName.localeCompare(b.scheduleName);
  });
}

export function summariseCrewScheduledWatches(
  entries: CrewScheduledWatchEntry[],
): CrewScheduledWatchSummary {
  const past = entries.filter((e) => e.status === 'past');
  const upcoming = entries.filter((e) => e.status === 'upcoming' || e.status === 'today');

  const monthMap = new Map<string, ScheduledWatchMonthBucket>();
  for (const entry of entries) {
    const key = monthKeyFromDate(entry.date);
    let bucket = monthMap.get(key);
    if (!bucket) {
      bucket = {
        monthKey: key,
        monthLabel: monthLabelFromKey(key),
        watches: 0,
        hours: 0,
        daysWorked: 0,
        entries: [],
      };
      monthMap.set(key, bucket);
    }
    bucket.entries.push(entry);
    bucket.watches += 1;
    bucket.hours += entry.durationHours;
  }

  for (const bucket of monthMap.values()) {
    bucket.daysWorked = new Set(bucket.entries.map((e) => e.date)).size;
    bucket.entries.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.startHour - a.startHour;
    });
  }

  return {
    totalWatches: entries.length,
    pastWatches: past.length,
    upcomingWatches: upcoming.length,
    totalHours: entries.reduce((sum, e) => sum + e.durationHours, 0),
    pastHours: past.reduce((sum, e) => sum + e.durationHours, 0),
    totalDaysWorked: new Set(entries.map((e) => e.date)).size,
    entries,
    months: Array.from(monthMap.values()).sort((a, b) =>
      a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
    ),
  };
}

export function fmtWatchHour(h: number): string {
  const actual = h === 24 ? 0 : h;
  return `${String(actual).padStart(2, '0')}:00`;
}

export function fmtWatchDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEE d MMM yyyy');
  } catch {
    return dateStr;
  }
}

export function scheduledWatchRoleLabel(entry: CrewScheduledWatchEntry): string {
  if (entry.shiftName?.trim()) return entry.shiftName.trim();
  if (entry.userPosition?.trim()) return entry.userPosition.trim();
  return 'Watch';
}
