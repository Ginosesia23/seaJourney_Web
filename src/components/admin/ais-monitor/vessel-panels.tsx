'use client';

import Link from 'next/link';
import { ArrowUpRight, Copy, HeartPulse, Ship } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  AisMonitorAttentionReason,
  AisMonitorSchedulerHealth,
  AisMonitorVesselIdentity,
  AisMonitorVesselsResponse,
} from '@/lib/ais/monitor/types';
import { cn } from '@/lib/utils';

import { ModeBadge, TriggerBadge } from './badges';
import { fmtMs, fmtNumber, fmtPercent, fmtRelative, fmtShortTime } from './format';
import { MiniStat, Pill, StatusDot, StudioEmpty, StudioPanel, studioTable, type StudioTone } from './studio';

export function vesselMonitorHref(vesselId: string): string {
  return `/dashboard/ais-monitor/vessels/${vesselId}`;
}

function VesselName({ vesselId, vessel }: { vesselId: string | null; vessel: AisMonitorVesselIdentity | null }) {
  if (!vesselId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs italic text-muted-foreground">Unattributed</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          Requests not tied to a vessel record (e.g. registration lookups by name/MMSI).
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Link href={vesselMonitorHref(vesselId)} className="group block min-w-0" onClick={(e) => e.stopPropagation()}>
      <span className="flex items-center gap-1.5 truncate text-sm text-foreground group-hover:underline">
        <Ship className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{vessel?.name ?? 'Unknown vessel'}</span>
      </span>
      <span className="block truncate pl-[18px] font-mono text-[11px] text-muted-foreground">
        {vessel?.mmsi ? vessel.mmsi : vessel?.imo ? `IMO ${vessel.imo}` : `${vesselId.slice(0, 8)}…`}
      </span>
    </Link>
  );
}

function OpenLink({ vesselId }: { vesselId: string | null }) {
  if (!vesselId) return null;
  return (
    <Link
      href={vesselMonitorHref(vesselId)}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Open vessel"
      onClick={(e) => e.stopPropagation()}
    >
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-md" />
      ))}
    </div>
  );
}

export function TopConsumersCard({ data, isLoading }: { data: AisMonitorVesselsResponse | null; isLoading: boolean }) {
  const rows = data?.topConsumers ?? [];
  return (
    <StudioPanel
      title="Top consumers"
      icon={Ship}
      description="Vessels with the most provider requests in the selected range"
      className="h-full"
    >
      {isLoading && !data ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <StudioEmpty>No provider requests in this range.</StudioEmpty>
      ) : (
        <div className={studioTable.wrap}>
          <Table>
            <TableHeader>
              <TableRow className={studioTable.headRow}>
                <TableHead className={studioTable.head}>Vessel</TableHead>
                <TableHead className={cn(studioTable.head, 'text-right')}>Requests</TableHead>
                <TableHead className={cn(studioTable.head, 'text-right')}>Success</TableHead>
                <TableHead className={cn(studioTable.head, 'hidden text-right md:table-cell')}>Avg</TableHead>
                <TableHead className={cn(studioTable.head, 'hidden lg:table-cell')}>Last request</TableHead>
                <TableHead className={cn(studioTable.head, 'w-10')} aria-label="Open" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.vesselId ?? 'unattributed'} className={studioTable.row}>
                  <TableCell className={cn(studioTable.cell, 'max-w-[220px]')}>
                    <VesselName vesselId={r.vesselId} vessel={r.vessel} />
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'text-right font-mono text-xs tabular-nums')}>
                    {fmtNumber(r.total)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      studioTable.cell,
                      'text-right font-mono text-xs tabular-nums',
                      r.successRate != null && r.successRate < 90 ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    {fmtPercent(r.successRate)}
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'hidden text-right font-mono text-xs tabular-nums md:table-cell')}>
                    {fmtMs(r.avgResponseMs)}
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'hidden text-[11px] text-muted-foreground lg:table-cell')}>
                    {fmtRelative(r.lastRequestAt)}
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'text-right')}>
                    <OpenLink vesselId={r.vesselId} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </StudioPanel>
  );
}

const REASON: Record<AisMonitorAttentionReason, { label: string; tone: StudioTone }> = {
  far_overdue: { label: 'Far overdue', tone: 'amber' },
  failing: { label: 'Failing', tone: 'destructive' },
  rapid_refetch: { label: 'Fetched too often', tone: 'violet' },
};

