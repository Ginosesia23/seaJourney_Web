'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Gauge,
  Info,
  Radar,
  ShieldAlert,
  Timer,
  TrendingDown,
  Workflow,
  XCircle,
} from 'lucide-react';

import { AIS_TRIGGER_LABELS } from '@/lib/ais/fetch-audit-shared';
import type { AisMonitorAlert, AisMonitorSummary } from '@/lib/ais/monitor/types';
import { cn } from '@/lib/utils';

import { TriggerBadge } from './badges';
import { fmtMs, fmtNumber, fmtPercent } from './format';
import {
  MiniStat,
  Pill,
  StatTile,
  StatTileSkeletonGrid,
  StudioEmpty,
  StudioPanel,
  type StatTileData,
} from './studio';

export function KpiGridSkeleton({ count = 8 }: { count?: number }) {
  return <StatTileSkeletonGrid count={count} />;
}

export function SummaryKpis({ summary }: { summary: AisMonitorSummary }) {
  const { today, last24h, month, scheduler } = summary;
  const tiles: StatTileData[] = [
    {
      label: 'Requests today',
      value: fmtNumber(today.total),
      hint: `${fmtNumber(today.succeeded)} ok · ${fmtNumber(today.failed)} failed (UTC)`,
      icon: Activity,
      tooltip: 'Real provider HTTP requests since 00:00 UTC. Cached reads are excluded.',
    },
    {
      label: 'Success rate today',
      value: fmtPercent(today.successRate),
      hint: today.total ? `${fmtNumber(today.succeeded)} of ${fmtNumber(today.total)}` : 'No requests yet',
      icon: CheckCircle2,
      tone:
        today.successRate == null
          ? 'default'
          : today.successRate >= 95
            ? 'emerald'
            : today.successRate >= 90
              ? 'amber'
              : 'destructive',
      tooltip: 'A stale fix (>6h old) counts as a failure even when HTTP 200.',
    },
    {
      label: 'Last 24 hours',
      value: fmtNumber(last24h.total),
      hint: `${fmtNumber(last24h.distinctVessels)} vessel(s)`,
      icon: Clock,
    },
    {
      label: 'Avg response (24h)',
      value: fmtMs(last24h.avgResponseMs),
      hint: last24h.p95ResponseMs != null ? `p95 ${fmtMs(last24h.p95ResponseMs)}` : 'No timing data yet',
      icon: Timer,
      tooltip: 'Measured around the provider HTTP call only.',
    },
    {
      label: 'This month',
      value: fmtNumber(month.total),
      hint: `${fmtNumber(month.failed)} failed`,
      icon: CalendarDays,
    },
    {
      label: 'Tracking enabled',
      value: fmtNumber(scheduler.enabled),
      hint: `${fmtNumber(scheduler.eligible)} eligible`,
      icon: Radar,
      tone: 'sky',
      tooltip:
        'Enabled = vessels.ais_provider_poll_enabled (what the cron polls). Eligible = vessels with MMSI/IMO opted in by vessel plan or cached entitlement.',
    },
    {
      label: 'Due / overdue',
      value: `${fmtNumber(scheduler.due)} / ${fmtNumber(scheduler.overdue)}`,
      hint: `Overdue = >${scheduler.thresholds.overdueMinutes} min past next check`,
      icon: Gauge,
      tone: scheduler.overdue > 0 ? 'amber' : 'default',
    },
    {
      label: 'Failures (24h)',
      value: fmtNumber(last24h.failed),
      hint: `${fmtNumber(last24h.rateLimited)} × 429 · ${fmtNumber(last24h.authFailed)} × 401/403`,
      icon: XCircle,
      tone:
        last24h.rateLimited > 0 || last24h.authFailed > 0
          ? 'destructive'
          : last24h.failed > 0
            ? 'amber'
            : 'emerald',
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <StatTile key={t.label} tile={t} />
      ))}
    </div>
  );
}

const ALERT_STYLE: Record<AisMonitorAlert['severity'], { icon: LucideIcon; cls: string; label: string }> = {
  critical: { icon: AlertOctagon, cls: 'text-destructive', label: 'Critical' },
  warning: { icon: AlertTriangle, cls: 'text-amber-600', label: 'Warning' },
  info: { icon: Info, cls: 'text-sky-600', label: 'Info' },
};

export function AlertsPanel({ alerts }: { alerts: AisMonitorAlert[] }) {
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  return (
    <StudioPanel
      title="Alerts"
      icon={ShieldAlert}
      description="Evaluated on each refresh from logged requests and scheduler state"
      action={
        alerts.length > 0 ? (
          <Pill tone={critical > 0 ? 'destructive' : 'amber'} mono>
            {alerts.length} active
          </Pill>
        ) : (
          <Pill tone="emerald">All clear</Pill>
        )
      }
      className="h-full"
    >
      {alerts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> No active alerts.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {alerts.map((a) => {
            const s = ALERT_STYLE[a.severity];
            const Icon = s.icon;
            return (
              <li key={a.id} className="flex gap-3 px-4 py-3">
                <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', s.cls)} />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-foreground">{a.title}</p>
                    <Pill tone={a.severity === 'critical' ? 'destructive' : a.severity === 'warning' ? 'amber' : 'sky'}>
                      {s.label}
                    </Pill>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{a.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </StudioPanel>
  );
}

export function SavingsCard({ summary }: { summary: AisMonitorSummary }) {
  const s = summary.savings;
  return (
    <StudioPanel
      title="Adaptive scheduling savings"
      icon={TrendingDown}
      description={`Last ${s.windowDays} days vs a fixed ${s.fixedIntervalMinutes}-minute schedule (288 pulls / vessel / day)`}
      action={<Pill tone="amber">Estimate</Pill>}
      className="h-full"
    >
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Fixed schedule" value={`≈${fmtNumber(s.fixedIntervalRequests)}`} />
          <MiniStat label="Actual" value={fmtNumber(s.actualRequests)} />
          <MiniStat
            label="Avoided"
            value={s.savingsPercent != null ? `≈${s.savingsPercent}%` : '—'}
            tone={s.savingsPercent != null ? 'emerald' : 'muted'}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-mono text-foreground">≈{fmtNumber(s.trackedVesselDays)}</span> tracked vessel-days.{' '}
          {s.basis} Cost is not shown: {summary.cost.reason}
        </p>
      </div>
    </StudioPanel>
  );
}

export function TriggerBreakdownCard({ summary }: { summary: AisMonitorSummary }) {
  const rows = summary.triggers24h;
  const total = rows.reduce((acc, r) => acc + r.total, 0);
  return (
    <StudioPanel
      title="Requests by trigger"
      icon={Workflow}
      description="Why provider requests happened in the last 24h, by endpoint"
      action={total ? <span className="font-mono text-xs tabular-nums text-muted-foreground">{fmtNumber(total)}</span> : null}
      className="h-full"
    >
      {rows.length === 0 ? (
        <StudioEmpty>No provider requests in the last 24 hours.</StudioEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={`${r.triggerSource}:${r.endpoint}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-32 shrink-0">
                <TriggerBadge trigger={r.triggerSource} />
              </div>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-600/70"
                  style={{ width: `${total ? Math.max(2, (r.total / total) * 100) : 0}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                {fmtNumber(r.total)}
                {r.failed ? <span className="text-destructive"> · {r.failed}✕</span> : null}
              </span>
              <span className="hidden w-28 shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                /{r.endpoint}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Legacy rows whose trigger could not be attributed reliably show as “{AIS_TRIGGER_LABELS.unknown}”.
      </p>
    </StudioPanel>
  );
}
