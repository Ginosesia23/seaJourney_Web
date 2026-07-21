'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Activity,
  Anchor,
  CheckCircle2,
  Loader2,
  Radio,
  RefreshCw,
  Ship,
  Waves,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';
import { hasCrewAisLiveTrackingTier } from '@/supabase/database/subscription-helpers';

/** Auto-sync at most once per hour while this page is open. */
const CREW_AIS_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;

function shouldRunAutoSync(lastSyncAt: string | null | undefined): boolean {
  if (!lastSyncAt) return true;
  const t = Date.parse(lastSyncAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= CREW_AIS_AUTO_SYNC_INTERVAL_MS;
}

type CrewSample = {
  id: string;
  state: string;
  sampledAt: string;
  navStatus: string | null;
  speedKn: number | null;
};

type ActiveVessel = {
  vesselId: string;
  vesselName: string | null;
  mmsi: string | null;
  imo: string | null;
  startDate: string | null;
  endDate: string | null;
};

type CrewAisStatus = {
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  activeVessel: ActiveVessel | null;
  today: string;
  todayDailyState: string | null;
  todayNotes: string | null;
  samples: CrewSample[];
};

type Props = {
  accessToken: string | null;
  profileRaw: unknown;
  onStateUpdated?: () => void;
};

const STATE_LABELS: Record<string, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored / In port',
  'in-yard': 'In yard',
  'on-leave': 'On leave',
};

