'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  Loader2,
  Radio,
  RefreshCw,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { hasVesselAisTrackingTier } from '@/lib/vessel-ais-access';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';
import { AisWrongStateReportButton } from '@/components/dashboard/ais-wrong-state-report-button';
import type { DailyStatus } from '@/lib/types';

/** Minimum time between automatic AIS syncs (page load + background). */
const AIS_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;

function shouldRunAutoSync(lastSyncAt: string | null | undefined): boolean {
  if (!lastSyncAt) return true;
  const t = Date.parse(lastSyncAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= AIS_AUTO_SYNC_INTERVAL_MS;
}

type AisTrackingStatus = {
  enabled: boolean;
  mmsi: string | null;
  imo: string | null;
  lastSyncAt: string | null;
  lastNavStatus: string | null;
  lastSpeed: number | null;
  lastPositionAt: string | null;
  lastError: string | null;
};

type AisTrackingCardProps = {
  vesselId: string;
  mmsi?: string | null;
  imo?: string | null;
  accessToken: string | null;
  profileRaw: unknown;
  todayState?: DailyStatus | string | null;
  onStateUpdated?: () => void;
  onEnabledChange?: (enabled: boolean) => void;
};

export function AisTrackingCard({
  vesselId,
  mmsi,
  imo,
  accessToken,
  profileRaw,
  todayState,
  onStateUpdated,
  onEnabledChange,
}: AisTrackingCardProps) {
  const eligible = hasVesselAisTrackingTier(profileRaw);
  const [status, setStatus] = useState<AisTrackingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const localLogDate = format(new Date(), 'yyyy-MM-dd');

  const onStateUpdatedRef = useRef(onStateUpdated);
  const onEnabledChangeRef = useRef(onEnabledChange);
  useEffect(() => {
    onStateUpdatedRef.current = onStateUpdated;
  }, [onStateUpdated]);
  useEffect(() => {
    onEnabledChangeRef.current = onEnabledChange;
  }, [onEnabledChange]);

  const loadStatus = useCallback(async () => {
    if (!accessToken || !eligible) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/vessels/ais-tracking?vesselId=${encodeURIComponent(vesselId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load AIS settings');
      const nextStatus = {
        enabled: !!data.enabled,
        mmsi: data.mmsi ?? null,
        imo: data.imo ?? null,
        lastSyncAt: data.lastSyncAt ?? null,
        lastNavStatus: data.lastNavStatus ?? null,
        lastSpeed: data.lastSpeed ?? null,
        lastPositionAt: data.lastPositionAt ?? null,
        lastError: data.lastError ?? null,
      };
      setStatus(nextStatus);
      onEnabledChangeRef.current?.(nextStatus.enabled);
    } catch (err: unknown) {
      console.error('[AIS TRACKING CARD]', err);
    } finally {
      setLoading(false);
    }
  }, [accessToken, eligible, vesselId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runSync = useCallback(
    async (options?: { silent?: boolean; refreshLogs?: boolean }) => {
      if (!accessToken || !status?.enabled) return false;
      setSyncing(true);
      try {
        const res = await fetch('/api/ais/sync', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ vesselId, logDate: localLogDate }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sync failed');

        const result = data.result;
        if (result?.ok) {
          if (!options?.silent) {
            toast({
              title: 'AIS state updated',
              description: `Today's state set to ${result.state} from AIS.`,
            });
          }
          if (options?.refreshLogs !== false) {
            onStateUpdatedRef.current?.();
          }
        } else if (!options?.silent) {
          toast({
            title: 'AIS sync skipped',
            description: result?.reason || 'No update applied',
            variant: 'destructive',
          });
        }
        await loadStatus();
        return !!result?.ok;
      } catch (err: unknown) {
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
    [accessToken, loadStatus, status?.enabled, vesselId],
  );

  // Sync on page load (if stale) and at most once per hour while this page stays open.
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
    }, AIS_AUTO_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [status?.enabled, status?.lastSyncAt, accessToken, loading]);

  const handleToggle = async (enabled: boolean) => {
    if (!accessToken) return;
    setToggling(true);
    try {
      const res = await fetch('/api/vessels/ais-tracking', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vesselId, enabled, logDate: localLogDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update AIS tracking');

      const nextStatus = {
        enabled: !!data.enabled,
        mmsi: data.mmsi ?? null,
        imo: data.imo ?? null,
        lastSyncAt: data.lastSyncAt ?? null,
        lastNavStatus: data.lastNavStatus ?? null,
        lastSpeed: data.lastSpeed ?? null,
        lastPositionAt: data.lastPositionAt ?? null,
        lastError: data.lastError ?? null,
      };
      setStatus(nextStatus);
      onEnabledChangeRef.current?.(nextStatus.enabled);

      if (enabled && data.sync?.ok) {
        toast({
          title: 'AIS tracking enabled',
          description: `State set to ${data.sync.state} from live AIS.`,
        });
        onStateUpdatedRef.current?.();
      } else if (enabled) {
        toast({
          title: 'AIS tracking enabled',
          description:
            'We will poll AIS hourly and set each day automatically — no daily login needed. Underway days need 4+ hours underway.',
        });
      } else {
        toast({
          title: 'AIS tracking disabled',
          description: 'Vessel state is back to manual logging on the calendar.',
        });
      }
    } catch (err: unknown) {
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
        title="Available on Vessel Premium"
        featureLabel="Live AIS tracking"
        description="Automatically set daily vessel state from AIS when your vessel is on Premium or Professional."
      />
    );
  }

  const hasIdentifier = !!(mmsi || imo || status?.mmsi || status?.imo);
  const liveBits = [
    status?.lastNavStatus || null,
    status?.lastSpeed != null ? `${Number(status.lastSpeed).toFixed(1)} kn` : null,
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
              {!hasIdentifier ? (
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  Add an{' '}
                  <Link href="/dashboard/profile" className="font-medium underline">
                    MMSI
                  </Link>{' '}
                  on your vessel profile to enable tracking.
                </p>
              ) : status?.lastError ? (
                <p className="text-xs leading-relaxed text-destructive">{status.lastError}</p>
              ) : status?.enabled && liveBits.length > 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {liveBits.join(' · ')}
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Hourly background sync sets each day automatically when enabled.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:pt-0.5">
            {status?.enabled && (
              <AisWrongStateReportButton
                accessToken={accessToken}
                vesselId={vesselId}
                accountType="vessel"
                aisEnabled={!!status.enabled}
                detectedState={todayState}
                aisNavStatus={status.lastNavStatus}
                aisSpeedKn={status.lastSpeed}
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
            <Label htmlFor="ais-tracking-toggle" className="text-xs text-muted-foreground">
              Use AIS
            </Label>
            <Switch
              id="ais-tracking-toggle"
              checked={!!status?.enabled}
              disabled={toggling || !hasIdentifier}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      )}
    </div>
  );
}
