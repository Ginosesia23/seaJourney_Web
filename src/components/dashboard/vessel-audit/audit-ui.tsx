'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AuditStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AuditCheck({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function AuditPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return (
      <p className="text-[11px] text-muted-foreground">
        {total} record{total === 1 ? '' : 's'}
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="px-1 text-[11px] text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function StateBadge({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    state === 'underway'
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
      : state === 'at-anchor'
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
        : state === 'in-port'
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : state === 'in-yard'
            ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
            : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      {state}
    </span>
  );
}

export function OutcomePill({ success, providerCalled = true }: { success: boolean; providerCalled?: boolean }) {
  if (!providerCalled) {
    return <Badge variant="secondary">Not sent</Badge>;
  }
  return (
    <Badge variant={success ? 'default' : 'destructive'}>
      {success ? 'Success' : 'Failed'}
    </Badge>
  );
}

export function EvidenceTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No stored records in this period.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="pb-2 pr-3 font-medium last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