export function CrewAisTrackingCard({
  accessToken,
  profileRaw,
  onStateUpdated,
}: Props) {
  const eligible = hasCrewAisLiveTrackingTier(profileRaw);
  const [status, setStatus] = useState<CrewAisStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const onStateUpdatedRef = useRef(onStateUpdated);
  useEffect(() => {
    onStateUpdatedRef.current = onStateUpdated;
  }, [onStateUpdated]);

  const loadStatus = useCallback(async () => {
    if (!accessToken || !eligible) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/ais/crew-tracking', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load AIS settings');
      setStatus({
        enabled: !!data.enabled,
        lastSyncAt: data.lastSyncAt ?? null,
        lastError: data.lastError ?? null,
        activeVessel: data.activeVessel ?? null,
        today: data.today,
        todayDailyState: data.todayDailyState ?? null,
        todayNotes: data.todayNotes ?? null,
        samples: data.samples ?? [],
      });
    } catch (err) {
      console.error('[CREW AIS CARD]', err);
    } finally {
      setLoading(false);
    }
  }, [accessToken, eligible]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runSync = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken || !status?.enabled) return false;
      setSyncing(true);
      try {
        const res = await fetch('/api/ais/crew-tracking', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ logDate: format(new Date(), 'yyyy-MM-dd') }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sync failed');

        const result = data.sync;
        if (result?.ok) {
          if (!options?.silent) {
            toast({
              title: 'AIS state updated',
              description: result.aggregatedState
                ? `Today's state set to ${STATE_LABELS[result.aggregatedState] || result.aggregatedState} (${result.sampleCount || 0} samples).`
                : `Recorded a new AIS sample.`,
            });
          }
          onStateUpdatedRef.current?.();
        } else if (!options?.silent) {
          toast({
            title: 'AIS sync skipped',
            description: result?.reason || 'No update applied',
            variant: 'destructive',
          });
        }
        await loadStatus();
        return !!result?.ok;
      } catch (err) {
        if (!options?.silent) {
          toast({
            title: 'AIS sync failed',
            description: err instanceof Error ? err.message : 'Unexpected error',
            variant: 'destructive',
          });
        }
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [accessToken, loadStatus, status?.enabled],
  );

  // Auto-sync on page load if stale + every hour while open.
  const runSyncRef = useRef(runSync);
  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  useEffect(() => {
    if (!status?.enabled || !accessToken || loading) return;
    let cancelled = false;
    const autoSync = async () => {
      if (cancelled) return;
      await runSyncRef.current({ silent: true });
    };
    if (shouldRunAutoSync(status.lastSyncAt)) {
      void autoSync();
    }
    const interval = window.setInterval(() => {
      void autoSync();
    }, CREW_AIS_AUTO_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [status?.enabled, status?.lastSyncAt, accessToken, loading]);

  const handleToggle = async (enabled: boolean) => {
    if (!accessToken) return;
    setToggling(true);
    try {
      const res = await fetch('/api/ais/crew-tracking', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled,
          logDate: format(new Date(), 'yyyy-MM-dd'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update AIS tracking');

      if (enabled) {
        if (data.sync?.ok) {
          toast({
            title: 'AIS tracking enabled',
            description: `First sample recorded — today's state is ${STATE_LABELS[data.sync.aggregatedState] || data.sync.aggregatedState}.`,
          });
          onStateUpdatedRef.current?.();
        } else {
          toast({
            title: 'AIS tracking enabled',
            description:
              data.sync?.reason ||
              "We'll start collecting hourly AIS samples for your active vessel.",
          });
        }
      } else {
        toast({
          title: 'AIS tracking disabled',
          description: 'You’re back to manual daily logging.',
        });
      }

      await loadStatus();
    } catch (err) {
      toast({
        title: 'Could not update AIS tracking',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setToggling(false);
    }
  };

  if (!eligible) {
    return (
      <VesselPremiumFeatureGate
        title="Available on Crew Premium & Professional"
        featureLabel="Live AIS tracking"
        description="Auto-set your daily state from live AIS on your active vessel."
        plansLabel="Crew Premium and Crew Professional"
      />
    );
  }

  const active = status?.activeVessel ?? null;
  const hasIdentifier = !!(active?.mmsi || active?.imo);
  const latestSample = status?.samples?.length
    ? status.samples[status.samples.length - 1]
    : null;

  // Count states in today's samples for the little tally display.
  const stateCounts: Record<string, number> = {};
  for (const s of status?.samples ?? []) {
    stateCounts[s.state] = (stateCounts[s.state] ?? 0) + 1;
  }
  const sortedStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]);
  // The analyzer's verdict is the source of truth for the "sea day" badge —
  // it may fire even if we only have 4 hourly samples of underway, and it may
  // NOT fire even if a few samples say underway (analyzer needs ≥ 4h total).
  const resolvedState = status?.todayDailyState ?? null;
  const isSeaDay = resolvedState === 'underway';
  // Try to extract "Xh underway" from the notes for a nicer badge.
  const underwayHoursMatch = status?.todayNotes?.match(/(\d+(?:\.\d+)?)h underway/);
  const underwayHours = underwayHoursMatch ? underwayHoursMatch[1] : null;

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-sky-500" />
              Live AIS tracking (your vessel)
            </CardTitle>
            <CardDescription>
              We poll your active vessel&apos;s AIS position every hour and set
              your daily state automatically. The analyser weighs{' '}
              <strong>hours underway</strong> (≥ 4h = sea day),{' '}
              <strong>position clusters</strong>, movement between anchor and
              berth, previous-day carry-forward, and reverse-geocoded location
              — the same algorithm as the AIS import page.
            </CardDescription>
          </div>
          {status?.enabled ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary">Manual</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading AIS settings…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-0.5">
                <Label
                  htmlFor="crew-ais-tracking-toggle"
                  className="text-sm font-medium"
                >
                  Use AIS for daily state
                </Label>
                <p className="text-xs text-muted-foreground">
                  {active?.vesselName ? (
                    <>
                      Tracking <strong>{active.vesselName}</strong>
                      {active.mmsi ? ` · MMSI ${active.mmsi}` : ''}
                    </>
                  ) : (
                    'No active vessel assignment — set one on Current Service.'
                  )}
                </p>
              </div>
              <Switch
                id="crew-ais-tracking-toggle"
                checked={!!status?.enabled}
                disabled={toggling || !active || !hasIdentifier}
                onCheckedChange={handleToggle}
              />
            </div>

            {!active && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Add an active vessel assignment before enabling live AIS tracking.
              </p>
            )}
            {active && !hasIdentifier && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Your vessel needs an MMSI or IMO on file. Ask your captain or
                vessel manager to add it on the vessel profile.
              </p>
            )}

            {status?.enabled && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Ship className="h-3.5 w-3.5" />
                    Latest AIS status
                  </div>
                  <p className="mt-1 text-sm font-medium truncate">
                    {latestSample?.navStatus || '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Waves className="h-3.5 w-3.5" />
                    Speed
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {latestSample?.speedKn != null
                      ? `${Number(latestSample.speedKn).toFixed(1)} kn`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Anchor className="h-3.5 w-3.5" />
                    Last sample
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {latestSample?.sampledAt
                      ? format(parseISO(latestSample.sampledAt), 'd MMM, HH:mm')
                      : '—'}
                  </p>
                </div>
              </div>
            )}

            {status?.enabled && (status.samples.length ?? 0) > 0 && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="h-4 w-4 text-sky-500" />
                    Today&apos;s samples
                    <span className="text-xs font-normal text-muted-foreground">
                      · {status.samples.length} recorded
                    </span>
                  </div>
                  {isSeaDay && (
                    <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Sea day{underwayHours ? ` · ${underwayHours}h underway` : ''}
                    </Badge>
                  )}
                </div>
                {resolvedState && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Today saved as{' '}
                    <span className="font-medium text-foreground">
                      {STATE_LABELS[resolvedState] || resolvedState}
                    </span>
                    {underwayHours && !isSeaDay
                      ? ` · ${underwayHours}h underway (below 4h)`
                      : ''}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {sortedStates.map(([state, count]) => (
                    <div
                      key={state}
                      className="rounded-md border bg-background px-2 py-1 text-xs"
                    >
                      <span className="font-medium">
                        {STATE_LABELS[state] || state}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        × {count}h
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {status?.lastError && (
              <p className="text-xs text-destructive">{status.lastError}</p>
            )}

            {status?.lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Last sync {format(parseISO(status.lastSyncAt), 'd MMM yyyy · HH:mm')}
              </p>
            )}

            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              disabled={!status?.enabled || syncing}
              onClick={() => void runSync()}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync now
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
