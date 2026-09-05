'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import type {
  MatchedSeaJourneyUser,
  PostHogAnalytics,
  PostHogExceptionEvent,
  PostHogRange,
} from '@/lib/posthog';
import { PostHogUsageMap } from '@/components/dashboard/posthog-usage-map';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

function changeHint(current: number, previous: number): string {
  if (previous <= 0 && current <= 0) return 'vs previous period';
  if (previous <= 0) return 'New vs previous';
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}% vs previous`;
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
        <div className="truncate text-xs text-foreground">{matched.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {matched.email || email}
          {matched.role ? ` · ${matched.role}` : ''}
        </div>
      </Link>
    );
  }
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted-foreground">
        {email || 'Anonymous'}
      </div>
      {distinctId ? (
        <div className="truncate font-mono text-[10px] text-muted-foreground/70">
          {distinctId.slice(0, 8)}…
        </div>
      ) : null}
    </div>
  );
}

function StudioPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-border bg-background',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{title}</p>
          {description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-0">{children}</div>
    </div>
  );
}

function EmptyCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function RankTable({
  columns,
  rows,
  empty,
}: {
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, React.ReactNode>>;
  empty: string;
}) {
  if (rows.length === 0) return <EmptyCell>{empty}</EmptyCell>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border hover:bg-transparent">
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className={cn(
                'h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground',
                col.align === 'right' ? 'text-right' : '',
                col.key === columns[0]?.key ? 'pl-4' : '',
                col.key === columns[columns.length - 1]?.key ? 'pr-4' : '',
              )}
            >
              {col.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow
            key={i}
            className="border-border bg-background hover:bg-muted/40"
          >
            {columns.map((col) => (
              <TableCell
                key={col.key}
                className={cn(
                  'py-2 text-xs',
                  col.align === 'right' && 'text-right tabular-nums',
                  col.key === columns[0]?.key ? 'pl-4' : '',
                  col.key === columns[columns.length - 1]?.key ? 'pr-4' : '',
                )}
              >
                {row[col.key]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function PostHogAnalyticsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { data: userProfileRaw, isLoading: isLoadingProfile } =
    useDoc<UserProfile>('users', user?.id);

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
  const [tab, setTab] = useState('overview');

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
      setError(
        e instanceof Error ? e.message : 'Failed to load PostHog analytics',
      );
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
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const totals = data?.totals;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'audience', label: 'Audience' },
    { id: 'map', label: 'Map' },
    { id: 'events', label: 'Events' },
    { id: 'people', label: 'People' },
    {
      id: 'exceptions',
      label: 'Exceptions',
      count: totals?.exceptions,
    },
  ] as const;

  const statTiles = totals
    ? [
        {
          label: 'Unique users',
          value: formatInt(totals.uniqueUsers),
          hint: changeHint(totals.uniqueUsers, totals.uniqueUsersPrev),
          tone: 'default' as const,
        },
        {
          label: 'Pageviews',
          value: formatInt(totals.pageviews),
          hint: changeHint(totals.pageviews, totals.pageviewsPrev),
          tone: 'sky' as const,
        },
        {
          label: 'Sessions',
          value: formatInt(totals.sessions),
          hint: changeHint(totals.sessions, totals.sessionsPrev),
          tone: 'emerald' as const,
        },
        {
          label: 'Events',
          value: formatInt(totals.events),
          hint: `${totals.avgEventsPerSession} / session avg`,
          tone: 'default' as const,
        },
        {
          label: 'Exceptions',
          value: formatInt(totals.exceptions),
          hint: changeHint(totals.exceptions, totals.exceptionsPrev),
          tone: 'destructive' as const,
        },
        {
          label: 'Matched people',
          value: `${matchedPeople}/${data?.people.length ?? 0}`,
          hint: `${totals.avgPageviewsPerUser} views / user`,
          tone: 'amber' as const,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span>Platform</span>
            <span className="text-border">/</span>
            <span className="text-foreground">PostHog</span>
          </div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            PostHog
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Live product analytics matched to SeaJourney accounts when identify
            succeeds. Admins are excluded from capture.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data?.generatedAt ? (
            <div className="hidden items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              Updated{' '}
              <span className="font-mono tabular-nums text-foreground">
                {format(parseISO(data.generatedAt), 'HH:mm:ss')}
              </span>
            </div>
          ) : null}
          <Select
            value={range}
            onValueChange={(v) => setRange(v as PostHogRange)}
          >
            <SelectTrigger className="h-8 w-[130px] rounded-md border-border text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d" className="text-xs">
                Last 7 days
              </SelectItem>
              <SelectItem value="30d" className="text-xs">
                Last 30 days
              </SelectItem>
              <SelectItem value="90d" className="text-xs">
                Last 90 days
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-md border-border text-xs"
            onClick={() => void load()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {!configured ? (
        <StudioPanel
          title="Connect PostHog"
          description="Server env vars required to query the API"
        >
          <p className="px-4 py-4 text-sm text-muted-foreground">{error}</p>
        </StudioPanel>
      ) : isLoading && !data ? (
        <div className="flex items-center justify-center rounded-md border border-border bg-muted/40 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error && !data ? (
        <StudioPanel title="Could not load analytics">
          <p className="px-4 py-4 text-sm text-destructive">{error}</p>
        </StudioPanel>
      ) : totals && data ? (
        <>
          {/* Stats — kept as top section */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {statTiles.map((tile) => (
              <div
                key={tile.label}
                className="overflow-hidden rounded-md border border-border bg-background"
              >
                <div className="border-b border-border bg-muted/40 px-3 py-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {tile.label}
                  </span>
                </div>
                <div className="px-3 py-3">
                  <div
                    className={cn(
                      'font-mono text-xl font-medium tabular-nums tracking-tight',
                      tile.tone === 'emerald' && 'text-emerald-600',
                      tile.tone === 'sky' && 'text-sky-600',
                      tile.tone === 'amber' && 'text-amber-600',
                      tile.tone === 'destructive' && 'text-destructive',
                      tile.tone === 'default' && 'text-foreground',
                    )}
                  >
                    {tile.value}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {tile.hint}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-md border border-border bg-muted/40 p-0.5">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="h-7 gap-1.5 rounded-[5px] px-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  {t.label}
                  {'count' in t && typeof t.count === 'number' && t.count > 0 ? (
                    <span className="rounded px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {t.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-0 flex flex-col gap-4">
              <StudioPanel
                title="Traffic"
                description={`Daily users, pageviews, and sessions · last ${data.days} days`}
              >
                {data.trend.length === 0 ? (
                  <EmptyCell>No events in this range yet.</EmptyCell>
                ) : (
                  <div className="h-64 w-full px-2 py-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.trend}
                        margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border"
                        />
                        <XAxis
                          dataKey="day"
                          tickFormatter={(v) =>
                            format(parseISO(String(v)), 'd MMM')
                          }
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          allowDecimals={false}
                          width={36}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--background))',
                            fontSize: 12,
                          }}
                          labelFormatter={(v) =>
                            format(parseISO(String(v)), 'd MMM yyyy')
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="uniqueUsers"
                          name="Users"
                          stroke="hsl(142 76% 36%)"
                          fill="hsl(142 76% 36%)"
                          fillOpacity={0.12}
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="pageviews"
                          name="Pageviews"
                          stroke="hsl(var(--muted-foreground))"
                          fill="hsl(var(--muted-foreground))"
                          fillOpacity={0.06}
                          strokeWidth={1.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="sessions"
                          name="Sessions"
                          stroke="hsl(199 89% 48%)"
                          fill="hsl(199 89% 48%)"
                          fillOpacity={0.08}
                          strokeWidth={1.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </StudioPanel>

              <StudioPanel
                title="Activity by hour (UTC)"
                description="When events land across the day"
              >
                <div className="h-48 w-full px-2 py-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.hourly ?? []}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(v) => `${v}`}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))',
                          fontSize: 12,
                        }}
                        labelFormatter={(v) => `${v}:00 UTC`}
                      />
                      <Bar
                        dataKey="events"
                        name="Events"
                        fill="hsl(142 76% 36%)"
                        fillOpacity={0.7}
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </StudioPanel>

              <div className="grid gap-4 lg:grid-cols-2">
                <StudioPanel title="Top pages" description="By pageview count">
                  <RankTable
                    empty="No pageviews yet."
                    columns={[
                      { key: 'path', label: 'Path' },
                      { key: 'views', label: 'Views', align: 'right' },
                      { key: 'users', label: 'Users', align: 'right' },
                    ]}
                    rows={data.topPages.map((row) => ({
                      path: (
                        <span className="max-w-[280px] truncate font-mono text-[11px]">
                          {row.path}
                        </span>
                      ),
                      views: formatInt(row.views),
                      users: (
                        <span className="text-muted-foreground">
                          {formatInt(row.users)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>

                <StudioPanel
                  title="Dashboard routes"
                  description="Paths under /dashboard"
                >
                  <RankTable
                    empty="No dashboard pageviews yet."
                    columns={[
                      { key: 'path', label: 'Path' },
                      { key: 'views', label: 'Views', align: 'right' },
                      { key: 'users', label: 'Users', align: 'right' },
                    ]}
                    rows={(data.dashboardPages ?? []).map((row) => ({
                      path: (
                        <span className="max-w-[280px] truncate font-mono text-[11px]">
                          {row.path}
                        </span>
                      ),
                      views: formatInt(row.views),
                      users: (
                        <span className="text-muted-foreground">
                          {formatInt(row.users)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <StudioPanel title="Top events" description="All event types">
                  <RankTable
                    empty="No events yet."
                    columns={[
                      { key: 'event', label: 'Event' },
                      { key: 'count', label: 'Count', align: 'right' },
                      { key: 'users', label: 'Users', align: 'right' },
                    ]}
                    rows={data.topEvents.map((row) => ({
                      event: (
                        <span className="font-mono text-[11px]">{row.event}</span>
                      ),
                      count: formatInt(row.count),
                      users: (
                        <span className="text-muted-foreground">
                          {formatInt(row.users)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>

                <StudioPanel
                  title="Custom events"
                  description="Excludes $ system events"
                >
                  <RankTable
                    empty="No custom events captured yet."
                    columns={[
                      { key: 'event', label: 'Event' },
                      { key: 'count', label: 'Count', align: 'right' },
                      { key: 'users', label: 'Users', align: 'right' },
                    ]}
                    rows={(data.customEvents ?? []).map((row) => ({
                      event: (
                        <span className="font-mono text-[11px]">{row.event}</span>
                      ),
                      count: formatInt(row.count),
                      users: (
                        <span className="text-muted-foreground">
                          {formatInt(row.users)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>
              </div>
            </TabsContent>

            <TabsContent value="audience" className="mt-0 flex flex-col gap-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <StudioPanel title="Devices" description="Unique users">
                  <RankTable
                    empty="No device data yet."
                    columns={[
                      { key: 'name', label: 'Device' },
                      { key: 'users', label: 'Users', align: 'right' },
                      { key: 'events', label: 'Events', align: 'right' },
                    ]}
                    rows={data.devices.map((row) => ({
                      name: row.device,
                      users: formatInt(row.users),
                      events: (
                        <span className="text-muted-foreground">
                          {formatInt(row.events)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>
                <StudioPanel title="Browsers" description="Unique users">
                  <RankTable
                    empty="No browser data yet."
                    columns={[
                      { key: 'name', label: 'Browser' },
                      { key: 'users', label: 'Users', align: 'right' },
                      { key: 'events', label: 'Events', align: 'right' },
                    ]}
                    rows={(data.browsers ?? []).map((row) => ({
                      name: row.browser,
                      users: formatInt(row.users),
                      events: (
                        <span className="text-muted-foreground">
                          {formatInt(row.events)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>
                <StudioPanel title="Operating systems" description="Unique users">
                  <RankTable
                    empty="No OS data yet."
                    columns={[
                      { key: 'name', label: 'OS' },
                      { key: 'users', label: 'Users', align: 'right' },
                      { key: 'events', label: 'Events', align: 'right' },
                    ]}
                    rows={(data.operatingSystems ?? []).map((row) => ({
                      name: row.os,
                      users: formatInt(row.users),
                      events: (
                        <span className="text-muted-foreground">
                          {formatInt(row.events)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <StudioPanel
                  title="Referrers"
                  description="Referring domain on pageviews"
                >
                  <RankTable
                    empty="No referrer data yet."
                    columns={[
                      { key: 'name', label: 'Referrer' },
                      { key: 'users', label: 'Users', align: 'right' },
                      { key: 'events', label: 'Views', align: 'right' },
                    ]}
                    rows={(data.referrers ?? []).map((row) => ({
                      name: (
                        <span className="font-mono text-[11px]">
                          {row.referrer}
                        </span>
                      ),
                      users: formatInt(row.users),
                      events: (
                        <span className="text-muted-foreground">
                          {formatInt(row.events)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>

                <StudioPanel
                  title="Roles"
                  description="From person.properties.role after identify"
                >
                  <RankTable
                    empty="No role data yet."
                    columns={[
                      { key: 'name', label: 'Role' },
                      { key: 'users', label: 'Users', align: 'right' },
                      { key: 'events', label: 'Events', align: 'right' },
                    ]}
                    rows={(data.roles ?? []).map((row) => ({
                      name: (
                        <span className="capitalize">{row.role}</span>
                      ),
                      users: formatInt(row.users),
                      events: (
                        <span className="text-muted-foreground">
                          {formatInt(row.events)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>
              </div>
            </TabsContent>

            <TabsContent value="map" className="mt-0 flex flex-col gap-4">
              <StudioPanel
                title="Where the app is used"
                description="PostHog GeoIP — city-level from IP, matched when identified"
              >
                <div className="p-4">
                  <PostHogUsageMap
                    locations={data.locations ?? []}
                    locatedPeople={data.locatedPeople ?? []}
                  />
                </div>
              </StudioPanel>

              <div className="grid gap-4 lg:grid-cols-2">
                <StudioPanel title="Countries" description="Unique people">
                  <RankTable
                    empty="No country data yet."
                    columns={[
                      { key: 'name', label: 'Country' },
                      { key: 'users', label: 'People', align: 'right' },
                      { key: 'events', label: 'Events', align: 'right' },
                    ]}
                    rows={(data.countries ?? []).map((row) => ({
                      name: (
                        <span>
                          {row.country}
                          <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                            {row.countryCode}
                          </span>
                        </span>
                      ),
                      users: formatInt(row.users),
                      events: (
                        <span className="text-muted-foreground">
                          {formatInt(row.events)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>

                <StudioPanel
                  title="People by location"
                  description="Last known city"
                >
                  <RankTable
                    empty="No located people in this range."
                    columns={[
                      { key: 'person', label: 'Person' },
                      { key: 'place', label: 'Location' },
                      { key: 'events', label: 'Events', align: 'right' },
                    ]}
                    rows={(data.locatedPeople ?? []).map((row) => ({
                      person: (
                        <PersonCell
                          matched={row.matchedUser}
                          email={row.email}
                          distinctId={row.distinctId}
                        />
                      ),
                      place:
                        [row.city, row.country].filter(Boolean).join(', ') ||
                        '—',
                      events: (
                        <span className="text-muted-foreground">
                          {formatInt(row.events)}
                        </span>
                      ),
                    }))}
                  />
                </StudioPanel>
              </div>
            </TabsContent>

            <TabsContent value="events" className="mt-0">
              <StudioPanel
                title="Recent events"
                description="Latest captures · excluding $pageleave"
              >
                {(data.recentEvents ?? []).length === 0 ? (
                  <EmptyCell>No events in this range.</EmptyCell>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="h-9 bg-muted/40 pl-4 text-[11px] font-normal text-muted-foreground">
                          When
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                          Event
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                          Person
                        </TableHead>
                        <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground md:table-cell">
                          Path
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 pr-4 text-[11px] font-normal text-muted-foreground">
                          Client
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentEvents.map((row, i) => (
                        <TableRow
                          key={`${row.timestamp}-${row.event}-${i}`}
                          className="border-border bg-background hover:bg-muted/40"
                        >
                          <TableCell className="py-2 pl-4 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                            {formatTs(row.timestamp)}
                          </TableCell>
                          <TableCell className="py-2 font-mono text-[11px]">
                            {row.event}
                          </TableCell>
                          <TableCell className="py-2">
                            <PersonCell
                              matched={row.matchedUser}
                              email={row.email}
                              distinctId={row.distinctId}
                            />
                          </TableCell>
                          <TableCell className="hidden max-w-[220px] truncate py-2 text-xs md:table-cell">
                            {row.path || '—'}
                          </TableCell>
                          <TableCell className="py-2 pr-4 text-xs whitespace-nowrap text-muted-foreground">
                            {[row.device, row.browser, row.os]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </StudioPanel>
            </TabsContent>

            <TabsContent value="people" className="mt-0">
              <StudioPanel
                title="People"
                description="Matched by distinct_id = users.id or person email"
              >
                {data.people.length === 0 ? (
                  <EmptyCell>No people in this range.</EmptyCell>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="h-9 bg-muted/40 pl-4 text-[11px] font-normal text-muted-foreground">
                          Person
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                          Match
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground">
                          Events
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground">
                          Views
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground">
                          Errors
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 pr-4 text-[11px] font-normal text-muted-foreground">
                          Last seen
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.people.map((row) => (
                        <TableRow
                          key={row.distinctId}
                          className="border-border bg-background hover:bg-muted/40"
                        >
                          <TableCell className="py-2 pl-4">
                            <PersonCell
                              matched={row.matchedUser}
                              email={row.email}
                              distinctId={row.distinctId}
                            />
                          </TableCell>
                          <TableCell className="py-2">
                            {row.matchedUser ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                SeaJourney
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                                Unmatched
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-right font-mono text-xs tabular-nums">
                            {formatInt(row.events)}
                          </TableCell>
                          <TableCell className="py-2 text-right font-mono text-xs tabular-nums">
                            {formatInt(row.pageviews)}
                          </TableCell>
                          <TableCell className="py-2 text-right font-mono text-xs tabular-nums">
                            {formatInt(row.exceptions)}
                          </TableCell>
                          <TableCell className="py-2 pr-4 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                            {formatTs(row.lastSeen)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </StudioPanel>
            </TabsContent>

            <TabsContent
              value="exceptions"
              className="mt-0 flex flex-col gap-4"
            >
              <StudioPanel
                title="Grouped exceptions"
                description="Same type + message in this range"
              >
                {data.exceptionGroups.length === 0 ? (
                  <EmptyCell>
                    No <span className="font-mono">$exception</span> events yet.
                  </EmptyCell>
                ) : (
                  <RankTable
                    empty=""
                    columns={[
                      { key: 'type', label: 'Type' },
                      { key: 'message', label: 'Message' },
                      { key: 'count', label: 'Count', align: 'right' },
                      { key: 'users', label: 'Users', align: 'right' },
                      { key: 'last', label: 'Last seen' },
                    ]}
                    rows={data.exceptionGroups.map((row) => ({
                      type: (
                        <span className="font-mono text-[11px] whitespace-nowrap">
                          {row.type}
                        </span>
                      ),
                      message: (
                        <span className="max-w-[360px] truncate">
                          {row.message}
                        </span>
                      ),
                      count: formatInt(row.occurrences),
                      users: formatInt(row.users),
                      last: (
                        <span className="tabular-nums text-muted-foreground">
                          {formatTs(row.lastSeen)}
                        </span>
                      ),
                    }))}
                  />
                )}
              </StudioPanel>

              <StudioPanel
                title="Exception log"
                description="Expand a row for stack, page, and browser"
              >
                {data.exceptions.length === 0 ? (
                  <EmptyCell>No exception events in this range.</EmptyCell>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="h-9 w-8 bg-muted/40 pl-2 text-[11px] font-normal" />
                        <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                          When
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                          Person
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                          Exception
                        </TableHead>
                        <TableHead className="h-9 bg-muted/40 pr-4 text-[11px] font-normal text-muted-foreground">
                          Path
                        </TableHead>
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
                              cur === `${row.timestamp}-${i}`
                                ? null
                                : `${row.timestamp}-${i}`,
                            )
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </StudioPanel>
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
      <TableRow
        className="cursor-pointer border-border bg-background hover:bg-muted/40"
        onClick={onToggle}
      >
        <TableCell className="w-8 py-2 pl-2 text-muted-foreground">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </TableCell>
        <TableCell className="py-2 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
          {formatTs(row.timestamp)}
        </TableCell>
        <TableCell className="py-2">
          <PersonCell
            matched={row.matchedUser}
            email={row.email}
            distinctId={row.distinctId}
          />
        </TableCell>
        <TableCell className="py-2">
          <div className="font-mono text-[11px]">{row.type}</div>
          <div className="max-w-[360px] truncate text-[11px] text-muted-foreground">
            {row.message}
          </div>
        </TableCell>
        <TableCell className="max-w-[200px] truncate py-2 pr-4 text-xs">
          {row.path || '—'}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/20 px-4 py-3">
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Message
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words">
                  {row.message}
                </p>
              </div>
              <div className="space-y-1">
                <Detail label="Level" value={row.level} />
                <Detail label="Source" value={row.source} />
                <Detail
                  label="Browser"
                  value={[row.browser, row.os].filter(Boolean).join(' · ')}
                />
                <Detail label="Path" value={row.path} />
                {row.issueId && row.issueId !== 'null' ? (
                  <Detail label="Issue" value={row.issueId} />
                ) : null}
              </div>
            </div>
            {row.stack ? (
              <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-background p-3 text-[11px] leading-relaxed">
                {row.stack}
              </pre>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">
                No stack trace on this event.
              </p>
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
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="break-all">{value}</div>
    </div>
  );
}
