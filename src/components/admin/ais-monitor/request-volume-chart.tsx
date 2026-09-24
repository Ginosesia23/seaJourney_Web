'use client';

import { format, parseISO } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import type { AisMonitorRange, AisMonitorTimeseries } from '@/lib/ais/monitor/types';

import { fmtMs, fmtNumber } from './format';
import { SegmentedControl, STUDIO_CHART, StudioEmpty, StudioPanel } from './studio';

type ChartRow = { label: string; fullLabel: string; succeeded: number; failed: number; total: number; avgMs: number | null };

const RANGES: { id: AisMonitorRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

function toRows(series: AisMonitorTimeseries): ChartRow[] {
  return series.points.map((p) => {
    const d = parseISO(p.bucketStart);
    return {
      label: series.bucket === 'hour' ? format(d, 'HH:mm') : format(d, 'd MMM'),
      fullLabel: series.bucket === 'hour' ? format(d, 'd MMM HH:mm') : format(d, 'EEE d MMM yyyy'),
      succeeded: p.succeeded,
      failed: p.failed,
      total: p.total,
      avgMs: p.avgResponseMs,
    };
  });
}

function VolumeTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload;
  return (
    <div style={STUDIO_CHART.tooltip} className="px-3 py-2 shadow-sm">
      <p className="mb-1 text-xs font-medium text-foreground">{row.fullLabel} UTC</p>
      <div className="space-y-0.5 text-[11px]">
        <p className="flex justify-between gap-6">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono tabular-nums">{fmtNumber(row.total)}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-emerald-700 dark:text-emerald-400">Success</span>
          <span className="font-mono tabular-nums">{fmtNumber(row.succeeded)}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-destructive">Failed</span>
          <span className="font-mono tabular-nums">{fmtNumber(row.failed)}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-muted-foreground">Avg response</span>
          <span className="font-mono tabular-nums">{fmtMs(row.avgMs)}</span>
        </p>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm" style={{ background: STUDIO_CHART.success }} /> Success
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm" style={{ background: STUDIO_CHART.failed }} /> Failed
      </span>
    </div>
  );
}

export function RequestVolumeChart({
  series,
  isLoading,
  range,
  onRangeChange,
  title = 'Request volume',
  description = 'Provider requests per bucket (UTC) · cached reads excluded',
}: {
  series: AisMonitorTimeseries | null;
  isLoading: boolean;
  range: AisMonitorRange;
  onRangeChange: (r: AisMonitorRange) => void;
  title?: string;
  description?: string;
}) {
  const rows = series ? toRows(series) : [];
  const total = rows.reduce((a, r) => a + r.total, 0);
  const failed = rows.reduce((a, r) => a + r.failed, 0);

  return (
    <StudioPanel
      title={title}
      icon={BarChart3}
      description={description}
      action={<SegmentedControl value={range} onChange={onRangeChange} options={RANGES} ariaLabel="Chart range" />}
      className="h-full"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Total <span className="font-mono tabular-nums text-foreground">{series ? fmtNumber(total) : '—'}</span>
          </span>
          <span>
            Failed{' '}
            <span className={failed ? 'font-mono tabular-nums text-destructive' : 'font-mono tabular-nums text-foreground'}>
              {series ? fmtNumber(failed) : '—'}
            </span>
          </span>
        </div>
        <Legend />
      </div>
      {isLoading && !series ? (
        <div className="p-4">
          <Skeleton className="h-56 w-full rounded-md" />
        </div>
      ) : rows.length === 0 ? (
        <StudioEmpty>No data for this range.</StudioEmpty>
      ) : (
        <div className="h-64 w-full px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={16} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.5 }} />
              <Bar dataKey="succeeded" name="Success" stackId="req" fill={STUDIO_CHART.success} fillOpacity={0.75} />
              <Bar dataKey="failed" name="Failed" stackId="req" fill={STUDIO_CHART.failed} fillOpacity={0.8} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </StudioPanel>
  );
}
