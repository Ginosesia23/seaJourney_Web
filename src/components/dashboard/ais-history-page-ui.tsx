'use client';

import type { ReactNode } from 'react';
import { Database } from 'lucide-react';

import { cn } from '@/lib/utils';

export function AisHistoryPageHeader({
  title = 'AIS history',
  description,
  actions,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          <span>Dashboard</span>
          <span className="text-border">/</span>
          <span className="text-foreground">{title}</span>
        </div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function AisHistoryStatTiles({
  items,
}: {
  items: Array<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'default' | 'emerald' | 'amber' | 'sky' | 'destructive';
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        'grid gap-3',
        items.length <= 2 && 'sm:grid-cols-2',
        items.length === 3 && 'sm:grid-cols-3',
        items.length >= 4 && 'sm:grid-cols-2 lg:grid-cols-4',
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="overflow-hidden rounded-md border border-border bg-background"
        >
          <div className="border-b border-border bg-muted/40 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {item.label}
            </span>
          </div>
          <div className="px-3 py-3">
            <div
              className={cn(
                'font-mono text-2xl font-medium tabular-nums tracking-tight',
                item.tone === 'emerald' && 'text-emerald-600',
                item.tone === 'amber' && 'text-amber-600',
                item.tone === 'sky' && 'text-sky-600',
                item.tone === 'destructive' && 'text-destructive',
                (!item.tone || item.tone === 'default') && 'text-foreground',
              )}
            >
              {item.value}
            </div>
            {item.hint ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AisHistorySection({
  title,
  description,
  action,
  flush,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-border bg-background',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-xs font-medium text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn(!flush && 'px-4 py-3 sm:px-5 sm:py-4')}>{children}</div>
    </section>
  );
}
