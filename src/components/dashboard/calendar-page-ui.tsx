'use client';

import type { ReactNode } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function CalendarPageHeader({
  title = 'Calendar',
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
          <CalendarIcon className="h-3.5 w-3.5" />
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

export function CalendarSection({
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
