'use client';

import { useMemo } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
} from 'date-fns';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  MonthStateSummary,
  buildMonthSummaryItems,
} from '@/components/dashboard/month-state-summary';
import { calendarStateSolid } from '@/lib/calendar-state-colors';
import type { DailyStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const CALENDAR_STATE_LABELS: Record<DailyStatus, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored',
  'on-leave': 'On leave',
  'in-yard': 'In yard',
};

export const CALENDAR_ALL_STATES: DailyStatus[] = [
  'underway',
  'at-anchor',
  'in-port',
  'in-yard',
  'on-leave',
];

export type DayAccent = 'conflict' | 'leave-fill' | null;

/** Bottom strip overlay — matches main Calendar page indicators. */
export type DaySecondaryIndicator = 'standby' | 'passage';

/** Passage summary shown when hovering a calendar day. */
export type DayHoverPassage = {
  id: string;
  routeLabel: string;
  whenLabel: string;
  metaLabel?: string;
};

export type DayHoverInfo = {
  passages?: DayHoverPassage[];
  /** Extra note lines (e.g. “Part of active passage”). */
  notes?: string[];
};

type MonthGridProps = {
  monthStart: Date;
  stateByDate: Map<string, DailyStatus>;
  /** Optional per-day accent (e.g. conflict ring). */
  accentByDate?: Map<string, DayAccent>;
  /** Rich hover content (passages, notes) keyed by yyyy-MM-dd. */
  dayHoverByDate?: Map<string, DayHoverInfo>;
  /**
   * Bottom strip on the day cell (main calendar design):
   * purple = counted standby.
   */
  secondaryByDate?: Map<string, DaySecondaryIndicator>;
  /** Collapsible month day-count summary (Calendar page design). Default true. */
  showSummary?: boolean;
  /** When showSummary is true, start the summary expanded. */
  summaryDefaultOpen?: boolean;
  includeOnLeave?: boolean;
  /** Include standby counts in the month summary. */
  includeStandbySummary?: boolean;
  /** Denser month cards for multi-month crew dossier layouts. */
  size?: 'default' | 'compact';
  className?: string;
};

