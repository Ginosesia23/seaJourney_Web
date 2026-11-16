'use client';

import {
  forwardRef,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from 'react';
import {
  eachDayOfInterval,
  endOfYear,
  format,
  isSameDay,
  startOfDay,
  startOfYear,
} from 'date-fns';

import { useCalendarColorStyle } from '@/components/calendar-color-style-provider';
import {
  calendarStateFill,
  calendarStateSolid,
  calendarStateSwatch,
} from '@/lib/calendar-state-colors';
import type { DailyStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const CELL_W = 18;
const CELL_H = 28;
const NAME_W = 168;

/** Same inset ring used for “today” — reused for hover. */
function dayCellOutline(state: DailyStatus | undefined): string {
  return `inset 0 0 0 1.5px ${
    state ? calendarStateSolid(state) : 'hsl(var(--primary))'
  }`;
}

const CrewYearDayCellButton = forwardRef<
  HTMLButtonElement,
  {
    state: DailyStatus | undefined;
    isToday: boolean;
    selected: boolean;
    edge: boolean;
    onSelect: () => void;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'>
>(function CrewYearDayCellButton(
  { state, isToday, selected, edge, onSelect, className, onMouseEnter, onMouseLeave, onFocus, onBlur, ...rest },
  ref,
) {
  const [hovered, setHovered] = useState(false);
  const showOutline = !edge && (isToday || hovered);

  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      onClick={onSelect}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        setHovered(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setHovered(false);
        onBlur?.(e);
      }}
      style={{ width: CELL_W, minWidth: CELL_W }}
      className={cn(
        'relative z-0 flex shrink-0 items-center justify-center rounded-[4px]',
        (hovered || isToday) && 'z-20',
        selected && 'bg-sky-500/10',
        className,
      )}
    >
      <div
        style={{
          width: CELL_W - 2,
          height: CELL_H - 4,
          marginLeft: 1,
          marginRight: 1,
          borderRadius: 4,
          backgroundColor: state ? calendarStateFill(state) : 'transparent',
          boxShadow: edge
            ? 'inset 0 0 0 1.5px hsl(199 89% 48%)'
            : showOutline
              ? dayCellOutline(state)
              : undefined,
        }}
        className={cn(
          'pointer-events-none',
          !state && 'border border-border/40 bg-muted/20',
          selected && !edge && 'ring-1 ring-inset ring-sky-400/50',
        )}
      />
    </button>
  );
});

export type CrewYearRow = {
  /** Lookup key into statesByUser */
  userId: string;
  name: string;
  position: string | null;
  onboard?: boolean;
  /** Vessel comparison row vs crew member row */
  kind?: 'vessel' | 'crew';
};

export type CrewYearDateRange = {
  from: string | null;
  to: string | null;
};

/** Who the selected range applies to */
export type CrewYearRangeScope =
  | { mode: 'all' }
  | { mode: 'crew'; userId: string; name: string };

export type CrewYearDateSelectPayload = {
  dateKey: string;
  /** Vessel / day-header → all crew; crew row → that person only */
  scope: CrewYearRangeScope;
};

const STATE_LABELS: Record<DailyStatus, string> = {
  underway: 'Underway',
  'at-anchor': 'At anchor',
  'in-port': 'Moored',
  'in-yard': 'In yard',
  'on-leave': 'On leave',
};

function buildMonthGroups(days: Date[]): Array<{ label: string; count: number }> {
  const groups: Array<{ label: string; count: number }> = [];
  for (const day of days) {
    const label = format(day, 'MMM');
    if (groups.length === 0 || groups[groups.length - 1].label !== label) {
      groups.push({ label, count: 1 });
    } else {
      groups[groups.length - 1].count++;
    }
  }
  return groups;
}

function inSelectedRange(
  dateKey: string,
  range: CrewYearDateRange | null | undefined,
): boolean {
  if (!range?.from) return false;
  if (!range.to) return dateKey === range.from;
  const a = range.from <= range.to ? range.from : range.to;
  const b = range.from <= range.to ? range.to : range.from;
  return dateKey >= a && dateKey <= b;
}

function isRangeEdge(
  dateKey: string,
  range: CrewYearDateRange | null | undefined,
): boolean {
  if (!range?.from) return false;
  if (!range.to) return dateKey === range.from;
  return dateKey === range.from || dateKey === range.to;
}

function rowShowsRangeHighlight(
  row: CrewYearRow,
  scope: CrewYearRangeScope | null | undefined,
): boolean {
  if (!scope) return false;
  if (scope.mode === 'all') return true;
  return row.kind === 'crew' && row.userId === scope.userId;
}

export function CrewYearCalendarGrid({
  year,
  rows,
  statesByUser,
  range,
  rangeScope = null,
  onDateSelect,
  recenterToken = 0,
  className,
}: {
  year: number;
  rows: CrewYearRow[];
  /** userId → dateKey (yyyy-MM-dd) → DailyStatus */
  statesByUser: Map<string, Map<string, DailyStatus>>;
  range?: CrewYearDateRange | null;
  /** Limits cell highlight to vessel-all or one crew row */
  rangeScope?: CrewYearRangeScope | null;
  /** Click a day to set start / end; scope comes from which row was clicked */
  onDateSelect?: (payload: CrewYearDateSelectPayload) => void;
  recenterToken?: number;
  className?: string;
}) {
  useCalendarColorStyle();
  const today = useMemo(() => startOfDay(new Date()), []);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    const start = startOfYear(new Date(year, 0, 1));
    const end = endOfYear(new Date(year, 0, 1));
    return eachDayOfInterval({ start, end });
  }, [year]);

  const monthGroups = useMemo(() => buildMonthGroups(days), [days]);

  // Only recenter on year change / explicit Today — not on range selection re-renders
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const run = () => {
      const node = scrollRef.current;
      if (!node) return;
      const todayIdx = days.findIndex((d) => isSameDay(d, today));
      if (todayIdx < 0 || year !== today.getFullYear()) {
        node.scrollLeft = 0;
        return;
      }
      const visibleW = Math.max(0, node.clientWidth - NAME_W);
      const desired = todayIdx * CELL_W + CELL_W / 2 - visibleW / 2;
      const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
      node.scrollLeft = Math.max(0, Math.min(desired, maxScroll));
    };

    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(run);
    });
    return () => {
      cancelAnimationFrame(id1);
      if (id2) cancelAnimationFrame(id2);
    };
  }, [year, recenterToken, days, today]);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        ref={scrollRef}
        className={cn(
          'scrollbar-hide max-w-full min-w-0 overflow-x-auto rounded-[14px] border border-border/80 bg-card/40',
          className,
        )}
      >
        <div style={{ minWidth: `${NAME_W + days.length * CELL_W + 24}px` }}>
          {/* Month band */}
          <div className="flex border-b border-border/70 bg-muted/40">
            <div
              className="sticky left-0 z-20 flex shrink-0 items-end border-r border-border/70 bg-muted px-3 pb-1.5"
              style={{ width: NAME_W }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Crew
              </span>
            </div>
            <div className="flex">
              {monthGroups.map((g, i) => (
                <div
                  key={`${g.label}-${i}`}
                  style={{
                    width: `${g.count * CELL_W}px`,
                    minWidth: `${g.count * CELL_W}px`,
                  }}
                  className={cn(
                    'shrink-0 truncate px-1.5 py-1.5 text-[11px] font-semibold text-foreground',
                    i > 0 && 'border-l border-border/60',
                  )}
                >
                  {g.label}
                </div>
              ))}
            </div>
          </div>

          {/* Day numbers — also selectable */}
          <div className="flex border-b border-border/60 bg-muted/20">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-border/70 bg-muted"
              style={{ width: NAME_W }}
            />
            <div className="flex">
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const isToday = isSameDay(day, today) && year === today.getFullYear();
                const selected = inSelectedRange(key, range);
                const edge = isRangeEdge(key, range);
                const showNum =
                  day.getDate() === 1 || day.getDate() % 5 === 0 || isToday || edge;
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() =>
                      onDateSelect?.({ dateKey: key, scope: { mode: 'all' } })
                    }
                    style={{ width: CELL_W, minWidth: CELL_W }}
                    className={cn(
                      'flex h-5 shrink-0 items-center justify-center text-[8px] font-medium transition-colors',
                      selected && 'bg-sky-500/20',
                      edge && 'bg-sky-500/35 text-sky-700 dark:text-sky-300',
                      isToday && !selected && 'bg-primary/15 text-primary',
                      !selected && !isToday && 'text-muted-foreground hover:bg-muted',
                    )}
                    title={format(day, 'EEE d MMM yyyy')}
                  >
                    {showNum ? day.getDate() : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vessel + crew rows */}
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No active crew on this vessel.
            </div>
          ) : (
            rows.map((row, rowIndex) => {
              const userMap = statesByUser.get(row.userId);
              const isVesselRow = row.kind === 'vessel';
              const rowKey = `${row.kind ?? 'crew'}-${row.userId}-${rowIndex}`;
              const highlightRow = rowShowsRangeHighlight(row, rangeScope);
              return (
                <div
                  key={rowKey}
                  className={cn(
                    'flex border-b border-border/50 last:border-b-0',
                    isVesselRow && 'border-b-2 border-border bg-muted/15',
                  )}
                >
                  <div
                    className={cn(
                      'sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-border/70 px-3',
                      isVesselRow ? 'bg-muted' : 'bg-background',
                    )}
                    style={{ width: NAME_W, minHeight: CELL_H + 8 }}
                  >
                    <p className="truncate text-xs font-semibold text-foreground">
                      {row.name}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {row.position || (isVesselRow ? 'Vessel log' : 'Crew')}
                      {!isVesselRow && row.onboard ? ' · onboard' : ''}
                    </p>
                  </div>
                  <div className="flex items-center py-1">
                    {days.map((day) => {
                      const key = format(day, 'yyyy-MM-dd');
                      const state = userMap?.get(key);
                      const isToday =
                        isSameDay(day, today) && year === today.getFullYear();
                      const selected =
                        highlightRow && inSelectedRange(key, range);
                      const edge = highlightRow && isRangeEdge(key, range);
                      const swatch = state ? calendarStateSwatch(state) : null;

                      const selectScope: CrewYearRangeScope = isVesselRow
                        ? { mode: 'all' }
                        : { mode: 'crew', userId: row.userId, name: row.name };

                      return (
                        <Tooltip key={key}>
                          <TooltipTrigger asChild>
                            <CrewYearDayCellButton
                              state={state}
                              isToday={isToday}
                              selected={selected}
                              edge={edge}
                              onSelect={() =>
                                onDateSelect?.({ dateKey: key, scope: selectScope })
                              }
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-semibold">{row.name}</p>
                            <p>{format(day, 'EEE d MMM yyyy')}</p>
                            <p
                              className="mt-0.5 font-medium"
                              style={{
                                color: swatch?.accent ?? undefined,
                              }}
                            >
                              {state
                                ? `${isVesselRow ? 'Vessel · ' : ''}${STATE_LABELS[state]}`
                                : isVesselRow
                                  ? 'No vessel log'
                                  : 'No state logged'}
                            </p>
                            {onDateSelect ? (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {isVesselRow
                                  ? 'Click for range · totals for all crew'
                                  : 'Click for range · totals for this person'}
                              </p>
                            ) : null}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

export function buildCrewYearStateMaps(
  logs: Array<{ userId: string; date: string; state: DailyStatus }>,
  year: number,
): Map<string, Map<string, DailyStatus>> {
  const prefix = `${year}-`;
  const byUser = new Map<string, Map<string, DailyStatus>>();
  for (const log of logs) {
    if (!log.date?.startsWith(prefix)) continue;
    let m = byUser.get(log.userId);
    if (!m) {
      m = new Map();
      byUser.set(log.userId, m);
    }
    m.set(log.date, log.state);
  }
  return byUser;
}

export type RangeStateCounts = Record<DailyStatus, number> & { logged: number };

export function countStatesInDateRange(
  stateByDate: Map<string, DailyStatus> | undefined,
  from: string,
  to: string,
): RangeStateCounts {
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const counts: RangeStateCounts = {
    underway: 0,
    'at-anchor': 0,
    'in-port': 0,
    'in-yard': 0,
    'on-leave': 0,
    logged: 0,
  };
  if (!stateByDate) return counts;
  stateByDate.forEach((state, date) => {
    if (date < a || date > b) return;
    counts[state] = (counts[state] || 0) + 1;
    counts.logged += 1;
  });
  return counts;
}

/** Inclusive day span between two yyyy-MM-dd keys. */
export function inclusiveDaySpan(from: string, to: string): number {
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const start = startOfDay(new Date(`${a}T00:00:00`));
  const end = startOfDay(new Date(`${b}T00:00:00`));
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}
