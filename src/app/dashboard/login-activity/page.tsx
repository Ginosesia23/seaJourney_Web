'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parse, startOfDay, differenceInDays } from 'date-fns';
import {
  ArrowUpRight,
  Loader2,
  LogIn,
  Mail,
  Search,
} from 'lucide-react';

import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CrewLoginActivity {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  lastSignInAt: string | null;
  createdAt: string;
  daysSinceLastLogin: number | null;
  daysSinceAccountCreation: number;
  loginCount: number | null;
}

type ActivityFilter = 'all' | 'active' | 'inactive' | 'never';

export default function LoginActivityPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [crewActivity, setCrewActivity] = useState<CrewLoginActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState<ActivityFilter>('all');
  const [sortBy, setSortBy] = useState<'lastLogin' | 'accountCreation' | 'name'>(
    'lastLogin',
  );

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

    const fetchLoginActivity = async () => {
      setIsLoading(true);
      try {
        const { data: allCrew, error: crewError } = await supabase
          .from('users')
          .select(
            'id, first_name, last_name, username, email, role, created_at, last_sign_in_at',
          )
          .in('role', ['crew', 'captain'])
          .order('created_at', { ascending: false });

        if (crewError) {
          console.error('[LOGIN ACTIVITY] Error fetching crew:', crewError);
          setCrewActivity([]);
          setIsLoading(false);
          return;
        }

        const crewActivityData: CrewLoginActivity[] = (allCrew || []).map(
          (crewMember) => {
            const lastSignInAt = crewMember.last_sign_in_at || null;
            const createdAt = new Date(crewMember.created_at);
            const today = startOfDay(new Date());
            const daysSinceAccountCreation = differenceInDays(today, createdAt);

            let daysSinceLastLogin: number | null = null;
            if (lastSignInAt) {
              const lastLogin = new Date(lastSignInAt);
              daysSinceLastLogin = differenceInDays(today, lastLogin);
            }

            return {
              id: crewMember.id,
              firstName: crewMember.first_name || '',
              lastName: crewMember.last_name || '',
              username: crewMember.username || '',
              email: crewMember.email || '',
              role: crewMember.role || 'crew',
              lastSignInAt: lastSignInAt
                ? format(new Date(lastSignInAt), 'yyyy-MM-dd HH:mm:ss')
                : null,
              createdAt: crewMember.created_at,
              daysSinceLastLogin,
              daysSinceAccountCreation,
              loginCount: null,
            };
          },
        );

        setCrewActivity(crewActivityData);
      } catch (error) {
        console.error('[LOGIN ACTIVITY] Error fetching activity:', error);
        setCrewActivity([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchLoginActivity();
  }, [isAdmin, user?.id, supabase]);

  const filteredAndSortedCrew = useMemo(() => {
    let filtered = crewActivity;

    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (crew) =>
          crew.firstName.toLowerCase().includes(search) ||
          crew.lastName.toLowerCase().includes(search) ||
          crew.username.toLowerCase().includes(search) ||
          crew.email.toLowerCase().includes(search),
      );
    }

    if (filterBy === 'active') {
      filtered = filtered.filter(
        (crew) =>
          crew.daysSinceLastLogin !== null && crew.daysSinceLastLogin <= 30,
      );
    } else if (filterBy === 'inactive') {
      filtered = filtered.filter(
        (crew) =>
          crew.daysSinceLastLogin === null || crew.daysSinceLastLogin > 30,
      );
    } else if (filterBy === 'never') {
      filtered = filtered.filter((crew) => crew.lastSignInAt === null);
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'lastLogin') {
        if (a.daysSinceLastLogin === null && b.daysSinceLastLogin === null) {
          return b.daysSinceAccountCreation - a.daysSinceAccountCreation;
        }
        if (a.daysSinceLastLogin === null) return 1;
        if (b.daysSinceLastLogin === null) return -1;
        return a.daysSinceLastLogin - b.daysSinceLastLogin;
      }
      if (sortBy === 'accountCreation') {
        return b.daysSinceAccountCreation - a.daysSinceAccountCreation;
      }
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }, [crewActivity, searchTerm, filterBy, sortBy]);

  const stats = useMemo(() => {
    const total = crewActivity.length;
    const active = crewActivity.filter(
      (c) => c.daysSinceLastLogin !== null && c.daysSinceLastLogin <= 30,
    ).length;
    const inactive = crewActivity.filter(
      (c) => c.daysSinceLastLogin === null || c.daysSinceLastLogin > 30,
    ).length;
    const neverLoggedIn = crewActivity.filter(
      (c) => c.lastSignInAt === null,
    ).length;
    const withLogin = crewActivity.filter((c) => c.daysSinceLastLogin !== null);
    const avgDaysSinceLogin =
      withLogin.length === 0
        ? 0
        : Math.round(
            withLogin.reduce(
              (sum, c) => sum + (c.daysSinceLastLogin || 0),
              0,
            ) / withLogin.length,
          );

    return { total, active, inactive, neverLoggedIn, avgDaysSinceLogin };
  }, [crewActivity]);

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const filterTabs: Array<{
    id: ActivityFilter;
    label: string;
    count: number;
  }> = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'active', label: 'Active', count: stats.active },
    { id: 'inactive', label: 'Inactive', count: stats.inactive },
    { id: 'never', label: 'Never', count: stats.neverLoggedIn },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header — Supabase Studio style */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LogIn className="h-3.5 w-3.5" />
            <span>Platform</span>
            <span className="text-border">/</span>
            <span className="text-foreground">Login activity</span>
          </div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            Login activity
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Track crew and captain sign-ins, inactivity, and never-used
            accounts.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="hidden items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {stats.active} active (30d)
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {stats.inactive} inactive
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              {stats.neverLoggedIn} never signed in
            </span>
            {stats.avgDaysSinceLogin > 0 ? (
              <>
                <span className="h-3 w-px bg-border" />
                <span className="font-mono tabular-nums">
                  ~{stats.avgDaysSinceLogin}d avg
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {stats.neverLoggedIn === stats.total && stats.total > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <span className="font-medium">No login data yet.</span> After the{' '}
          <code className="font-mono text-[11px]">sync_last_sign_in_trigger</code>{' '}
          is active on <code className="font-mono text-[11px]">auth.users</code>,
          timestamps appear when crew sign in.
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterBy(tab.id)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
                  filterBy === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'rounded px-1 font-mono text-[10px] tabular-nums',
                    filterBy === tab.id
                      ? 'bg-muted text-muted-foreground'
                      : 'text-muted-foreground/70',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, username, email…"
              className="h-8 rounded-md border-border bg-background pl-8 text-xs shadow-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={sortBy}
            onValueChange={(v) =>
              setSortBy(v as 'lastLogin' | 'accountCreation' | 'name')
            }
          >
            <SelectTrigger className="h-8 w-full rounded-md border-border text-xs sm:w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lastLogin" className="text-xs">
                Sort: last login
              </SelectItem>
              <SelectItem value="accountCreation" className="text-xs">
                Sort: account age
              </SelectItem>
              <SelectItem value="name" className="text-xs">
                Sort: name
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            <span className="font-mono tabular-nums">
              {filteredAndSortedCrew.length}
            </span>
            {' of '}
            <span className="font-mono tabular-nums">{crewActivity.length}</span>
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
                Last login
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground lg:table-cell">
                Days since
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground xl:table-cell">
                Account age
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Status
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
                <TableCell colSpan={8} className="h-36 bg-background">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading login activity…
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredAndSortedCrew.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-36 bg-background">
                  <div className="flex flex-col items-center justify-center gap-1 text-center">
                    <p className="text-sm text-foreground">No crew found</p>
                    <p className="text-xs text-muted-foreground">
                      {searchTerm || filterBy !== 'all'
                        ? 'Try another filter or search term.'
                        : 'No crew or captain accounts yet.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedCrew.map((crew) => {
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
                      <RoleChip role={crew.role} />
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      {crew.lastSignInAt ? (
                        <div className="flex flex-col">
                          <span className="text-xs tabular-nums text-foreground">
                            {format(
                              parse(
                                crew.lastSignInAt,
                                'yyyy-MM-dd HH:mm:ss',
                                new Date(),
                              ),
                              'd MMM yyyy',
                            )}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(
                              parse(
                                crew.lastSignInAt,
                                'yyyy-MM-dd HH:mm:ss',
                                new Date(),
                              ),
                              'HH:mm',
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Never
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle lg:table-cell">
                      {crew.daysSinceLastLogin !== null ? (
                        <span
                          className={cn(
                            'font-mono text-xs tabular-nums',
                            crew.daysSinceLastLogin > 30
                              ? 'text-destructive'
                              : 'text-emerald-600',
                          )}
                        >
                          {crew.daysSinceLastLogin}d
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle xl:table-cell">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {crew.daysSinceAccountCreation}d
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <StatusChip
                        lastSignInAt={crew.lastSignInAt}
                        daysSinceLastLogin={crew.daysSinceLastLogin}
                      />
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

function RoleChip({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 text-[10px] capitalize',
        role === 'captain'
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400'
          : 'border-border bg-muted/60 text-muted-foreground',
      )}
    >
      {role}
    </span>
  );
}

function StatusChip({
  lastSignInAt,
  daysSinceLastLogin,
}: {
  lastSignInAt: string | null;
  daysSinceLastLogin: number | null;
}) {
  if (lastSignInAt === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        Never
      </span>
    );
  }
  if (daysSinceLastLogin !== null && daysSinceLastLogin <= 7) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (daysSinceLastLogin !== null && daysSinceLastLogin <= 30) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
        Recent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Inactive
    </span>
  );
}
