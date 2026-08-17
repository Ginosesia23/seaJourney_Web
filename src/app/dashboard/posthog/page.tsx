'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import type {
  MatchedSeaJourneyUser,
  PostHogAnalytics,
  PostHogExceptionEvent,
  PostHogRange,
} from '@/lib/posthog';
import {
  DashboardHeader,
  DashboardPanel,
  DashboardStatRow,
} from '@/components/dashboard/dashboard-home-ui';
import { PostHogUsageMap } from '@/components/dashboard/posthog-usage-map';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function changeHint(current: number, previous: number): string {
  if (previous <= 0 && current <= 0) return 'vs previous period';
  if (previous <= 0) return 'New vs previous period';
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}% vs previous period`;
}

function formatInt(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

function formatTs(value: string): string {
  if (!value) return '—';
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    try {
      return format(parseISO(value.slice(0, 10)), 'dd MMM');
    } catch {
      return value;
    }
  }
  return format(d, 'dd MMM HH:mm');
}

function PersonCell({
  matched,
  email,
  distinctId,
}: {
  matched: MatchedSeaJourneyUser | null;
  email?: string;
  distinctId?: string;
}) {
  if (matched) {
    return (
      <Link
        href={`/dashboard/users/${matched.id}`}
        className="min-w-0 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="truncate text-xs font-medium">{matched.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {matched.email || email}
          {matched.role ? ` · ${matched.role}` : ''}
        </div>
      </Link>
    );
  }
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted-foreground">{email || 'Anonymous'}</div>
      {distinctId ? (
        <div className="truncate font-mono text-[10px] text-muted-foreground/70">
          {distinctId.slice(0, 8)}…
        </div>
      ) : null}
    </div>
  );
}

export default function PostHogAnalyticsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    'users',
    user?.id,
  );

  const isAdmin = useMemo(() => {
    const role = (userProfileRaw as { role?: string } | null)?.role;
    return role === 'admin';
  }, [userProfileRaw]);

  const [range, setRange] = useState<PostHogRange>('30d');
  const [data, setData] = useState<PostHogAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [openException, setOpenException] = useState<string | null>(null);

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
      const res = await fetch(`/api/admin/posthog?range=${range}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503 || body.configured === false) {
        setConfigured(false);
        setData(null);
        setError(body.error || 'PostHog is not configured');
        return;
      }
      setConfigured(true);
      if (!res.ok) {
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setData(body.data as PostHogAnalytics);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Failed to load PostHog analytics');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, user, supabase, range]);

  useEffect(() => {
    if (isAdmin) void load();
    else if (!isLoadingProfile) setIsLoading(false);
  }, [isAdmin, isLoadingProfile, load]);

  const matchedPeople = data?.people.filter((p) => p.matchedUser).length ?? 0;

  if (isLoadingProfile || (!isAdmin && userProfileRaw)) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const totals = data?.totals;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="PostHog"
        description="Live product analytics, matched to SeaJourney accounts where identify succeeded."
        actions={
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as PostHogRange)}>
              <SelectTrigger className="h-9 w-[140px] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => void load()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        }
      />

      {!configured ? (
        <DashboardPanel title="Connect PostHog" description="Server env vars required to query the API">
          <p className="text-sm text-muted-foreground leading-relaxed">{error}</p>
        </DashboardPanel>
      ) : isLoading && !data ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error && !data ? (
        <DashboardPanel title="Could not load analytics">
          <p className="text-sm text-destructive">{error}</p>
        </DashboardPanel>
      ) : totals && data ? (
        <>
          <DashboardStatRow
            items={[
              {
                label: 'Unique users',
                value: formatInt(totals.uniqueUsers),
                hint: changeHint(totals.uniqueUsers, totals.uniqueUsersPrev),
              },
              {
                label: 'Pageviews',
                value: formatInt(totals.pageviews),
                hint: changeHint(totals.pageviews, totals.pageviewsPrev),
              },
              {
                label: 'Exceptions',
                value: formatInt(totals.exceptions),
                hint: changeHint(totals.exceptions, totals.exceptionsPrev),
              },
              {
                label: 'Matched people',
                value: `${matchedPeople}/${data.people.length}`,
                hint: 'PostHog distinct_id / email → users table',
              },
            ]}
          />

          <Tabs defaultValue="overview" className="flex flex-col gap-4">
            <TabsList className="w-fit">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="exceptions">
                Exceptions
                {totals.exceptions > 0 ? (
                  <span className="ml-1.5 tabular-nums text-[10px]">{totals.exceptions}</span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0 flex flex-col gap-6">
              <DashboardPanel
                title="Traffic"
                description={`Daily unique users and pageviews · last ${data.days} days`}
                action={
                  data.generatedAt ? (
                    <Badge variant="secondary" className="rounded-md text-[10px] font-medium">
                      {format(parseISO(data.generatedAt), 'HH:mm')}
                    </Badge>
                  ) : null
                }
              >
                {data.trend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events in this range yet.</p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="day"
                          tickFormatter={(v) => format(parseISO(String(v)), 'd MMM')}
                          tick={{ fontSize: 11 }}
                          className="text-muted-foreground"
                        />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--background))',
                            fontSize: 12,
                          }}
                          labelFormatter={(v) => format(parseISO(String(v)), 'd MMM yyyy')}
                        />
                        <Area
                          type="monotone"
                          dataKey="uniqueUsers"
                          name="Users"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.12}
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="pageviews"
                          name="Pageviews"
                          stroke="hsl(var(--muted-foreground))"
                          fill="hsl(var(--muted-foreground))"
                          fillOpacity={0.08}
                          strokeWidth={1.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </DashboardPanel>

              <div className="grid gap-6 lg:grid-cols-2">
                <DashboardPanel title="Top pages" description="By pageview count">
                  {data.topPages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pageviews yet.</p>
                  ) : (
                    <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 px-4 text-xs font-medium">Path</TableHead>
                            <TableHead className="h-8 px-2 text-xs font-medium text-right">Views</TableHead>
                            <TableHead className="h-8 px-4 text-xs font-medium text-right">Users</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.topPages.map((row) => (
                            <TableRow key={row.path} className="hover:bg-muted/40">
                              <TableCell className="px-4 py-1.5 text-xs font-medium max-w-[280px] truncate">
                                {row.path}
                              </TableCell>
                              <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                                {formatInt(row.views)}
                              </TableCell>
                              <TableCell className="px-4 py-1.5 text-xs tabular-nums text-right text-muted-foreground">
                                {formatInt(row.users)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </DashboardPanel>

                <DashboardPanel title="Top events" description="Including custom captures">
                  {data.topEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events yet.</p>
                  ) : (
                    <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 px-4 text-xs font-medium">Event</TableHead>
                            <TableHead className="h-8 px-2 text-xs font-medium text-right">Count</TableHead>
                            <TableHead className="h-8 px-4 text-xs font-medium text-right">Users</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.topEvents.map((row) => (
                            <TableRow key={row.event} className="hover:bg-muted/40">
                              <TableCell className="px-4 py-1.5 text-xs font-medium font-mono">
                                {row.event}
                              </TableCell>
                              <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                                {formatInt(row.count)}
                              </TableCell>
                              <TableCell className="px-4 py-1.5 text-xs tabular-nums text-right text-muted-foreground">
                                {formatInt(row.users)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </DashboardPanel>
              </div>

              <DashboardPanel title="Devices" description="Unique users by device type">
                {data.devices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No device data yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {data.devices.map((row) => (
                      <div key={row.device} className="min-w-[140px] rounded-lg border px-3 py-2.5">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {row.device}
                        </div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums">
                          {formatInt(row.users)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatInt(row.events)} events
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardPanel>
            </TabsContent>

            <TabsContent value="map" className="mt-0 flex flex-col gap-6">
              <DashboardPanel
                title="Where the app is used"
                description="PostHog GeoIP — city-level from IP address, matched to SeaJourney accounts when identified."
              >
                <PostHogUsageMap
                  locations={data.locations ?? []}
                  locatedPeople={data.locatedPeople ?? []}
                />
              </DashboardPanel>

              <div className="grid gap-6 lg:grid-cols-2">
                <DashboardPanel title="Countries" description="Unique people by country">
                  {(data.countries ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No country data yet.</p>
                  ) : (
                    <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 px-4 text-xs font-medium">Country</TableHead>
                            <TableHead className="h-8 px-2 text-xs font-medium text-right">People</TableHead>
                            <TableHead className="h-8 px-4 text-xs font-medium text-right">Events</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.countries.map((row) => (
                            <TableRow key={row.countryCode + row.country} className="hover:bg-muted/40">
                              <TableCell className="px-4 py-1.5 text-xs font-medium">
                                {row.country}
                                <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                                  {row.countryCode}
                                </span>
                              </TableCell>
                              <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                                {formatInt(row.users)}
                              </TableCell>
                              <TableCell className="px-4 py-1.5 text-xs tabular-nums text-right text-muted-foreground">
                                {formatInt(row.events)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </DashboardPanel>

                <DashboardPanel title="People by location" description="Last known city for identified and anonymous users">
                  {(data.locatedPeople ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No located people in this range.</p>
                  ) : (
                    <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 px-4 text-xs font-medium">Person</TableHead>
                            <TableHead className="h-8 px-2 text-xs font-medium">Location</TableHead>
                            <TableHead className="h-8 px-4 text-xs font-medium text-right">Events</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.locatedPeople.map((row) => (
                            <TableRow key={row.distinctId} className="hover:bg-muted/40">
                              <TableCell className="px-4 py-1.5">
                                <PersonCell
                                  matched={row.matchedUser}
                                  email={row.email}
                                  distinctId={row.distinctId}
                                />
                              </TableCell>
                              <TableCell className="px-2 py-1.5 text-xs">
                                {[row.city, row.country].filter(Boolean).join(', ') || '—'}
                              </TableCell>
                              <TableCell className="px-4 py-1.5 text-xs tabular-nums text-right text-muted-foreground">
                                {formatInt(row.events)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </DashboardPanel>
              </div>
            </TabsContent>

            <TabsContent value="events" className="mt-0">
              <DashboardPanel
                title="Recent events"
                description="Latest captures in this range, excluding $pageleave. Click a matched name to open the user."
              >
                {data.recentEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events in this range.</p>
                ) : (
                  <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-8 px-4 text-xs font-medium">When</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium">Event</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium">Person</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium">Path</TableHead>
                          <TableHead className="h-8 px-4 text-xs font-medium">Client</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recentEvents.map((row, i) => (
                          <TableRow key={`${row.timestamp}-${row.event}-${i}`} className="hover:bg-muted/40">
                            <TableCell className="px-4 py-1.5 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                              {formatTs(row.timestamp)}
                            </TableCell>
                            <TableCell className="px-2 py-1.5">
                              <span className="font-mono text-xs">{row.event}</span>
                            </TableCell>
                            <TableCell className="px-2 py-1.5">
                              <PersonCell
                                matched={row.matchedUser}
                                email={row.email}
                                distinctId={row.distinctId}
                              />
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-xs max-w-[240px] truncate">
                              {row.path || '—'}
                            </TableCell>
                            <TableCell className="px-4 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                              {[row.device, row.browser, row.os].filter(Boolean).join(' · ') || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </DashboardPanel>
            </TabsContent>

            <TabsContent value="people" className="mt-0">
              <DashboardPanel
                title="People"
                description="Matched by PostHog distinct_id = users.id (after login identify), or person email."
              >
                {data.people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No people in this range.</p>
                ) : (
                  <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-8 px-4 text-xs font-medium">Person</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium">Match</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium text-right">Events</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium text-right">Views</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium text-right">Errors</TableHead>
                          <TableHead className="h-8 px-4 text-xs font-medium">Last seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.people.map((row) => (
                          <TableRow key={row.distinctId} className="hover:bg-muted/40">
                            <TableCell className="px-4 py-1.5">
                              <PersonCell
                                matched={row.matchedUser}
                                email={row.email}
                                distinctId={row.distinctId}
                              />
                            </TableCell>
                            <TableCell className="px-2 py-1.5">
                              {row.matchedUser ? (
                                <Badge
                                  variant="secondary"
                                  className="h-5 rounded-md px-1.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                                >
                                  SeaJourney
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
                                  Unmatched
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                              {formatInt(row.events)}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                              {formatInt(row.pageviews)}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                              {formatInt(row.exceptions)}
                            </TableCell>
                            <TableCell className="px-4 py-1.5 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                              {formatTs(row.lastSeen)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </DashboardPanel>
            </TabsContent>

            <TabsContent value="exceptions" className="mt-0 flex flex-col gap-6">
              <DashboardPanel title="Grouped exceptions" description="Same type + message, counted in this range">
                {data.exceptionGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No <span className="font-mono text-xs">$exception</span> events yet. Uncaught errors are captured
                    automatically from this app going forward.
                  </p>
                ) : (
                  <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-8 px-4 text-xs font-medium">Type</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium">Message</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium text-right">Count</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium text-right">Users</TableHead>
                          <TableHead className="h-8 px-4 text-xs font-medium">Last seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.exceptionGroups.map((row, i) => (
                          <TableRow key={`${row.type}-${row.message}-${i}`} className="hover:bg-muted/40">
                            <TableCell className="px-4 py-1.5 font-mono text-xs whitespace-nowrap">
                              {row.type}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-xs max-w-[420px] truncate">
                              {row.message}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                              {formatInt(row.occurrences)}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-xs tabular-nums text-right">
                              {formatInt(row.users)}
                            </TableCell>
                            <TableCell className="px-4 py-1.5 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                              {formatTs(row.lastSeen)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </DashboardPanel>

              <DashboardPanel title="Exception log" description="Expand a row for stack, page, and browser">
                {data.exceptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No exception events in this range.</p>
                ) : (
                  <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-8 w-8 px-2" />
                          <TableHead className="h-8 px-2 text-xs font-medium">When</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium">Person</TableHead>
                          <TableHead className="h-8 px-2 text-xs font-medium">Exception</TableHead>
                          <TableHead className="h-8 px-4 text-xs font-medium">Path</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.exceptions.map((row, i) => (
                          <ExceptionRows
                            key={`${row.timestamp}-${i}`}
                            row={row}
                            open={openException === `${row.timestamp}-${i}`}
                            onToggle={() =>
                              setOpenException((cur) =>
                                cur === `${row.timestamp}-${i}` ? null : `${row.timestamp}-${i}`,
                              )
                            }
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </DashboardPanel>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

function ExceptionRows({
  row,
  open,
  onToggle,
}: {
  row: PostHogExceptionEvent;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <TableCell className="w-8 px-2 py-1.5 text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </TableCell>
        <TableCell className="px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
          {formatTs(row.timestamp)}
        </TableCell>
        <TableCell className="px-2 py-1.5">
          <PersonCell matched={row.matchedUser} email={row.email} distinctId={row.distinctId} />
        </TableCell>
        <TableCell className="px-2 py-1.5">
          <div className="font-mono text-xs">{row.type}</div>
          <div className="max-w-[360px] truncate text-[11px] text-muted-foreground">{row.message}</div>
        </TableCell>
        <TableCell className="px-4 py-1.5 text-xs max-w-[200px] truncate">{row.path || '—'}</TableCell>
      </TableRow>
      {open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/30 px-4 py-3">
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Message
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{row.message}</p>
              </div>
              <div className="space-y-1">
                <Detail label="Level" value={row.level} />
                <Detail label="Source" value={row.source} />
                <Detail label="Browser" value={[row.browser, row.os].filter(Boolean).join(' · ')} />
                <Detail label="Path" value={row.path} />
                {row.issueId && row.issueId !== 'null' ? (
                  <Detail label="Issue" value={row.issueId} />
                ) : null}
              </div>
            </div>
            {row.stack ? (
              <pre className="mt-3 max-h-56 overflow-auto rounded-lg border bg-background p-3 text-[11px] leading-relaxed">
                {row.stack}
              </pre>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">No stack trace on this event.</p>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="break-all">{value}</div>
    </div>
  );
}
