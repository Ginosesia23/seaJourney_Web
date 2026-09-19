'use client';

import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';

import { cn } from '@/lib/utils';

export function TrainingRecordsPageHeader({
  title = 'Training records',
  description,
  actions,
  breadcrumb,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  /** Extra crumb after Dashboard, e.g. programme name */
  breadcrumb?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span>Dashboard</span>
          <span className="text-border">/</span>
          <span className={breadcrumb ? 'text-muted-foreground' : 'text-foreground'}>
            Training records
          </span>
          {breadcrumb ? (
            <>
              <span className="text-border">/</span>
              <span className="truncate text-foreground">{breadcrumb}</span>
            </>
          ) : null}
        </div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">{title}</h1>
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

export function TrainingRecordsStatTiles({
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

export function TrainingRecordsSection({
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
            <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn(!flush && 'px-4 py-3 sm:px-5 sm:py-4')}>{children}</div>
    </section>
  );
}

export function TrainingRecordsDisclaimer({
  children,
  title = 'Demonstration programme',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <p className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
        {title}
      </p>
      <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">{children}</p>
    </div>
  );
}

export function TrainingRecordsAttribution({
  text,
  sourceUrl,
  oglUrl,
}: {
  text: string;
  sourceUrl?: string | null;
  oglUrl?: string | null;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground">
      <p>{text}</p>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Official MCA publication
          </a>
        ) : null}
        {oglUrl ? (
          <a
            href={oglUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Open Government Licence v3.0
          </a>
        ) : null}
      </p>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  approved:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  awaiting_signoff:
    'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
  ready_for_assessment:
    'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
  changes_requested:
    'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  in_progress: 'bg-muted text-foreground border-border',
  not_started: 'bg-muted/60 text-muted-foreground border-border',
  superseded: 'bg-muted text-muted-foreground border-border',
  pending: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
  completed:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
  expired: 'bg-muted text-muted-foreground border-border',
  draft: 'bg-muted text-muted-foreground border-border',
  pilot: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20',
  retired: 'bg-muted text-muted-foreground border-border',
};

export function TrainingStatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
        STATUS_TONE[status] || STATUS_TONE.not_started,
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function TrainingRecordsEmpty({
  icon: Icon = BookOpen,
  title,
  description,
}: {
  icon?: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <p className="mt-3 text-xs font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-[11px] text-muted-foreground">{description}</p>
    </div>
  );
}