export function SchedulerHealthCard({
  scheduler,
  vessels,
}: {
  scheduler: AisMonitorSchedulerHealth;
  vessels: AisMonitorVesselsResponse | null;
}) {
  const attention = vessels?.attention ?? [];
  const t = vessels?.thresholds;
  return (
    <StudioPanel
      title="Scheduler health"
      icon={HeartPulse}
      description={
        <>
          Adaptive scheduler state from vessel_ais_status · last scheduler request{' '}
          <span className="font-mono text-foreground">{fmtRelative(scheduler.lastSchedulerRequestAt)}</span>
        </>
      }
      className="h-full"
    >
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Eligible" value={fmtNumber(scheduler.eligible)} />
          <MiniStat label="Enabled" value={fmtNumber(scheduler.enabled)} tone="sky" />
          <MiniStat label="Due now" value={fmtNumber(scheduler.due)} />
          <MiniStat
            label={`Overdue >${scheduler.thresholds.overdueMinutes}m`}
            value={fmtNumber(scheduler.overdue)}
            tone={scheduler.overdue > 0 ? 'amber' : 'default'}
          />
          <MiniStat
            label={`Far overdue >${scheduler.thresholds.farOverdueMinutes}m`}
            value={fmtNumber(scheduler.farOverdue)}
            tone={scheduler.farOverdue > 0 ? 'destructive' : 'default'}
          />
          <MiniStat label="With failures" value={fmtNumber(scheduler.failing)} tone={scheduler.failing > 0 ? 'amber' : 'default'} />
          <MiniStat
            label="5+ failures"
            value={fmtNumber(scheduler.failing5Plus)}
            tone={scheduler.failing5Plus > 0 ? 'destructive' : 'default'}
          />
          <MiniStat label="Never scheduled" value={fmtNumber(scheduler.enabledNeverScheduled)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>Modes</span>
          {(Object.entries(scheduler.modes) as [string, number][]).map(([mode, count]) => (
            <span key={mode} className="inline-flex items-center gap-1">
              <ModeBadge mode={mode} />
              <span className="font-mono tabular-nums text-foreground">{count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-muted/40 px-4 py-2 text-[11px] font-medium text-muted-foreground">
        Vessels needing attention
      </div>
      {attention.length === 0 ? (
        <StudioEmpty>
          None.
          {t
            ? ` Flags: >${t.farOverdueMinutes} min overdue, any consecutive failures, or >${t.rapidThreshold} requests in ${t.rapidWindowMinutes} min.`
            : ''}
        </StudioEmpty>
      ) : (
        <div className={studioTable.wrap}>
          <Table>
            <TableHeader>
              <TableRow className={studioTable.headRow}>
                <TableHead className={studioTable.head}>Vessel</TableHead>
                <TableHead className={studioTable.head}>Issue</TableHead>
                <TableHead className={studioTable.head}>Mode</TableHead>
                <TableHead className={cn(studioTable.head, 'hidden sm:table-cell')}>Next check</TableHead>
                <TableHead className={cn(studioTable.head, 'hidden md:table-cell')}>Last success</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attention.map((a) => (
                <TableRow key={`${a.reason}:${a.vesselId}`} className={studioTable.row}>
                  <TableCell className={cn(studioTable.cell, 'max-w-[200px]')}>
                    <VesselName vesselId={a.vesselId} vessel={a.vessel} />
                  </TableCell>
                  <TableCell className={studioTable.cell}>
                    <Pill tone={REASON[a.reason].tone}>{REASON[a.reason].label}</Pill>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {a.reason === 'failing'
                        ? `${a.consecutiveFetchFailures} consecutive failure(s)`
                        : a.reason === 'rapid_refetch'
                          ? `${fmtNumber(a.requestsInWindow)} req / ${t?.rapidWindowMinutes ?? 60} min`
                          : `Due ${fmtRelative(a.nextAisCheckAt)}`}
                    </p>
                  </TableCell>
                  <TableCell className={studioTable.cell}>
                    <ModeBadge mode={a.trackingMode} />
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'hidden text-[11px] text-muted-foreground sm:table-cell')}>
                    {fmtRelative(a.nextAisCheckAt)}
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'hidden text-[11px] text-muted-foreground md:table-cell')}>
                    {fmtRelative(a.lastSuccessfulFetchAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </StudioPanel>
  );
}

export function DuplicatesCard({ data, isLoading }: { data: AisMonitorVesselsResponse | null; isLoading: boolean }) {
  const rows = data?.duplicates ?? [];
  const suspicious = rows.filter((r) => !r.likelyLegitimate).length;
  return (
    <StudioPanel
      title="Possible duplicate fetches"
      icon={Copy}
      description={`Same vessel's live position requested within ${data?.thresholds.duplicateWindowSeconds ?? 60}s (last 7 days max) · observational only`}
      action={
        suspicious > 0 ? (
          <Pill tone="amber" mono>
            {suspicious} unexplained
          </Pill>
        ) : rows.length > 0 ? (
          <Pill tone="muted" mono>
            {rows.length} explained
          </Pill>
        ) : null
      }
    >
      {isLoading && !data ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <StudioEmpty>No near-duplicate requests detected.</StudioEmpty>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className={studioTable.headRow}>
                <TableHead className={studioTable.head}>Vessel</TableHead>
                <TableHead className={studioTable.head}>When</TableHead>
                <TableHead className={cn(studioTable.head, 'text-right')}>Gap</TableHead>
                <TableHead className={studioTable.head}>Triggers</TableHead>
                <TableHead className={studioTable.head}>Assessment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.fetchId} className={studioTable.row}>
                  <TableCell className={cn(studioTable.cell, 'max-w-[180px]')}>
                    <VesselName vesselId={d.vesselId} vessel={d.vessel} />
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'whitespace-nowrap font-mono text-[11px] text-muted-foreground')}>
                    {fmtShortTime(d.requestedAt)}
                  </TableCell>
                  <TableCell className={cn(studioTable.cell, 'text-right font-mono text-xs tabular-nums')}>
                    {d.secondsApart}s
                  </TableCell>
                  <TableCell className={studioTable.cell}>
                    <div className="flex flex-wrap items-center gap-1">
                      <TriggerBadge trigger={d.previousTriggerSource} />
                      <span className="text-[11px] text-muted-foreground">→</span>
                      <TriggerBadge trigger={d.triggerSource} />
                    </div>
                  </TableCell>
                  <TableCell className={studioTable.cell}>
                    {d.likelyLegitimate ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <StatusDot tone="muted">
                              <span className="text-muted-foreground">Likely legitimate</span>
                            </StatusDot>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          A manual action, tracking start, Premium enable, or a failed previous request explains the repeat.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <StatusDot tone="amber">
                        <span className="font-medium text-amber-700 dark:text-amber-400">Investigate</span>
                      </StatusDot>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </StudioPanel>
  );
}
