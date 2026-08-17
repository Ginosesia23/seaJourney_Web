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
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  ShieldOff,
  Ship,
  User as UserIcon,
  Users,
  UserSearch,
  type LucideIcon,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { StatePill } from '@/components/state-pill';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { DailyStatus, UserProfile } from '@/lib/types';
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
};

const ROLE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'crew', label: 'Crew' },
  { value: 'captain', label: 'Captain' },
  { value: 'vessel', label: 'Vessel' },
  { value: 'admin', label: 'Admin' },
];

const VERIFICATION_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Any verification' },
  { value: 'verified', label: 'Verified only' },
  { value: 'unverified', label: 'Unverified only' },
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
          'id, first_name, last_name, username, email, role, subscription_tier, subscription_status, active_vessel_id, last_sign_in_at, created_at',
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
  }, [rows, searchTerm, roleFilter, verificationFilter, sortBy]);

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
          <h1 className="text-3xl font-bold tracking-tight">User Lookup</h1>
          <p className="text-muted-foreground">Loading…</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-sky-600" />
          <h1 className="text-3xl font-bold tracking-tight">User Lookup</h1>
        </div>
        <p className="text-muted-foreground">
          Find any account on the platform and drill into their calendar, passages, watches, testimonials, and full activity history.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total accounts" value={stats.total} icon={Users} />
        <StatTile
          label="Active (30d)"
          value={stats.active30}
          icon={UserSearch}
          tone="positive"
        />
        <StatTile
          label="Unverified email"
          value={
            stats.authChecked === 0
              ? '…'
              : stats.unverified === 0
                ? '0'
                : stats.unverified
          }
          icon={ShieldOff}
          tone={stats.unverified > 0 ? 'warning' : undefined}
        />
        <StatTile
          label="Never logged in"
          value={stats.neverLoggedIn}
          icon={UserIcon}
          tone={stats.neverLoggedIn > 0 ? 'warning' : undefined}
        />
      </div>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            {filteredRows.length} of {rows.length} accounts shown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, username, email, or vessel…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_FILTERS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={verificationFilter}
              onValueChange={setVerificationFilter}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Verification" />
              </SelectTrigger>
              <SelectContent>
                {VERIFICATION_FILTERS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastLogin">Sort: last login</SelectItem>
                <SelectItem value="lastState">Sort: last state change</SelectItem>
                <SelectItem value="name">Sort: name</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Active vessel</TableHead>
                  <TableHead>Latest state</TableHead>
                  <TableHead>Last sign in</TableHead>
                  <TableHead className="w-12 text-right" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No accounts match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((r) => {
                    const fullName =
                      `${r.firstName} ${r.lastName}`.trim() || r.username || '—';
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => router.push(`/dashboard/users/${r.id}`)}
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              {fullName}
                              {r.isDisabled ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  Disabled
                                </Badge>
                              ) : null}
                            </span>
                            {r.username && (
                              <span className="text-xs text-muted-foreground">
                                @{r.username}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            {r.email || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <VerifiedBadge confirmed={r.emailConfirmed} />
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={r.role} />
                        </TableCell>
                        <TableCell>
                          {r.subscriptionTier ? (
                            <div className="flex flex-col text-xs">
                              <span className="font-medium capitalize">
                                {r.subscriptionTier}
                              </span>
                              <span
                                className={cn(
                                  'text-muted-foreground',
                                  r.subscriptionStatus === 'active' &&
                                    'text-green-600',
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
                        <TableCell>
                          {r.vesselName ? (
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <Ship className="h-3.5 w-3.5 text-muted-foreground" />
                              {r.vesselName}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.latestState ? (
                            <div className="flex flex-col gap-1">
                              <StatePill stateKey={r.latestState} />
                              {r.latestStateAt && (
                                <span className="text-[11px] text-muted-foreground">
                                  {format(parseISO(r.latestStateAt), 'd MMM yyyy')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.lastSignInAt ? (
                            <div className="flex flex-col text-xs">
                              <span className="font-medium">
                                {format(parseISO(r.lastSignInAt), 'd MMM yyyy')}
                              </span>
                              <span className="text-muted-foreground">
                                {r.daysSinceLastLogin != null
                                  ? `${r.daysSinceLastLogin} d ago`
                                  : ''}
                              </span>
                            </div>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              Never
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/dashboard/users/${r.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Open user profile"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'positive' | 'warning' | 'destructive';
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'text-2xl font-bold',
            tone === 'positive' && 'text-green-600',
            tone === 'warning' && 'text-amber-600',
            tone === 'destructive' && 'text-destructive',
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function VerifiedBadge({ confirmed }: { confirmed: boolean | null }) {
  if (confirmed == null) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  if (confirmed) {
    return (
      <Badge className="bg-green-600 hover:bg-green-600/90 text-[10px]">
        Verified
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-300"
    >
      Unverified
    </Badge>
  );
}

function RoleBadge({ role }: { role: string }) {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    role === 'admin'
      ? 'destructive'
      : role === 'vessel'
        ? 'default'
        : role === 'captain'
          ? 'default'
          : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {role}
    </Badge>
  );
}
