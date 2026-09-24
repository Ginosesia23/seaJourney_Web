'use client';

import { useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthIndicator } from '@/components/admin/ais-monitor/badges';
import { FetchLogTable } from '@/components/admin/ais-monitor/fetch-log-table';
import { AIS_MONITOR_POLL_MS, useAdminGate, useAdminMonitorQuery } from '@/components/admin/ais-monitor/hooks';
import { RequestVolumeChart } from '@/components/admin/ais-monitor/request-volume-chart';
import { StudioError, StudioPageHeader } from '@/components/admin/ais-monitor/studio';
import {
  AlertsPanel,
  KpiGridSkeleton,
  SavingsCard,
  SummaryKpis,
  TriggerBreakdownCard,
} from '@/components/admin/ais-monitor/summary-cards';
import {
  DuplicatesCard,
  SchedulerHealthCard,
  TopConsumersCard,
} from '@/components/admin/ais-monitor/vessel-panels';
import { format } from 'date-fns';
import type {
  AisMonitorRange,
  AisMonitorSummary,
  AisMonitorTimeseries,
  AisMonitorVesselsResponse,
} from '@/lib/ais/monitor/types';

/**
 * Admin AIS API Monitor. Every request on this page goes to
 * /api/admin/ais-monitor/* which only reads our database — opening or
 * refreshing it never triggers an AIS provider (Datalastic) request.
 */
export default function AdminAisMonitorPage() {
  const { isAdmin, isChecking } = useAdminGate();
  const [range, setRange] = useState<AisMonitorRange>('24h');

  const summary = useAdminMonitorQuery<AisMonitorSummary>('/api/admin/ais-monitor/summary', {
    enabled: isAdmin,
    pollMs: AIS_MONITOR_POLL_MS,
  });
  const series = useAdminMonitorQuery<AisMonitorTimeseries>(`/api/admin/ais-monitor/timeseries?range=${range}`, {
    enabled: isAdmin,
    pollMs: AIS_MONITOR_POLL_MS,
  });
  const vessels = useAdminMonitorQuery<AisMonitorVesselsResponse>(`/api/admin/ais-monitor/vessels?range=${range}`, {
    enabled: isAdmin,
    pollMs: AIS_MONITOR_POLL_MS,
  });

  if (isChecking) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <KpiGridSkeleton />
      </div>
    );
  }
  if (!isAdmin) return null;

  const refreshing = summary.isRefreshing || series.isRefreshing || vessels.isRefreshing;
  const refreshAll = () => {
    void summary.refetch();
    void series.refetch();
    void vessels.refetch();
  };

  return (
    <div className="flex flex-col gap-6">
      <StudioPageHeader
        icon={Activity}
        crumbs={['Platform', 'AIS monitor']}
        title="AIS Monitor"
        description="Monitor SeaJourney AIS provider requests, scheduler activity and failures."
        actions={
          <>
            <HealthIndicator status={summary.data?.health ?? null} live={!!summary.data && !summary.error} />
            {summary.lastUpdated ? (
              <div className="hidden h-8 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 text-xs text-muted-foreground md:flex">
                Updated
                <span className="font-mono tabular-nums text-foreground">{format(summary.lastUpdated, 'HH:mm:ss')}</span>
                <span className="text-border">·</span>
                every 30s
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-md border-border text-xs"
              onClick={refreshAll}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </>
        }
      />

      {summary.error ? <StudioError message={summary.error} hint={summary.hint} /> : null}

      {summary.data ? <SummaryKpis summary={summary.data} /> : summary.isLoading ? <KpiGridSkeleton /> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RequestVolumeChart series={series.data} isLoading={series.isLoading} range={range} onRangeChange={setRange} />
        </div>
        {summary.data ? <AlertsPanel alerts={summary.data.alerts} /> : <Skeleton className="h-[340px] rounded-md" />}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TopConsumersCard data={vessels.data} isLoading={vessels.isLoading} />
        {summary.data ? (
          <SchedulerHealthCard scheduler={summary.data.scheduler} vessels={vessels.data} />
        ) : (
          <Skeleton className="h-[340px] rounded-md" />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {summary.data ? <TriggerBreakdownCard summary={summary.data} /> : <Skeleton className="h-[220px] rounded-md" />}
        {summary.data ? <SavingsCard summary={summary.data} /> : <Skeleton className="h-[220px] rounded-md" />}
      </div>

      <DuplicatesCard data={vessels.data} isLoading={vessels.isLoading} />

      <FetchLogTable enabled={isAdmin} pollMs={AIS_MONITOR_POLL_MS} />
    </div>
  );
}
