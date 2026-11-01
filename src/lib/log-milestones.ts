import { eachDayOfInterval, endOfDay, format, startOfDay } from 'date-fns';

import { MIN_UNDERWAY_MS_FOR_SEA_DAY } from '@/lib/ais/sea-day-threshold';

export type LogMilestoneMetric = 'sea_days' | 'distance_nm' | 'passages';

export const LOG_MILESTONE_THRESHOLDS: Record<LogMilestoneMetric, number[]> = {
  sea_days: [30, 50, 100, 180, 365, 500, 1000, 2000],
  distance_nm: [1000, 5000, 10000, 25000, 50000, 100000],
  passages: [10, 25, 50, 100, 250, 500],
};

export type LogMilestoneProgress = Partial<Record<LogMilestoneMetric, number>>;

export type ReachedLogMilestone = {
  id: string;
  metric: LogMilestoneMetric;
  threshold: number;
  value: number;
  title: string;
  description: string;
  href: string;
};

const METRICS: LogMilestoneMetric[] = ['sea_days', 'distance_nm', 'passages'];

export function seaDayKeysForPassage(startIso: string, endIso: string): string[] {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }
  return eachDayOfInterval({ start: startOfDay(startMs), end: endOfDay(endMs) })
    .filter((day) => {
      const overlapMs =
        Math.min(endMs, endOfDay(day).getTime()) -
        Math.max(startMs, startOfDay(day).getTime());
      return overlapMs >= MIN_UNDERWAY_MS_FOR_SEA_DAY;
    })
    .map((day) => format(day, 'yyyy-MM-dd'));
}

export function parseLogMilestoneProgress(raw: unknown): LogMilestoneProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const progress: LogMilestoneProgress = {};
  for (const metric of METRICS) {
    const value = Number(record[metric]);
    if (Number.isFinite(value) && value > 0) progress[metric] = value;
  }
  return progress;
}

export function highestReachedThreshold(
  thresholds: number[],
  value: number,
): number | null {
  let best: number | null = null;
  for (const threshold of thresholds) {
    if (value >= threshold) best = threshold;
  }
  return best;
}

export function nextLogMilestoneThreshold(
  metric: LogMilestoneMetric,
  value: number,
): number | null {
  return LOG_MILESTONE_THRESHOLDS[metric].find((threshold) => threshold > value) ?? null;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function milestoneCopy(
  metric: LogMilestoneMetric,
  threshold: number,
  value: number,
): { title: string; description: string; href: string } {
  const next = nextLogMilestoneThreshold(metric, value);
  if (metric === 'sea_days') {
    return {
      title: `Passed ${formatCount(threshold)} days at sea`,
      description: next
        ? `You're at ${formatCount(value)} underway days. Next mark: ${formatCount(next)} days.`
        : `You're at ${formatCount(value)} underway days. That's a serious stretch of sea time.`,
      href: '/dashboard/calendar',
    };
  }
  if (metric === 'distance_nm') {
    return {
      title: `Passed ${formatCount(threshold)} NM`,
      description: next
        ? `Your passage log total is ${formatCount(value)} NM. Next mark: ${formatCount(next)} NM.`
        : `Your passage log total is ${formatCount(value)} NM.`,
      href: '/dashboard/passage-logbook',
    };
  }
  return {
    title: `Passed ${formatCount(threshold)} passages`,
    description: next
      ? `You've logged ${formatCount(value)} passages. Next mark: ${formatCount(next)}.`
      : `You've logged ${formatCount(value)} passages.`,
    href: '/dashboard/passage-logbook',
  };
}

export function pendingLogMilestones(
  values: Record<LogMilestoneMetric, number>,
  progress: LogMilestoneProgress,
): ReachedLogMilestone[] {
  const pending: ReachedLogMilestone[] = [];
  for (const metric of METRICS) {
    const value = Math.max(0, values[metric] || 0);
    const notified = progress[metric] ?? 0;
    const highest = highestReachedThreshold(
      LOG_MILESTONE_THRESHOLDS[metric],
      value,
    );
    if (highest == null || highest <= notified) continue;
    const copy = milestoneCopy(metric, highest, value);
    pending.push({
      id: `milestone-${metric}-${highest}`,
      metric,
      threshold: highest,
      value,
      ...copy,
    });
  }
  return pending;
}

export function acknowledgeLogMilestone(
  progress: LogMilestoneProgress,
  metric: LogMilestoneMetric,
  threshold: number,
): LogMilestoneProgress {
  const current = progress[metric] ?? 0;
  return {
    ...progress,
    [metric]: Math.max(current, threshold),
  };
}
