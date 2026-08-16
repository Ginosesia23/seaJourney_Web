'use client';

import { useMemo } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
} from 'date-fns';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  MonthStateSummary,
  buildMonthSummaryItems,
} from '@/components/dashboard/month-state-summary';
import { calendarStateSolid } from '@/lib/calendar-state-colors';
import type { DailyStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export const CALENDAR_STATE_LABELS: Record<DailyStatus, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored / In port',
  'on-leave': 'On leave',
  'in-yard': 'In yard',
};

export const CALENDAR_ALL_STATES: DailyStatus[] = [
  'underway',
  'at-anchor',
  'in-port',
  'in-yard',
  'on-leave',
];

export type DayAccent = 'conflict' | 'leave-fill' | null;

type MonthGridProps = {
  monthStart: Date;
  stateByDate: Map<string, DailyStatus>;
  /** Optional per-day accent (e.g. conflict ring). */
  accentByDate?: Map<string, DayAccent>;
  /** Collapsible month day-count summary (Calendar page design). Default true. */
  showSummary?: boolean;
  includeOnLeave?: boolean;
  className?: string;
};

export function StateMonthGrid({
  monthStart,
  stateByDate,
  accentByDate,
  showSummary = true,
  includeOnLeave = true,
  className,
}: MonthGridProps) {
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const padBefore = getDay(monthStart);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  const summaryItems = useMemo(() => {
    if (!showSummary) return [];
    const counts: Partial<Record<DailyStatus, number>> = {};
    for (const [dateStr, state] of stateByDate) {
      if (dateStr < monthStartStr || dateStr > monthEndStr) continue;
      counts[state] = (counts[state] || 0) + 1;
    }
    return buildMonthSummaryItems({
      counts,
      includeOnLeave,
      includePassage: false,
      includeStandby: false,
    });
  }, [showSummary, stateByDate, monthStartStr, monthEndStr, includeOnLeave]);

  return (
    <Card className={cn('rounded-xl border bg-card/50', className)}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-semibold">
          {format(monthStart, 'MMMM yyyy')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d.charAt(0)}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-0.5">
          {Array.from({ length: padBefore }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const state = stateByDate.get(key);
            const accent = accentByDate?.get(key) ?? null;
            const titleParts = [format(d, 'EEE d MMM yyyy')];
            if (state) titleParts.push(CALENDAR_STATE_LABELS[state]);
            if (accent === 'conflict') titleParts.push('Conflict with other source');
            if (accent === 'leave-fill') titleParts.push('Leave period (no vessel log)');

            return (
              <div
                key={key}
                title={titleParts.join(' — ')}
                className={cn(
                  'relative flex aspect-square items-center justify-center rounded-[3px] text-[10px] font-medium',
                  !state && 'border bg-card text-muted-foreground/50',
                  accent === 'conflict' &&
                    'ring-2 ring-amber-500 ring-offset-1 ring-offset-background',
                  accent === 'leave-fill' && !state && 'border-dashed border-muted-foreground/40',
                )}
                style={
                  state
                    ? {
                        background: calendarStateSolid(state),
                        color: 'white',
                      }
                    : undefined
                }
              >
                {d.getDate()}
              </div>
            );
          })}
        </div>
        {showSummary && summaryItems.length > 0 && (
          <MonthStateSummary items={summaryItems} />
        )}
      </CardContent>
    </Card>
  );
}
