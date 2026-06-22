'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
  format,
  getDay,
  startOfYear,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { calendarStateSolid } from '@/lib/calendar-state-colors';
import type { DailyStatus, StateLog } from '@/lib/types';
import { useSupabase } from '@/supabase';
import { getAllStateLogsForUser } from '@/supabase/database/queries';
import { cn } from '@/lib/utils';

type Props = {
  userId: string;
};

const STATE_LABELS: Record<DailyStatus, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored / In port',
  'on-leave': 'On leave',
  'in-yard': 'In yard',
};

const ALL_STATES: DailyStatus[] = [
  'underway',
  'at-anchor',
  'in-port',
  'in-yard',
  'on-leave',
];

export function CalendarTab({ userId }: Props) {
  const { supabase } = useSupabase();
  const [logs, setLogs] = useState<StateLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = await getAllStateLogsForUser(supabase, userId);
        if (!cancelled) setLogs(data);
      } catch (err) {
        console.error('[admin/users/calendar] load logs:', err);
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const stateByDate = useMemo(() => {
    const map = new Map<string, DailyStatus>();
    for (const log of logs) {
      if (log.date && log.state) map.set(log.date, log.state as DailyStatus);
    }
    return map;
  }, [logs]);

  const yearStart = useMemo(() => startOfYear(new Date(year, 0, 1)), [year]);
  const yearEnd = useMemo(() => endOfYear(new Date(year, 0, 1)), [year]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  }, [year]);

  const yearStats = useMemo(() => {
    const counts: Record<DailyStatus, number> = {
      underway: 0,
      'at-anchor': 0,
      'in-port': 0,
      'in-yard': 0,
      'on-leave': 0,
    };
    let total = 0;
    const isInYear = (iso: string) => iso >= format(yearStart, 'yyyy-MM-dd') && iso <= format(yearEnd, 'yyyy-MM-dd');
    for (const log of logs) {
      if (!log.date || !isInYear(log.date)) continue;
      const s = log.state as DailyStatus;
      if (counts[s] != null) {
        counts[s] += 1;
        total += 1;
      }
    }
    return { counts, total };
  }, [logs, yearStart, yearEnd]);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const minYear = (() => {
      let min = now;
      for (const log of logs) {
        if (log.date) {
          const y = parseInt(log.date.slice(0, 4), 10);
          if (!Number.isNaN(y) && y < min) min = y;
        }
      }
      return min;
    })();
    return Array.from({ length: now - minYear + 2 }, (_, i) => minYear + i);
  }, [logs]);

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Calendar</CardTitle>
            <CardDescription>
              {yearStats.total} day{yearStats.total === 1 ? '' : 's'} logged in {year}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous year"
              onClick={() => setYear((y) => y - 1)}
              disabled={!yearOptions.includes(year - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[60px] text-center text-lg font-semibold">
              {year}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next year"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= new Date().getFullYear()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Legend + counts */}
          <div className="flex flex-wrap gap-2">
            {ALL_STATES.map((s) => (
              <div
                key={s}
                className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: calendarStateSolid(s) }}
                />
                <span className="text-muted-foreground">{STATE_LABELS[s]}</span>
                <span className="font-semibold">{yearStats.counts[s]}</span>
              </div>
            ))}
          </div>

          {/* Year grid: 12 months */}
          {yearStats.total === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              No state logs for this user in {year}.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {months.map((monthStart) => (
                <MonthGrid
                  key={monthStart.toISOString()}
                  monthStart={monthStart}
                  stateByDate={stateByDate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MonthGrid({
  monthStart,
  stateByDate,
}: {
  monthStart: Date;
  stateByDate: Map<string, DailyStatus>;
}) {
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Pad before the first day so the grid lines up Mon-Sun (we'll use Sun-Sat to match common US layout).
  const startWeekday = getDay(monthStart); // 0 (Sun) – 6 (Sat)
  const padBefore = startWeekday;

  return (
    <Card className="rounded-xl border bg-card/50">
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
            return (
              <div
                key={key}
                title={
                  state
                    ? `${format(d, 'EEE d MMM yyyy')} — ${STATE_LABELS[state]}`
                    : format(d, 'EEE d MMM yyyy')
                }
                className={cn(
                  'flex aspect-square items-center justify-center rounded-[3px] text-[10px] font-medium',
                  !state && 'border bg-card text-muted-foreground/50',
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
      </CardContent>
    </Card>
  );
}
