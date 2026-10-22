'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  PanelRightClose,
  PanelRightOpen,
  UserRound,
} from 'lucide-react';

import { useActivityRail } from '@/components/activity-rail/activity-rail-provider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ACTIVITY_RAIL_CATEGORIES,
  formatActivityRailDue,
  type ActivityRailCategory,
  type ActivityRailItem,
  type ActivityRailSeverity,
} from '@/lib/activity-rail';
import { cn } from '@/lib/utils';

const WIDTH = '16.5rem';
const WIDTH_ICON = '3rem';

const CATEGORY_ICON: Record<
  ActivityRailCategory,
  React.ComponentType<{ className?: string }>
> = {
  overdue: CircleAlert,
  upcoming: CalendarClock,
  missing: UserRound,
  issue: AlertTriangle,
};

function severityClass(severity: ActivityRailSeverity) {
  if (severity === 'critical') {
    return {
      bar: 'bg-red-400',
      icon: 'text-red-300',
      due: 'bg-red-400/15 text-red-200',
    };
  }
  if (severity === 'warning') {
    return {
      bar: 'bg-amber-400',
      icon: 'text-amber-300',
      due: 'bg-amber-400/15 text-amber-200',
    };
  }
  return {
    bar: 'bg-sky-400',
    icon: 'text-sky-300',
    due: 'bg-sky-400/15 text-sky-200',
  };
}

