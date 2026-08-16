'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  endOfYear,
  format,
  parse,
  startOfDay,
  startOfYear,
} from 'date-fns';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { calendarStateSolid } from '@/lib/calendar-state-colors';
import {
  CALENDAR_ALL_STATES,
  CALENDAR_STATE_LABELS,
  StateMonthGrid,
  type DayAccent,
} from '@/components/dashboard/state-month-grid';
import type { DailyStatus, StateLog } from '@/lib/types';
import { getVesselStateLogs } from '@/supabase/database/queries';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

function ConflictStateCell({ state }: { state: DailyStatus | null }) {
  if (!state) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: calendarStateSolid(state) }}
      />
      <span>{CALENDAR_STATE_LABELS[state]}</span>
    </span>
  );
}

function FragmentMonth({
  label,
  rows,
}: {
  label: string;
  rows: Array<{
    date: string;
    vessel: DailyStatus | null;
    crew: DailyStatus | null;
  }>;
}) {
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td
          colSpan={3}
          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {label}
          <span className="ml-2 font-normal normal-case tracking-normal">
            ({rows.length})
          </span>
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.date} className="border-b border-border/60 last:border-0">
          <td className="whitespace-nowrap px-3 py-1.5 font-medium tabular-nums">
            {format(parse(row.date, 'yyyy-MM-dd', new Date()), 'd MMM')}
          </td>
          <td className="px-3 py-1.5">
            <ConflictStateCell state={row.vessel} />
          </td>
          <td className="px-3 py-1.5">
            <ConflictStateCell state={row.crew} />
          </td>
        </tr>
      ))}
    </>
  );
}

type LeavePeriodLike = {
  startDate: string;
  endDate: string;
};

type Props = {
  supabase: SupabaseClient;
  vesselId: string;
  crewUserId: string;
  /** Vessel manager user id — vessel logs are filtered to this account. */
  vesselManagerUserId: string;
  rangeStart: string;
  rangeEnd: string | null;
  leavePeriods: LeavePeriodLike[];
  hasCrewAccess: boolean;
  crewDisplayName?: string | null;
};

type SourceMode = 'vessel' | 'crew';

function dateOnly(d: string): string {
  return d.includes('T') ? d.split('T')[0]! : d;
}

function buildLeaveDateSet(
  leavePeriods: LeavePeriodLike[],
  rangeStart: string,
  rangeEnd: string,
): Set<string> {
  const set = new Set<string>();
  const rangeLo = parse(rangeStart, 'yyyy-MM-dd', new Date());
  const rangeHi = parse(rangeEnd, 'yyyy-MM-dd', new Date());
  for (const lp of leavePeriods) {
    if (!lp.startDate || !lp.endDate) continue;
    try {
      const start = parse(lp.startDate, 'yyyy-MM-dd', new Date());
      const end = parse(lp.endDate, 'yyyy-MM-dd', new Date());
      if (end < start) continue;
      const lo = start < rangeLo ? rangeLo : start;
      const hi = end > rangeHi ? rangeHi : end;
      if (lo > hi) continue;
      let cur = startOfDay(lo);
      const endDay = startOfDay(hi);
      while (cur <= endDay) {
        set.add(format(cur, 'yyyy-MM-dd'));
        cur = addDays(cur, 1);
      }
    } catch {
      // skip bad rows
    }
  }
  return set;
}

function mapToStateByDate(logs: StateLog[]): Map<string, DailyStatus> {
  const map = new Map<string, DailyStatus>();
  for (const log of logs) {
    if (!log.date || !log.state) continue;
    map.set(dateOnly(log.date), log.state as DailyStatus);
  }
  return map;
}

