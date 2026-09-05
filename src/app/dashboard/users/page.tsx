'use client';

/**
 * Admin User Lookup
 *
 * Lists every account in the system. Admins can search/filter by name, email,
 * username, role, or subscription status, then click a row to drill into a
 * full per-user dashboard at /dashboard/users/[userId] with their calendar,
 * passages, watches, testimonials, sea time requests, and more.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import {
  ArrowUpRight,
  ArrowRightLeft,
  FlaskConical,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  Ship,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StatePill } from '@/components/state-pill';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { DailyStatus, UserProfile } from '@/lib/types';
import { formatSubscriptionTierLabel } from '@/lib/subscription-tier-labels';
import { cn } from '@/lib/utils';

type AdminUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  vesselName: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
  daysSinceLastLogin: number | null;
  latestState: DailyStatus | null;
  latestStateAt: string | null;
  /** null = auth status not yet loaded, true/false once known. */
  emailConfirmed: boolean | null;
  isDisabled: boolean | null;
  isTesting: boolean;
};

const VERIFICATION_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Any verification' },
  { value: 'verified', label: 'Verified only' },
  { value: 'unverified', label: 'Unverified only' },
];

const TESTING_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Any testing flag' },
  { value: 'hide', label: 'Hide testing' },
  { value: 'only', label: 'Testing only' },
];

