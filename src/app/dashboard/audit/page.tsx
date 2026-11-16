'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  Anchor,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileCheck,
  FolderOpen,
  Loader2,
  MapPin,
  Radar,
  Ship,
  Users,
  Waves,
} from 'lucide-react';

import {
  AuditCheck,
  AuditPager,
  AuditStat,
  EvidenceTable,
  OutcomePill,
  StateBadge,
} from '@/components/dashboard/vessel-audit/audit-ui';
import {
  SettingsPageHeader,
  SettingsSection,
} from '@/components/dashboard/settings-page-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { DailyStatus, UserProfile } from '@/lib/types';
import type {
  VesselAuditDayRow,
  VesselAuditDocumentRow,
  VesselAuditFetchRow,
  VesselAuditObservationRow,
  VesselAuditOverview,
  VesselAuditPage,
  VesselAuditPassageRow,
  VesselAuditPeriod,
  VesselAuditSection,
  VesselAuditStateLogRow,
  VesselAuditWatchRow,
} from '@/lib/vessel-audit/types';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';

const PERIODS: Array<{ key: VesselAuditPeriod; label: string }> = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

const STATE_LABELS: Array<{ key: DailyStatus; label: string; icon: typeof Waves }> = [
  { key: 'underway', label: 'Underway', icon: Waves },
  { key: 'at-anchor', label: 'At anchor', icon: Anchor },
  { key: 'in-port', label: 'Moored / in port', icon: Ship },
  { key: 'in-yard', label: 'In yard', icon: Ship },
  { key: 'on-leave', label: 'On leave', icon: CalendarDays },
];

type TabKey =
  | 'overview'
  | 'ais'
  | 'sea-time'
  | 'passages'
  | 'watches'
  | 'documents'
  | 'crew';

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM yyyy HH:mm');
  } catch {
    return iso;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
}

