'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parse, isAfter, startOfDay } from 'date-fns';
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Loader2,
  Mail,
  Search,
  Ship,
  Users,
  XCircle,
} from 'lucide-react';

import { useUser, useSupabase } from '@/supabase';
import { useDoc, useCollection } from '@/supabase/database';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { StatePill } from '@/components/state-pill';
import { excludeTestingAccounts } from '@/supabase/database/subscription-helpers';
import type { UserProfile, VesselAssignment, Vessel } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CrewWithoutVessel {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  lastAssignmentEndDate: string | null;
  daysSinceLastAssignment: number | null;
  hasActiveAssignment: boolean;
  activeVesselId: string | null;
  activeVesselName: string | null;
  todayState: string | null;
  todayStateKey: string | null;
  stateLastChanged: string | null;
}

type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

export default function CrewAnalyticsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [allCrewMembers, setAllCrewMembers] = useState<CrewWithoutVessel[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all');

  const { data: allVessels } = useCollection<Vessel>('vessels');

  const { data: userProfileRaw, isLoading: isLoadingProfile } =
    useDoc<UserProfile>('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role =
      (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    return {
      ...userProfileRaw,
      role,
    } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfile, router]);

  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchCrewAnalytics = async () => {
      setIsLoading(true);
      try {
        const { data: allCrewRaw, error: crewError } = await supabase
          .from('users')
          .select(
            'id, first_name, last_name, username, email, role, created_at, active_vessel_id, is_testing',
          )
          .in('role', ['crew', 'captain'])
          .order('created_at', { ascending: false });

        if (crewError) {
          console.error('[CREW ANALYTICS] Error fetching crew:', crewError);
          setAllCrewMembers([]);
          setIsLoading(false);
          return;
        }

        const allCrew = excludeTestingAccounts(allCrewRaw);
        const crewUserIds = (allCrew || []).map((c) => c.id);

        let allAssignments: VesselAssignment[] = [];
        if (crewUserIds.length > 0) {
          const { data: assignmentsData, error: assignmentsError } =
            await supabase
              .from('vessel_assignments')
              .select('*')
              .in('user_id', crewUserIds)
              .order('start_date', { ascending: false });

          if (assignmentsError) {
            console.error(
              '[CREW ANALYTICS] Error fetching assignments:',
              assignmentsError,
            );
          } else {
            allAssignments = (assignmentsData || []).map((assignment: any) => ({
              id: assignment.id,
              userId: assignment.user_id,
              vesselId: assignment.vessel_id,
              startDate: assignment.start_date,
              endDate: assignment.end_date || null,
              position: assignment.position || null,
              onboard: assignment.onboard || false,
              createdAt: assignment.created_at
                ? new Date(assignment.created_at).toISOString()
                : new Date().toISOString(),
              updatedAt: assignment.updated_at
                ? new Date(assignment.updated_at).toISOString()
                : new Date().toISOString(),
            }));
          }
        }

        const assignmentsByUser = new Map<string, VesselAssignment[]>();
        allAssignments.forEach((assignment) => {
          if (!assignmentsByUser.has(assignment.userId)) {
            assignmentsByUser.set(assignment.userId, []);
          }
          assignmentsByUser.get(assignment.userId)!.push(assignment);
        });

        const stateLabels: Record<string, string> = {
          underway: 'Underway',
          'at-anchor': 'At anchor',
          'in-port': 'Moored',
          'on-leave': 'On leave',
          'in-yard': 'In yard',
        };
        const latestStateByUser = new Map<string, string>();
        const latestStateKeyByUser = new Map<string, string>();
        const stateLastChangedByUser = new Map<string, string>();
        if (crewUserIds.length > 0) {
          const { data: allLogs } = await supabase
            .from('daily_state_logs')
            .select('user_id, state, date, updated_at, created_at')
            .in('user_id', crewUserIds)
            .order('date', { ascending: false })
            .limit(Math.max(2000, crewUserIds.length * 30));
          (allLogs || []).forEach((log: any) => {
            if (!latestStateByUser.has(log.user_id)) {
              const label = stateLabels[log.state] || log.state || '—';
              latestStateByUser.set(log.user_id, label);
              if (log.state) latestStateKeyByUser.set(log.user_id, log.state);
              const lastChanged = log.updated_at || log.created_at;
              if (lastChanged) {
                stateLastChangedByUser.set(
                  log.user_id,
                  format(new Date(lastChanged), 'd MMM yyyy'),
                );
              }
            }
          });
        }

        const crewData: CrewWithoutVessel[] = (allCrew || []).map(
          (crewMember) => {
            const userAssignments =
              assignmentsByUser.get(crewMember.id) || [];

            const today = startOfDay(new Date());
            const activeAssignments = userAssignments.filter((a) => {
              const endDate = a.endDate;
              if (
                endDate === null ||
                endDate === undefined ||
                endDate === ''
              ) {
                return true;
              }
              try {
                const parsedEndDate = parse(endDate, 'yyyy-MM-dd', new Date());
                return (
                  isAfter(parsedEndDate, today) ||
                  parsedEndDate.getTime() === today.getTime()
                );
              } catch {
                return false;
              }
            });
            const hasActiveAssignment = activeAssignments.length > 0;

            const activeAssignment =
              activeAssignments.length > 0
                ? activeAssignments.sort((a, b) => {
                    const dateA = parse(a.startDate, 'yyyy-MM-dd', new Date());
                    const dateB = parse(b.startDate, 'yyyy-MM-dd', new Date());
                    return dateB.getTime() - dateA.getTime();
                  })[0]
                : null;
            const activeVesselId = activeAssignment?.vesselId || null;

            let activeVesselName: string | null = null;
            if (activeVesselId && allVessels) {
              const vessel = allVessels.find((v) => v.id === activeVesselId);
              activeVesselName = vessel?.name || null;
            }

            const assignmentsWithEndDate = userAssignments
              .filter((a) => a.endDate)
              .sort((a, b) => {
                const dateA = parse(a.endDate!, 'yyyy-MM-dd', new Date());
                const dateB = parse(b.endDate!, 'yyyy-MM-dd', new Date());
                return dateB.getTime() - dateA.getTime();
              });

            const lastAssignmentEndDate =
              assignmentsWithEndDate.length > 0
                ? assignmentsWithEndDate[0].endDate
                : null;

            let daysSinceLastAssignment: number | null = null;
            if (lastAssignmentEndDate) {
              const endDate = parse(
                lastAssignmentEndDate,
                'yyyy-MM-dd',
                new Date(),
              );
              const todayDate = startOfDay(new Date());
              daysSinceLastAssignment = Math.floor(
                (todayDate.getTime() - endDate.getTime()) /
                  (1000 * 60 * 60 * 24),
              );
            } else if (userAssignments.length === 0) {
              const createdAt = new Date(crewMember.created_at);
              const todayDate = startOfDay(new Date());
              daysSinceLastAssignment = Math.floor(
                (todayDate.getTime() - createdAt.getTime()) /
                  (1000 * 60 * 60 * 24),
              );
            }

            return {
              id: crewMember.id,
              firstName: crewMember.first_name || '',
              lastName: crewMember.last_name || '',
              username: crewMember.username || '',
              email: crewMember.email || '',
              role: crewMember.role || 'crew',
              createdAt: crewMember.created_at,
              lastAssignmentEndDate,
              daysSinceLastAssignment,
              hasActiveAssignment,
              activeVesselId,
              activeVesselName,
              todayState: latestStateByUser.get(crewMember.id) ?? null,
              todayStateKey: latestStateKeyByUser.get(crewMember.id) ?? null,
              stateLastChanged:
                stateLastChangedByUser.get(crewMember.id) ?? null,
            };
          },
        );

        crewData.sort((a, b) => {
          if (a.hasActiveAssignment && !b.hasActiveAssignment) return -1;
          if (!a.hasActiveAssignment && b.hasActiveAssignment) return 1;
          if (
            a.daysSinceLastAssignment !== null &&
            b.daysSinceLastAssignment !== null
          ) {
            return b.daysSinceLastAssignment - a.daysSinceLastAssignment;
          }
          if (a.daysSinceLastAssignment !== null) return -1;
          if (b.daysSinceLastAssignment !== null) return 1;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });

        setAllCrewMembers(crewData);
      } catch (error) {
        console.error('[CREW ANALYTICS] Error fetching analytics:', error);
        setAllCrewMembers([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchCrewAnalytics();
  }, [isAdmin, user?.id, supabase, allVessels]);

  const filteredCrew = useMemo(() => {
    let list = allCrewMembers;

    if (assignmentFilter === 'assigned') {
      list = list.filter((c) => c.hasActiveAssignment);
    } else if (assignmentFilter === 'unassigned') {
      list = list.filter((c) => !c.hasActiveAssignment);
    }

    if (!searchTerm.trim()) return list;

    const search = searchTerm.toLowerCase();
    return list.filter(
      (crew) =>
        crew.firstName.toLowerCase().includes(search) ||
        crew.lastName.toLowerCase().includes(search) ||
        crew.username.toLowerCase().includes(search) ||
        crew.email.toLowerCase().includes(search) ||
        (crew.activeVesselName &&
          crew.activeVesselName.toLowerCase().includes(search)),
    );
  }, [allCrewMembers, searchTerm, assignmentFilter]);

  const stats = useMemo(() => {
    const total = allCrewMembers.length;
    const withActiveVessels = allCrewMembers.filter(
      (c) => c.hasActiveAssignment,
    ).length;
    const noAssignments = allCrewMembers.filter(
      (c) => c.lastAssignmentEndDate === null && !c.hasActiveAssignment,
    ).length;
    const recentEnded = allCrewMembers.filter(
      (c) =>
        !c.hasActiveAssignment &&
        c.daysSinceLastAssignment !== null &&
        c.daysSinceLastAssignment <= 30,
    ).length;
    const longTermInactive = allCrewMembers.filter(
      (c) =>
        !c.hasActiveAssignment &&
        c.daysSinceLastAssignment !== null &&
        c.daysSinceLastAssignment > 90,
    ).length;

    return {
      total,
      withActiveVessels,
      noAssignments,
      recentEnded,
      longTermInactive,
    };
  }, [allCrewMembers]);

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const filterTabs: Array<{
    id: AssignmentFilter;
    label: string;
    count: number;
  }> = [
    { id: 'all', label: 'All', count: stats.total },
    {
      id: 'assigned',
      label: 'Assigned',
      count: stats.withActiveVessels,
    },
    {
      id: 'unassigned',
      label: 'Unassigned',
      count: stats.total - stats.withActiveVessels,
    },
  ];

  const statTiles = [
    {
      label: 'Total crew',
      value: stats.total,
      hint: 'Crew & captains (excl. testing)',
      icon: Users,
      tone: 'default' as const,
    },
    {
      label: 'With active vessels',
      value: stats.withActiveVessels,
      hint: 'Currently assigned',
      icon: CheckCircle2,
      tone: 'emerald' as const,
    },
    {
      label: 'Never assigned',
      value: stats.noAssignments,
      hint: 'No vessel assignment on file',
      icon: AlertCircle,
      tone: 'amber' as const,
    },
    {
      label: 'Recently ended',
      value: stats.recentEnded,
      hint: 'Assignment ended in last 30 days',
      icon: Calendar,
      tone: 'sky' as const,
    },
    {
      label: 'Long-term inactive',
      value: stats.longTermInactive,
      hint: 'No assignment for 90+ days',
      icon: XCircle,
      tone: 'destructive' as const,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>Platform</span>
            <span className="text-border">/</span>
            <span className="text-foreground">Crew analytics</span>
          </div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            Crew analytics
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Vessel assignments and latest states for crew and captains. Testing
            accounts are excluded.
          </p>
        </div>
      </div>

      {/* Stats — same top section, Studio-styled */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className="overflow-hidden rounded-md border border-border bg-background"
            >
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {tile.label}
                </span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="px-3 py-3">
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <div
                    className={cn(
                      'font-mono text-2xl font-medium tabular-nums tracking-tight',
                      tile.tone === 'emerald' && 'text-emerald-600',
                      tile.tone === 'amber' && 'text-amber-600',
                      tile.tone === 'sky' && 'text-sky-600',
                      tile.tone === 'destructive' && 'text-destructive',
                      tile.tone === 'default' && 'text-foreground',
                    )}
                  >
                    {tile.value}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {tile.hint}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAssignmentFilter(tab.id)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
                assignmentFilter === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded px-1 font-mono text-[10px] tabular-nums',
                  assignmentFilter === tab.id
                    ? 'bg-muted text-muted-foreground'
                    : 'text-muted-foreground/70',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, email, vessel…"
              className="h-8 rounded-md border-border bg-background pl-8 text-xs shadow-none"
            />
          </div>
          <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
            <span className="font-mono tabular-nums">{filteredCrew.length}</span>
            {' of '}
            <span className="font-mono tabular-nums">{allCrewMembers.length}</span>
            {' shown'}
          </p>
        </div>
      </div>

      {/* Data table */}
      <div className="overflow-hidden rounded-md border border-border bg-muted/40">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground md:table-cell">
                Email
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Role
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Latest state
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground lg:table-cell">
                State changed
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Current vessel
              </TableHead>
              <TableHead
                className="h-9 w-10 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground"
                aria-label="Open"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-36 bg-background">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading crew analytics…
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredCrew.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-36 bg-background">
                  <div className="flex flex-col items-center justify-center gap-1 text-center">
                    <p className="text-sm text-foreground">No crew found</p>
                    <p className="text-xs text-muted-foreground">
                      {searchTerm || assignmentFilter !== 'all'
                        ? 'Try another filter or search term.'
                        : 'No crew or captain accounts yet.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredCrew.map((crew) => {
                const fullName =
                  `${crew.firstName} ${crew.lastName}`.trim() ||
                  crew.username ||
                  '—';
                return (
                  <TableRow
                    key={crew.id}
                    className="cursor-pointer border-border bg-background hover:bg-muted/40"
                    onClick={() => router.push(`/dashboard/users/${crew.id}`)}
                  >
                    <TableCell className="py-2.5 align-middle">
                      <div className="min-w-0 max-w-[220px]">
                        <span className="truncate text-sm text-foreground">
                          {fullName}
                        </span>
                        {crew.username ? (
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            @{crew.username}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle md:table-cell">
                      <span className="inline-flex max-w-[200px] items-center gap-1.5 truncate text-xs text-foreground">
                        <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{crew.email || '—'}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.5 text-[10px] capitalize',
                          crew.role === 'captain'
                            ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400'
                            : 'border-border bg-muted/60 text-muted-foreground',
                        )}
                      >
                        {crew.role}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      {crew.todayStateKey ? (
                        <StatePill
                          stateKey={crew.todayStateKey}
                          label={crew.todayState}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle lg:table-cell">
                      <span className="text-[11px] text-muted-foreground">
                        {crew.stateLastChanged ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      {crew.hasActiveAssignment && crew.activeVesselName ? (
                        <span className="inline-flex max-w-[200px] items-center gap-1.5 truncate text-xs text-foreground">
                          <Ship className="h-3 w-3 shrink-0 text-emerald-600" />
                          <span className="truncate">{crew.activeVesselName}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        </span>
                      ) : crew.activeVesselId && !crew.activeVesselName ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                          <Ship className="h-3 w-3" />
                          {crew.activeVesselId.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                          Not assigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-right align-middle">
                      <Link
                        href={`/dashboard/users/${crew.id}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Open user profile"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
