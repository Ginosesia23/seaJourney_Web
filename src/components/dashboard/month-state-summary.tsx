'use client';

import type { CSSProperties, ComponentType } from 'react';
import { useState } from 'react';
import {
  Anchor,
  Briefcase,
  Building,
  ChevronDown,
  Clock,
  Ship,
  Waves,
  Wrench,
} from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { calendarStateSolid, STANDBY_INDICATOR_COLOR } from '@/lib/calendar-state-colors';
import type { DailyStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

type SummaryIcon = ComponentType<{
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}>;

export type MonthSummaryItem = {
  key: string;
  label: string;
  shortLabel: string;
  count: number;
  color: string;
  Icon: SummaryIcon;
};

const STATE_META: Record<
  DailyStatus,
  { label: string; shortLabel: string; Icon: SummaryIcon }
> = {
  underway: { label: 'Underway', shortLabel: 'Underway', Icon: Waves },
  'at-anchor': { label: 'At Anchor', shortLabel: 'Anchor', Icon: Anchor },
  'in-port': { label: 'Moored', shortLabel: 'Moored', Icon: Building },
  'on-leave': { label: 'On Leave', shortLabel: 'Leave', Icon: Briefcase },
  'in-yard': { label: 'In Yard', shortLabel: 'Yard', Icon: Wrench },
};

const DEFAULT_STATE_ORDER: DailyStatus[] = [
  'underway',
  'at-anchor',
  'in-port',
  'on-leave',
  'in-yard',
];

/**
 * Build the standard month-summary rows used on Calendar / Current / sign-off.
 */
export function buildMonthSummaryItems(opts: {
  counts: Partial<Record<DailyStatus | 'standby' | 'passage', number>>;
  /** Hide on-leave (vessel accounts). Default true for crew. */
  includeOnLeave?: boolean;
  includePassage?: boolean;
  includeStandby?: boolean;
}): MonthSummaryItem[] {
  const includeOnLeave = opts.includeOnLeave !== false;
  const includePassage = opts.includePassage === true;
  const includeStandby = opts.includeStandby !== false;

  const items: MonthSummaryItem[] = [];
  for (const value of DEFAULT_STATE_ORDER) {
    if (!includeOnLeave && value === 'on-leave') continue;
    const meta = STATE_META[value];
    items.push({
      key: value,
      label: meta.label,
      shortLabel: meta.shortLabel,
      count: opts.counts[value] || 0,
      color: calendarStateSolid(value),
      Icon: meta.Icon,
    });
  }
  if (includePassage) {
    items.push({
      key: 'passage',
      label: 'Part of passage',
      shortLabel: 'Passage',
      count: opts.counts.passage || 0,
      color: calendarStateSolid('underway'),
      Icon: Ship,
    });
  }
  if (includeStandby) {
    items.push({
      key: 'standby',
      label: 'Standby days',
      shortLabel: 'Standby',
      count: opts.counts.standby || 0,
      color: STANDBY_INDICATOR_COLOR,
      Icon: Clock,
    });
  }
  return items;
}

type MonthStateSummaryProps = {
  items: MonthSummaryItem[];
  /** Controlled open state (e.g. parent tracks expanded months). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled initial state. Ignored when `open` is provided. */
  defaultOpen?: boolean;
  className?: string;
  title?: string;
};

/**
 * Collapsible month day-count strip: icon + short name | count.
 * Matches the Calendar page month summary design.
 */
export function MonthStateSummary({
  items,
  open: openControlled,
  onOpenChange,
  defaultOpen = false,
  className,
  title = 'Month summary',
}: MonthStateSummaryProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = openControlled !== undefined;
  const open = isControlled ? openControlled : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className={cn('mt-3', className)}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-expanded={open}
        >
          <span className="font-medium">{title}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
        {open && (
          <>
            <Separator className="my-2" />
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {items.map((item) => {
                const ItemIcon = item.Icon;
                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <ItemIcon
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: item.color }}
                            aria-hidden
                          />
                          <span className="truncate text-xs text-muted-foreground">
                            {item.shortLabel}
                          </span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums tracking-tight">
                          {item.count}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
