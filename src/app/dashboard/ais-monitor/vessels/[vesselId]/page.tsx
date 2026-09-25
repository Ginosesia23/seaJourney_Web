'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Gauge, Ship } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { ModeBadge } from '@/components/admin/ais-monitor/badges';
import { ConsumersPanel } from '@/components/admin/ais-monitor/consumers-panel';
import { FetchLogTable } from '@/components/admin/ais-monitor/fetch-log-table';
import { fmtDateTime, fmtMs, fmtNumber, fmtPercent, fmtRelative, humanizeToken } from '@/components/admin/ais-monitor/format';
import { AIS_MONITOR_POLL_MS, useAdminGate, useAdminMonitorQuery } from '@/components/admin/ais-monitor/hooks';
import { RequestVolumeChart } from '@/components/admin/ais-monitor/request-volume-chart';
import {
  Pill,
  StatTile,
  StatTileSkeletonGrid,
  StatusDot,
  StudioEmpty,
  StudioError,
  StudioPageHeader,
  StudioPanel,
} from '@/components/admin/ais-monitor/studio';
import type { AisMonitorRange, AisMonitorTimeseries, AisMonitorVesselDetail } from '@/lib/ais/monitor/types';
import { cn } from '@/lib/utils';

function Field({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="space-y-0.5 px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
      {sub ? <p className="font-mono text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Admin AIS Monitor — single vessel. Database reads only; never triggers a provider fetch. */
export default function AdminAisMonitorVesselPage() {
  const params = useParams<{ vesselId: string }>();
  const vesselId = params?.vesselId ?? '';
  const { isAdmin, isChecking } = useAdminGate();
  const [range, setRange] = useState<AisMonitorRange>('7d');

  const detail = useAdminMonitorQuery<AisMonitorVesselDetail>(
    vesselId ? `/api/admin/ais-monitor/vessels/${vesselId}?range=${range}` : null,
    { enabled: isAdmin, pollMs: AIS_MONITOR_POLL_MS },
  );

  if (isChecking) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <StatTileSkeletonGrid count={4} />
      </div>
    );
  }
  if (!isAdmin) return null;

  const d = detail.data;
  const s = d?.status ?? null;
  const series: AisMonitorTimeseries | null = d
    ? {
        range,
        bucket: range === '24h' ? 'hour' : 'day',
        from: d.timeseries[0]?.bucketStart ?? '',
        to: new Date().toISOString(),
        vesselId,
        points: d.timeseries,
      }
    : null;

  const successTone =
    d?.last7d.successRate == null
      ? 'default'
      : d.last7d.successRate >= 95
        ? 'emerald'
        : d.last7d.successRate < 90
          ? 'destructive'
          : 'amber';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/ais-monitor"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to AIS Monitor
        </Link>
        <StudioPageHeader
          icon={Ship}
          crumbs={['Platform', 'AIS monitor', d?.vessel.name ?? 'Vessel']}
          title={d ? d.vessel.name ?? 'Unknown vessel' : detail.isLoading ? <Skeleton className="h-7 w-56" /> : 'Vessel'}
          description={
            d ? (
              <span className="font-mono text-xs">
                {d.vessel.mmsi ? `MMSI ${d.vessel.mmsi}` : 'No MMSI'}
                {d.vessel.imo ? ` · IMO ${d.vessel.imo}` : ''}
                {d.vessel.flag ? ` · ${d.vessel.flag}` : ''}
              </span>
            ) : null
          }
          actions={
            d ? (
              <>
                <div className="flex h-8 items-center rounded-md border border-border bg-muted/40 px-3">
                  <StatusDot tone={d.pollingEnabled ? 'emerald' : 'muted'} pulse={d.pollingEnabled}>
                    <span className="text-foreground">{d.pollingEnabled ? 'Polling enabled' : 'Polling disabled'}</span>
                  </StatusDot>
                </div>
                <ModeBadge mode={s?.trackingMode ?? null} />
              </>
            ) : null
          }
        />
      </div>

      {detail.error ? <StudioError message={detail.error} hint={detail.hint} /> : null}

      {d ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile tile={{ label: 'Requests today', value: fmtNumber(d.today.total), hint: 'Since 00:00 UTC' }} />
            <StatTile
              tile={{ label: 'Requests (7 days)', value: fmtNumber(d.last7d.total), hint: `${fmtNumber(d.last7d.failed)} failed` }}
            />
            <StatTile
              tile={{ label: 'Success rate (7 days)', value: fmtPercent(d.last7d.successRate), tone: successTone }}
            />
            <StatTile
              tile={{
                label: 'Avg response (7 days)',
                value: fmtMs(d.last7d.avgResponseMs),
                hint: d.last7d.p95ResponseMs != null ? `p95 ${fmtMs(d.last7d.p95ResponseMs)}` : undefined,
              }}
            />
          </div>

          <StudioPanel
            title="Scheduler state"
            icon={Gauge}
            description="Current row in vessel_ais_status"
            action={
              s && s.consecutiveFetchFailures > 0 ? (
                <Pill tone="destructive" mono>
                  {s.consecutiveFetchFailures} failures
                </Pill>
              ) : null
            }
          >
            {s ? (
              <>
                <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 [&>*]:border-border sm:[&>*]:border-b lg:[&>*:nth-last-child(-n+4)]:border-b-0">
                  <Field label="Live state">{humanizeToken(s.state)}</Field>
                  <Field label="Next check" sub={fmtDateTime(s.nextAisCheckAt)}>
                    {fmtRelative(s.nextAisCheckAt)}
                  </Field>
                  <Field label="Last success" sub={fmtDateTime(s.lastSuccessfulFetchAt)}>
                    {fmtRelative(s.lastSuccessfulFetchAt)}
                  </Field>
                  <Field label="Consecutive failures">
                    <span
                      className={cn(
                        'font-mono tabular-nums',
                        s.consecutiveFetchFailures > 0 && 'text-destructive',
                      )}
                    >
                      {s.consecutiveFetchFailures}
                    </span>
                  </Field>
                  <Field label="Last state change">
                    <span className="font-mono text-xs">{fmtDateTime(s.lastStateChangeAt)}</span>
                  </Field>
                  <Field label="Stable since">
                    <span className="font-mono text-xs">{fmtDateTime(s.stateStableSince)}</span>
                  </Field>
                  <Field label="Provider fix time">
                    <span className="font-mono text-xs">{fmtDateTime(s.providerTimestamp)}</span>
                  </Field>
                  <Field label="Tracking opt-in">
                    <span className="text-xs">{d.trackingOptIn ? 'Vessel plan opt-in' : 'No vessel opt-in (crew-funded or off)'}</span>
                  </Field>
                </div>
                {s.refreshError ? (
                  <div className="border-t border-border px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">Last refresh error</p>
                    <p className="mt-0.5 text-xs text-destructive">{s.refreshError}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <StudioEmpty>No AIS status recorded for this vessel yet.</StudioEmpty>
            )}
          </StudioPanel>

          <ConsumersPanel consumers={d.consumers} />
        </>
      ) : detail.isLoading ? (
        <StatTileSkeletonGrid count={4} />
      ) : null}

      <RequestVolumeChart
        title="Request history"
        description="Provider requests for this vessel (UTC)"
        series={series}
        isLoading={detail.isLoading}
        range={range}
        onRangeChange={setRange}
      />

      {vesselId ? (
        <FetchLogTable vesselId={vesselId} enabled={isAdmin} pollMs={AIS_MONITOR_POLL_MS} title="Recent requests for this vessel" />
      ) : null}
    </div>
  );
}
