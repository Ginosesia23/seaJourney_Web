'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Bug,
  Flag,
  Loader2,
  RefreshCw,
  Ship,
  User,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type DetectionSnapshot = {
  sampleCount?: number;
  state?: string | null;
  reason?: string;
  confidence?: string;
  seaDayRuleFired?: boolean;
  usedFallback?: boolean;
  metrics?: {
    positionCount?: number;
    distanceTraveledNm?: number;
    radiusOfMovementNm?: number;
    avgSpeed?: number | null;
    maxSpeed?: number | null;
    dominantNavStatus?: string | null;
    underwayDurationMs?: number;
    stationaryClusterCount?: number;
    clusterTransitionNm?: number;
  } | null;
} | null;

type ReportRow = {
  id: string;
  accountType: 'vessel' | 'crew';
  logDate: string;
  detectedState: string | null;
  suggestedState: string;
  aisNavStatus: string | null;
  aisSpeedKn: number | null;
  notes: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  adminNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  detectionSnapshot?: DetectionSnapshot;
  reporter: { id: string; name: string; email: string | null; role: string | null };
  vessel: { id: string; name: string; mmsi: string | null; imo: string | null };
  reviewer: { id: string; name: string } | null;
};

type ReplaySample = {
  id: string;
  sampledAt: string;
  storedState: string;
  navStatus: string | null;
  speedKn: number | null;
  lat: number | null;
  lon: number | null;
  resolved?: {
    state: string;
    confidence: string;
    reason: string;
    distanceFromPreviousNm: number | null;
    positionChangedMeaningfully: boolean;
  };
};

type ReplayPayload = {
  report: {
    id: string;
    detectedState: string | null;
    suggestedState: string;
    detectionSnapshot: DetectionSnapshot;
  };
  replay: {
    logDate: string;
    yesterdayIso: string;
    sampleSource: string;
    previousDay: {
      state: string;
      lastLatitude: number | null;
      lastLongitude: number | null;
    } | null;
    locationContext: {
      endOfDayPlaceName: string | null;
      endOfDayInPopulatedArea: boolean;
    } | null;
    loggedState: string | null;
    aggregate: {
      state: string;
      reason: string;
      confidence: string;
      sampleCount: number;
      seaDayRuleFired: boolean;
      usedFallback: boolean;
      metrics: {
        distanceTraveledNm?: number;
        underwayDurationMs?: number;
        avgSpeed?: number | null;
        maxSpeed?: number | null;
        dominantNavStatus?: string | null;
        stationaryClusterCount?: number;
        clusterTransitionNm?: number;
        radiusOfMovementNm?: number;
        positionCount?: number;
      } | null;
    } | null;
    samples: ReplaySample[];
  };
};

const STATUS_TABS = [
  { id: 'open', label: 'Open' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
] as const;

function stateLabel(s: string | null | undefined): string {
  if (!s) return '—';
  const map: Record<string, string> = {
    underway: 'Underway',
    'at-anchor': 'At anchor',
    'in-port': 'In port',
    'in-yard': 'In yard',
    'on-leave': 'On leave',
  };
  return map[s] || s;
}

function hoursFromMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

function statusBadge(status: ReportRow['status']) {
  const styles: Record<ReportRow['status'], string> = {
    open: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    reviewing: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
    resolved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    dismissed: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] capitalize', styles[status])}>
      {status}
    </Badge>
  );
}

