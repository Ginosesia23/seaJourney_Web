'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  Anchor,
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
import { hasVesselAisTrackingTier } from '@/lib/vessel-ais-access';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';

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
  onStateUpdated?: () => void;
  onEnabledChange?: (enabled: boolean) => void;
};

export function AisTrackingCard({
  vesselId,
  mmsi,
  imo,
  accessToken,
  profileRaw,
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
          description: data.sync?.reason || 'Manual calendar logging is paused while AIS is on.',
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

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-sky-500" />
              Live AIS tracking
            </CardTitle>
            <CardDescription>
              When enabled, SeaJourney reads your vessel&apos;s AIS position and sets
              today&apos;s state automatically. Turn off to log manually on the calendar.
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
                <Label htmlFor="ais-tracking-toggle" className="text-sm font-medium">
                  Use AIS for daily state
                </Label>
                <p className="text-xs text-muted-foreground">
                  Powered by Datalastic · syncs on page load and hourly while open
                </p>
              </div>
              <Switch
                id="ais-tracking-toggle"
                checked={!!status?.enabled}
                disabled={toggling || !hasIdentifier}
                onCheckedChange={handleToggle}
              />
            </div>

            {!hasIdentifier && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Add an{' '}
                <Link href="/dashboard/profile" className="underline font-medium">
                  MMSI number
                </Link>{' '}
                to your vessel profile before enabling AIS tracking.
              </p>
            )}

            {status?.enabled && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Ship className="h-3.5 w-3.5" />
                    AIS status
                  </div>
                  <p className="mt-1 text-sm font-medium truncate">
                    {status.lastNavStatus || '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Waves className="h-3.5 w-3.5" />
                    Speed
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {status.lastSpeed != null ? `${Number(status.lastSpeed).toFixed(1)} kn` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Anchor className="h-3.5 w-3.5" />
                    Last position
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {status.lastPositionAt
                      ? format(parseISO(status.lastPositionAt), 'd MMM, HH:mm')
                      : '—'}
                  </p>
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