export function StateMonthGrid({
  monthStart,
  stateByDate,
  accentByDate,
  dayHoverByDate,
  secondaryByDate,
  showSummary = true,
  summaryDefaultOpen = false,
  includeOnLeave = true,
  includeStandbySummary = false,
  size = 'default',
  className,
}: MonthGridProps) {
  const compact = size === 'compact';
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const padBefore = getDay(monthStart);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  const summaryItems = useMemo(() => {
    if (!showSummary) return [];
    const counts: Partial<Record<DailyStatus | 'standby' | 'passage', number>> = {};
    for (const [dateStr, state] of stateByDate) {
      if (dateStr < monthStartStr || dateStr > monthEndStr) continue;
      counts[state] = (counts[state] || 0) + 1;
    }
    if (includeStandbySummary && secondaryByDate) {
      let standby = 0;
      for (const [dateStr, secondary] of secondaryByDate) {
        if (dateStr < monthStartStr || dateStr > monthEndStr) continue;
        if (secondary === 'standby') standby += 1;
      }
      counts.standby = standby;
    }
    return buildMonthSummaryItems({
      counts,
      includeOnLeave,
      includePassage: false,
      includeStandby: includeStandbySummary,
    });
  }, [
    showSummary,
    stateByDate,
    monthStartStr,
    monthEndStr,
    includeOnLeave,
    includeStandbySummary,
    secondaryByDate,
  ]);

  return (
    <Card
      className={cn(
        'rounded-xl border bg-card/50',
        compact && 'rounded-lg shadow-none',
        className,
      )}
    >
      <CardHeader className={cn(compact ? 'px-3 py-2 pb-1' : 'pb-1')}>
        <CardTitle
          className={cn(
            'font-semibold',
            compact ? 'text-xs tracking-tight' : 'text-sm',
          )}
        >
          {format(monthStart, compact ? 'MMM yyyy' : 'MMMM yyyy')}
        </CardTitle>
      </CardHeader>
      <CardContent className={cn(compact ? 'px-3 pb-2.5 pt-0' : 'pb-3')}>
        <div
          className={cn(
            'grid grid-cols-7 gap-0.5 text-center font-medium uppercase tracking-wider text-muted-foreground',
            compact ? 'text-[9px]' : 'text-[9px]',
          )}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d.charAt(0)}</div>
          ))}
        </div>
        <TooltipProvider delayDuration={200}>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {Array.from({ length: padBefore }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}
            {days.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const state = stateByDate.get(key);
              const accent = accentByDate?.get(key) ?? null;
              const secondary = secondaryByDate?.get(key) ?? null;
              const hover = dayHoverByDate?.get(key);
              const passages = hover?.passages ?? [];
              const notes = hover?.notes ?? [];
              const titleParts = [format(d, 'EEE d MMM yyyy')];
              if (state) titleParts.push(CALENDAR_STATE_LABELS[state]);
              if (secondary === 'standby') titleParts.push('Standby');
              if (secondary === 'passage') titleParts.push('Part of passage');
              if (accent === 'conflict') titleParts.push('Conflict with other source');
              if (accent === 'leave-fill') titleParts.push('Leave period (no vessel log)');
              for (const p of passages) {
                titleParts.push(p.routeLabel);
              }

              // Match main Calendar page: rounded-[6px] fill + optional bottom strip.
              const cell = (
                <div className="aspect-square overflow-hidden rounded-[6px]">
                  <div
                    className={cn(
                      'relative flex h-full w-full items-center justify-center font-medium',
                      secondary && 'overflow-hidden',
                      compact ? 'text-[10px] leading-none' : 'text-[10px]',
                      state ? 'text-white' : 'border bg-card text-muted-foreground/50',
                      accent === 'conflict' &&
                        (compact
                          ? 'ring-1 ring-amber-500 ring-offset-0'
                          : 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background'),
                      accent === 'leave-fill' &&
                        !state &&
                        'border-dashed border-muted-foreground/40',
                    )}
                    style={
                      state
                        ? {
                            backgroundColor: calendarStateSolid(state),
                          }
                        : undefined
                    }
                  >
                    <span className="relative z-[1]">{d.getDate()}</span>
                    {secondary === 'passage' && (
                      <div
                        className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[6px] bg-blue-600"
                        aria-hidden
                      />
                    )}
                    {secondary === 'standby' && (
                      <div
                        className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[6px] bg-[#7629BB]"
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
              );

              const hasRichHover =
                passages.length > 0 ||
                notes.length > 0 ||
                !!state ||
                !!accent ||
                !!secondary;

              if (!hasRichHover) {
                return (
                  <div key={key} title={titleParts.join(' — ')}>
                    {cell}
                  </div>
                );
              }

              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <div className="cursor-default outline-none">{cell}</div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-[260px] space-y-1.5 px-3 py-2 text-xs"
                  >
                    <div className="font-semibold text-sm leading-tight">
                      {format(d, 'EEE d MMM yyyy')}
                    </div>
                    {state ? (
                      <div className="font-medium">{CALENDAR_STATE_LABELS[state]}</div>
                    ) : (
                      <div className="text-muted-foreground">No state logged</div>
                    )}
                    {secondary === 'standby' && (
                      <div className="flex items-center gap-1.5 text-[#7629BB] dark:text-purple-300">
                        <span className="h-1.5 w-3 rounded-sm bg-[#7629BB]" aria-hidden />
                        Counted as standby
                      </div>
                    )}
                    {secondary === 'passage' && (
                      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                        <span className="h-1.5 w-3 rounded-sm bg-blue-600" aria-hidden />
                        Part of active passage
                      </div>
                    )}
                    {accent === 'conflict' && (
                      <div className="text-amber-600 dark:text-amber-400">
                        Conflict with other source
                      </div>
                    )}
                    {accent === 'leave-fill' && (
                      <div className="text-muted-foreground">
                        Leave period (no vessel log)
                      </div>
                    )}
                    {notes.map((note) => (
                      <div key={note} className="text-muted-foreground">
                        {note}
                      </div>
                    ))}
                    {passages.length > 0 && (
                      <div className="space-y-1.5 border-t border-border/60 pt-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {passages.length > 1 ? 'Passages' : 'Passage'}
                        </div>
                        {passages.map((p) => (
                          <div key={p.id} className="space-y-0.5">
                            <div className="font-medium leading-snug text-blue-700 dark:text-blue-300">
                              {p.routeLabel}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.whenLabel}
                            </div>
                            {p.metaLabel ? (
                              <div className="text-[11px] capitalize text-muted-foreground">
                                {p.metaLabel}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
        {showSummary && summaryItems.length > 0 && (
          <MonthStateSummary
            items={summaryItems}
            defaultOpen={summaryDefaultOpen}
            className={cn(compact && 'mt-2')}
          />
        )}
      </CardContent>
    </Card>
  );
}