export default function AdminUserLookupPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    'users',
    user?.id,
  );

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role =
      (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    return { ...userProfileRaw, role } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfile, router]);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [verificationFilter, setVerificationFilter] = useState<string>('all');
  const [testingFilter, setTestingFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'lastLogin' | 'lastState'>(
    'lastLogin',
  );

  const loadUsers = useCallback(async () => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      const { data: usersData, error: usersErr } = await supabase
        .from('users')
        .select(
          'id, first_name, last_name, username, email, role, subscription_tier, subscription_status, active_vessel_id, last_sign_in_at, created_at, is_testing',
        )
        .order('created_at', { ascending: false });

      if (usersErr) {
        console.error('[admin/users] load users:', usersErr);
        setRows([]);
        setIsLoading(false);
        return;
      }

      const allUsers = usersData ?? [];
      const userIds = allUsers.map((u) => u.id);

      // Resolve "active vessel" per user from the latest active assignment row
      // (`vessel_assignments` where end_date is null or in the future). The
      // `users.active_vessel_id` column is unreliable / often stale, so we
      // prefer assignments and fall back to the profile column only when
      // the user has no active assignment.
      const today = startOfDay(new Date());
      const todayIso = format(today, 'yyyy-MM-dd');
      const activeVesselIdByUser = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: assignments } = await supabase
          .from('vessel_assignments')
          .select('user_id, vessel_id, start_date, end_date')
          .in('user_id', userIds)
          .or(`end_date.is.null,end_date.gte.${todayIso}`)
          .order('start_date', { ascending: false });
        for (const row of assignments ?? []) {
          const uid = row.user_id as string;
          const vid = row.vessel_id as string | null;
          if (!uid || !vid) continue;
          if (activeVesselIdByUser.has(uid)) continue;
          activeVesselIdByUser.set(uid, vid);
        }
      }

      const vesselIds = Array.from(
        new Set([
          ...Array.from(activeVesselIdByUser.values()),
          ...allUsers
            .map((u) => u.active_vessel_id)
            .filter((v): v is string => typeof v === 'string' && v.length > 0),
        ]),
      );

      const vesselNameById = new Map<string, string>();
      if (vesselIds.length > 0) {
        const { data: vessels } = await supabase
          .from('vessels')
          .select('id, name')
          .in('id', vesselIds);
        for (const v of vessels ?? []) {
          if (v.id && v.name) vesselNameById.set(v.id as string, v.name as string);
        }
      }

      // Latest state per user — admin RLS lets us read all daily_state_logs.
      // Pull date-desc + updated/created-desc, take first hit per user_id.
      const latestStateByUser = new Map<
        string,
        { state: DailyStatus; at: string }
      >();
      if (userIds.length > 0) {
        const { data: logs } = await supabase
          .from('daily_state_logs')
          .select('user_id, state, date, updated_at, created_at')
          .in('user_id', userIds)
          .order('date', { ascending: false })
          .order('updated_at', { ascending: false, nullsFirst: false });

        for (const log of logs ?? []) {
          const uid = log.user_id as string;
          if (latestStateByUser.has(uid)) continue;
          latestStateByUser.set(uid, {
            state: log.state as DailyStatus,
            at: (log.updated_at as string) || (log.created_at as string) || (log.date as string),
          });
        }
      }

      const mapped: AdminUserRow[] = allUsers.map((u) => {
        const lastSignInAt = (u.last_sign_in_at as string | null) ?? null;
        const daysSinceLastLogin = lastSignInAt
          ? differenceInDays(today, new Date(lastSignInAt))
          : null;
        const latest = latestStateByUser.get(u.id as string) ?? null;
        const resolvedVesselId =
          activeVesselIdByUser.get(u.id as string) ??
          (u.active_vessel_id as string | null) ??
          null;
        const vesselName = resolvedVesselId
          ? vesselNameById.get(resolvedVesselId) ?? null
          : null;
        return {
          id: u.id as string,
          firstName: (u.first_name as string) || '',
          lastName: (u.last_name as string) || '',
          username: (u.username as string) || '',
          email: (u.email as string) || '',
          role: (u.role as string) || 'crew',
          subscriptionTier: (u.subscription_tier as string) ?? null,
          subscriptionStatus: (u.subscription_status as string) ?? null,
          vesselName,
          lastSignInAt,
          createdAt: (u.created_at as string) ?? null,
          daysSinceLastLogin,
          latestState: latest?.state ?? null,
          latestStateAt: latest?.at ?? null,
          emailConfirmed: null,
          isDisabled: null,
          isTesting: u.is_testing === true,
        };
      });

      setRows(mapped);

      // Fire-and-forget: fetch auth verification status for every user from
      // `auth.users` via the admin API. We render the table immediately and
      // patch in the verified/unverified badge once this resolves.
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch('/api/admin/users/auth?list=all', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = (await res.json()) as {
            users: Array<{ id: string; isConfirmed: boolean; isDisabled?: boolean }>;
          };
          const confirmedById = new Map<string, boolean>();
          const disabledById = new Map<string, boolean>();
          for (const u of json.users ?? []) {
            confirmedById.set(u.id, u.isConfirmed);
            disabledById.set(u.id, Boolean(u.isDisabled));
          }
          setRows((prev) =>
            prev.map((r) => ({
              ...r,
              emailConfirmed: confirmedById.has(r.id)
                ? confirmedById.get(r.id) ?? false
                : r.emailConfirmed,
              isDisabled: disabledById.has(r.id)
                ? disabledById.get(r.id) ?? false
                : r.isDisabled,
            })),
          );
        } else {
          console.warn('[admin/users] auth list fetch failed', res.status);
        }
      } catch (err) {
        console.warn('[admin/users] auth list fetch error', err);
      }
    } catch (err) {
      console.error('[admin/users] unexpected error:', err);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, supabase, user?.id]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredRows = useMemo(() => {
    let next = rows;
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      next = next.filter((r) =>
        [
          r.firstName,
          r.lastName,
          r.username,
          r.email,
          r.vesselName ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    if (roleFilter !== 'all') {
      next = next.filter((r) => r.role === roleFilter);
    }
    if (verificationFilter === 'verified') {
      next = next.filter((r) => r.emailConfirmed === true);
    } else if (verificationFilter === 'unverified') {
      next = next.filter((r) => r.emailConfirmed === false);
    }
    if (testingFilter === 'hide') {
      next = next.filter((r) => !r.isTesting);
    } else if (testingFilter === 'only') {
      next = next.filter((r) => r.isTesting);
    }

    const sorted = [...next];
    sorted.sort((a, b) => {
      if (sortBy === 'name') {
        const an = `${a.firstName} ${a.lastName}`.trim().toLowerCase() || a.username;
        const bn = `${b.firstName} ${b.lastName}`.trim().toLowerCase() || b.username;
        return an.localeCompare(bn);
      }
      if (sortBy === 'lastLogin') {
        if (a.daysSinceLastLogin == null && b.daysSinceLastLogin == null) return 0;
        if (a.daysSinceLastLogin == null) return 1;
        if (b.daysSinceLastLogin == null) return -1;
        return a.daysSinceLastLogin - b.daysSinceLastLogin;
      }
      // lastState
      if (!a.latestStateAt && !b.latestStateAt) return 0;
      if (!a.latestStateAt) return 1;
      if (!b.latestStateAt) return -1;
      return b.latestStateAt.localeCompare(a.latestStateAt);
    });
    return sorted;
  }, [rows, searchTerm, roleFilter, verificationFilter, testingFilter, sortBy]);

  const stats = useMemo(() => {
    const total = rows.length;
    const counts = { crew: 0, captain: 0, vessel: 0, admin: 0 } as Record<string, number>;
    let active30 = 0;
    let neverLoggedIn = 0;
    let unverified = 0;
    let authChecked = 0;
    for (const r of rows) {
      if (counts[r.role] != null) counts[r.role] += 1;
      if (r.lastSignInAt == null) neverLoggedIn += 1;
      else if (r.daysSinceLastLogin != null && r.daysSinceLastLogin <= 30)
        active30 += 1;
      if (r.emailConfirmed != null) {
        authChecked += 1;
        if (r.emailConfirmed === false) unverified += 1;
      }
    }
    return { total, counts, active30, neverLoggedIn, unverified, authChecked };
  }, [rows]);

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[480px] w-full rounded-md" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const roleTabs = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'crew', label: 'Crew', count: stats.counts.crew },
    { id: 'captain', label: 'Captain', count: stats.counts.captain },
    { id: 'vessel', label: 'Vessel', count: stats.counts.vessel },
    { id: 'admin', label: 'Admin', count: stats.counts.admin },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Platform</span>
            <span className="text-border">/</span>
            <span className="text-foreground">Users</span>
          </div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            User lookup
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Find any account and open their calendar, passages, watches,
            testimonials, and full activity history.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="hidden items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {stats.active30} active (30d)
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {stats.authChecked === 0 ? '…' : stats.unverified} unverified
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              {stats.neverLoggedIn} never signed in
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-md border-border text-xs"
            asChild
          >
            <Link href="/dashboard/users/transfer">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Transfer email
            </Link>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
            {roleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoleFilter(tab.id)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
                  roleFilter === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'rounded px-1 font-mono text-[10px] tabular-nums',
                    roleFilter === tab.id
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
              placeholder="Search name, email, vessel…"
              className="h-8 rounded-md border-border bg-background pl-8 text-xs shadow-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select
            value={verificationFilter}
            onValueChange={setVerificationFilter}
          >
            <SelectTrigger className="h-8 w-full rounded-md border-border text-xs sm:w-[160px]">
              <SelectValue placeholder="Verification" />
            </SelectTrigger>
            <SelectContent>
              {VERIFICATION_FILTERS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={testingFilter} onValueChange={setTestingFilter}>
            <SelectTrigger className="h-8 w-full rounded-md border-border text-xs sm:w-[150px]">
              <SelectValue placeholder="Testing" />
            </SelectTrigger>
            <SelectContent>
              {TESTING_FILTERS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(v) =>
              setSortBy(v as 'name' | 'lastLogin' | 'lastState')
            }
          >
            <SelectTrigger className="h-8 w-full rounded-md border-border text-xs sm:w-[170px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lastLogin" className="text-xs">
                Sort: last login
              </SelectItem>
              <SelectItem value="lastState" className="text-xs">
                Sort: last state
              </SelectItem>
              <SelectItem value="name" className="text-xs">
                Sort: name
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            <span className="font-mono tabular-nums">{filteredRows.length}</span>
            {' of '}
            <span className="font-mono tabular-nums">{rows.length}</span>
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
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Email
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Verified
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Role
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground md:table-cell">
                Plan
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground lg:table-cell">
                Vessel
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground xl:table-cell">
                Latest state
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Last sign in
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
                <TableCell colSpan={9} className="h-36 bg-background">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading accounts…
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="h-36 bg-background">
                  <div className="flex flex-col items-center justify-center gap-1 text-center">
                    <p className="text-sm text-foreground">No accounts found</p>
                    <p className="text-xs text-muted-foreground">
                      Try another filter or search term.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => {
                const fullName =
                  `${r.firstName} ${r.lastName}`.trim() ||
                  r.username ||
                  '—';
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer border-border bg-background hover:bg-muted/40"
                    onClick={() => router.push(`/dashboard/users/${r.id}`)}
                  >
                    <TableCell className="py-2.5 align-middle">
                      <div className="min-w-0 max-w-[220px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm text-foreground">
                            {fullName}
                          </span>
                          {r.isTesting ? (
                            <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
                              <FlaskConical className="h-2.5 w-2.5" />
                              Testing
                            </span>
                          ) : null}
                          {r.isDisabled ? (
                            <span className="rounded border border-destructive/40 bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive">
                              Disabled
                            </span>
                          ) : null}
                        </div>
                        {r.username ? (
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            @{r.username}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <span className="inline-flex max-w-[200px] items-center gap-1.5 truncate text-xs text-foreground">
                        <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r.email || '—'}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <VerifiedBadge confirmed={r.emailConfirmed} />
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <RoleBadge role={r.role} />
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle md:table-cell">
                      {r.subscriptionTier ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-foreground">
                            {formatSubscriptionTierLabel(r.subscriptionTier)}
                          </span>
                          <span
                            className={cn(
                              'text-[11px] capitalize text-muted-foreground',
                              r.subscriptionStatus === 'active' &&
                                'text-emerald-600',
                              r.subscriptionStatus === 'past-due' &&
                                'text-amber-600',
                              r.subscriptionStatus === 'inactive' &&
                                'text-destructive',
                            )}
                          >
                            {r.subscriptionStatus ?? '—'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle lg:table-cell">
                      {r.vesselName ? (
                        <span className="inline-flex max-w-[160px] items-center gap-1.5 truncate text-xs text-foreground">
                          <Ship className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{r.vesselName}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle xl:table-cell">
                      {r.latestState ? (
                        <div className="flex flex-col gap-1">
                          <StatePill stateKey={r.latestState} />
                          {r.latestStateAt ? (
                            <span className="text-[11px] text-muted-foreground">
                              {format(parseISO(r.latestStateAt), 'd MMM yyyy')}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      {r.lastSignInAt ? (
                        <div className="flex flex-col">
                          <span className="text-xs tabular-nums text-foreground">
                            {format(parseISO(r.lastSignInAt), 'd MMM yyyy')}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {r.daysSinceLastLogin != null
                              ? `${r.daysSinceLastLogin}d ago`
                              : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Never
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-right align-middle">
                      <Link
                        href={`/dashboard/users/${r.id}`}
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

function VerifiedBadge({ confirmed }: { confirmed: boolean | null }) {
  if (confirmed == null) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unverified
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground">
      {role}
    </span>
  );
}
