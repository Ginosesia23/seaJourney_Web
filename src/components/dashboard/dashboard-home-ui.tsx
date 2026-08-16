'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function DashboardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
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
  }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-xl border bg-border',
        items.length <= 2 && 'grid-cols-2',
        items.length === 3 && 'grid-cols-3',
        items.length >= 4 && 'grid-cols-2 sm:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
            {item.value}
          </div>
          {item.hint ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{item.hint}</div>
          ) : null}
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border bg-card',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="flex-1 px-4 py-4 sm:px-5">{children}</div>
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
            className="h-8 rounded-lg"
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
      <p className="text-sm text-muted-foreground">No days logged yet.</p>
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
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: row.color }} />
                ) : (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                )}
                <span className="truncate text-muted-foreground">{row.label}</span>
              </div>
              <span className="shrink-0 tabular-nums font-medium">
                {row.count}
                <span className="ml-1 font-normal text-muted-foreground">({pct}%)</span>
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
