'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  endOfYear,
  format,
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
import {
  CALENDAR_ALL_STATES,
  CALENDAR_STATE_LABELS,
  StateMonthGrid,
} from '@/components/dashboard/state-month-grid';
import { calendarStateSolid } from '@/lib/calendar-state-colors';
import type { DailyStatus, StateLog } from '@/lib/types';
import { useSupabase } from '@/supabase';
import { getAllStateLogsForUser } from '@/supabase/database/queries';

type Props = {
  userId: string;
};

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
    const isInYear = (iso: string) =>
      iso >= format(yearStart, 'yyyy-MM-dd') && iso <= format(yearEnd, 'yyyy-MM-dd');
    for (const log of logs) {
      if (!log.date || !isInYear(log.date)) continue;
      const s = log.state as DailyStatus;
      if (s in counts) {
        counts[s]++;
        total++;
      }
    }
    return { counts, total };
  }, [logs, yearStart, yearEnd]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const log of logs) {
      if (!log.date) continue;
      const y = Number(log.date.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => a - b);
  }, [logs]);

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>State calendar</CardTitle>
            <CardDescription>Daily vessel states for this user</CardDescription>
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
          <div className="flex flex-wrap gap-2">
            {CALENDAR_ALL_STATES.map((s) => (
              <div
                key={s}
                className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: calendarStateSolid(s) }}
                />
                <span className="text-muted-foreground">{CALENDAR_STATE_LABELS[s]}</span>
                <span className="font-semibold">{yearStats.counts[s]}</span>
              </div>
            ))}
          </div>

          {yearStats.total === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              No state logs for this user in {year}.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {months.map((monthStart) => (
                <StateMonthGrid
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