function ActivityRailItemRow({
  item,
  collapsed,
  onNavigate,
}: {
  item: ActivityRailItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const tone = severityClass(item.severity);
  const due = formatActivityRailDue(item.daysUntil);
  const Icon = CATEGORY_ICON[item.category];

  if (collapsed) return null;

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        className="group/item flex gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent/70"
      >
        <span className={cn('mt-0.5 h-8 w-0.5 shrink-0 rounded-full', tone.bar)} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-1.5">
            <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone.icon)} />
            <span className="text-[13px] font-medium leading-snug text-sidebar-foreground">
              {item.title}
            </span>
          </span>
          <span className="mt-0.5 block pl-5 text-[11px] leading-snug text-sidebar-foreground/55">
            {item.description}
          </span>
          {due ? (
            <span
              className={cn(
                'mt-1.5 ml-5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                tone.due,
              )}
            >
              {due}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function ActivityRailBody({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { items, counts, isLoading, toggle } = useActivityRail();

  const grouped = React.useMemo(() => {
    return ACTIVITY_RAIL_CATEGORIES.map((category) => ({
      ...category,
      items: items.filter((item) => item.category === category.id),
    })).filter((group) => group.items.length > 0);
  }, [items]);

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border/80 px-2">
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 px-1',
            collapsed && 'justify-center px-0',
          )}
        >
          <button
            type="button"
            onClick={collapsed ? toggle : undefined}
            className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent/70 hover:bg-sidebar-accent"
            title={collapsed ? 'Expand attention bar' : undefined}
          >
            <Bell className="h-4 w-4" />
            {counts.total > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-semibold text-amber-950">
                {counts.total > 9 ? '9+' : counts.total}
              </span>
            ) : null}
          </button>
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-tight">
                Attention
              </div>
              <div className="truncate text-[11px] text-sidebar-foreground/50">
                {isLoading
                  ? 'Checking account…'
                  : counts.total === 0
                    ? 'Nothing waiting'
                    : `${counts.total} item${counts.total === 1 ? '' : 's'} to review`}
              </div>
            </div>
          ) : null}
        </div>
        {!collapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={toggle}
            title="Collapse attention bar"
          >
            <PanelRightClose className="h-4 w-4" />
            <span className="sr-only">Collapse attention bar</span>
          </Button>
        ) : null}
      </div>

      <ScrollArea className="h-full min-h-0 flex-1">
        <div className={cn('px-1 py-2', collapsed && 'px-1.5')}>
          {isLoading ? (
            <div className="space-y-2 px-2 py-2">
              {Array.from({ length: collapsed ? 4 : 5 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className={cn(
                    'bg-sidebar-accent',
                    collapsed ? 'h-8 w-8 rounded-lg' : 'h-14 w-full rounded-lg',
                  )}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-center py-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300/80" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">You are all caught up</TooltipContent>
              </Tooltip>
            ) : (
              <div className="mx-1 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 px-3 py-8 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-300/80" />
                <p className="mt-2 text-sm font-medium">You are all caught up</p>
                <p className="mt-1 text-[11px] leading-snug text-sidebar-foreground/50">
                  Upcoming expiries, missing details, and account issues will
                  show here.
                </p>
              </div>
            )
          ) : collapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              {ACTIVITY_RAIL_CATEGORIES.map((category) => {
                const count =
                  category.id === 'overdue'
                    ? counts.overdue
                    : category.id === 'upcoming'
                      ? counts.upcoming
                      : category.id === 'missing'
                        ? counts.missing
                        : counts.issues;
                if (!count) return null;
                const Icon = CATEGORY_ICON[category.id];
                return (
                  <Tooltip key={category.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={toggle}
                        className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {category.label} · {count}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ) : (
            grouped.map((group) => {
              const Icon = CATEGORY_ICON[group.id];
              return (
                <section key={group.id} className="mb-3">
                  <div className="flex h-7 items-center gap-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                    <Icon className="h-3.5 w-3.5" />
                    {group.label}
                  </div>
                  <ul className="mt-0.5">
                    {group.items.map((item) => (
                      <ActivityRailItemRow
                        key={item.id}
                        item={item}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ActivityRail() {
  const { open, setOpen, openMobile, setOpenMobile, isMobile } =
    useActivityRail();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="right"
          className="w-[18rem] border-l-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
        >
          <ActivityRailBody onNavigate={() => setOpenMobile(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group/activity-rail hidden text-sidebar-foreground md:block"
      data-state={open ? 'expanded' : 'collapsed'}
      data-collapsible={open ? '' : 'icon'}
      data-side="right"
      style={
        {
          '--activity-rail-width': WIDTH,
          '--activity-rail-width-icon': WIDTH_ICON,
        } as React.CSSProperties
      }
    >
      <div
        className={cn(
          'relative h-svh bg-transparent transition-[width] duration-200 ease-linear',
          open
            ? 'w-[--activity-rail-width]'
            : 'w-[calc(var(--activity-rail-width-icon)_+_theme(spacing.4))]',
        )}
      />
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-10 hidden h-svh p-2 transition-[width] duration-200 ease-linear md:flex',
          open
            ? 'w-[--activity-rail-width]'
            : 'w-[calc(var(--activity-rail-width-icon)_+_theme(spacing.4)_+2px)]',
        )}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden">
          <button
            type="button"
            aria-label="Toggle attention bar"
            title="Toggle attention bar"
            tabIndex={-1}
            onClick={() => setOpen((current) => !current)}
            className="absolute inset-y-0 left-0 z-20 hidden w-4 -translate-x-1/2 sm:flex"
          />
          <ActivityRailBody collapsed={!open} />
        </div>
      </div>
    </div>
  );
}

export function ActivityRailTrigger({
  className,
}: {
  className?: string;
}) {
  const { toggle, counts, isMobile, open, openMobile } = useActivityRail();
  const Icon = isMobile || !open ? PanelRightOpen : PanelRightClose;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('relative h-8 w-8', className)}
      onClick={toggle}
      title="Attention bar"
      aria-expanded={isMobile ? openMobile : open}
    >
      <Icon className="h-4 w-4" />
      {counts.total > 0 ? (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold text-amber-950">
          {counts.total > 9 ? '9+' : counts.total}
        </span>
      ) : null}
      <span className="sr-only">Toggle attention bar</span>
    </Button>
  );
}
