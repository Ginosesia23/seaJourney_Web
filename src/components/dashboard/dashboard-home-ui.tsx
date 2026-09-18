'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Dashboard home chrome — matches the newer Inbox / Certificates / Current
 * page-ui language (breadcrumb header, mono stat tiles, muted section bars).
 */

export function DashboardHeader({
  title,
  description,
  actions,
  icon: Icon = LayoutDashboard,
  breadcrumb = 'Overview',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  /** Shown after "Dashboard /" in the breadcrumb trail. */
  breadcrumb?: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>Dashboard</span>
          <span className="text-border">/</span>
          <span className="text-foreground">{breadcrumb}</span>
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

export function DashboardStatRow({
  items,
  className,
}: {
  items: Array<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'default' | 'sky' | 'emerald' | 'purple' | 'amber' | 'destructive';
  }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-3',
        items.length <= 2 && 'sm:grid-cols-2',
        items.length === 3 && 'sm:grid-cols-3',
        items.length >= 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
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
                item.tone === 'sky' && 'text-sky-600',
                item.tone === 'emerald' && 'text-emerald-600',
                item.tone === 'purple' && 'text-[#7629BB]',
                item.tone === 'amber' && 'text-amber-600',
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

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className,
  flush,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
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

export function DashboardQuickLinks({
  links,
}: {
  links: Array<{ href: string; label: string; icon?: LucideIcon }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Button
            key={`${link.href}-${link.label}`}
            asChild
            variant="outline"
            size="sm"
            className="h-8 rounded-md text-xs"
          >
            <Link href={link.href}>
              {Icon ? <Icon className="mr-1.5 h-3.5 w-3.5" /> : null}
              {link.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

export function StateBreakdownBars({
  rows,
}: {
  rows: Array<{
    key: string;
    label: string;
    count: number;
    color: string;
    icon?: LucideIcon;
  }>;
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const visible = rows.filter((r) => r.count > 0);
  if (visible.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">No days logged yet.</p>
    );
  }
  return (
    <div className="space-y-3">
      {visible.map((row) => {
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        const Icon = row.icon;
        return (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                {Icon ? (
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: row.color }}
                  />
                ) : (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                )}
                <span className="truncate text-muted-foreground">{row.label}</span>
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums font-medium">
                {row.count}
                <span className="ml-1 font-sans font-normal text-muted-foreground">
                  ({pct}%)
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: row.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact mono metric strip used inside panels (e.g. sea-time calculator). */
export function DashboardInlineMetrics({
  items,
}: {
  items: Array<{ label: string; value: string | number; tone?: string }>;
}) {
  return (
    <div
      className={cn(
        'grid gap-3',
        items.length <= 2 && 'grid-cols-2',
        items.length === 3 && 'grid-cols-3',
        items.length >= 4 && 'grid-cols-2 sm:grid-cols-4',
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="overflow-hidden rounded-md border border-border bg-muted/20 px-3 py-2.5"
        >
          <p className="text-[11px] text-muted-foreground">{item.label}</p>
          <p
            className={cn(
              'mt-0.5 font-mono text-lg font-medium tabular-nums tracking-tight',
              item.tone === 'purple' && 'text-[#7629BB]',
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
