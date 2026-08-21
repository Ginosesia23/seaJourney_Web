'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  CalendarDays,
  ChevronDown,
  Clock,
  Download,
  History,
  Loader2,
  Ship,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { getVesselAssignments } from '@/supabase/database/queries';
import { isLinkedVesselWatchViewer } from '@/lib/vessel-linked-features';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import { CrewWatchHistorySection } from '@/components/dashboard/crew-watch-history-section';
import type { WatchSchedule } from '@/lib/watch-schedule-types';
import { generateCrewWatchSchedulePDF } from '@/lib/watch-schedule-pdf';
import {
  flattenCrewScheduledWatches,
  fmtWatchDate,
  fmtWatchHour,
  scheduledWatchRoleLabel,
  summariseCrewScheduledWatches,
  type CrewScheduledWatchEntry,
  type ScheduledWatchStatus,
} from '@/lib/watch-schedule-crew-history';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRange(start: string, end: string): string {
  try {
    return `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM yyyy')}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function statusBadge(status: ScheduledWatchStatus) {
  switch (status) {
    case 'past':
      return (
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
          Past
        </Badge>
      );
    case 'today':
      return (
        <Badge className="text-[10px] uppercase tracking-wide bg-emerald-600 hover:bg-emerald-600">
          Today
        </Badge>
      );
    case 'upcoming':
      return (
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          Upcoming
        </Badge>
      );
  }
}

type HistoryFilter = 'all' | 'past' | 'upcoming';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MyWatchSchedulePage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { supabase } = useSupabase();
  const { data: profileRaw, isLoading: isProfileLoading } = useDoc<Record<string, unknown>>(
    'users',
    user?.id,
  );

  const role = (profileRaw?.role as string) || 'crew';
  const linkedWatchViewer = isLinkedVesselWatchViewer(profileRaw);

  useEffect(() => {
    if (isUserLoading || isProfileLoading) return;
    if (!user) {
      router.replace('/dashboard');
      return;
    }
    if (role === 'vessel' || (linkedWatchViewer && role === 'captain')) {
      router.replace('/dashboard/watch-schedule');
    }
  }, [isUserLoading, isProfileLoading, user, role, linkedWatchViewer, router]);

  const [schedules, setSchedules] = useState<WatchSchedule[]>([]);
  const [vesselNames, setVesselNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const crewDisplayName =
    [profileRaw?.first_name, profileRaw?.last_name].filter(Boolean).join(' ') ||
    (user?.email ?? 'Crew member');

  const loadSchedules = useCallback(async () => {
    if (!supabase || !user) return;
    setIsLoading(true);
    try {
      const assignments = await getVesselAssignments(supabase, user.id);
      const vesselIds = [...new Set(assignments.map((a) => a.vesselId))];

      if (vesselIds.length === 0) {
        setSchedules([]);
        setVesselNames({});
        return;
      }

      const { data, error } = await supabase
        .from('watch_schedules')
        .select('*')
        .in('vessel_id', vesselIds)
        .order('start_date', { ascending: false });

      if (error) throw error;

      const parsed: WatchSchedule[] = (data ?? [])
        .map((d: Record<string, unknown>) => ({
          id: d.id as string,
          vesselId: d.vessel_id as string,
          createdBy: d.created_by as string,
          name: d.name as string,
          startDate: d.start_date as string,
          endDate: d.end_date as string,
          watchSystem: d.watch_system as WatchSchedule['watchSystem'],
          shifts: (d.shifts as WatchSchedule['shifts']) ?? [],
          assignments: (d.assignments as WatchSchedule['assignments']) ?? [],
          createdAt: d.created_at as string | undefined,
          updatedAt: d.updated_at as string | undefined,
        }))
        .filter((s) => s.assignments.some((a) => a.userId === user.id));

      setSchedules(parsed);

      const nameMap: Record<string, string> = {};
      const { data: vessels } = await supabase
        .from('vessels')
        .select('id, name')
        .in('id', vesselIds);

      for (const v of vessels ?? []) {
        nameMap[(v as { id: string }).id] = (v as { name?: string }).name ?? 'Unknown vessel';
      }
      setVesselNames(nameMap);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: 'Could not load schedules',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    if (user) void loadSchedules();
  }, [user, loadSchedules]);

  const scheduledEntries = useMemo(() => {
    if (!user) return [];
    return flattenCrewScheduledWatches(schedules, user.id, vesselNames);
  }, [schedules, user, vesselNames]);

  const scheduledSummary = useMemo(
    () => summariseCrewScheduledWatches(scheduledEntries),
    [scheduledEntries],
  );

  const filteredMonths = useMemo(() => {
    if (historyFilter === 'all') return scheduledSummary.months;
    return scheduledSummary.months
      .map((month) => ({
        ...month,
        entries: month.entries.filter((e) =>
          historyFilter === 'past'
            ? e.status === 'past'
            : e.status === 'today' || e.status === 'upcoming',
        ),
      }))
      .filter((month) => month.entries.length > 0);
  }, [scheduledSummary.months, historyFilter]);

  useEffect(() => {
    if (filteredMonths.length > 0 && expandedMonths.size === 0) {
      setExpandedMonths(new Set([filteredMonths[0].monthKey]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMonths]);

  const handleExport = useCallback(
    async (s: WatchSchedule) => {
      if (!user) return;
      setExportingId(s.id ?? null);
      try {
        const vesselName = vesselNames[s.vesselId] ?? 'Unknown vessel';
        await generateCrewWatchSchedulePDF({
          schedule: s,
          crewUserId: user.id,
          crewName: String(crewDisplayName),
          vesselName,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Export failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setExportingId(null);
      }
    },
    [user, crewDisplayName, vesselNames],
  );

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isUserLoading || isProfileLoading || isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || role === 'vessel') return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Watch Schedules</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every watch your vessel has assigned you — past and upcoming — plus any bridge or lookout
          watches you have logged yourself.
        </p>
      </div>

      {scheduledSummary.totalWatches === 0 && schedules.length === 0 ? (
        <Alert>
          <Calendar className="h-4 w-4" />
          <AlertTitle>No watch schedules yet</AlertTitle>
          <AlertDescription>
            Your vessel manager hasn&apos;t assigned you to a watch schedule yet. When they add you
            to a rota, every past and upcoming watch block will appear here automatically.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Assigned watches" value={scheduledSummary.totalWatches} />
          <SummaryTile label="Past watches" value={scheduledSummary.pastWatches} tone="muted" />
          <SummaryTile
            label="Upcoming"
            value={scheduledSummary.upcomingWatches}
            tone="info"
          />
          <SummaryTile
            label="Total hours"
            value={`${scheduledSummary.totalHours}h`}
            tone="primary"
          />
        </div>
      )}

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Watch history
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            By schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Assigned watch history</CardTitle>
              <CardDescription>
                A chronological record of every watch block your vessel has scheduled for you —
                bridge, lookout, and other rotas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'past', label: 'Past' },
                    { key: 'upcoming', label: 'Upcoming' },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.key}
                    size="sm"
                    variant={historyFilter === opt.key ? 'default' : 'outline'}
                    onClick={() => setHistoryFilter(opt.key)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {filteredMonths.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No {historyFilter === 'all' ? '' : `${historyFilter} `}assigned watches to show
                  yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredMonths.map((month) => (
                    <MonthHistoryCard
                      key={month.monthKey}
                      monthLabel={month.monthLabel}
                      watches={month.watches}
                      hours={month.hours}
                      daysWorked={month.daysWorked}
                      expanded={expandedMonths.has(month.monthKey)}
                      onToggle={() => toggleMonth(month.monthKey)}
                      entries={month.entries}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          {schedules.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No schedules include your assignments yet.
              </CardContent>
            </Card>
          ) : (
            schedules.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                userId={user.id}
                vesselName={vesselNames[s.vesselId] ?? 'Unknown vessel'}
                exporting={exportingId === s.id}
                onExport={() => handleExport(s)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Logged watches</h2>
          <p className="text-sm text-muted-foreground">
            Bridge, lookout, and other watches you have recorded on the Bridge Watch Log.
          </p>
        </div>
        <CrewWatchHistorySection
          supabase={supabase}
          vesselId={null}
          crewUserId={user.id}
          crewDisplayName={crewDisplayName}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'primary' | 'info' | 'muted';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'primary' && 'border-primary/30 bg-primary/5',
        tone === 'info' && 'border-sky-200/70 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/30',
        tone === 'muted' && 'border-border bg-muted/30',
        tone === 'default' && 'border-border bg-muted/20',
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-2xl font-semibold tabular-nums',
          tone === 'primary' && 'text-primary',
          tone === 'info' && 'text-sky-700 dark:text-sky-300',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MonthHistoryCard({
  monthLabel,
  watches,
  hours,
  daysWorked,
  expanded,
  onToggle,
  entries,
}: {
  monthLabel: string;
  watches: number;
  hours: number;
  daysWorked: number;
  expanded: boolean;
  onToggle: () => void;
  entries: CrewScheduledWatchEntry[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-sm truncate">{monthLabel}</CardTitle>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-base font-semibold tabular-nums">{hours}h</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {watches} watch{watches === 1 ? '' : 'es'} · {daysWorked} day
                {daysWorked === 1 ? '' : 's'}
              </div>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Watch
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Vessel
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Schedule
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {fmtWatchDate(entry.date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="secondary" className="text-[10px] font-medium">
                        {scheduledWatchRoleLabel(entry)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap text-muted-foreground">
                      {fmtWatchHour(entry.startHour)} – {fmtWatchHour(entry.endHour)}
                      <span className="ml-2 font-medium text-foreground">
                        ({entry.durationHours}h)
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Ship className="h-3 w-3 shrink-0" />
                        {entry.vesselName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{entry.scheduleName}</td>
                    <td className="px-4 py-2.5">{statusBadge(entry.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ScheduleCard({
  schedule,
  userId,
  vesselName,
  exporting,
  onExport,
}: {
  schedule: WatchSchedule;
  userId: string;
  vesselName: string;
  exporting: boolean;
  onExport: () => void;
}) {
  const myAssignments = schedule.assignments
    .filter((a) => a.userId === userId)
    .sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return a.startHour - b.startHour;
    });

  const totalHours = myAssignments.reduce((sum, a) => sum + (a.endHour - a.startHour), 0);
  const uniqueDays = new Set(myAssignments.map((a) => a.date)).size;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 shrink-0" />
              {schedule.name}
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Ship className="h-3 w-3" />
                {vesselName}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmtRange(schedule.startDate, schedule.endDate)}
              </span>
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Proof PDF
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          {[
            { label: 'Watches', value: myAssignments.length },
            { label: 'Days on watch', value: uniqueDays },
            { label: 'Total hours', value: `${totalHours}h` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-muted/50 px-3 py-2 text-center">
              <p className="text-lg font-bold">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {myAssignments.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">
            No watch assignments found for you in this schedule.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t bg-muted/30">
                  <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Watch
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Start
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    End
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {myAssignments.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-6 py-2 font-medium">{fmtWatchDate(a.date)}</td>
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className="text-[10px] font-medium">
                        {a.shiftName?.trim() || a.userPosition?.trim() || 'Watch'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{fmtWatchHour(a.startHour)}</td>
                    <td className="px-4 py-2 tabular-nums">{fmtWatchHour(a.endHour)}</td>
                    <td className="px-4 py-2 tabular-nums font-medium">
                      {a.endHour - a.startHour}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