function fmtCoord(lat: number | null, lon: number | null) {
  if (lat == null || lon == null) return '—';
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function fmtSeconds(total: number) {
  if (!total) return '—';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function triggerLabel(source: string) {
  return source.replace(/_/g, ' ');
}

async function fetchAuditSection<T>(
  vesselId: string,
  token: string,
  section: VesselAuditSection,
  period: VesselAuditPeriod,
  page = 1,
): Promise<T> {
  const params = new URLSearchParams({
    vesselId,
    section,
    period,
    page: String(page),
    pageSize: '25',
  });
  const res = await fetch(`/api/vessel-audit?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load audit');
  return json.data as T;
}

function FetchRow({ row }: { row: VesselAuditFetchRow }) {
  const [open, setOpen] = useState(false);
  const obs = row.observation;

  return (
    <>
      <tr className="border-b border-border/60 align-top">
        <td className="py-2.5 pr-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-left text-sm text-foreground hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="whitespace-nowrap">{fmtWhen(row.requestedAt)}</span>
          </button>
        </td>
        <td className="py-2.5 pr-3">
          <OutcomePill success={row.success} providerCalled={row.providerCalled} />
        </td>
        <td className="py-2.5 pr-3 text-xs text-muted-foreground">
          {row.endpoint || 'vessel'}
          {row.httpStatus != null ? ` · ${row.httpStatus}` : ''}
        </td>
        <td className="py-2.5 pr-3 text-xs capitalize text-muted-foreground">
          {triggerLabel(row.triggerSource)}
        </td>
        <td className="py-2.5 pr-3">
          {obs ? (
            <div className="space-y-0.5">
              <StateBadge state={obs.state} />
              <p className="text-[11px] text-muted-foreground">
                {obs.speedKn != null ? `${obs.speedKn.toFixed(1)} kn` : '—'} ·{' '}
                {fmtCoord(obs.latitude, obs.longitude)}
              </p>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.success ? 'No linked fix' : row.errorMessage || '—'}
            </span>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-border/60 bg-muted/20">
          <td colSpan={5} className="px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Completed" value={fmtWhen(row.completedAt)} />
              <Detail
                label="Response time"
                value={row.responseTimeMs != null ? `${row.responseTimeMs} ms` : '—'}
              />
              <Detail label="Tracking mode" value={row.trackingMode || '—'} />
              <Detail label="Trigger detail" value={row.triggerDetail || '—'} />
              <Detail label="Scheduled reason" value={row.scheduledReason || '—'} />
              <Detail
                label="Provider credits"
                value={
                  row.providerCreditsUsed != null ? String(row.providerCreditsUsed) : '—'
                }
              />
              {row.errorMessage ? (
                <Detail label="Error" value={row.errorMessage} className="sm:col-span-2" />
              ) : null}
              {obs ? (
                <>
                  <Detail label="Stored fix at" value={fmtWhen(obs.fetchedAt)} />
                  <Detail label="Provider timestamp" value={fmtWhen(obs.providerTimestamp)} />
                  <Detail label="Nav status" value={obs.navStatus || '—'} />
                  <Detail
                    label="Course / heading"
                    value={`${obs.course ?? '—'}° / ${obs.heading ?? '—'}°`}
                  />
                </>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Showing the stored API request and linked observation already saved for this
              vessel — nothing is re-requested from the AIS provider.
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}

export default function VesselAuditPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const { supabase } = useSupabase();
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

  const [period, setPeriod] = useState<VesselAuditPeriod>('90');
  const [tab, setTab] = useState<TabKey>('overview');
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overview, setOverview] = useState<VesselAuditOverview | null>(null);

  const [aisSub, setAisSub] = useState<'fetches' | 'observations' | 'days'>('fetches');
  const [listLoading, setListLoading] = useState(false);
  const [page, setPage] = useState(1);

  const [fetches, setFetches] = useState<VesselAuditPage<VesselAuditFetchRow> | null>(null);
  const [observations, setObservations] =
    useState<VesselAuditPage<VesselAuditObservationRow> | null>(null);
  const [aisDays, setAisDays] = useState<VesselAuditPage<VesselAuditDayRow> | null>(null);
  const [seaTime, setSeaTime] = useState<VesselAuditPage<VesselAuditStateLogRow> | null>(null);
  const [passages, setPassages] = useState<VesselAuditPage<VesselAuditPassageRow> | null>(null);
  const [watches, setWatches] = useState<VesselAuditPage<VesselAuditWatchRow> | null>(null);
  const [documents, setDocuments] =
    useState<VesselAuditPage<VesselAuditDocumentRow> | null>(null);

  useEffect(() => {
    if (profileLoading || !userProfileRaw) return;
    if (!isVessel) router.replace('/dashboard');
  }, [profileLoading, userProfileRaw, isVessel, router]);

  const getToken = useCallback(async () => {
    if (!supabase) return null;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, [supabase]);

  const loadOverview = useCallback(async () => {
    if (!activeVesselId || !isVessel) return;
    setOverviewLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const data = await fetchAuditSection<VesselAuditOverview>(
        activeVesselId,
        token,
        'overview',
        period,
      );
      setOverview(data);
    } catch (err) {
      console.error('[vessel-audit]', err);
      toast({
        title: 'Could not load audit',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, [activeVesselId, getToken, isVessel, period, toast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const listSection = useMemo((): VesselAuditSection | null => {
    if (tab === 'ais') {
      if (aisSub === 'fetches') return 'ais-fetches';
      if (aisSub === 'observations') return 'ais-observations';
      return 'ais-days';
    }
    if (tab === 'sea-time') return 'sea-time';
    if (tab === 'passages') return 'passages';
    if (tab === 'watches') return 'watches';
    if (tab === 'documents') return 'documents';
    return null;
  }, [aisSub, tab]);

  useEffect(() => {
    setPage(1);
  }, [period, tab, aisSub]);

  useEffect(() => {
    if (!activeVesselId || !isVessel || !listSection) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in');
        if (listSection === 'ais-fetches') {
          const data = await fetchAuditSection<VesselAuditPage<VesselAuditFetchRow>>(
            activeVesselId,
            token,
            'ais-fetches',
            period,
            page,
          );
          if (!cancelled) setFetches(data);
        } else if (listSection === 'ais-observations') {
          const data = await fetchAuditSection<
            VesselAuditPage<VesselAuditObservationRow>
          >(activeVesselId, token, 'ais-observations', period, page);
          if (!cancelled) setObservations(data);
        } else if (listSection === 'ais-days') {
          const data = await fetchAuditSection<VesselAuditPage<VesselAuditDayRow>>(
            activeVesselId,
            token,
            'ais-days',
            period,
            page,
          );
          if (!cancelled) setAisDays(data);
        } else if (listSection === 'sea-time') {
          const data = await fetchAuditSection<VesselAuditPage<VesselAuditStateLogRow>>(
            activeVesselId,
            token,
            'sea-time',
            period,
            page,
          );
          if (!cancelled) setSeaTime(data);
        } else if (listSection === 'passages') {
          const data = await fetchAuditSection<VesselAuditPage<VesselAuditPassageRow>>(
            activeVesselId,
            token,
            'passages',
            period,
            page,
          );
          if (!cancelled) setPassages(data);
        } else if (listSection === 'watches') {
          const data = await fetchAuditSection<VesselAuditPage<VesselAuditWatchRow>>(
            activeVesselId,
            token,
            'watches',
            period,
            page,
          );
          if (!cancelled) setWatches(data);
        } else if (listSection === 'documents') {
          const data = await fetchAuditSection<VesselAuditPage<VesselAuditDocumentRow>>(
            activeVesselId,
            token,
            'documents',
            period,
            page,
          );
          if (!cancelled) setDocuments(data);
        }
      } catch (err) {
        console.error('[vessel-audit list]', err);
        if (!cancelled) {
          toast({
            title: 'Could not load records',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeVesselId, getToken, isVessel, listSection, page, period, toast]);

  if (profileLoading || (!userProfileRaw && user)) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isVessel) return null;

  const vessel = overview?.vessel;
  const aisOn = Boolean(vessel?.aisTrackingEnabled);
  const counts = overview?.counts;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <SettingsPageHeader
        title="Audit"
        icon={ClipboardCheck}
        description="Browse readiness and the evidence already stored for this vessel — AIS requests, observations, sea time, passages, watches, and documents. Nothing here re-calls external providers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.key}
                type="button"
                size="sm"
                variant={period === p.key ? 'default' : 'outline'}
                className="h-8"
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      />

      {overviewLoading && !overview ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : overview && vessel ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AuditStat label="Vessel" value={vessel.name} hint={vessel.type || undefined} />
            <AuditStat
              label="Sea-time coverage"
              value={`${overview.loggedDays}/${overview.expectedDays || '—'}`}
              hint={
                overview.missingDays > 0
                  ? `${overview.missingDays} day${overview.missingDays === 1 ? '' : 's'} missing`
                  : 'Complete for period'
              }
            />
            <AuditStat
              label="AIS API requests"
              value={aisOn ? counts?.fetches ?? 0 : 'Off'}
              hint={
                aisOn
                  ? `${counts?.observations ?? 0} stored observations`
                  : 'Tracking disabled'
              }
            />
            <AuditStat
              label="Documents"
              value={
                (counts?.vesselGeneratedDocs ?? 0) +
                (counts?.proofOfService ?? 0) +
                (counts?.approvedTestimonials ?? 0)
              }
              hint={`${counts?.pendingTestimonials ?? 0} pending testimonials`}
            />
          </div>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabKey)}
            className="space-y-4"
          >
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/40 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ais" className="gap-1.5">
                <Radar className="h-3.5 w-3.5" />
                AIS evidence
                {aisOn && counts ? (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {counts.fetches}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="sea-time">Sea time</TabsTrigger>
              <TabsTrigger value="passages">Passages</TabsTrigger>
              <TabsTrigger value="watches">Watches</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="crew">Crew</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <SettingsSection
                  title="Audit readiness"
                  description="Checklist of identity, crew, logs, and supporting records for this period."
                >
                  <div className="divide-y divide-border">
                    {overview.readiness.map((item) => (
                      <AuditCheck
                        key={item.id}
                        ok={item.ok}
                        label={item.label}
                        hint={item.hint}
                      />
                    ))}
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="Vessel identity"
                  description="Details used on testimonials and verification."
                >
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <Identity label="IMO" value={vessel.imo} />
                    <Identity label="Official number" value={vessel.officialNumber} />
                    <Identity label="MMSI" value={vessel.mmsi} />
                    <Identity label="Call sign" value={vessel.callSign} />
                    <Identity label="Flag" value={vessel.flag} />
                    <Identity
                      label="GT"
                      value={vessel.grossTonnage != null ? String(vessel.grossTonnage) : null}
                    />
                    <Identity label="Management" value={vessel.managementCompany} />
                    <Identity
                      label="Ship stamp"
                      value={vessel.hasStamp ? 'Uploaded' : 'Missing'}
                    />
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/vessel-documents">
                        <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                        Vessel documents
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/settings">Settings</Link>
                    </Button>
                  </div>
                </SettingsSection>
              </div>

              <SettingsSection
                title="Logged state mix"
                description={
                  overview.lastLoggedDate
                    ? `Last logged day ${fmtDate(overview.lastLoggedDate)}`
                    : 'No daily states in this period'
                }
              >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {STATE_LABELS.map(({ key, label, icon: Icon }) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium">
                          {overview.stateCounts[key] || 0}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </SettingsSection>

              {aisOn ? (
                <SettingsSection
                  title="Live AIS status"
                  description="Latest values already stored for this vessel — not a fresh provider call."
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setTab('ais')}
                    >
                      Browse AIS evidence
                    </Button>
                  }
                >
                  {overview.aisStatus ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <AuditStat
                        label="Derived state"
                        value={<StateBadge state={overview.aisStatus.state} />}
                      />
                      <AuditStat
                        label="Speed"
                        value={
                          overview.aisStatus.speedKn != null
                            ? `${overview.aisStatus.speedKn.toFixed(1)} kn`
                            : '—'
                        }
                      />
                      <AuditStat
                        label="Position"
                        value={fmtCoord(
                          overview.aisStatus.latitude,
                          overview.aisStatus.longitude,
                        )}
                      />
                      <AuditStat
                        label="Last successful fetch"
                        value={fmtWhen(overview.aisStatus.lastSuccessfulFetchAt)}
                        hint={
                          overview.aisStatus.refreshError
                            ? overview.aisStatus.refreshError
                            : overview.aisStatus.trackingMode || undefined
                        }
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No AIS status row yet. Once tracking runs, stored requests and
                      observations appear under AIS evidence.
                    </p>
                  )}
                </SettingsSection>
              ) : null}
            </TabsContent>

            <TabsContent value="ais" className="space-y-4">
              {!aisOn ? (
                <SettingsSection title="AIS tracking is off">
                  <p className="text-sm text-muted-foreground">
                    Enable AIS tracking in vessel settings to start storing provider
                    requests and position observations. Manual sea-time logs remain
                    available under Sea time.
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href="/dashboard/settings">Open settings</Link>
                  </Button>
                </SettingsSection>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ['fetches', 'API requests', counts?.fetches],
                        ['observations', 'Observations', counts?.observations],
                        ['days', 'Daily summaries', counts?.aisDays],
                      ] as const
                    ).map(([key, label, count]) => (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={aisSub === key ? 'default' : 'outline'}
                        className="h-8"
                        onClick={() => setAisSub(key)}
                      >
                        {label}
                        {typeof count === 'number' ? (
                          <Badge
                            variant={aisSub === key ? 'secondary' : 'outline'}
                            className="ml-1.5 h-5 px-1.5 text-[10px]"
                          >
                            {count}
                          </Badge>
                        ) : null}
                      </Button>
                    ))}
                  </div>

                  <SettingsSection
                    title={
                      aisSub === 'fetches'
                        ? 'Stored AIS API requests'
                        : aisSub === 'observations'
                          ? 'Stored AIS observations'
                          : 'Daily AIS summaries vs logged state'
                    }
                    description={
                      aisSub === 'fetches'
                        ? 'Each provider call already made for this vessel, with the linked stored result when available.'
                        : aisSub === 'observations'
                          ? 'Position and state samples saved from successful fetches — browse without re-requesting.'
                          : 'Per-day AIS aggregates compared with the captain’s logged daily state.'
                    }
                    action={
                      listLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : null
                    }
                  >
                    {aisSub === 'fetches' ? (
                      <>
                        <EvidenceTable
                          headers={[
                            'Requested',
                            'Outcome',
                            'Endpoint',
                            'Trigger',
                            'Stored result',
                          ]}
                          empty={!listLoading && (fetches?.rows.length ?? 0) === 0}
                        >
                          {fetches?.rows.map((row) => (
                            <FetchRow key={row.id} row={row} />
                          ))}
                        </EvidenceTable>
                        {fetches ? (
                          <div className="mt-3 border-t border-border pt-3">
                            <AuditPager
                              page={fetches.page}
                              pageSize={fetches.pageSize}
                              total={fetches.total}
                              onPage={setPage}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {aisSub === 'observations' ? (
                      <>
                        <EvidenceTable
                          headers={[
                            'Fetched',
                            'State',
                            'Speed',
                            'Position',
                            'Nav status',
                            'Provider time',
                          ]}
                          empty={!listLoading && (observations?.rows.length ?? 0) === 0}
                        >
                          {observations?.rows.map((row) => (
                            <tr
                              key={row.id}
                              className="border-b border-border/60 align-top"
                            >
                              <td className="py-2.5 pr-3 whitespace-nowrap text-sm">
                                {fmtWhen(row.fetchedAt)}
                              </td>
                              <td className="py-2.5 pr-3">
                                <StateBadge state={row.state} />
                              </td>
                              <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                                {row.speedKn != null ? `${row.speedKn.toFixed(1)} kn` : '—'}
                              </td>
                              <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {fmtCoord(row.latitude, row.longitude)}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                                {row.navStatus || '—'}
                              </td>
                              <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                                {fmtWhen(row.providerTimestamp)}
                              </td>
                            </tr>
                          ))}
                        </EvidenceTable>
                        {observations ? (
                          <div className="mt-3 border-t border-border pt-3">
                            <AuditPager
                              page={observations.page}
                              pageSize={observations.pageSize}
                              total={observations.total}
                              onPage={setPage}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {aisSub === 'days' ? (
                      <>
                        <EvidenceTable
                          headers={[
                            'Date',
                            'AIS day state',
                            'Logged state',
                            'Fixes',
                            'Distance',
                            'Underway',
                            'Final',
                          ]}
                          empty={!listLoading && (aisDays?.rows.length ?? 0) === 0}
                        >
                          {aisDays?.rows.map((row) => {
                            const mismatch =
                              row.loggedState &&
                              row.qualifyingState &&
                              row.loggedState !== row.qualifyingState;
                            return (
                              <tr
                                key={row.date}
                                className={cn(
                                  'border-b border-border/60 align-top',
                                  mismatch && 'bg-amber-500/5',
                                )}
                              >
                                <td className="py-2.5 pr-3 whitespace-nowrap text-sm">
                                  {fmtDate(row.date)}
                                </td>
                                <td className="py-2.5 pr-3">
                                  <StateBadge state={row.qualifyingState} />
                                </td>
                                <td className="py-2.5 pr-3">
                                  <StateBadge state={row.loggedState} />
                                </td>
                                <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                                  {row.observationCount}
                                </td>
                                <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                                  {row.distanceNm != null
                                    ? `${row.distanceNm.toFixed(1)} nm`
                                    : '—'}
                                </td>
                                <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                                  {fmtSeconds(row.underwaySeconds)}
                                </td>
                                <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                                  {row.isFinal ? 'Yes' : 'Open'}
                                </td>
                              </tr>
                            );
                          })}
                        </EvidenceTable>
                        {aisDays ? (
                          <div className="mt-3 border-t border-border pt-3">
                            <AuditPager
                              page={aisDays.page}
                              pageSize={aisDays.pageSize}
                              total={aisDays.total}
                              onPage={setPage}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </SettingsSection>
                </>
              )}
            </TabsContent>

            <TabsContent value="sea-time" className="space-y-4">
              <SettingsSection
                title="Daily sea-time logs"
                description="Captain-recorded daily states stored for this vessel."
                action={
                  listLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/calendar">Open calendar</Link>
                    </Button>
                  )
                }
              >
                <EvidenceTable
                  headers={['Date', 'State', 'Passage', 'Notes']}
                  empty={!listLoading && (seaTime?.rows.length ?? 0) === 0}
                >
                  {seaTime?.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-sm">
                        {fmtDate(row.date)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StateBadge state={row.state} />
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {row.isPartOfActivePassage ? 'Active passage' : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                        {row.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </EvidenceTable>
                {seaTime ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <AuditPager
                      page={seaTime.page}
                      pageSize={seaTime.pageSize}
                      total={seaTime.total}
                      onPage={setPage}
                    />
                  </div>
                ) : null}
              </SettingsSection>
            </TabsContent>

            <TabsContent value="passages" className="space-y-4">
              <SettingsSection
                title="Passages"
                description="Stored passage records for the selected period."
                action={
                  listLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null
                }
              >
                <EvidenceTable
                  headers={[
                    'Departed',
                    'Arrived',
                    'From',
                    'To',
                    'Distance',
                    'Source',
                  ]}
                  empty={!listLoading && (passages?.rows.length ?? 0) === 0}
                >
                  {passages?.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-sm">
                        {fmtWhen(row.startTime)}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-sm text-muted-foreground">
                        {fmtWhen(row.endTime)}
                      </td>
                      <td className="py-2.5 pr-3 text-sm">{row.departurePort || '—'}</td>
                      <td className="py-2.5 pr-3 text-sm">{row.arrivalPort || '—'}</td>
                      <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                        {row.distanceNm != null ? `${row.distanceNm.toFixed(1)} nm` : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-xs capitalize text-muted-foreground">
                        {row.source || '—'}
                      </td>
                    </tr>
                  ))}
                </EvidenceTable>
                {passages ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <AuditPager
                      page={passages.page}
                      pageSize={passages.pageSize}
                      total={passages.total}
                      onPage={setPage}
                    />
                  </div>
                ) : null}
              </SettingsSection>
            </TabsContent>

            <TabsContent value="watches" className="space-y-4">
              <SettingsSection
                title="Navigation watches"
                description="Stored watchkeeping entries for this vessel."
                action={
                  listLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null
                }
              >
                <EvidenceTable
                  headers={['Started', 'Ended', 'Type', 'Crew']}
                  empty={!listLoading && (watches?.rows.length ?? 0) === 0}
                >
                  {watches?.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 align-top">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-sm">
                        {fmtWhen(row.startTime)}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-sm text-muted-foreground">
                        {fmtWhen(row.endTime)}
                      </td>
                      <td className="py-2.5 pr-3 text-sm capitalize">
                        {row.watchType || '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-sm">{row.crewName || '—'}</td>
                    </tr>
                  ))}
                </EvidenceTable>
                {watches ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <AuditPager
                      page={watches.page}
                      pageSize={watches.pageSize}
                      total={watches.total}
                      onPage={setPage}
                    />
                  </div>
                ) : null}
              </SettingsSection>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <SettingsSection
                title="Supporting documents"
                description="Testimonials and proof of service already issued or in progress."
                action={
                  listLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/vessel-documents">
                        <FileCheck className="mr-1.5 h-3.5 w-3.5" />
                        Manage
                      </Link>
                    </Button>
                  )
                }
              >
                <EvidenceTable
                  headers={['Created', 'Type', 'Crew', 'Period', 'Status', 'Code']}
                  empty={!listLoading && (documents?.rows.length ?? 0) === 0}
                >
                  {documents?.rows.map((row) => (
                    <tr key={`${row.kind}-${row.id}`} className="border-b border-border/60 align-top">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-sm">
                        {fmtWhen(row.createdAt)}
                      </td>
                      <td className="py-2.5 pr-3 text-sm">{row.title}</td>
                      <td className="py-2.5 pr-3 text-sm">{row.crewName || '—'}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {row.startDate || row.endDate
                          ? `${fmtDate(row.startDate)} → ${fmtDate(row.endDate)}`
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge variant="secondary" className="capitalize">
                          {(row.status || '—').replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">
                        {row.verificationCode || '—'}
                      </td>
                    </tr>
                  ))}
                </EvidenceTable>
                {documents ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <AuditPager
                      page={documents.page}
                      pageSize={documents.pageSize}
                      total={documents.total}
                      onPage={setPage}
                    />
                  </div>
                ) : null}
              </SettingsSection>
            </TabsContent>

            <TabsContent value="crew" className="space-y-4">
              <SettingsSection
                title="Active crew assignments"
                description="People currently linked to this vessel."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/crew">
                      <Users className="mr-1.5 h-3.5 w-3.5" />
                      Crew
                    </Link>
                  </Button>
                }
              >
                {(overview.crew.length ?? 0) === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No active crew assignments.
                  </p>
                ) : (
                  <EvidenceTable headers={['Name', 'Position', 'Onboard', 'Since', 'Email']}>
                    {overview.crew.map((member) => (
                      <tr
                        key={member.userId}
                        className="border-b border-border/60 align-top"
                      >
                        <td className="py-2.5 pr-3 text-sm font-medium">{member.name}</td>
                        <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                          {member.position || '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge variant={member.onboard ? 'default' : 'secondary'}>
                            {member.onboard ? 'Onboard' : 'Assigned'}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                          {fmtDate(member.startDate)}
                        </td>
                        <td className="py-2.5 pr-3 text-sm text-muted-foreground">
                          {member.email || '—'}
                        </td>
                      </tr>
                    ))}
                  </EvidenceTable>
                )}
              </SettingsSection>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <SettingsSection title="Audit unavailable">
          <p className="text-sm text-muted-foreground">
            Could not load vessel audit data. Confirm you have an active vessel selected
            and try again.
          </p>
          <Button type="button" size="sm" className="mt-3" onClick={() => void loadOverview()}>
            Retry
          </Button>
        </SettingsSection>
      )}
    </div>
  );
}

function Identity({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value || '—'}</dd>
    </div>
  );
}