export default function AisWrongStateReportsPage() {
  const { user } = useUser();
  const { session } = useSupabase();
  const { data: profile } = useDoc<UserProfile>('users', user?.id);
  const role = String((profile as { role?: string } | null)?.role || '').toLowerCase();
  const isAdmin = role === 'admin';

  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [nextStatus, setNextStatus] = useState<string>('reviewing');
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [replay, setReplay] = useState<ReplayPayload | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token || !isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/ais-wrong-state-reports?status=${encodeURIComponent(statusFilter)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setReports(data.reports || []);
    } catch (err) {
      toast({
        title: 'Could not load reports',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, isAdmin, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReview = (row: ReportRow) => {
    setSelected(row);
    setNextStatus(row.status === 'open' ? 'reviewing' : row.status);
    setAdminNotes(row.adminNotes || '');
    setReplay(null);
    setReplayError(null);
    setShowReplay(false);
  };

  const loadReplay = async () => {
    if (!selected || !session?.access_token) return;
    setShowReplay(true);
    setReplayLoading(true);
    setReplayError(null);
    try {
      const res = await fetch(
        `/api/admin/ais-wrong-state-reports/${encodeURIComponent(selected.id)}/replay`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Replay failed');
      setReplay(data as ReplayPayload);
    } catch (err) {
      setReplay(null);
      setReplayError(err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setReplayLoading(false);
    }
  };

  const saveReview = async () => {
    if (!selected || !session?.access_token) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ais-wrong-state-reports', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: selected.id,
          status: nextStatus,
          adminNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      toast({ title: 'Updated', description: `Report marked ${nextStatus}.` });
      setSelected(null);
      await load();
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (profile && !isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-xl font-semibold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page lists AIS wrong-state reports from vessel and crew accounts.
        </p>
      </div>
    );
  }

  const agg = replay?.replay.aggregate;
  const metrics = agg?.metrics;
  const snapshot = selected?.detectionSnapshot || replay?.report.detectionSnapshot;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AIS wrong states</h1>
          <p className="text-sm text-muted-foreground">
            Reports from vessel and crew Premium accounts when AIS set the wrong daily state.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              '-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors',
              statusFilter === tab.id
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <div className="py-16 text-center">
          <Flag className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <h2 className="text-base font-medium">No reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing in this filter yet.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 px-2 py-1.5 text-xs">When</TableHead>
              <TableHead className="h-8 px-2 py-1.5 text-xs">Account</TableHead>
              <TableHead className="h-8 px-2 py-1.5 text-xs">Vessel</TableHead>
              <TableHead className="h-8 px-2 py-1.5 text-xs">Day</TableHead>
              <TableHead className="h-8 px-2 py-1.5 text-xs">AIS → Correct</TableHead>
              <TableHead className="h-8 px-2 py-1.5 text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => openReview(row)}
              >
                <TableCell className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground tabular-nums">
                  {format(parseISO(row.createdAt), 'd MMM · HH:mm')}
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5 text-sm">
                    {row.accountType === 'vessel' ? (
                      <Ship className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-medium">{row.reporter.name}</span>
                  </div>
                  <div className="text-[11px] capitalize text-muted-foreground">
                    {row.accountType}
                    {row.reporter.email ? ` · ${row.reporter.email}` : ''}
                  </div>
                </TableCell>
                <TableCell className="px-2 py-1.5 text-sm">
                  {row.vessel.name}
                  {row.vessel.mmsi ? (
                    <div className="text-[11px] text-muted-foreground">MMSI {row.vessel.mmsi}</div>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums">
                  {format(parseISO(row.logDate), 'd MMM yyyy')}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-sm">
                  <span className="text-muted-foreground">{stateLabel(row.detectedState)}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-medium">{stateLabel(row.suggestedState)}</span>
                  {row.aisNavStatus ? (
                    <div className="text-[11px] text-muted-foreground">{row.aisNavStatus}</div>
                  ) : null}
                </TableCell>
                <TableCell className="px-2 py-1.5">{statusBadge(row.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Review report
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.reporter.name} · ${selected.vessel.name} · ${format(parseISO(selected.logDate), 'd MMM yyyy')}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">AIS set</div>
                  <div className="font-medium">{stateLabel(selected.detectedState)}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">User says</div>
                  <div className="font-medium">{stateLabel(selected.suggestedState)}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2 col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-muted-foreground">Recomputed</div>
                  <div className="font-medium">
                    {replayLoading
                      ? '…'
                      : agg
                        ? stateLabel(agg.state)
                        : showReplay
                          ? '—'
                          : 'Run debug'}
                  </div>
                </div>
              </div>

              {(selected.aisNavStatus || selected.aisSpeedKn != null) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    selected.aisNavStatus,
                    selected.aisSpeedKn != null
                      ? `${selected.aisSpeedKn.toFixed(1)} kn`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}

              {selected.notes && (
                <div className="rounded-lg border px-3 py-2 text-sm">
                  <div className="text-[11px] text-muted-foreground">Note</div>
                  {selected.notes}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => void loadReplay()}
                  disabled={replayLoading}
                >
                  {replayLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Bug className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Debug this day
                </Button>
                {snapshot?.reason && !showReplay && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-md">
                    Snapshot: {snapshot.reason}
                  </p>
                )}
              </div>

              {showReplay && (
                <div className="space-y-3 rounded-lg border p-3">
                  {replayError && (
                    <p className="text-sm text-destructive">{replayError}</p>
                  )}
                  {replayLoading && !replay && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Replaying samples…
                    </div>
                  )}
                  {replay && (
                    <>
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Why this day won
                        </div>
                        <p className="mt-1 text-sm">
                          {agg?.reason || 'No samples to aggregate.'}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Confidence {agg?.confidence ?? '—'}
                          {agg?.usedFallback ? ' · frequency fallback' : ''}
                          {agg?.seaDayRuleFired ? ' · ≥4h underway rule' : ''}
                          {' · '}
                          {agg?.sampleCount ?? 0} samples
                          {replay.replay.locationContext?.endOfDayPlaceName
                            ? ` · near ${replay.replay.locationContext.endOfDayPlaceName}`
                            : ''}
                        </p>
                      </div>

                      {metrics && (
                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <Metric
                            label="Underway"
                            value={hoursFromMs(metrics.underwayDurationMs)}
                          />
                          <Metric
                            label="Distance"
                            value={
                              metrics.distanceTraveledNm != null
                                ? `${metrics.distanceTraveledNm.toFixed(1)} nm`
                                : '—'
                            }
                          />
                          <Metric
                            label="Avg / max SOG"
                            value={
                              metrics.avgSpeed != null || metrics.maxSpeed != null
                                ? `${metrics.avgSpeed?.toFixed(1) ?? '—'} / ${metrics.maxSpeed?.toFixed(1) ?? '—'} kn`
                                : '—'
                            }
                          />
                          <Metric
                            label="Clusters"
                            value={
                              metrics.stationaryClusterCount != null
                                ? String(metrics.stationaryClusterCount)
                                : '—'
                            }
                          />
                          <Metric
                            label="Dominant nav"
                            value={metrics.dominantNavStatus || '—'}
                          />
                          <Metric
                            label="Yesterday"
                            value={
                              replay.replay.previousDay
                                ? stateLabel(replay.replay.previousDay.state)
                                : '—'
                            }
                          />
                          <Metric
                            label="Logged now"
                            value={stateLabel(replay.replay.loggedState)}
                          />
                          <Metric
                            label="Source"
                            value={
                              replay.replay.sampleSource.includes('crew')
                                ? 'crew samples'
                                : 'vessel samples'
                            }
                          />
                        </div>
                      )}

                      {replay.replay.samples.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No hourly samples stored for this day
                          {snapshot?.reason
                            ? ` — frozen snapshot: ${snapshot.reason}`
                            : '.'}
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-auto rounded border">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-7 px-2 py-1 text-[10px]">Time</TableHead>
                                <TableHead className="h-7 px-2 py-1 text-[10px]">Nav / SOG</TableHead>
                                <TableHead className="h-7 px-2 py-1 text-[10px]">Stored</TableHead>
                                <TableHead className="h-7 px-2 py-1 text-[10px]">Resolved</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {replay.replay.samples.map((s) => (
                                <TableRow key={s.id} className="align-top">
                                  <TableCell className="whitespace-nowrap px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                                    {format(parseISO(s.sampledAt), 'HH:mm')}
                                  </TableCell>
                                  <TableCell className="px-2 py-1 text-[11px]">
                                    <div>{s.navStatus || '—'}</div>
                                    <div className="text-muted-foreground">
                                      {s.speedKn != null ? `${s.speedKn.toFixed(1)} kn` : '—'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-2 py-1 text-[11px]">
                                    {stateLabel(s.storedState)}
                                  </TableCell>
                                  <TableCell className="px-2 py-1 text-[11px]">
                                    {s.resolved ? (
                                      <>
                                        <div
                                          className={cn(
                                            s.resolved.state !== s.storedState &&
                                              'font-medium text-amber-700 dark:text-amber-400',
                                          )}
                                        >
                                          {stateLabel(s.resolved.state)}
                                          <span className="ml-1 text-muted-foreground">
                                            ({s.resolved.confidence})
                                          </span>
                                        </div>
                                        <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                                          {s.resolved.reason}
                                        </div>
                                      </>
                                    ) : (
                                      '—'
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Status</label>
                <Select value={nextStatus} onValueChange={setNextStatus}>
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="reviewing">Reviewing</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Admin notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="min-h-[80px]"
                  placeholder="Internal note — e.g. which rule to tweak"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setSelected(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={() => void saveReview()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="truncate font-medium tabular-nums">{value}</div>
    </div>
  );
}