export function CrewMemberStateCalendar({
  supabase,
  vesselId,
  crewUserId,
  vesselManagerUserId,
  rangeStart,
  rangeEnd,
  leavePeriods,
  hasCrewAccess,
  crewDisplayName,
}: Props) {
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const effectiveEnd =
    rangeEnd && rangeEnd < todayIso ? rangeEnd : todayIso;

  const [source, setSource] = useState<SourceMode>('vessel');
  const [showConflicts, setShowConflicts] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [year, setYear] = useState(() => {
    const y = parseInt(rangeStart.slice(0, 4), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  });
  const [vesselLogs, setVesselLogs] = useState<StateLog[]>([]);
  const [crewLogs, setCrewLogs] = useState<StateLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCrewAccess && source === 'crew') {
      setSource('vessel');
      setShowConflicts(false);
    }
  }, [hasCrewAccess, source]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const vesselRes = await fetch(
          `/api/vessel-logs?vesselId=${encodeURIComponent(vesselId)}`,
          {
            credentials: 'include',
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : undefined,
          },
        );
        if (!vesselRes.ok) {
          const err = await vesselRes.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error || 'Failed to load vessel logs',
          );
        }
        const { logs: allVesselLogs } = (await vesselRes.json()) as {
          logs: StateLog[];
        };
        const managerLogs = (allVesselLogs ?? []).filter(
          (l) => l.userId === vesselManagerUserId,
        );

        let crew: StateLog[] = [];
        if (hasCrewAccess) {
          try {
            crew = await getVesselStateLogs(supabase, vesselId, crewUserId);
          } catch (crewErr) {
            console.warn('[crew-state-calendar] crew logs load failed', crewErr);
            crew = [];
          }
        }

        if (cancelled) return;
        setVesselLogs(managerLogs);
        setCrewLogs(crew);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load calendar');
          setVesselLogs([]);
          setCrewLogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    vesselId,
    crewUserId,
    vesselManagerUserId,
    hasCrewAccess,
  ]);

  const leaveDates = useMemo(
    () => buildLeaveDateSet(leavePeriods, rangeStart, effectiveEnd),
    [leavePeriods, rangeStart, effectiveEnd],
  );

  const inAssignmentRange = (iso: string) =>
    iso >= rangeStart && iso <= effectiveEnd;

  const vesselStateByDate = useMemo(() => {
    const map = new Map<string, DailyStatus>();
    for (const log of vesselLogs) {
      const d = dateOnly(log.date);
      if (!inAssignmentRange(d)) continue;
      map.set(d, (log.state as DailyStatus) || 'in-port');
    }
    // Fill / override leave periods so the calendar shows time away even
    // when there is no vessel state log that day.
    for (const d of leaveDates) {
      map.set(d, 'on-leave');
    }
    return map;
  }, [vesselLogs, leaveDates, rangeStart, effectiveEnd]);

  const crewStateByDate = useMemo(() => {
    const map = new Map<string, DailyStatus>();
    for (const log of crewLogs) {
      const d = dateOnly(log.date);
      if (!inAssignmentRange(d)) continue;
      map.set(d, log.state as DailyStatus);
    }
    return map;
  }, [crewLogs, rangeStart, effectiveEnd]);

  const displayStateByDate =
    source === 'crew' && hasCrewAccess ? crewStateByDate : vesselStateByDate;

  const conflictDates = useMemo(() => {
    if (!hasCrewAccess) return new Set<string>();
    const set = new Set<string>();
    const dates = new Set<string>([
      ...vesselStateByDate.keys(),
      ...crewStateByDate.keys(),
    ]);
    for (const d of dates) {
      const v = vesselStateByDate.get(d);
      const c = crewStateByDate.get(d);
      if (!v && !c) continue;
      // Missing on one side, or different state — treat as conflict.
      // Skip pure leave-vs-leave matches.
      if (v !== c) set.add(d);
    }
    return set;
  }, [hasCrewAccess, vesselStateByDate, crewStateByDate]);

  const accentByDate = useMemo(() => {
    const map = new Map<string, DayAccent>();
    if (source === 'vessel') {
      for (const d of leaveDates) {
        const hadVesselLog = vesselLogs.some(
          (l) => dateOnly(l.date) === d && inAssignmentRange(d),
        );
        if (!hadVesselLog) map.set(d, 'leave-fill');
      }
    }
    if (showConflicts && hasCrewAccess) {
      for (const d of conflictDates) {
        map.set(d, 'conflict');
      }
    }
    return map;
  }, [
    source,
    leaveDates,
    vesselLogs,
    showConflicts,
    hasCrewAccess,
    conflictDates,
    rangeStart,
    effectiveEnd,
  ]);

  const yearStart = useMemo(() => startOfYear(new Date(year, 0, 1)), [year]);
  const yearEnd = useMemo(() => endOfYear(new Date(year, 0, 1)), [year]);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(year, i, 1)),
    [year],
  );

  const yearStats = useMemo(() => {
    const counts: Record<DailyStatus, number> = {
      underway: 0,
      'at-anchor': 0,
      'in-port': 0,
      'in-yard': 0,
      'on-leave': 0,
    };
    let total = 0;
    const yStart = format(yearStart, 'yyyy-MM-dd');
    const yEnd = format(yearEnd, 'yyyy-MM-dd');
    for (const [d, state] of displayStateByDate) {
      if (d < yStart || d > yEnd) continue;
      if (counts[state] != null) {
        counts[state] += 1;
        total += 1;
      }
    }
    return { counts, total };
  }, [displayStateByDate, yearStart, yearEnd]);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const startY = parseInt(rangeStart.slice(0, 4), 10) || now;
    const endY = parseInt(effectiveEnd.slice(0, 4), 10) || now;
    const min = Math.min(startY, endY, now);
    const max = Math.max(endY, now);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [rangeStart, effectiveEnd]);

  const conflictRows = useMemo(() => {
    if (!showConflicts || conflictDates.size === 0) return [];
    return Array.from(conflictDates)
      .sort()
      .map((d) => ({
        date: d,
        vessel: vesselStateByDate.get(d) ?? null,
        crew: crewStateByDate.get(d) ?? null,
      }));
  }, [showConflicts, conflictDates, vesselStateByDate, crewStateByDate]);

  const conflictsInYear = useMemo(
    () => conflictRows.filter((r) => r.date.startsWith(String(year))),
    [conflictRows, year],
  );

  const conflictsByMonth = useMemo(() => {
    const groups: { monthKey: string; label: string; rows: typeof conflictsInYear }[] =
      [];
    let current: (typeof groups)[number] | null = null;
    for (const row of conflictsInYear) {
      const monthKey = row.date.slice(0, 7);
      if (!current || current.monthKey !== monthKey) {
        current = {
          monthKey,
          label: format(parse(`${monthKey}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy'),
          rows: [],
        };
        groups.push(current);
      }
      current.rows.push(row);
    }
    return groups;
  }, [conflictsInYear]);

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load calendar</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">State calendar</CardTitle>
            <CardDescription>
              {crewDisplayName
                ? `Daily states for ${crewDisplayName}`
                : 'Daily states for this crew member'}
              {' · '}
              {format(parse(rangeStart, 'yyyy-MM-dd', new Date()), 'd MMM yyyy')}
              {' – '}
              {format(parse(effectiveEnd, 'yyyy-MM-dd', new Date()), 'd MMM yyyy')}
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
              disabled={!yearOptions.includes(year + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="inline-flex rounded-lg border p-1">
              <button
                type="button"
                onClick={() => setSource('vessel')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  source === 'vessel'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Vessel + leave
              </button>
              <button
                type="button"
                onClick={() => hasCrewAccess && setSource('crew')}
                disabled={!hasCrewAccess}
                title={
                  hasCrewAccess
                    ? 'Show this crew member’s own daily logs'
                    : 'Crew must approve sea-time access first'
                }
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  source === 'crew'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                  !hasCrewAccess && 'cursor-not-allowed opacity-50',
                )}
              >
                Crew logs
              </button>
            </div>

            {hasCrewAccess && (
              <div className="flex items-center gap-2">
                <Switch
                  id="show-state-conflicts"
                  checked={showConflicts}
                  onCheckedChange={setShowConflicts}
                />
                <Label htmlFor="show-state-conflicts" className="text-sm">
                  Highlight conflicts
                  {conflictDates.size > 0
                    ? ` (${conflictDates.size})`
                    : ''}
                </Label>
              </div>
            )}
          </div>

          {!hasCrewAccess && (
            <p className="text-sm text-muted-foreground">
              Showing vessel account states with leave periods filled in. Request
              sea-time access to compare against this crew member&apos;s own logs.
            </p>
          )}

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
                <span className="text-muted-foreground">
                  {CALENDAR_STATE_LABELS[s]}
                </span>
                <span className="font-semibold">{yearStats.counts[s]}</span>
              </div>
            ))}
          </div>

          {showConflicts && hasCrewAccess && (
            <Collapsible open={conflictsOpen} onOpenChange={setConflictsOpen}>
              <div className="rounded-xl border bg-muted/30">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <span
                    className={cn(
                      'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold',
                      conflictDates.size > 0
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {conflictDates.size}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    {conflictDates.size === 0 ? (
                      <span className="text-muted-foreground">
                        No differences between vessel and crew logs
                      </span>
                    ) : (
                      <span>
                        <span className="font-medium">
                          {conflictDates.size} conflict
                          {conflictDates.size === 1 ? '' : 's'}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          across the service period
                          {conflictsInYear.length !== conflictDates.size
                            ? ` · ${conflictsInYear.length} in ${year}`
                            : ''}
                          . Amber rings mark them on the calendar.
                        </span>
                      </span>
                    )}
                  </div>
                  {conflictDates.size > 0 && (
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                      >
                        {conflictsOpen ? 'Hide list' : 'View list'}
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            conflictsOpen && 'rotate-180',
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>

                <CollapsibleContent>
                  <div className="border-t">
                    {conflictsInYear.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        No conflicts in {year}. Change year above to browse other
                        periods.
                      </p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                            <tr className="border-b text-muted-foreground">
                              <th className="px-3 py-2 font-medium">Date</th>
                              <th className="px-3 py-2 font-medium">Vessel</th>
                              <th className="px-3 py-2 font-medium">Crew</th>
                            </tr>
                          </thead>
                          <tbody>
                            {conflictsByMonth.map((group) => (
                              <FragmentMonth
                                key={group.monthKey}
                                label={group.label}
                                rows={group.rows}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {yearStats.total === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
              No states to show for {year} in this service period.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {months.map((monthStart) => (
                <StateMonthGrid
                  key={monthStart.toISOString()}
                  monthStart={monthStart}
                  stateByDate={displayStateByDate}
                  accentByDate={accentByDate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
