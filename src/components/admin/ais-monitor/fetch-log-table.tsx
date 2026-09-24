'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListFilter, Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AisMonitorFetchPage, AisMonitorLogFilter } from '@/lib/ais/monitor/types';
import { cn } from '@/lib/utils';

import { HttpStatusBadge, ModeBadge, OutcomeBadge, TriggerBadge } from './badges';
import { FetchDetailSheet } from './fetch-detail-sheet';
import { fmtMs, fmtNumber, fmtShortTime } from './format';
import { useAdminMonitorQuery } from './hooks';
import { SegmentedControl, studioTable } from './studio';

const FILTERS: { id: AisMonitorLogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'success', label: 'Success' },
  { id: 'failed', label: 'Failed' },
  { id: 'scheduler', label: 'Scheduler' },
  { id: 'manual', label: 'Manual' },
  { id: 'retry', label: 'Retry' },
];

const PAGE_SIZE = 25;
const inputCls = 'h-8 rounded-md border-border bg-background text-xs shadow-none';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function dayStartIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T00:00:00.000Z`;
}

function nextDayIso(date: string): string | null {
  const start = dayStartIso(date);
  if (!start) return null;
  return new Date(Date.parse(start) + 86_400_000).toISOString();
}

export function FetchLogTable({
  vesselId,
  enabled,
  pollMs,
  title = 'Recent provider requests',
}: {
  vesselId?: string;
  enabled: boolean;
  pollMs: number | null;
  title?: string;
}) {
  const [filter, setFilter] = useState<AisMonitorLogFilter>('all');
  const [vesselSearch, setVesselSearch] = useState('');
  const [mmsi, setMmsi] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const debouncedVessel = useDebounced(vesselSearch.trim(), 400);
  const debouncedMmsi = useDebounced(mmsi.replace(/\D/g, ''), 400);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedVessel, debouncedMmsi, fromDate, toDate]);

  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), filter });
    if (vesselId) p.set('vesselId', vesselId);
    if (!vesselId && debouncedVessel) p.set('vessel', debouncedVessel);
    if (!vesselId && debouncedMmsi) p.set('mmsi', debouncedMmsi);
    const from = fromDate ? dayStartIso(fromDate) : null;
    const to = toDate ? nextDayIso(toDate) : null;
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return `/api/admin/ais-monitor/fetches?${p.toString()}`;
  }, [page, filter, vesselId, debouncedVessel, debouncedMmsi, fromDate, toDate]);

  // Only auto-refresh the first page so paging through history stays stable.
  const { data, error, hint, isLoading } = useAdminMonitorQuery<AisMonitorFetchPage>(path, {
    enabled,
    pollMs: page === 1 ? pollMs : null,
  });

  const rows = data?.rows ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const colSpan = vesselId ? 8 : 9;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ListFilter className="h-3.5 w-3.5 text-muted-foreground" /> {title}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Real provider requests only (cached reads excluded). Default window last 7 days, max 90. Click a row for
          details.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <SegmentedControl value={filter} onChange={setFilter} options={FILTERS} ariaLabel="Filter requests" />
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto">
          {!vesselId ? (
            <>
              <div className="relative w-full sm:w-52">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={vesselSearch}
                  onChange={(e) => setVesselSearch(e.target.value)}
                  placeholder="Vessel name…"
                  className={cn(inputCls, 'pl-8')}
                  aria-label="Search by vessel name"
                />
              </div>
              <Input
                value={mmsi}
                onChange={(e) => setMmsi(e.target.value)}
                placeholder="MMSI"
                inputMode="numeric"
                className={cn(inputCls, 'w-full font-mono sm:w-32')}
                aria-label="Search by MMSI"
              />
            </>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={cn(inputCls, 'w-full sm:w-36')}
              aria-label="From date (UTC)"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={cn(inputCls, 'w-full sm:w-36')}
              aria-label="To date (UTC)"
            />
          </div>
          <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
            <span className="font-mono tabular-nums text-foreground">{fmtNumber(data?.total ?? 0)}</span> requests
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          {hint ? <p className="mt-0.5 text-xs opacity-90">{hint}</p> : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-muted/40">
          {/* Mobile list */}
          <ul className="divide-y divide-border bg-background md:hidden">
            {isLoading && !data ? (
              <li className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading requests…
              </li>
            ) : rows.length === 0 ? (
              <li className="py-10 text-center text-xs text-muted-foreground">No requests match these filters.</li>
            ) : (
              rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className="w-full space-y-1.5 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-foreground">
                        {r.vessel?.name ?? (r.vesselId ? 'Unknown vessel' : 'Unattributed')}
                      </span>
                      <OutcomeBadge success={r.success} providerCalled={r.providerCalled} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">{fmtShortTime(r.requestedAt)}</span>
                      <HttpStatusBadge status={r.httpStatus} />
                      <TriggerBadge trigger={r.triggerSource} />
                      <span className="font-mono text-[11px] text-muted-foreground">{fmtMs(r.responseTimeMs)}</span>
                    </div>
                    {r.errorMessage ? <p className="line-clamp-1 text-[11px] text-destructive">{r.errorMessage}</p> : null}
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className={studioTable.headRow}>
                  <TableHead className={studioTable.head}>Time (local)</TableHead>
                  {!vesselId ? <TableHead className={studioTable.head}>Vessel</TableHead> : null}
                  <TableHead className={studioTable.head}>Result</TableHead>
                  <TableHead className={studioTable.head}>HTTP</TableHead>
                  <TableHead className={cn(studioTable.head, 'text-right')}>Duration</TableHead>
                  <TableHead className={studioTable.head}>Trigger</TableHead>
                  <TableHead className={cn(studioTable.head, 'hidden lg:table-cell')}>Mode</TableHead>
                  <TableHead className={cn(studioTable.head, 'hidden xl:table-cell')}>Endpoint</TableHead>
                  <TableHead className={cn(studioTable.head, 'hidden lg:table-cell')}>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && !data ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colSpan} className="h-36 bg-background">
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={colSpan} className="h-36 bg-background">
                      <div className="flex flex-col items-center justify-center gap-1 text-center">
                        <p className="text-sm text-foreground">No requests found</p>
                        <p className="text-xs text-muted-foreground">
                          {filter !== 'all' || debouncedVessel || debouncedMmsi || fromDate || toDate
                            ? 'Try another filter, search term or date range.'
                            : 'Provider requests appear here as soon as they are made.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className={cn(studioTable.row, 'cursor-pointer')}
                      onClick={() => setSelected(r.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelected(r.id);
                      }}
                    >
                      <TableCell className={cn(studioTable.cell, 'whitespace-nowrap font-mono text-[11px] text-muted-foreground')}>
                        {fmtShortTime(r.requestedAt)}
                      </TableCell>
                      {!vesselId ? (
                        <TableCell className={cn(studioTable.cell, 'max-w-[200px]')}>
                          <span className="block truncate text-sm text-foreground">
                            {r.vessel?.name ??
                              (r.vesselId ? 'Unknown vessel' : <span className="italic text-muted-foreground">Unattributed</span>)}
                          </span>
                          {r.mmsi ? <span className="font-mono text-[11px] text-muted-foreground">{r.mmsi}</span> : null}
                        </TableCell>
                      ) : null}
                      <TableCell className={studioTable.cell}>
                        <OutcomeBadge success={r.success} providerCalled={r.providerCalled} />
                      </TableCell>
                      <TableCell className={studioTable.cell}>
                        <HttpStatusBadge status={r.httpStatus} />
                      </TableCell>
                      <TableCell className={cn(studioTable.cell, 'text-right font-mono text-xs tabular-nums')}>
                        {fmtMs(r.responseTimeMs)}
                      </TableCell>
                      <TableCell className={studioTable.cell}>
                        <TriggerBadge trigger={r.triggerSource} detail={r.triggerDetail} />
                      </TableCell>
                      <TableCell className={cn(studioTable.cell, 'hidden lg:table-cell')}>
                        <ModeBadge mode={r.trackingMode} />
                      </TableCell>
                      <TableCell className={cn(studioTable.cell, 'hidden font-mono text-[11px] text-muted-foreground xl:table-cell')}>
                        {r.endpoint ? `/${r.endpoint}` : '—'}
                      </TableCell>
                      <TableCell className={cn(studioTable.cell, 'hidden max-w-[260px] lg:table-cell')}>
                        <span
                          className={cn('line-clamp-1 text-[11px]', r.errorMessage ? 'text-destructive' : 'text-muted-foreground')}
                          title={r.errorMessage ?? undefined}
                        >
                          {r.errorMessage ?? '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {data && data.total > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
              <span>
                <span className="font-mono tabular-nums text-foreground">
                  {fmtNumber((data.page - 1) * data.pageSize + 1)}–{fmtNumber(Math.min(data.total, data.page * data.pageSize))}
                </span>{' '}
                of <span className="font-mono tabular-nums text-foreground">{fmtNumber(data.total)}</span>
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-md border-border"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 font-mono tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-md border-border"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      <FetchDetailSheet fetchId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
