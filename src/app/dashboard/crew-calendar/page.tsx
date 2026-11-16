'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, Ship, Users, X } from 'lucide-react';

import { CalendarPageHeader } from '@/components/dashboard/calendar-page-ui';
import {
  buildCrewYearStateMaps,
  countStatesInDateRange,
  CrewYearCalendarGrid,
  inclusiveDaySpan,
  type CrewYearDateRange,
  type CrewYearDateSelectPayload,
  type CrewYearRangeScope,
  type CrewYearRow,
} from '@/components/dashboard/crew-year-calendar-grid';
import { useCalendarColorStyle } from '@/components/calendar-color-style-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  calendarDayCellStyle,
  calendarStateSolid,
} from '@/lib/calendar-state-colors';
import type { DailyStatus, StateLog, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { normalizeStateLogDate } from '@/supabase/database/queries';

type LogSource = 'vessel' | 'crew';

const RANGE_STATE_COLS: Array<{ state: DailyStatus; label: string }> = [
  { state: 'underway', label: 'Underway' },
  { state: 'at-anchor', label: 'Anchor' },
  { state: 'in-port', label: 'Moored' },
  { state: 'in-yard', label: 'Yard' },
  { state: 'on-leave', label: 'Leave' },
];

function fmtRangeDay(iso: string) {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

const LEGEND: Array<{ state: DailyStatus; label: string }> = [
  { state: 'underway', label: 'Underway' },
  { state: 'at-anchor', label: 'At anchor' },
  { state: 'in-port', label: 'Moored' },
  { state: 'in-yard', label: 'In yard' },
  { state: 'on-leave', label: 'On leave' },
];

function displayName(profile: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return name || profile.email || 'Crew member';
}

export default function CrewCalendarPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const { supabase } = useSupabase();
  useCalendarColorStyle();

  const { data: userProfileRaw, isLoading: profileLoading } = useDoc<UserProfile>(
    'users',
    user?.id,
  );

  const role = ((userProfileRaw as { role?: string } | null)?.role || '').toLowerCase();
  const isVessel = role === 'vessel';
  const activeVesselId =
    (userProfileRaw as { active_vessel_id?: string; activeVesselId?: string } | null)
      ?.active_vessel_id ||
    userProfileRaw?.activeVesselId ||
    null;

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [logSource, setLogSource] = useState<LogSource>('crew');
  const [dateRange, setDateRange] = useState<CrewYearDateRange>({
    from: null,
    to: null,
  });
  const [rangeScope, setRangeScope] = useState<CrewYearRangeScope | null>(null);
  const [recenterToken, setRecenterToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [crewRows, setCrewRows] = useState<CrewYearRow[]>([]);
  const [allLogs, setAllLogs] = useState<
    Array<{ userId: string; date: string; state: DailyStatus }>
  >([]);
  const [vesselName, setVesselName] = useState<string | null>(null);
  const [vesselManagerId, setVesselManagerId] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading || !userProfileRaw) return;
    if (!isVessel) router.replace('/dashboard');
  }, [profileLoading, userProfileRaw, isVessel, router]);

  const load = useCallback(async () => {
    if (!supabase || !activeVesselId || !isVessel) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const [vesselRes, assignmentsRes, logsRes] = await Promise.all([
        supabase
          .from('vessels')
          .select('id, name, vessel_manager_id')
          .eq('id', activeVesselId)
          .maybeSingle(),
        supabase
          .from('vessel_assignments')
          .select('user_id, position, onboard, start_date, end_date')
          .eq('vessel_id', activeVesselId)
          .is('end_date', null)
          .order('start_date', { ascending: false }),
        fetch(`/api/vessel-logs?vesselId=${encodeURIComponent(activeVesselId)}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        }),
      ]);

      if (vesselRes.error) throw vesselRes.error;
      const vesselRow = vesselRes.data as {
        name?: string;
        vessel_manager_id?: string;
      } | null;
      setVesselName(vesselRow?.name ?? null);
      setVesselManagerId(vesselRow?.vessel_manager_id ?? user?.id ?? null);

      const assignments = assignmentsRes.data || [];
      const userIds = [
        ...new Set(assignments.map((a: { user_id: string }) => a.user_id)),
      ];

      let profiles: Array<{
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        role?: string | null;
      }> = [];
      if (userIds.length > 0) {
        const { data, error } = await supabase
          .from('users')
          .select('id, first_name, last_name, email, role')
          .in('id', userIds);
        if (error) throw error;
        profiles = data || [];
      }
      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      const nextRows: CrewYearRow[] = assignments
        .filter((a: { user_id: string }) => {
          const p = profileMap.get(a.user_id);
          return p && (p.role || '').toLowerCase() !== 'vessel';
        })
        .map((a: {
          user_id: string;
          position: string | null;
          onboard: boolean | null;
        }) => {
          const p = profileMap.get(a.user_id);
          return {
            userId: a.user_id,
            name: p ? displayName(p) : 'Crew member',
            position: a.position,
            onboard: Boolean(a.onboard),
          };
        })
        .filter(
          (row, i, arr) => arr.findIndex((r) => r.userId === row.userId) === i,
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!logsRes.ok) {
        const err = await logsRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Failed to load vessel logs');
      }
      const { logs } = (await logsRes.json()) as { logs: StateLog[] };
      const normalized = (logs || [])
        .map((l) => {
          const date = normalizeStateLogDate(l.date) ?? l.date;
          if (!date) return null;
          return { userId: l.userId, date, state: l.state as DailyStatus };
        })
        .filter(Boolean) as Array<{ userId: string; date: string; state: DailyStatus }>;

      setCrewRows(nextRows);
      setAllLogs(normalized);
    } catch (err) {
      console.error('[crew-calendar]', err);
      toast({
        title: 'Could not load crew calendar',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setCrewRows([]);
      setAllLogs([]);
      setVesselManagerId(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, activeVesselId, isVessel, toast, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const logsByUser = useMemo(
    () => buildCrewYearStateMaps(allLogs, year),
    [allLogs, year],
  );

  const vesselStateMap = useMemo(() => {
    if (!vesselManagerId) return new Map<string, DailyStatus>();
    return logsByUser.get(vesselManagerId) ?? new Map<string, DailyStatus>();
  }, [logsByUser, vesselManagerId]);

  /** Always vessel row on top, then every active crew member. */
  const displayRows = useMemo((): CrewYearRow[] => {
    const vesselRow: CrewYearRow | null = vesselManagerId
      ? {
          userId: vesselManagerId,
          name: vesselName || 'Vessel',
          position: 'Vessel log',
          kind: 'vessel',
        }
      : null;

    const crew = crewRows.map((row) => ({ ...row, kind: 'crew' as const }));
    return vesselRow ? [vesselRow, ...crew] : crew;
  }, [vesselManagerId, vesselName, crewRows]);

  /**
   * Crew logs: each crew row uses that member’s personal map; vessel row uses vessel map.
   * Vessel logs: crew rows are painted from the shared vessel map, but personal
   * on-leave days always overlay so leave periods stay visible on each crew.
   */
  const statesByUser = useMemo(() => {
    const next = new Map<string, Map<string, DailyStatus>>();
    if (vesselManagerId) {
      next.set(vesselManagerId, vesselStateMap);
    }
    for (const row of crewRows) {
      if (logSource === 'vessel') {
        const merged = new Map(vesselStateMap);
        const personal = logsByUser.get(row.userId);
        if (personal) {
          for (const [date, state] of personal) {
            if (state === 'on-leave') merged.set(date, 'on-leave');
          }
        }
        next.set(row.userId, merged);
      } else {
        next.set(row.userId, logsByUser.get(row.userId) ?? new Map());
      }
    }
    return next;
  }, [logSource, vesselManagerId, vesselStateMap, crewRows, logsByUser]);

  const loggedCount = useMemo(() => {
    if (logSource === 'vessel') return vesselStateMap.size;
    let n = 0;
    for (const row of crewRows) {
      n += logsByUser.get(row.userId)?.size ?? 0;
    }
    return n;
  }, [logSource, vesselStateMap, crewRows, logsByUser]);

  const clearRange = useCallback(() => {
    setDateRange({ from: null, to: null });
    setRangeScope(null);
  }, []);

  // Clear range when year changes
  useEffect(() => {
    clearRange();
  }, [year, clearRange]);

  const handleDateSelect = useCallback(
    (payload: CrewYearDateSelectPayload) => {
      const { dateKey, scope } = payload;
      const startingFresh =
        !dateRange.from || Boolean(dateRange.from && dateRange.to);

      if (startingFresh) {
        setRangeScope(scope);
        setDateRange({ from: dateKey, to: null });
        return;
      }
      // Completing the range — keep scope from the start click
      if (dateRange.from === dateKey) {
        setDateRange({ from: dateKey, to: dateKey });
        return;
      }
      setDateRange({ from: dateRange.from, to: dateKey });
    },
    [dateRange],
  );

  const normalizedRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return null;
    const from = dateRange.from <= dateRange.to ? dateRange.from : dateRange.to;
    const to = dateRange.from <= dateRange.to ? dateRange.to : dateRange.from;
    return { from, to };
  }, [dateRange]);

  const rangeSummaries = useMemo(() => {
    if (!normalizedRange || !rangeScope) return [];
    const rows =
      rangeScope.mode === 'all'
        ? displayRows
        : displayRows.filter(
            (r) => r.kind === 'crew' && r.userId === rangeScope.userId,
          );
    return rows.map((row) => {
      const counts = countStatesInDateRange(
        statesByUser.get(row.userId),
        normalizedRange.from,
        normalizedRange.to,
      );
      // Yacht-style “at sea” = underway + at-anchor
      const atSeaDays = counts.underway + counts['at-anchor'];
      return { row, counts, atSeaDays };
    });
  }, [normalizedRange, rangeScope, displayRows, statesByUser]);

  if (profileLoading || (!userProfileRaw && user)) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!isVessel) return null;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <CalendarPageHeader
        title="Crew calendar"
        description={
          logSource === 'vessel'
            ? 'Vessel log on top; crew rows use vessel states, with each member’s leave periods kept from their personal logs.'
            : 'Vessel log on top for comparison, with each crew member’s own personal states below.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setLogSource('vessel')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  logSource === 'vessel'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Ship className="h-3.5 w-3.5" />
                Vessel logs
              </button>
              <button
                type="button"
                onClick={() => setLogSource('crew')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  logSource === 'crew'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Crew logs
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums">
              {year}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={year >= currentYear}
              onClick={() => setYear((y) => Math.min(currentYear, y + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {year === currentYear ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setRecenterToken((t) => t + 1)}
              >
                Today
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  setYear(currentYear);
                  setRecenterToken((t) => t + 1);
                }}
              >
                This year
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {crewRows.length} crew
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5">
            <Ship className="h-3.5 w-3.5" />
            {logSource === 'vessel'
              ? 'Vessel states on crew · leave from personal logs'
              : 'Showing crew personal logs'}
          </span>
          <span>·</span>
          <span>
            {loggedCount} logged day{loggedCount === 1 ? '' : 's'} in {year}
          </span>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {LEGEND.map(({ state, label }) => (
            <span
              key={state}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium"
              style={calendarDayCellStyle(state)}
            >
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: calendarStateSolid(state) }}
                aria-hidden
              />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
            Empty = no log
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Click a start date, then an end date. Select on a crew row for that person only; select
        on the vessel row (or day headers) for all crew.
      </p>

      {loading && displayRows.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <CrewYearCalendarGrid
          year={year}
          rows={displayRows}
          statesByUser={statesByUser}
          range={dateRange}
          rangeScope={rangeScope}
          onDateSelect={handleDateSelect}
          recenterToken={recenterToken}
        />
      )}

      {dateRange.from && !dateRange.to ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm">
          <p>
            Start{' '}
            <span className="font-semibold">{fmtRangeDay(dateRange.from)}</span>
            {rangeScope?.mode === 'crew' ? (
              <>
                {' · '}
                <span className="font-semibold">{rangeScope.name}</span> only
              </>
            ) : (
              <> · all crew</>
            )}
            {' — '}click an end date
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={clearRange}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      ) : null}

      {normalizedRange && rangeScope ? (
        <div className="overflow-hidden rounded-[14px] border border-border/80 bg-card/40">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {rangeScope.mode === 'crew'
                  ? `Sea time · ${rangeScope.name}`
                  : 'Sea time in range · all crew'}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fmtRangeDay(normalizedRange.from)} → {fmtRangeDay(normalizedRange.to)}
                {' · '}
                {inclusiveDaySpan(normalizedRange.from, normalizedRange.to)} calendar day
                {inclusiveDaySpan(normalizedRange.from, normalizedRange.to) === 1 ? '' : 's'}
                {' · '}
                {logSource === 'vessel' ? 'using vessel states' : 'using crew personal logs'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={clearRange}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear range
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">At sea</th>
                  {RANGE_STATE_COLS.map((c) => (
                    <th key={c.state} className="px-3 py-2.5 font-medium">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 font-medium">Logged</th>
                </tr>
              </thead>
              <tbody>
                {rangeSummaries.map(({ row, counts, atSeaDays }) => (
                  <tr
                    key={`${row.kind}-${row.userId}`}
                    className={cn(
                      'border-b border-border/40 last:border-b-0',
                      row.kind === 'vessel' && 'bg-muted/20',
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.position || (row.kind === 'vessel' ? 'Vessel log' : 'Crew')}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums text-foreground">
                      {atSeaDays}
                    </td>
                    {RANGE_STATE_COLS.map((c) => (
                      <td
                        key={c.state}
                        className="px-3 py-2.5 tabular-nums text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: calendarStateSolid(c.state) }}
                            aria-hidden
                          />
                          {counts[c.state]}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {counts.logged}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
