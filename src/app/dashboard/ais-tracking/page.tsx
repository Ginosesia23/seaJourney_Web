'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  Ship,
  Users,
} from 'lucide-react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type CrewTracker = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  position: string | null;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  subscriptionActive: boolean;
  cronEligible: boolean;
  activeVesselId: string | null;
  activeVesselName: string | null;
  activeVesselMmsi: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

type VesselTracker = {
  id: string;
  name: string;
  mmsi: string | null;
  imo: string | null;
  managerId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  managerTier: string | null;
  managerSubscriptionActive: boolean;
  lastSyncAt: string | null;
  lastPositionAt: string | null;
  lastNavStatus: string | null;
  lastSpeedKn: number | null;
  lastSyncError: string | null;
};

type RosterPayload = {
  crew: CrewTracker[];
  vessels: VesselTracker[];
  counts: {
    crew: number;
    vessels: number;
    crewCronEligible: number;
    crewWithErrors: number;
    vesselsWithErrors: number;
  };
};

function formatSyncAge(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function SyncCell({
  at,
  error,
}: {
  at: string | null;
  error: string | null;
}) {
  return (
    <div className="space-y-1 min-w-[160px]">
      <p className="text-sm tabular-nums">{formatSyncAge(at)}</p>
      {error ? (
        <p
          className="text-xs text-amber-700 dark:text-amber-400 line-clamp-2"
          title={error}
        >
          {error}
        </p>
      ) : at ? (
        <p className="text-xs text-muted-foreground">OK</p>
      ) : (
        <p className="text-xs text-muted-foreground">No sync yet</p>
      )}
    </div>
  );
}

export default function AdminAisTrackingPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    'users',
    user?.id,
  );

  const isAdmin = useMemo(() => {
    const role =
      (userProfileRaw as any)?.role || userProfileRaw?.role || 'crew';
    return role === 'admin';
  }, [userProfileRaw]);

  const [data, setData] = useState<RosterPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'crew' | 'vessels'>('crew');

  useEffect(() => {
    if (!isLoadingProfile && userProfileRaw && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfileRaw, router]);

  const load = useCallback(async () => {
    if (!isAdmin || !user) return;
    setIsLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/ais-tracking', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as RosterPayload;
      setData(json);
    } catch (e: any) {
      console.error('[ais-tracking admin]', e);
      setError(e?.message || 'Failed to load AIS trackers');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, user, supabase]);

  useEffect(() => {
    if (isAdmin) void load();
    else if (!isLoadingProfile) setIsLoading(false);
  }, [isAdmin, isLoadingProfile, load]);

  const q = search.trim().toLowerCase();

  const filteredCrew = useMemo(() => {
    const list = data?.crew ?? [];
    if (!q) return list;
    return list.filter((c) =>
      [c.name, c.email, c.role, c.position, c.activeVesselName, c.activeVesselMmsi, c.subscriptionTier]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data?.crew, q]);

  const filteredVessels = useMemo(() => {
    const list = data?.vessels ?? [];
    if (!q) return list;
    return list.filter((v) =>
      [v.name, v.mmsi, v.imo, v.managerName, v.managerEmail, v.lastNavStatus]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q)),
    );
  }, [data?.vessels, q]);

  if (isLoadingProfile || (!userProfileRaw && user)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Radar className="h-4 w-4" />
            Platform
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            AIS live tracking
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Crew and vessels currently opted in for hourly AIS sync. Useful for
            support, Datalastic cost, and spotting stuck sync errors.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-lg shrink-0"
          onClick={() => void load()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Crew opted in',
            value: data?.counts.crew ?? '—',
            icon: Users,
            hint: `${data?.counts.crewCronEligible ?? 0} cron-eligible`,
          },
          {
            label: 'Vessels opted in',
            value: data?.counts.vessels ?? '—',
            icon: Ship,
            hint: 'ais_tracking_enabled',
          },
          {
            label: 'Crew with errors',
            value: data?.counts.crewWithErrors ?? '—',
            icon: AlertTriangle,
            hint: 'Last sync error set',
          },
          {
            label: 'Vessels with errors',
            value: data?.counts.vesselsWithErrors ?? '—',
            icon: AlertTriangle,
            hint: 'Last sync error set',
          },
        ].map((s) => (
          <Card key={s.label} className="rounded-xl">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl">
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Active trackers</CardTitle>
            <CardDescription>
              Only accounts with tracking toggled on. Cron may still skip
              ineligible tiers.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, MMSI…"
              className="pl-9 rounded-lg"
            />
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'crew' | 'vessels')}>
            <TabsList className="mb-4">
              <TabsTrigger value="crew" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Crew ({filteredCrew.length})
              </TabsTrigger>
              <TabsTrigger value="vessels" className="gap-1.5">
                <Ship className="h-3.5 w-3.5" />
                Vessels ({filteredVessels.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="crew" className="mt-0">
              {isLoading && !data ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading crew trackers…
                </div>
              ) : filteredCrew.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No crew members with live AIS tracking enabled
                  {q ? ' match this search' : ''}.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Crew</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Active vessel</TableHead>
                        <TableHead>Cron</TableHead>
                        <TableHead>Last sync</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCrew.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <Link
                                href={`/dashboard/users/${c.id}`}
                                className="font-medium hover:underline"
                              >
                                {c.name}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {[c.email, c.role, c.position]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant="outline" className="font-normal capitalize">
                                {c.subscriptionTier}
                              </Badge>
                              <span
                                className={cn(
                                  'text-[11px]',
                                  c.subscriptionActive
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {c.subscriptionActive ? 'Active sub' : 'Inactive sub'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {c.activeVesselName ? (
                              <div>
                                <p className="text-sm font-medium">{c.activeVesselName}</p>
                                {c.activeVesselMmsi && (
                                  <p className="text-xs text-muted-foreground tabular-nums">
                                    MMSI {c.activeVesselMmsi}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {c.cronEligible ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 border-0">
                                Eligible
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Skipped</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <SyncCell at={c.lastSyncAt} error={c.lastSyncError} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="vessels" className="mt-0">
              {isLoading && !data ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading vessel trackers…
                </div>
              ) : filteredVessels.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No vessels with AIS tracking enabled
                  {q ? ' match this search' : ''}.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Manager</TableHead>
                        <TableHead>Last AIS</TableHead>
                        <TableHead>Last sync</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVessels.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium">{v.name}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {[
                                  v.mmsi ? `MMSI ${v.mmsi}` : null,
                                  v.imo ? `IMO ${v.imo}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'No MMSI/IMO'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {v.managerId ? (
                              <div className="space-y-0.5">
                                <Link
                                  href={`/dashboard/users/${v.managerId}`}
                                  className="text-sm font-medium hover:underline"
                                >
                                  {v.managerName || 'Manager'}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                  {[v.managerEmail, v.managerTier]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                                <span
                                  className={cn(
                                    'text-[11px]',
                                    v.managerSubscriptionActive
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-muted-foreground',
                                  )}
                                >
                                  {v.managerSubscriptionActive
                                    ? 'Active sub'
                                    : 'Inactive sub'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No manager</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5 text-sm">
                              <p>{v.lastNavStatus || '—'}</p>
                              <p className="text-xs text-muted-foreground">
                                {v.lastSpeedKn != null
                                  ? `${v.lastSpeedKn} kn`
                                  : 'No speed'}
                                {v.lastPositionAt
                                  ? ` · fix ${formatSyncAge(v.lastPositionAt)}`
                                  : ''}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <SyncCell at={v.lastSyncAt} error={v.lastSyncError} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
