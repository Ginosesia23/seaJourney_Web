'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Inbox, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export function InboxPageHeader({
  title = 'Inbox',
  description,
  actions,
  pendingCount,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  pendingCount?: number;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Inbox className="h-3.5 w-3.5" />
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
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {typeof pendingCount === 'number' && pendingCount > 0 ? (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="font-mono tabular-nums text-foreground">
              {pendingCount}
            </span>
            pending
          </div>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

export function InboxStatTiles({
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

export function InboxSection({
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

export function InboxEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="text-xs font-medium text-foreground">{title}</p>
      </div>
      <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <p className="mt-3 max-w-md text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function InboxLoadingState() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted/40">
      <div className="flex min-h-[220px] items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading inbox…
      </div>
    </div>
  );
}

export function InboxViewTabs({
  activeView,
  onViewChange,
  tabs,
}: {
  activeView: 'incoming' | 'sent';
  onViewChange: (view: 'incoming' | 'sent') => void;
  tabs: Array<{ id: 'incoming' | 'sent'; label: string; count: number }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
      {tabs.map((tab) => {
        const active = activeView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onViewChange(tab.id)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'rounded px-1 font-mono text-[10px] tabular-nums',
                active
                  ? 'bg-muted text-muted-foreground'
                  : 'text-muted-foreground/70',
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** @deprecated Prefer InboxPageHeader / InboxStatTiles */
export { InboxPageHeader as DashboardHeader, InboxStatTiles as DashboardStatRow };
