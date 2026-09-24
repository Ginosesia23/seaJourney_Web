'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Supabase Studio–style primitives shared by the AIS Monitor pages. */

export type StudioTone = 'default' | 'emerald' | 'amber' | 'sky' | 'destructive' | 'violet' | 'muted';

export const toneText: Record<StudioTone, string> = {
  default: 'text-foreground',
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  sky: 'text-sky-600',
  destructive: 'text-destructive',
  violet: 'text-violet-600',
  muted: 'text-muted-foreground',
};

const pillTone: Record<StudioTone, string> = {
  default: 'border-border bg-muted/60 text-foreground',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  violet: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400',
  muted: 'border-border bg-muted/60 text-muted-foreground',
};

const dotTone: Record<StudioTone, string> = {
  default: 'bg-foreground',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  destructive: 'bg-destructive',
  violet: 'bg-violet-500',
  muted: 'bg-muted-foreground/50',
};

/** Chart colours matching other Studio-styled admin pages. */
export const STUDIO_CHART = {
  success: 'hsl(142 76% 36%)',
  failed: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--muted-foreground))',
  tooltip: {
    borderRadius: 8,
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--background))',
    fontSize: 12,
  },
} as const;

/** Table class tokens (header strip, dense rows). */
export const studioTable = {
  wrap: 'overflow-x-auto',
  headRow: 'border-border hover:bg-transparent',
  head: 'h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground',
  row: 'border-border bg-background hover:bg-muted/40',
  cell: 'py-2.5 align-middle',
} as const;

export function StudioPageHeader({
  icon: Icon,
  crumbs,
  title,
  description,
  actions,
  children,
}: {
  icon: LucideIcon;
  crumbs: ReactNode[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {crumbs.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 ? <span className="text-border">/</span> : null}
              <span className={i === crumbs.length - 1 ? 'text-foreground' : undefined}>{c}</span>
            </span>
          ))}
        </div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">{title}</h1>
        {description ? <div className="max-w-2xl text-sm text-muted-foreground">{description}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StudioPanel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-background', className)}>
      <div className="flex flex-col gap-2 border-b border-border bg-muted/40 px-4 py-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
            {title}
          </p>
          {description ? <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function StudioEmpty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-xs text-muted-foreground">{children}</div>;
}

export function StudioError({ message, hint }: { message: string; hint?: string | null }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">{message}</p>
      {hint ? <p className="mt-0.5 text-xs opacity-90">{hint}</p> : null}
    </div>
  );
}

export type StatTileData = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StudioTone;
  tooltip?: string;
};

export function StatTile({ tile, isLoading }: { tile: StatTileData; isLoading?: boolean }) {
  const Icon = tile.icon;
  const body = (
    <div className="h-full overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">{tile.label}</span>
        {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
      </div>
      <div className="px-3 py-3">
        {isLoading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className={cn('font-mono text-2xl font-medium tabular-nums tracking-tight', toneText[tile.tone ?? 'default'])}>
            {tile.value}
          </div>
        )}
        {tile.hint ? <p className="mt-1 text-[11px] text-muted-foreground">{tile.hint}</p> : null}
      </div>
    </div>
  );
  if (!tile.tooltip) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="h-full">{body}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{tile.tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function StatTileSkeletonGrid({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[92px] rounded-md" />
      ))}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
            {typeof o.count === 'number' ? (
              <span
                className={cn(
                  'rounded px-1 font-mono text-[10px] tabular-nums',
                  active ? 'bg-muted text-muted-foreground' : 'text-muted-foreground/70',
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({
  tone = 'muted',
  children,
  className,
  mono,
}: {
  tone?: StudioTone;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium',
        mono && 'font-mono',
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone, children, pulse }: { tone: StudioTone; children?: ReactNode; pulse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="relative flex h-1.5 w-1.5">
        {pulse ? (
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dotTone[tone])} />
        ) : null}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotTone[tone])} />
      </span>
      {children}
    </span>
  );
}

/** Small bordered metric used inside panels. */
export function MiniStat({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: StudioTone }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-mono text-lg font-medium tabular-nums', toneText[tone])}>{value}</p>
    </div>
  );
}
