'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2, Radio, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';
import { AisWrongStateReportButton } from '@/components/dashboard/ais-wrong-state-report-button';
import { hasCrewAisLiveTrackingTier } from '@/supabase/database/subscription-helpers';
import type { DailyStatus } from '@/lib/types';

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
  todayState?: DailyStatus | string | null;
  onStateUpdated?: () => void;
};

const STATE_LABELS: Record<string, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored',
  'in-yard': 'In yard',
  'on-leave': 'On leave',
};

export function CrewAisTrackingCard({
  accessToken,
  profileRaw,
  todayState,
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
  const resolvedState = status?.todayDailyState ?? null;
  const underwayHoursMatch = status?.todayNotes?.match(/(\d+(?:\.\d+)?)h underway/);
  const underwayHours = underwayHoursMatch ? underwayHoursMatch[1] : null;
  const liveBits = [
    active?.vesselName || null,
    latestSample?.navStatus || null,
    latestSample?.speedKn != null
      ? `${Number(latestSample.speedKn).toFixed(1)} kn`
      : null,
    resolvedState
      ? `today ${STATE_LABELS[resolvedState] || resolvedState}`
      : null,
    underwayHours ? `${underwayHours}h underway` : null,
    status?.lastSyncAt
      ? `synced ${format(parseISO(status.lastSyncAt), 'd MMM · HH:mm')}`
      : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      {loading ? (
        <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading AIS…
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Radio className="h-4 w-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Live AIS tracking</span>
                {status?.enabled ? (
                  <Badge className="h-5 border-emerald-500/30 bg-emerald-500/15 px-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    Manual
                  </Badge>
                )}
              </div>
              {!active ? (
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  Add an active vessel assignment before enabling tracking.
                </p>
              ) : !hasIdentifier ? (
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  Your vessel needs an MMSI or IMO on file.
                </p>
              ) : status?.lastError ? (
                <p className="text-xs leading-relaxed text-destructive">{status.lastError}</p>
              ) : status?.enabled && liveBits.length > 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {liveBits.join(' · ')}
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Hourly samples set your daily state when enabled (≥ 4h underway = sea day).
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:pt-0.5">
            {status?.enabled && active?.vesselId && (
              <AisWrongStateReportButton
                accessToken={accessToken}
                vesselId={active.vesselId}
                accountType="crew"
                aisEnabled={!!status.enabled}
                detectedState={todayState ?? resolvedState}
                aisNavStatus={latestSample?.navStatus}
                aisSpeedKn={latestSample?.speedKn}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={!status?.enabled || syncing}
              onClick={() => void runSync()}
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Sync</span>
            </Button>
            <Label
              htmlFor="crew-ais-tracking-toggle"
              className="text-xs text-muted-foreground"
            >
              Use AIS
            </Label>
            <Switch
              id="crew-ais-tracking-toggle"
              checked={!!status?.enabled}
              disabled={toggling || !active || !hasIdentifier}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      )}
    </div>
  );
}
