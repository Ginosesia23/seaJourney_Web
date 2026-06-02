'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDays,
  differenceInDays,
  format,
  parseISO,
  startOfDay,
} from 'date-fns';
import {
  AlertTriangle,
  Anchor,
  CalendarClock,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  RefreshCw,
  Repeat,
  Search,
  Ship,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasVesselPremiumPlusFeatures } from '@/supabase/database/subscription-helpers';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { MiniStatTile } from '@/components/dashboard/mini-stat-tile';

import type { CrewRotation, RotationUnit } from '@/lib/types';
import {
  buildOffBoardDatesByUser,
  buildOwedDatesByUser,
  computeCrewOnboardSummary,
  formatRotationShort,
  getEndOfOnBlock,
  getNextRotationTransition,
  getRotationSegments,
  getRotationStatus,
  manualSignOffOverrideUntil,
  ONBOARD_TOGGLE_LEAVE_MARKER,
  type CrewDaysOwedPeriod,
  type OffBoardLeavePeriod,
  type RotationSegment,
  type RotationStatus,
} from '@/lib/crew-rotation';

// Re-export so any external callers (legacy imports from this page)
// continue to resolve. New code should import from `@/lib/crew-rotation`.
export { getRotationStatus, getRotationSegments };
export type { RotationSegment };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESETS = [
  { label: '2w / 2w', onValue: 2, onUnit: 'weeks' as RotationUnit, offValue: 2, offUnit: 'weeks' as RotationUnit },
  { label: '3m / 1m', onValue: 3, onUnit: 'months' as RotationUnit, offValue: 1, offUnit: 'months' as RotationUnit },
  { label: '6m / 6m', onValue: 6, onUnit: 'months' as RotationUnit, offValue: 6, offUnit: 'months' as RotationUnit },
  { label: '1m / 1m', onValue: 1, onUnit: 'months' as RotationUnit, offValue: 1, offUnit: 'months' as RotationUnit },
];

// ---------------------------------------------------------------------------
// Rotation math: shared with the sync route and the crew page via
// `@/lib/crew-rotation` (see the import block at the top of this file).
// `formatRotation` stays local because its pluralisation style is page-
// specific; the shared lib exposes `formatRotationShort` for badges.
// ---------------------------------------------------------------------------

function formatRotation(r: CrewRotation): string {
  return `${r.onValue}${r.onUnit[0]} on / ${r.offValue}${r.offUnit[0]} off`;
}

// ---------------------------------------------------------------------------
// TimelineGrid — individual day boxes with hover tooltip + per-row edit
// ---------------------------------------------------------------------------

interface TimelineGridProps {
  crewMembers:       CrewMemberRow[];
  rotations:         CrewRotation[];
  defaultRotation:   CrewRotation | null;
  /** Days recorded as off-board via manual sign-off (Onboard Tracker). */
  offBoardDatesByUser: Map<string, Set<string>>;
  /** Days recorded as owed to the vessel (override while rotation ON). */
  owedDatesByUser: Map<string, Set<string>>;
  rangeStart:        Date;
  rangeEnd:          Date;
  /** Increments to force a re-centre on today even when the year
   *  hasn't changed (e.g. clicking "Today" while already on the
   *  current year). */
  recenterToken:     number;
  onEditCrew:        (crewUserId: string | null) => void;
  onAdjustEndDate:   (crewUserId: string, newEndDate: string | null) => void;
}

// Build the list of days in the range (inclusive rangeStart, exclusive rangeEnd)
function buildDayList(rangeStart: Date, rangeEnd: Date): Date[] {
  const days: Date[] = [];
  let cursor = startOfDay(rangeStart);
  const end  = startOfDay(rangeEnd);
  while (cursor < end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

// Group consecutive days by calendar month for the header row
function buildMonthGroups(days: Date[]): Array<{ label: string; count: number }> {
  const groups: Array<{ label: string; count: number }> = [];
  for (const day of days) {
    const label = format(day, 'MMM yyyy');
    if (groups.length === 0 || groups[groups.length - 1].label !== label) {
      groups.push({ label, count: 1 });
    } else {
      groups[groups.length - 1].count++;
    }
  }
  return groups;
}

function TimelineGrid({
  crewMembers,
  rotations,
  defaultRotation,
  offBoardDatesByUser,
  owedDatesByUser,
  rangeStart,
  rangeEnd,
  recenterToken,
  onEditCrew,
  onAdjustEndDate,
}: TimelineGridProps) {
  const [tooltip, setTooltip] = useState<{
    crewIdx: number;
    dayIdx: number;
    date: Date;
    status: 'on' | 'off' | 'not-started' | 'none';
  } | null>(null);

  // Clicked cell for the end-date popover
  const [clickedCell, setClickedCell] = useState<{
    crewUserId: string;
    date: Date;
    hasRotation: boolean;
    currentEndDate: string | null;
  } | null>(null);

  // Close popover on Escape
  React.useEffect(() => {
    if (!clickedCell) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setClickedCell(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clickedCell]);

  const today = startOfDay(new Date());
  const days  = buildDayList(rangeStart, rangeEnd);
  const monthGroups = buildMonthGroups(days);

  // Cap display at 366 days (full leap year)
  const displayDays = days.slice(0, 366);

  // Fixed sizing for the year view: day cells wide enough for day
  // numbers in the header row, with slightly taller rows for readability.
  const cellW = 16;
  const cellH = 35;
  const showWeekday      = false;
  const showDayNumberAll = true;
  const showDayNumberSparse = false;

  // Width of the sticky name column — just enough for a name and
  // a short position underneath.
  const NAME_W = 160;

  // ---- Theme-aware palette ----------------------------------------
  // The previous palette used a very dark navy for "on board" that
  // disappeared against the dark-mode background. We pick brighter,
  // higher-contrast variants in dark mode while keeping the same
  // hues, and bump stripe opacity so off-board / override-off cells
  // read clearly without overwhelming the grid.
  const [isDark, setIsDark] = useState<boolean>(false);
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const palette = isDark
    ? {
        onBg: '#3b82f6',             // blue-500 — pops on dark bg
        joinBg: '#22c55e',           // green-500
        offBg: 'rgba(248,113,113,0.18)',
        offStripe: 'rgba(248,113,113,0.45)',
        overrideOnBg: '#fb923c',     // orange-400 — slightly lighter
        overrideOffBg: 'rgba(251,146,60,0.20)',
        overrideOffStripe: 'rgba(251,146,60,0.55)',
        owedBg: '#ca8a04',
        owedStripe: 'rgba(254,243,199,0.55)',
      }
    : {
        onBg: '#193656',             // navy — original
        joinBg: '#16a34a',           // emerald-600
        offBg: 'rgba(239,68,68,0.10)',
        offStripe: 'rgba(239,68,68,0.30)',
        overrideOnBg: '#f97316',     // orange-500
        overrideOffBg: 'rgba(249,115,22,0.12)',
        overrideOffStripe: 'rgba(249,115,22,0.40)',
        owedBg: '#eab308',
        owedStripe: 'rgba(120,53,15,0.35)',
      };

  // Scroll container ref — used to centre today on mount / year change.
  // Hydration of the timeline (resolving widths for ~365 cells) can lag
  // the first paint by a frame, so we run the centring inside a
  // requestAnimationFrame after a layout effect — that way the user
  // never sees the timeline at scrollLeft=0 briefly. The user is then
  // free to scroll to either end of the year; we only re-centre when
  // the year changes or the caller bumps `recenterToken`.
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (!scrollRef.current) return;

    const run = () => {
      const el = scrollRef.current;
      if (!el) return;
      const todayIdx = displayDays.findIndex((d) => d.getTime() === today.getTime());

      if (todayIdx < 0) {
        // Today is outside the visible year — start at the beginning
        // so the manager can manually scroll forwards or back.
        el.scrollLeft = 0;
        return;
      }
      // Centre today within the area visible to the right of the
      // sticky name column. Clamp so the start and end of the year
      // remain reachable by manual scrolling.
      const visibleW = Math.max(0, el.clientWidth - NAME_W);
      const cellCenterFromContentStart = todayIdx * cellW + cellW / 2;
      const desired = cellCenterFromContentStart - visibleW / 2;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollLeft = Math.max(0, Math.min(desired, maxScroll));
    };

    // rAF + a second frame in case fonts/borders re-layout briefly
    // after mount. Without this the inner scrollWidth can be wrong
    // on the very first paint, and today ends up flush-left.
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(run);
    });
    return () => {
      cancelAnimationFrame(id1);
      if (id2) cancelAnimationFrame(id2);
    };
  // Re-run whenever the year changes, cell sizing changes, or the
  // caller bumps the recenter token (e.g. clicking "Today" while
  // already on the current year).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart.getTime(), cellW, recenterToken]);

  return (
    <>
    <div ref={scrollRef} className="overflow-x-auto rounded-lg border border-border">
      <div style={{ minWidth: `${NAME_W + displayDays.length * cellW + 80}px` }}>

        {/* ── Month header band ── */}
        <div className="flex border-b border-border bg-muted/40">
          {/* Sticky name label */}
          <div
            className="shrink-0 sticky left-0 z-20 border-r border-border flex items-end pb-1 px-3 bg-[hsl(var(--muted))]"
            style={{ width: NAME_W }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Crew</span>
          </div>
          {/* Month spans */}
          <div className="flex">
            {monthGroups.map((g, i) => {
              const groupDays = Math.min(g.count, displayDays.length - monthGroups.slice(0, i).reduce((s, m) => s + m.count, 0));
              if (groupDays <= 0) return null;
              return (
                <div
                  key={i}
                  style={{ width: `${groupDays * cellW}px`, minWidth: `${groupDays * cellW}px` }}
                  className={[
                    'py-1.5 px-2 text-[11px] font-semibold text-foreground shrink-0 truncate',
                    i > 0 ? 'border-l border-border' : '',
                  ].join(' ')}
                >
                  {g.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Day-of-week + day-number header ──
            Density adapts to cell width: in 1m / 3m views we show the
            weekday letter and every day number; at 6m we only show day
            numbers on every 7th day; at 12m we only flag month starts. */}
        <div className="flex border-b border-border bg-muted/20">
          {/* Sticky spacer */}
          <div
            className="shrink-0 sticky left-0 z-20 border-r border-border bg-[hsl(var(--muted))]"
            style={{ width: NAME_W }}
          />
          {/* Day headers */}
          <div className="flex">
            {displayDays.map((day, di) => {
              const isToday    = day.getTime() === today.getTime();
              const isWeekend  = day.getDay() === 0 || day.getDay() === 6;
              const isMonStart = day.getDate() === 1;
              // What to show as the day number:
              //  - all days when cells are wide,
              //  - every 7th + month start when medium,
              //  - just month start when very narrow.
              const dayNumberVisible = showDayNumberAll
                ? true
                : showDayNumberSparse
                  ? (day.getDate() === 1 || day.getDate() % 7 === 0)
                  : isMonStart;

              return (
                <div
                  key={di}
                  style={{ width: `${cellW}px`, minWidth: `${cellW}px` }}
                  className={[
                    'flex flex-col items-center justify-center py-1 shrink-0 select-none',
                    isMonStart && di > 0 ? 'border-l border-border' : 'border-l border-border/30',
                    isWeekend ? 'bg-muted/30' : '',
                    isToday ? 'bg-primary/10' : '',
                  ].join(' ')}
                >
                  {showWeekday && (
                    <span className={[
                      'text-[9px] uppercase font-medium leading-none',
                      isToday ? 'text-primary' : 'text-muted-foreground/60',
                    ].join(' ')}>
                      {format(day, 'EEE')[0]}
                    </span>
                  )}
                  {dayNumberVisible ? (
                    <span className={[
                      'tabular-nums font-semibold leading-none',
                      showWeekday ? 'mt-0.5' : '',
                      isToday
                        ? 'text-primary font-bold text-[10px]'
                        : isWeekend
                        ? 'text-muted-foreground/70 text-[10px]'
                        : 'text-foreground/80 text-[10px]',
                    ].join(' ')}>
                      {format(day, 'd')}
                    </span>
                  ) : (
                    // Tiny tick to keep the bar visually balanced when
                    // most days have no number.
                    <span className="h-1 w-px bg-border/60" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Crew rows ── */}
        {/* `relative` so we can render a continuous "today" line
            spanning every row as an absolutely-positioned overlay. */}
        <div className="divide-y divide-border relative">
          {/* Today line — only when today falls within the visible range. */}
          {(() => {
            const todayIdx = displayDays.findIndex((d) => d.getTime() === today.getTime());
            if (todayIdx < 0) return null;
            return (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 z-20"
                style={{
                  left: NAME_W + todayIdx * cellW + cellW / 2 - 1,
                  width: 2,
                  background: 'linear-gradient(to bottom, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.4) 100%)',
                  boxShadow: '0 0 0 1px hsl(var(--primary) / 0.15)',
                }}
              />
            );
          })()}

          {crewMembers.map((cm, crewIdx) => {
            const override  = rotations.find(r => r.crewUserId === cm.userId);
            const effective = override ?? defaultRotation;
            const hasCustom = !!override;

            // Pre-compute status for every day
            const dayStatuses: Array<'on' | 'off' | 'not-started' | 'none'> = displayDays.map(day =>
              effective ? getRotationStatus(effective, day) : 'none',
            );

            // ---- Manual sign-off / days owed --------------------------------
            // Sync metadata only — not shown on the timeline grid.
            const recordedOffDates = offBoardDatesByUser.get(cm.userId);
            const owedDates = owedDatesByUser.get(cm.userId);
            const todayKey = format(today, 'yyyy-MM-dd');
            const hasActiveOwed = !!owedDates?.has(todayKey);
            const assignmentStart = cm.startDate
              ? startOfDay(parseISO(cm.startDate))
              : null;

            return (
              <div key={cm.userId} className="flex items-stretch group">
                {/* Name column — sticky */}
                <div
                  className="shrink-0 sticky left-0 z-10 border-r border-border flex items-center justify-between px-3 gap-2 transition-colors bg-[hsl(var(--card))] group-hover:bg-[hsl(var(--muted))]"
                  style={{ width: NAME_W, minHeight: cellH }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium truncate leading-tight">{cm.displayName}</p>
                      {cm.onboard && !hasActiveOwed && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
                          title="On board"
                        />
                      )}
                      {hasActiveOwed && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                          title="Days owed to vessel"
                        />
                      )}
                      {!cm.onboard && !hasActiveOwed && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-red-500/70 shrink-0"
                          title="Off board"
                        />
                      )}
                    </div>
                    {cm.position && (
                      <p className="text-[10px] text-muted-foreground truncate leading-tight">{cm.position}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditCrew(cm.userId)}
                    className="shrink-0 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                    title={hasCustom ? 'Edit rotation' : 'Set rotation'}
                  >
                    {hasCustom ? 'Edit ★' : 'Set'}
                  </button>
                </div>

                {/* Day cells */}
                <div className="flex">
                  {displayDays.map((day, di) => {
                    const status      = dayStatuses[di];
                    const dateKey     = format(day, 'yyyy-MM-dd');
                    const isToday     = day.getTime() === today.getTime();
                    const isMonStart  = day.getDate() === 1;
                    const isHovered   = tooltip?.crewIdx === crewIdx && tooltip?.dayIdx === di;
                    const isClicked   = clickedCell?.crewUserId === cm.userId && clickedCell?.date.getTime() === day.getTime();
                    const isJoinDay   = !!assignmentStart && day.getTime() === assignmentStart.getTime();
                    const isBeforeAssignment = assignmentStart ? day < assignmentStart : false;
                    // Recorded sign-off days persist on the timeline even
                    // after the crew member is toggled back on-board.
                    const isRecordedOff = !!recordedOffDates?.has(dateKey);
                    // Days owed to the vessel — rotation said ON but the
                    // crew member was manually signed off.
                    const isOwedDay = !isBeforeAssignment && !!owedDates?.has(dateKey);
                    // Signed off the boat (not counted as days owed).
                    const isOffBoardDay =
                      !isBeforeAssignment &&
                      !isOwedDay &&
                      (isRecordedOff || status === 'off' || (!cm.onboard && day.getTime() === today.getTime()));

                    let cellStyle: React.CSSProperties = {};
                    if (isBeforeAssignment) {
                      // Not on the vessel yet — leave uncoloured.
                      cellStyle = {};
                    } else if (isJoinDay) {
                      cellStyle = { backgroundColor: palette.joinBg, opacity: isHovered || isClicked ? 1 : 0.95 };
                    } else if (isOwedDay) {
                      cellStyle = {
                        backgroundColor: palette.owedBg,
                        backgroundImage:
                          `repeating-linear-gradient(-45deg, transparent, transparent 2px, ${palette.owedStripe} 2px, ${palette.owedStripe} 5px)`,
                        opacity: isHovered || isClicked ? 1 : 0.95,
                      };
                    } else if (isOffBoardDay) {
                      cellStyle = {
                        backgroundColor: palette.offBg,
                        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, ${palette.offStripe} 3px, ${palette.offStripe} 6px)`,
                        opacity: isHovered || isClicked ? 1 : 0.95,
                      };
                    } else if (status === 'on') {
                      cellStyle = { backgroundColor: palette.onBg, opacity: isHovered || isClicked ? 1 : 0.9 };
                    }

                    return (
                      <div
                        key={di}
                        style={{
                          width: `${cellW}px`,
                          minWidth: `${cellW}px`,
                          minHeight: `${cellH}px`,
                          ...cellStyle,
                        }}
                        className={[
                          'relative shrink-0',
                          effective ? 'cursor-pointer' : 'cursor-default',
                          (status === 'none' || status === 'not-started' || isBeforeAssignment) ? 'bg-muted/30' : '',
                          isMonStart && di > 0 ? 'border-l border-border' : 'border-l border-border/50',
                        ].join(' ')}
                        onMouseEnter={() => { if (!clickedCell) setTooltip({ crewIdx, dayIdx: di, date: day, status }); }}
                        onMouseLeave={() => { if (!clickedCell) setTooltip(null); }}
                        onClick={() => {
                          if (!effective) return;
                          setTooltip(null);
                          setClickedCell(prev =>
                            prev?.crewUserId === cm.userId && prev?.date.getTime() === day.getTime()
                              ? null
                              : { crewUserId: cm.userId, date: day, hasRotation: true, currentEndDate: effective.endDate ?? null }
                          );
                        }}
                      >
                        {/* End-date adjustment popover */}
                        {isClicked && (
                          <div
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-40"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="whitespace-nowrap rounded-md bg-popover border border-border shadow-lg px-3 py-2 text-[11px] leading-snug min-w-[180px]">
                              <p className="font-semibold text-foreground mb-1">{format(day, 'EEE, d MMM yyyy')}</p>
                              <p className="text-muted-foreground text-[10px] mb-1">
                                {effective!.endDate
                                  ? `Current sign-off: ${format(parseISO(effective!.endDate), 'd MMM yyyy')}`
                                  : 'Sign-off date not set (full rotation)'}
                              </p>
                              {!hasCustom && (
                                <p className="text-amber-600 dark:text-amber-400 text-[10px] mb-2">
                                  Uses vessel default — a personal override will be created.
                                </p>
                              )}
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  className="w-full text-left rounded px-2 py-1 text-[11px] font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                                  onClick={() => {
                                    onAdjustEndDate(cm.userId, format(day, 'yyyy-MM-dd'));
                                    setClickedCell(null);
                                  }}
                                >
                                  Set sign-off to this day
                                </button>
                                {effective!.endDate && (
                                  <button
                                    type="button"
                                    className="w-full text-left rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                                    onClick={() => {
                                      onAdjustEndDate(cm.userId, null);
                                      setClickedCell(null);
                                    }}
                                  >
                                    Clear sign-off (full rotation cycle)
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="w-full text-left rounded px-2 py-1 text-[11px] text-muted-foreground/70 hover:bg-muted transition-colors"
                                  onClick={() => setClickedCell(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
                          </div>
                        )}
                        {/* Hover tooltip — hidden when popover is open */}
                        {isHovered && !clickedCell && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 pointer-events-none">
                            <div className="whitespace-nowrap rounded-md bg-popover border border-border shadow-md px-2.5 py-1.5 text-[11px] leading-snug">
                              <p className="font-semibold text-foreground">{format(day, 'EEE, d MMM yyyy')}</p>
                              {isJoinDay && (
                                <p className="font-medium mt-0.5 text-emerald-600 dark:text-emerald-400">Joined vessel</p>
                              )}
                              {isBeforeAssignment ? (
                                <p className="font-medium mt-0.5 text-muted-foreground">Not yet on vessel</p>
                              ) : isOwedDay ? (
                                <>
                                  <p className="font-medium mt-0.5 text-amber-700 dark:text-amber-300">
                                    Day owed to vessel
                                  </p>
                                  <p className="text-muted-foreground/70 text-[10px] mt-0.5">
                                    Rotation expected on board
                                  </p>
                                </>
                              ) : isOffBoardDay ? (
                                <>
                                  <p className="font-medium mt-0.5 text-red-600 dark:text-red-400">
                                    Off board
                                  </p>
                                  {status === 'on' && (
                                    <p className="text-muted-foreground/70 text-[10px] mt-0.5">
                                      Rotation expected on board
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className={[
                                  'font-medium mt-0.5',
                                  status === 'on' ? 'text-foreground' : 'text-muted-foreground',
                                ].join(' ')}>
                                  {status === 'on'    ? 'On board'
                                  : status === 'off'  ? 'Off board'
                                  : status === 'none' ? 'No rotation'
                                  :                    'Not started'}
                                </p>
                              )}
                              {effective && !isBeforeAssignment && !isOwedDay && !isOffBoardDay && <p className="text-muted-foreground/70 text-[10px] mt-0.5">Click to adjust sign-off</p>}
                              {isToday && <p className="text-primary text-[10px]">Today</p>}
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>

    {/* ── Legend — outside scroll so it never scrolls.
        Swatches share the palette object above so they stay in
        lockstep with the actual cell colours in light + dark mode. */}
    <div className="flex items-center gap-5 px-1 py-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-7 rounded-sm" style={{ backgroundColor: palette.onBg, opacity: 0.9 }} />
        <span className="text-xs text-muted-foreground">On board</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="h-3 w-7 rounded-sm"
          style={{
            backgroundColor: palette.offBg,
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, ${palette.offStripe} 2px, ${palette.offStripe} 4px)`,
          }}
        />
        <span className="text-xs text-muted-foreground">Off board</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="h-3 w-7 rounded-sm"
          style={{
            backgroundColor: palette.owedBg,
            backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 2px, ${palette.owedStripe} 2px, ${palette.owedStripe} 4px)`,
          }}
        />
        <span className="text-xs text-muted-foreground">Days owed</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-7 rounded-sm" style={{ backgroundColor: palette.joinBg, opacity: 0.95 }} />
        <span className="text-xs text-muted-foreground">Joined vessel</span>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] text-primary">★</span>
        <span className="text-xs text-muted-foreground">Custom rotation</span>
      </div>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrewMemberRow {
  userId: string;
  displayName: string;
  position: string | null;
  assignmentId: string;
  onboard: boolean;
  startDate: string | null; // vessel assignment start date (YYYY-MM-DD)
  endDate: string | null; // null = current assignment
  /** ISO timestamp — while in the future, the rotation sync leaves
   *  this row alone (manager has manually overridden the pattern). */
  onboardOverrideUntil: string | null;
}

// ---------------------------------------------------------------------------
// CrewSummaryDetails — inline day-count breakdown for one crew member.
// ---------------------------------------------------------------------------

function CrewSummaryDetails({
  row,
  leavePeriods,
  owedDates,
  onViewTimeline,
}: {
  row: CrewMemberRow & {
    rotation: CrewRotation | null;
    todayStatus: RotationStatus | null;
    isConflict: boolean;
  };
  leavePeriods: Array<{ startDate: string; endDate: string }>;
  owedDates?: Set<string>;
  onViewTimeline?: () => void;
}) {
  const summary = useMemo(() => {
    return computeCrewOnboardSummary({
      assignmentStart: row.startDate,
      assignmentEndDate: row.endDate,
      rotation: row.rotation,
      leavePeriods,
      owedDates,
      currentlyOnboard: row.onboard,
    });
  }, [row, leavePeriods, owedDates]);

  const assignmentLabel = (() => {
    if (!row.startDate) return null;
    try {
      return format(parseISO(row.startDate), 'dd MMM yyyy');
    } catch {
      return null;
    }
  })();

  const throughLabel = row.endDate
    ? format(parseISO(summary.throughDate), 'dd MMM yyyy')
    : 'present';

  if (!row.startDate) {
    return (
      <p className="text-sm text-muted-foreground py-1">
        Set an assignment start date on the Crew page to see day counts.
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-3 pb-1">
      <div className="space-y-1 text-[11px] text-muted-foreground leading-snug">
        {assignmentLabel && (
          <p>
            {format(parseISO(row.startDate!), 'dd MMM yyyy')} – {throughLabel}
            {' · '}{summary.totalAssignmentDays} day{summary.totalAssignmentDays === 1 ? '' : 's'} on assignment
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/80">
          Same assignment window and leave counts as the Crew page.
        </p>
        {row.rotation ? (
          <p>
            Rotation: {formatRotationShort(row.rotation)}
            {row.todayStatus && row.todayStatus !== 'not-started' && (
              <> · today: {row.todayStatus === 'on' ? 'On' : 'Off'}</>
            )}
            {row.isConflict && (
              <span className="text-amber-600 dark:text-amber-400"> · out of sync with rotation</span>
            )}
          </p>
        ) : (
          <p className="italic">No rotation pattern — manual status only.</p>
        )}
      </div>

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Time on board
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <MiniStatTile
            label="Days on board"
            value={summary.daysOnBoard}
            tone="blue"
            hint="Present on the vessel"
          />
          <MiniStatTile
            label="Days on leave"
            value={summary.daysOnLeave}
            tone="green"
            hint="Vessel leave periods (Crew page)"
          />
          {row.rotation && summary.scheduledLeaveDays > 0 && (
            <MiniStatTile
              label="Scheduled leave"
              value={summary.scheduledLeaveDays}
              tone="muted"
              hint="Off per rotation pattern"
            />
          )}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Balance
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MiniStatTile
            label="Owes vessel"
            value={summary.daysOwedToVessel}
            tone="orange"
            hint="Signed off during scheduled on time"
          />
          <MiniStatTile
            label="Vessel owes"
            value={summary.daysVesselOwesCrew}
            tone="purple"
            hint="On board during scheduled leave"
          />
        </div>
      </div>

      {row.rotation && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Rotation schedule
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <MiniStatTile
              label="Scheduled on"
              value={summary.rotationOnDays}
              tone="blue"
              hint="Per rotation pattern"
            />
            <MiniStatTile
              label="Scheduled off"
              value={summary.rotationOffDays}
              tone="muted"
              hint="Scheduled leave days"
            />
          </div>
        </div>
      )}

      {onViewTimeline && (
        <Button variant="outline" size="sm" onClick={onViewTimeline}>
          View on timeline
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CurrentlyOnboardPanel — the live tracker.
//
// First thing the manager sees: a hero strip with how many crew are
// onboard right now, followed by a searchable list of every active
// assignment with an inline onboard toggle. Each row also surfaces the
// effective rotation pattern (when configured) plus a small warning
// when the manual toggle disagrees with what the rotation says today,
// so the manager knows the state will be reconciled on next sync.
//
// Toggle writes go through the same Supabase mutation as the crew page
// (`vessel_assignments.onboard`) — and the page's realtime subscription
// listens for those mutations from anywhere, so the two pages stay in
// lockstep without manual refresh.
// ---------------------------------------------------------------------------

interface CurrentlyOnboardPanelProps {
  crewMembers: CrewMemberRow[];
  rotations: CrewRotation[];
  defaultRotation: CrewRotation | null;
  isLoading: boolean;
  leavePeriods: OffBoardLeavePeriod[];
  offBoardDatesByUser: Map<string, Set<string>>;
  owedDatesByUser: Map<string, Set<string>>;
  /** Toggle handler — fires the DB update; UI updates via realtime. */
  onToggleOnboard: (assignmentId: string, currentValue: boolean) => Promise<void>;
  /** Tracks which assignment is currently being mutated for spinners. */
  togglingAssignmentId: string | null;
  /** Manual "Sync now" button — bidirectional reconcile with rotation. */
  onRunSync: () => void;
  isSyncing: boolean;
  /** Jump to the timeline tab for a crew member. */
  onViewTimeline?: (userId: string) => void;
}

function CurrentlyOnboardPanel({
  crewMembers,
  rotations,
  defaultRotation,
  isLoading,
  leavePeriods,
  offBoardDatesByUser,
  owedDatesByUser,
  onToggleOnboard,
  togglingAssignmentId,
  onRunSync,
  isSyncing,
  onViewTimeline,
}: CurrentlyOnboardPanelProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'onboard' | 'offboard' | 'conflict'>('all');
  const [expandedCrewId, setExpandedCrewId] = useState<string | null>(null);

  // ---- Per-row derived data ---------------------------------------------
  type Row = CrewMemberRow & {
    rotation: CrewRotation | null;
    todayStatus: RotationStatus | null;
    isConflict: boolean;
    /** True while a manual override is still in effect (set by the
     *  conflict dialog; expires at the next pattern transition). */
    overrideActive: boolean;
    /** Parsed expiry of the active override, for display. */
    overrideExpiresAt: Date | null;
  };

  const now = new Date();

  const rows: Row[] = crewMembers.map((cm) => {
    const override = rotations.find((r) => r.crewUserId === cm.userId);
    const rotation = override ?? defaultRotation ?? null;
    const todayStatus: RotationStatus | null = rotation ? getRotationStatus(rotation, now) : null;
    const overrideExpiresAt = cm.onboardOverrideUntil ? new Date(cm.onboardOverrideUntil) : null;
    const overrideActive = !!overrideExpiresAt && overrideExpiresAt > now;
    const isConflict =
      !!rotation &&
      todayStatus !== null &&
      todayStatus !== 'not-started' &&
      cm.onboard !== (todayStatus === 'on');
    return { ...cm, rotation, todayStatus, isConflict, overrideActive, overrideExpiresAt };
  });

  // ---- Aggregate counts (hero strip) ------------------------------------
  const total = rows.length;
  const onboardCount = rows.filter((r) => r.onboard).length;
  const offboardCount = total - onboardCount;
  const conflictCount = rows.filter((r) => r.isConflict).length;
  const onPct = total === 0 ? 0 : Math.round((onboardCount / total) * 100);

  // ---- Filter / sort ----------------------------------------------------
  const filtered = rows
    .filter((r) => {
      if (statusFilter === 'onboard' && !r.onboard) return false;
      if (statusFilter === 'offboard' && r.onboard) return false;
      if (statusFilter === 'conflict' && !r.isConflict) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        r.displayName.toLowerCase().includes(q) ||
        (r.position ?? '').toLowerCase().includes(q)
      );
    })
    // Conflicts first, then onboard, then by name.
    .sort((a, b) => {
      if (a.isConflict !== b.isConflict) return a.isConflict ? -1 : 1;
      if (a.onboard !== b.onboard) return a.onboard ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });


  return (
    <div className="space-y-6">
      {/* ---- Hero stat strip ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox
          icon={Ship}
          label="Currently onboard"
          value={`${onboardCount}`}
          hint={total > 0 ? `${onPct}% of ${total}` : 'No active crew'}
          tone="success"
        />
        <StatBox
          icon={Anchor}
          label="Off board"
          value={`${offboardCount}`}
          hint={total > 0 ? `${100 - onPct}% of ${total}` : '—'}
          tone={offboardCount > 0 ? 'danger' : 'muted'}
        />
        <StatBox
          icon={Repeat}
          label="On rotation"
          value={`${rows.filter((r) => r.rotation).length}`}
          hint={defaultRotation ? `Default: ${formatRotationShort(defaultRotation)}` : 'No vessel default'}
          tone="muted"
        />
        <StatBox
          icon={AlertTriangle}
          label="Out of sync"
          value={`${conflictCount}`}
          hint={
            conflictCount > 0
              ? 'Status differs from rotation'
              : 'All aligned with rotation'
          }
          tone={conflictCount > 0 ? 'warn' : 'muted'}
        />
      </div>

      {/* ---- Toolbar: search + filter + sync ---- */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search crew or position…"
                className="pl-8 h-9"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
                All
                <span className="ml-1.5 text-muted-foreground/70 tabular-nums">{total}</span>
              </FilterPill>
              <FilterPill active={statusFilter === 'onboard'} onClick={() => setStatusFilter('onboard')} tone="success">
                Onboard
                <span className="ml-1.5 tabular-nums">{onboardCount}</span>
              </FilterPill>
              <FilterPill active={statusFilter === 'offboard'} onClick={() => setStatusFilter('offboard')} tone="danger">
                Off board
                <span className="ml-1.5 tabular-nums">{offboardCount}</span>
              </FilterPill>
              {conflictCount > 0 && (
                <FilterPill
                  active={statusFilter === 'conflict'}
                  onClick={() => setStatusFilter('conflict')}
                  tone="warn"
                >
                  Out of sync
                  <span className="ml-1.5 tabular-nums">{conflictCount}</span>
                </FilterPill>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onRunSync} disabled={isSyncing}>
              {isSyncing
                ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Sync with rotation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Crew list ---- */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {total === 0
                ? 'No active crew members. Add crew from the Crew page first.'
                : query.trim()
                  ? 'No crew match your search.'
                  : 'No crew match this filter.'}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => (
                <CurrentlyOnboardRow
                  key={r.userId}
                  row={r}
                  isExpanded={expandedCrewId === r.userId}
                  onToggleExpanded={() =>
                    setExpandedCrewId((prev) => (prev === r.userId ? null : r.userId))
                  }
                  isToggling={togglingAssignmentId === r.assignmentId}
                  onToggle={() => onToggleOnboard(r.assignmentId, r.onboard)}
                  leavePeriods={leavePeriods
                    .filter((p) => p.crewUserId === r.userId)
                    .map(({ startDate, endDate }) => ({ startDate, endDate }))}
                  owedDates={owedDatesByUser.get(r.userId)}
                  onViewTimeline={
                    onViewTimeline ? () => onViewTimeline(r.userId) : undefined
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CurrentlyOnboardRow({
  row,
  isExpanded,
  onToggleExpanded,
  isToggling,
  onToggle,
  leavePeriods,
  owedDates,
  onViewTimeline,
}: {
  row: CrewMemberRow & {
    rotation: CrewRotation | null;
    todayStatus: RotationStatus | null;
    isConflict: boolean;
    overrideActive: boolean;
    overrideExpiresAt: Date | null;
  };
  isExpanded: boolean;
  onToggleExpanded: () => void;
  isToggling: boolean;
  onToggle: () => void;
  leavePeriods: Array<{ startDate: string; endDate: string }>;
  owedDates?: Set<string>;
  onViewTimeline?: () => void;
}) {
  const onboardSinceLabel = (() => {
    if (!row.startDate) return null;
    try {
      return `since ${format(parseISO(row.startDate), 'd MMM yyyy')}`;
    } catch {
      return null;
    }
  })();

  const expandId = `crew-summary-${row.userId}`;

  return (
    <li className={cn('transition-colors', isExpanded ? 'bg-muted/20' : 'hover:bg-muted/30')}>
      <div className="flex items-center gap-4 px-4 sm:px-6 py-3 group/row">
        {/* Status accent strip — green/red/orange per spec */}
        <span
          className={cn(
            'w-1 self-stretch rounded-full shrink-0 min-h-[2.5rem]',
            row.overrideActive
              ? 'bg-orange-500'
              : row.isConflict
                ? 'bg-amber-500'
                : row.onboard
                  ? 'bg-emerald-500'
                  : 'bg-red-500/70',
          )}
          aria-hidden
        />

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={expandId}
          className="min-w-0 flex-1 text-left rounded-md -my-1 py-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                isExpanded && 'rotate-180',
              )}
              aria-hidden
            />
            <p className="text-sm font-medium truncate">{row.displayName}</p>
            {row.position && (
              <Badge variant="secondary" className="text-[10px] font-medium">
                {row.position}
              </Badge>
            )}
            {row.onboard ? (
              <Badge className="text-[10px] font-medium uppercase tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15">
                <Ship className="h-2.5 w-2.5 mr-1" />
                Onboard
              </Badge>
            ) : (
              <Badge className="text-[10px] font-medium uppercase tracking-wide bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20 hover:bg-red-500/15">
                <Anchor className="h-2.5 w-2.5 mr-1" />
                Off board
              </Badge>
            )}
            {row.isConflict && !row.onboard && row.todayStatus === 'on' && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium uppercase tracking-wide border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              >
                <CalendarClock className="h-2.5 w-2.5 mr-1" />
                Days owed?
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap pl-5">
            {row.rotation && row.todayStatus && row.todayStatus !== 'not-started' && (
              <span
                className={cn(
                  row.isConflict && 'text-amber-600 dark:text-amber-400 font-medium',
                )}
              >
                Rotation: {formatRotationShort(row.rotation)} · today: {row.todayStatus === 'on' ? 'On' : 'Off'}
                {row.isConflict ? ' · status differs from rotation' : ''}
              </span>
            )}
            {!row.rotation && (
              <span className="italic">No rotation pattern · manual only</span>
            )}
            {onboardSinceLabel && (
              <span className="text-muted-foreground/70">· {onboardSinceLabel}</span>
            )}
          </p>
        </button>

        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={row.onboard}
            onCheckedChange={onToggle}
            disabled={isToggling}
            aria-label={row.onboard ? 'Mark off-board' : 'Mark onboard'}
          />
        </div>
      </div>

      <div
        id={expandId}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/60 px-4 sm:px-6 pb-4 pt-0 ml-5 sm:ml-6 mr-4 sm:mr-6">
            <CrewSummaryDetails
              row={row}
              leavePeriods={leavePeriods}
              owedDates={owedDates}
              onViewTimeline={onViewTimeline}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

// Small helper components used by the panel ---------------------------------

function StatBox({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  tone: 'primary' | 'muted' | 'warn' | 'success' | 'danger' | 'override';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        tone === 'primary'  && 'border-primary/30 bg-primary/5 dark:bg-primary/10',
        tone === 'warn'     && 'border-amber-300/60 bg-amber-50 dark:bg-amber-950/20',
        tone === 'muted'    && 'border-border bg-muted/30',
        tone === 'success'  && 'border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/20',
        tone === 'danger'   && 'border-red-300/60 bg-red-50 dark:bg-red-950/20',
        tone === 'override' && 'border-orange-300/60 bg-orange-50 dark:bg-orange-950/20',
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums',
          tone === 'primary'  && 'text-primary',
          tone === 'warn'     && 'text-amber-700 dark:text-amber-400',
          tone === 'success'  && 'text-emerald-700 dark:text-emerald-400',
          tone === 'danger'   && 'text-red-700 dark:text-red-400',
          tone === 'override' && 'text-orange-700 dark:text-orange-400',
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  tone = 'default',
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** 'warn' = amber (sync conflicts), 'override' = orange (manual overrides),
   *  'success' = green, 'danger' = red, default = primary. */
  tone?: 'default' | 'warn' | 'override' | 'success' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? tone === 'warn'
            ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
            : tone === 'override'
              ? 'border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200'
              : tone === 'success'
                ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                : tone === 'danger'
                  ? 'border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200'
                  : 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CrewRotationPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { supabase } = useSupabase();
  const { data: profileRaw, isLoading: isProfileLoading } = useDoc<Record<string, unknown>>(
    'users',
    user?.id,
  );

  const role            = (profileRaw?.role as string) || 'crew';
  const activeVesselId  = (profileRaw?.active_vessel_id as string) || null;

  // Auth guard — vessel managers and admins only
  useEffect(() => {
    if (isUserLoading || isProfileLoading) return;
    if (!user) { router.replace('/dashboard'); return; }
    if (profileRaw && role !== 'vessel' && role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [isUserLoading, isProfileLoading, user, profileRaw, role, router]);

  const hasPremiumPlusTier = useMemo(
    () => hasVesselPremiumPlusFeatures(profileRaw),
    [profileRaw],
  );

  // ---- Feature state ----
  const [rotations,   setRotations]   = useState<CrewRotation[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMemberRow[]>([]);
  const [leavePeriods, setLeavePeriods] = useState<OffBoardLeavePeriod[]>([]);
  const [daysOwedPeriods, setDaysOwedPeriods] = useState<CrewDaysOwedPeriod[]>([]);
  const [recordDaysOwed, setRecordDaysOwed] = useState(false);
  const [owedUntilMode, setOwedUntilMode] = useState<'rotation_block' | 'until_return'>('rotation_block');
  const [isLoading,   setIsLoading]   = useState(true);
  const [isSyncing,   setIsSyncing]   = useState(false);
  const [activeTab,   setActiveTab]   = useState('current');
  /** Which assignment is currently being toggled — for inline spinners. */
  const [togglingAssignmentId, setTogglingAssignmentId] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [dialogTarget,   setDialogTarget]   = useState<string | null>(null); // null = default
  const [formOnValue,    setFormOnValue]    = useState(3);
  const [formOnUnit,     setFormOnUnit]     = useState<RotationUnit>('months');
  const [formOffValue,   setFormOffValue]   = useState(1);
  const [formOffUnit,    setFormOffUnit]    = useState<RotationUnit>('months');
  const [formStartDate,  setFormStartDate]  = useState('');
  const [formEndDate,    setFormEndDate]    = useState('');
  const [formNotes,      setFormNotes]      = useState('');
  const [isSavingDialog, setIsSavingDialog] = useState(false);

  // ---- Timeline range -------------------------------------------------
  // The timeline always shows a full calendar year — paging is by year.
  // `timelineYear` is the calendar year currently in view.
  const [timelineYear, setTimelineYear] = useState<number>(() => new Date().getFullYear());

  // Bumped whenever we want the TimelineGrid to re-centre today even if
  // the year hasn't changed (e.g. user clicks "Today" while already on
  // the current year, or hits it again after scrolling away).
  const [recenterToken, setRecenterToken] = useState(0);

  // Timeline filter — applied to the rows that get rendered in the grid.
  // 'all' (default) shows everyone; the other three help managers focus
  // on specific subsets without leaving the page.
  type TimelineFilter = 'all' | 'onboard' | 'offboard' | 'owed';
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');

  const rangeStart = startOfDay(new Date(timelineYear, 0, 1));
  const rangeEnd   = startOfDay(new Date(timelineYear + 1, 0, 1));
  const rangeLabel = String(timelineYear);

  // ---- Derived ----
  const defaultRotation = rotations.find(r => r.crewUserId === null) ?? null;
  const trackerSignOffPeriods = useMemo(
    () => leavePeriods.filter((p) => p.notes?.startsWith(ONBOARD_TOGGLE_LEAVE_MARKER)),
    [leavePeriods],
  );
  const offBoardDatesByUser = useMemo(
    () => buildOffBoardDatesByUser(trackerSignOffPeriods),
    [trackerSignOffPeriods],
  );
  const owedDatesByUser = useMemo(() => {
    const rotationForCrew = (crewUserId: string) => {
      const override = rotations.find((r) => r.crewUserId === crewUserId);
      return override ?? defaultRotation ?? null;
    };
    return buildOwedDatesByUser(daysOwedPeriods, rotationForCrew);
  }, [daysOwedPeriods, rotations, defaultRotation]);

  // ---- Load data ----
  const loadData = useCallback(async () => {
    if (!activeVesselId || !supabase) return;
    setIsLoading(true);
    try {
      const [rotationsRes, assignmentsRes, leaveRes, owedRes] = await Promise.all([
        fetch(`/api/crew-rotation?vesselId=${activeVesselId}`).then(r => r.json()),
        supabase
          .from('vessel_assignments')
          .select('id, user_id, position, onboard, start_date, end_date, onboard_override_until')
          .eq('vessel_id', activeVesselId)
          .is('end_date', null),
        supabase
          .from('crew_leave_periods')
          .select('crew_user_id, start_date, end_date, notes')
          .eq('vessel_id', activeVesselId),
        supabase
          .from('crew_days_owed')
          .select('crew_user_id, start_date, end_date, scope')
          .eq('vessel_id', activeVesselId),
      ]);

      setRotations(rotationsRes.rotations ?? []);
      setLeavePeriods(
        (leaveRes.data ?? []).map((row: {
          crew_user_id: string;
          start_date: string;
          end_date: string;
          notes: string | null;
        }) => ({
          crewUserId: row.crew_user_id,
          startDate: row.start_date,
          endDate: row.end_date,
          notes: row.notes,
        })),
      );
      setDaysOwedPeriods(
        owedRes.error
          ? []
          : (owedRes.data ?? []).map((row: {
          crew_user_id: string;
          start_date: string;
          end_date: string;
          scope: 'rotation_block' | 'until_return';
        }) => ({
          crewUserId: row.crew_user_id,
          startDate: row.start_date,
          endDate: row.end_date,
          scope: row.scope,
        })),
      );

      const assignments = assignmentsRes.data ?? [];
      if (assignments.length > 0) {
        const userIds = assignments.map((a: any) => a.user_id);
        const { data: profiles } = await supabase
          .from('users')
          .select('id, first_name, last_name, email, role')
          .in('id', userIds);

        // Vessel accounts can show up here when the owner has a self
        // assignment, but they're not actually crew (and logically
        // always "on board"). Exclude them so the tracker only lists
        // real people.
        const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
        const filteredAssignments = assignments.filter((a: any) => {
          const p: any = profileMap.get(a.user_id);
          return p ? p.role !== 'vessel' : true;
        });

        setCrewMembers(
          filteredAssignments.map((a: any) => {
            const p: any = profileMap.get(a.user_id);
            const name = p
              ? [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
              : a.user_id;
            return {
              userId:               a.user_id,
              displayName:          name,
              position:             a.position ?? null,
              assignmentId:         a.id,
              onboard:              a.onboard ?? false,
              startDate:            a.start_date ?? null,
              endDate:              a.end_date ?? null,
              onboardOverrideUntil: a.onboard_override_until ?? null,
            };
          }),
        );
      } else {
        setCrewMembers([]);
      }
    } catch (err) {
      console.error('[CrewRotation] loadData error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeVesselId, supabase]);

  const refreshLeavePeriods = useCallback(async () => {
    if (!activeVesselId || !supabase) return;
    try {
      const { data } = await supabase
        .from('crew_leave_periods')
        .select('crew_user_id, start_date, end_date, notes')
        .eq('vessel_id', activeVesselId);

      setLeavePeriods(
        (data ?? []).map((row: {
          crew_user_id: string;
          start_date: string;
          end_date: string;
          notes: string | null;
        }) => ({
          crewUserId: row.crew_user_id,
          startDate: row.start_date,
          endDate: row.end_date,
          notes: row.notes,
        })),
      );
    } catch (err) {
      console.warn('[ONBOARD TRACKER] Could not refresh leave periods:', err);
    }
  }, [activeVesselId, supabase]);

  const refreshDaysOwedPeriods = useCallback(async () => {
    if (!activeVesselId || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('crew_days_owed')
        .select('crew_user_id, start_date, end_date, scope')
        .eq('vessel_id', activeVesselId);

      if (error) {
        console.warn('[ONBOARD TRACKER] Could not refresh days owed:', error.message);
        return;
      }

      setDaysOwedPeriods(
        (data ?? []).map((row: {
          crew_user_id: string;
          start_date: string;
          end_date: string;
          scope: 'rotation_block' | 'until_return';
        }) => ({
          crewUserId: row.crew_user_id,
          startDate: row.start_date,
          endDate: row.end_date,
          scope: row.scope,
        })),
      );
    } catch (err) {
      console.warn('[ONBOARD TRACKER] Days owed refresh exception:', err);
    }
  }, [activeVesselId, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ---- Sync ----
  const runSync = useCallback(async () => {
    if (!activeVesselId || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/crew-rotation/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vesselId: activeVesselId }),
      });
      const json = await res.json();
      const updated: Array<{ userId: string; from: boolean; to: boolean }> = json.updated ?? [];
      if (updated.length > 0) {
        const movedOn = updated.filter((u) => u.to === true).length;
        const movedOff = updated.filter((u) => u.to === false).length;
        const parts: string[] = [];
        if (movedOn > 0) parts.push(`${movedOn} moved on-board`);
        if (movedOff > 0) parts.push(`${movedOff} moved off-board`);
        toast({
          title: 'Rotation sync',
          description: parts.join(', ') + ' based on their rotation pattern.',
        });
        await loadData();
      }
    } catch (err) {
      console.error('[CrewRotation] sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [activeVesselId, isSyncing, loadData]);

  // Run sync once after initial load (only if rotations exist)
  const [hasSynced, setHasSynced] = useState(false);
  useEffect(() => {
    if (!isLoading && !hasSynced && rotations.length > 0) {
      setHasSynced(true);
      runSync();
    }
  }, [isLoading, hasSynced, rotations.length, runSync]);

  // ---- Conflict dialog state -------------------------------------------
  // Opened when a manager toggles a row whose new value disagrees with
  // the rotation pattern for today. They can either edit the rotation
  // or override the pattern until the next scheduled transition.
  const [conflictDialog, setConflictDialog] = useState<{
    member: CrewMemberRow;
    rotation: CrewRotation;
    todayStatus: 'on' | 'off';
    newValue: boolean;
    nextTransition: Date | null;
  } | null>(null);

  // ---- Auto leave-period bookkeeping -----------------------------------
  // Whenever a crew member is toggled off-board from this page we want
  // that absence to appear in their Leave Periods on the crew page (so
  // the vessel manager has a single source of truth for time away from
  // the boat). When they're toggled back on-board we close the most
  // recent auto-recorded period out so its length reflects reality.
  const recordLeaveFromToggle = useCallback(
    async (
      crewUserId: string,
      newOnboard: boolean,
      leaveEndDate: Date | null,
    ) => {
      if (!supabase || !activeVesselId || !user?.id) return;

      const today = startOfDay(new Date());
      const todayIso = format(today, 'yyyy-MM-dd');
      const openEndIso = format(
        leaveEndDate ?? manualSignOffOverrideUntil(today),
        'yyyy-MM-dd',
      );

      if (!newOnboard) {
        try {
          const { data: openLeaves, error: fetchErr } = await supabase
            .from('crew_leave_periods')
            .select('id, end_date')
            .eq('crew_user_id', crewUserId)
            .eq('vessel_id', activeVesselId)
            .gte('end_date', todayIso)
            .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`)
            .order('start_date', { ascending: false })
            .limit(1);

          if (fetchErr) {
            console.warn(
              '[ONBOARD TRACKER] Could not look up auto leave periods:',
              fetchErr.message,
            );
            return;
          }

          const open = openLeaves?.[0];
          if (open) {
            if (open.end_date < openEndIso) {
              await supabase
                .from('crew_leave_periods')
                .update({ end_date: openEndIso })
                .eq('id', open.id);
            }
            return;
          }

          const { error } = await supabase
            .from('crew_leave_periods')
            .insert({
              crew_user_id: crewUserId,
              vessel_id: activeVesselId,
              vessel_user_id: user.id,
              start_date: todayIso,
              end_date: openEndIso,
              notes: `${ONBOARD_TOGGLE_LEAVE_MARKER} Off-board via Onboard Tracker`,
            });
          if (error) {
            console.warn(
              '[ONBOARD TRACKER] Could not auto-record leave period:',
              error.message,
            );
          }
        } catch (err) {
          console.warn(
            '[ONBOARD TRACKER] Leave period insert exception:',
            err,
          );
        }
        return;
      }

      // Going on-board → close the most recent open auto-recorded leave.
      try {
        const { data: openLeaves, error: fetchErr } = await supabase
          .from('crew_leave_periods')
          .select('id, start_date, end_date, notes')
          .eq('crew_user_id', crewUserId)
          .eq('vessel_id', activeVesselId)
          .gte('end_date', todayIso)
          .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`)
          .order('start_date', { ascending: false })
          .limit(1);

        if (fetchErr) {
          console.warn(
            '[ONBOARD TRACKER] Could not look up auto leave periods:',
            fetchErr.message,
          );
          return;
        }

        const open = openLeaves?.[0];
        if (!open) return;

        if (open.start_date >= todayIso) {
          await supabase
            .from('crew_leave_periods')
            .delete()
            .eq('id', open.id);
        } else {
          const yesterdayIso = format(addDays(today, -1), 'yyyy-MM-dd');
          await supabase
            .from('crew_leave_periods')
            .update({ end_date: yesterdayIso })
            .eq('id', open.id);
        }
      } catch (err) {
        console.warn(
          '[ONBOARD TRACKER] Leave period close exception:',
          err,
        );
      }
    },
    [supabase, activeVesselId, user?.id],
  );

  const recordDaysOwedFromOverride = useCallback(
    async (
      crewUserId: string,
      rotation: CrewRotation,
      scope: 'rotation_block' | 'until_return',
    ): Promise<CrewDaysOwedPeriod | null> => {
      if (!supabase || !activeVesselId || !user?.id) return null;

      const today = startOfDay(new Date());
      const todayIso = format(today, 'yyyy-MM-dd');
      const blockEnd = getEndOfOnBlock(rotation, today);
      const endDate = scope === 'rotation_block'
        ? (blockEnd ?? today)
        : manualSignOffOverrideUntil(today);
      const endIso = format(endDate, 'yyyy-MM-dd');

      try {
        const { data: openRows, error: fetchErr } = await supabase
          .from('crew_days_owed')
          .select('id, end_date')
          .eq('crew_user_id', crewUserId)
          .eq('vessel_id', activeVesselId)
          .gte('end_date', todayIso)
          .order('start_date', { ascending: false })
          .limit(1);

        if (fetchErr) {
          console.warn('[ONBOARD TRACKER] Could not look up days owed:', fetchErr.message);
          return null;
        }

        const open = openRows?.[0];
        if (open) {
          if (open.end_date < endIso) {
            const { error: updateErr } = await supabase
              .from('crew_days_owed')
              .update({ end_date: endIso, scope })
              .eq('id', open.id);
            if (updateErr) return null;
          }
          return {
            crewUserId,
            startDate: todayIso,
            endDate: endIso,
            scope,
          };
        }

        const { error } = await supabase.from('crew_days_owed').insert({
          crew_user_id: crewUserId,
          vessel_id: activeVesselId,
          vessel_user_id: user.id,
          start_date: todayIso,
          end_date: endIso,
          scope,
          notes: 'Signed off while scheduled on board',
        });
        if (error) {
          console.warn('[ONBOARD TRACKER] Could not record days owed:', error.message);
          return null;
        }

        return {
          crewUserId,
          startDate: todayIso,
          endDate: endIso,
          scope,
        };
      } catch (err) {
        console.warn('[ONBOARD TRACKER] Days owed insert exception:', err);
        return null;
      }
    },
    [supabase, activeVesselId, user?.id],
  );

  const closeDaysOwedOnReturn = useCallback(
    async (crewUserId: string) => {
      if (!supabase || !activeVesselId) return;

      const today = startOfDay(new Date());
      const todayIso = format(today, 'yyyy-MM-dd');

      try {
        const { data: openRows, error: fetchErr } = await supabase
          .from('crew_days_owed')
          .select('id, start_date')
          .eq('crew_user_id', crewUserId)
          .eq('vessel_id', activeVesselId)
          .gte('end_date', todayIso)
          .order('start_date', { ascending: false })
          .limit(1);

        if (fetchErr || !openRows?.[0]) return;

        const open = openRows[0];
        if (open.start_date >= todayIso) {
          await supabase.from('crew_days_owed').delete().eq('id', open.id);
        } else {
          const yesterdayIso = format(addDays(today, -1), 'yyyy-MM-dd');
          await supabase
            .from('crew_days_owed')
            .update({ end_date: yesterdayIso })
            .eq('id', open.id);
        }
      } catch (err) {
        console.warn('[ONBOARD TRACKER] Days owed close exception:', err);
      }
    },
    [supabase, activeVesselId],
  );

  // ---- Low-level write --------------------------------------------------
  // Single funnel for every onboard mutation made from this page. It
  // updates the row optimistically (so the toggle is snappy) and
  // optionally writes `onboard_override_until` so the sync route will
  // honour the manual choice until that timestamp passes.
  const applyOnboardChange = useCallback(
    async (
      assignmentId: string,
      crewUserId: string,
      previousValue: boolean,
      newValue: boolean,
      overrideUntil: Date | null,
      leaveEndDate: Date | null = overrideUntil,
      skipSignOffLeave = false,
    ) => {
      if (!supabase) return;
      setTogglingAssignmentId(assignmentId);

      // Manual sign-off persists until toggled back on-board. Rotation
      // sync must not overwrite a signed-off crew member.
      const effectiveOverride = newValue
        ? null
        : (overrideUntil ?? manualSignOffOverrideUntil());
      const effectiveLeaveEnd = newValue
        ? null
        : (leaveEndDate ?? effectiveOverride);
      const overrideIso = effectiveOverride ? effectiveOverride.toISOString() : null;

      // Optimistic update
      setCrewMembers((prev) =>
        prev.map((m) =>
          m.assignmentId === assignmentId
            ? { ...m, onboard: newValue, onboardOverrideUntil: overrideIso }
            : m,
        ),
      );

      try {
        const { error } = await supabase
          .from('vessel_assignments')
          .update({ onboard: newValue, onboard_override_until: overrideIso })
          .eq('id', assignmentId);
        if (error) throw error;

        if (previousValue !== newValue) {
          if (!(skipSignOffLeave && !newValue)) {
            await recordLeaveFromToggle(crewUserId, newValue, effectiveLeaveEnd);
          }
          if (newValue) {
            await closeDaysOwedOnReturn(crewUserId);
          }
          await refreshLeavePeriods();
          await refreshDaysOwedPeriods();
        }
      } catch (err: any) {
        // Revert on failure
        setCrewMembers((prev) =>
          prev.map((m) =>
            m.assignmentId === assignmentId
              ? { ...m, onboard: previousValue }
              : m,
          ),
        );
        toast({
          title: 'Update failed',
          description: err?.message ?? 'Could not update onboard status.',
          variant: 'destructive',
        });
      } finally {
        setTogglingAssignmentId(null);
      }
    },
    [supabase, recordLeaveFromToggle, closeDaysOwedOnReturn, refreshLeavePeriods, refreshDaysOwedPeriods],
  );

  // ---- Toggle entry point ----------------------------------------------
  // If the new value matches the rotation for today (or there's no
  // rotation), apply immediately. Otherwise open the conflict dialog
  // so the manager can choose between editing the pattern and a
  // temporary override.
  const handleToggleOnboard = useCallback(
    async (assignmentId: string, currentValue: boolean) => {
      const member = crewMembers.find((m) => m.assignmentId === assignmentId);
      if (!member) return;
      const newValue = !currentValue;
      const override = rotations.find((r) => r.crewUserId === member.userId);
      const rotation = override ?? defaultRotation ?? null;
      const todayStatus = rotation ? getRotationStatus(rotation, new Date()) : null;

      // No active rotation → no possible conflict. Also clear any
      // stale override timestamp now that there's no pattern fighting
      // the manual flag.
      if (!rotation || todayStatus === null || todayStatus === 'not-started') {
        await applyOnboardChange(assignmentId, member.userId, currentValue, newValue, null);
        toast({
          title: newValue ? 'Marked onboard' : 'Marked off-board',
          description: 'Onboard status updated.',
        });
        return;
      }

      const rotationSaysOn = todayStatus === 'on';
      const matchesRotation = newValue === rotationSaysOn;

      if (matchesRotation) {
        const leaveUntil = !newValue
          ? getNextRotationTransition(rotation, new Date())
          : null;
        await applyOnboardChange(
          assignmentId,
          member.userId,
          currentValue,
          newValue,
          null,
          leaveUntil,
        );
        toast({
          title: newValue ? 'Marked onboard' : 'Marked off-board',
          description: 'Back in sync with the rotation pattern.',
        });
        return;
      }

      // Conflict → ask the manager what to do.
      setRecordDaysOwed(todayStatus === 'on' && !newValue);
      setOwedUntilMode('rotation_block');
      setConflictDialog({
        member,
        rotation,
        todayStatus,
        newValue,
        nextTransition: getNextRotationTransition(rotation, new Date()),
      });
    },
    [crewMembers, rotations, defaultRotation, applyOnboardChange],
  );

  // ---- Resolve a conflict -----------------------------------------------
  // "Override" path: apply the toggle and set `onboard_override_until`
  // to the next pattern transition. Until then, the sync route will
  // leave the row alone.
  const handleApplyOverride = useCallback(async () => {
    if (!conflictDialog) return;
    const { member, rotation, newValue, nextTransition, todayStatus } = conflictDialog;
    const shouldRecordOwed =
      recordDaysOwed && todayStatus === 'on' && !newValue;

    await applyOnboardChange(
      member.assignmentId,
      member.userId,
      member.onboard,
      newValue,
      nextTransition ?? addDays(new Date(), 365 * 5),
      undefined,
      shouldRecordOwed,
    );

    if (shouldRecordOwed) {
      const period = await recordDaysOwedFromOverride(
        member.userId,
        rotation,
        owedUntilMode,
      );
      if (period) {
        setDaysOwedPeriods((prev) => [
          ...prev.filter((p) => p.crewUserId !== member.userId),
          period,
        ]);
        await refreshDaysOwedPeriods();
        toast({
          title: 'Marked off board — days owed recorded',
          description: `${member.displayName}'s owed days are highlighted in gold on the timeline.`,
        });
      } else {
        await refreshLeavePeriods();
        toast({
          title: 'Days owed could not be saved',
          description:
            'The off-board status was updated, but owed days were not recorded. Run sql/create-crew-days-owed.sql in Supabase if you have not already.',
          variant: 'destructive',
        });
      }
    } else {
      const desc = nextTransition
        ? `${member.displayName} will stay ${newValue ? 'on board' : 'off board'} until ${format(nextTransition, 'd MMM yyyy')}.`
        : `${member.displayName} is now marked ${newValue ? 'on board' : 'off board'}.`;
      toast({ title: 'Status updated', description: desc });
    }

    setConflictDialog(null);
    setRecordDaysOwed(false);
  }, [
    conflictDialog,
    applyOnboardChange,
    recordDaysOwed,
    owedUntilMode,
    recordDaysOwedFromOverride,
    refreshDaysOwedPeriods,
  ]);

  // "Edit pattern" path: close the conflict dialog and open the
  // existing rotation editor pre-targeted at this crew member.
  const handleOpenRotationEditor = useCallback(() => {
    if (!conflictDialog) return;
    const userId = conflictDialog.member.userId;
    setConflictDialog(null);
    openDialog(userId);
  }, [conflictDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Realtime sync ----------------------------------------------------
  // Subscribe to vessel_assignments changes for this vessel so that any
  // toggle made elsewhere (the crew page, another tab, an admin action)
  // is reflected here immediately without manual refresh. This is what
  // turns this screen into a true live tracker.
  useEffect(() => {
    if (!supabase || !activeVesselId) return;
    const channel = supabase
      .channel(`onboard-tracker-${activeVesselId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'vessel_assignments',
          filter: `vessel_id=eq.${activeVesselId}`,
        },
        (payload: any) => {
          const row = payload?.new ?? payload?.old;
          if (!row) return;
          // For UPDATE: patch the local row if we know about it.
          if (payload.eventType === 'UPDATE' && row?.id) {
            setCrewMembers((prev) =>
              prev.map((m) =>
                m.assignmentId === row.id
                  ? {
                      ...m,
                      onboard:              row.onboard ?? false,
                      position:             row.position ?? m.position,
                      startDate:            row.start_date ?? m.startDate,
                      endDate:              row.end_date ?? m.endDate,
                      onboardOverrideUntil: row.onboard_override_until ?? null,
                    }
                  : m,
              ),
            );
            return;
          }
          // For INSERT/DELETE the membership list shifts — re-fetch.
          loadData();
        },
      )
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'crew_leave_periods',
          filter: `vessel_id=eq.${activeVesselId}`,
        },
        () => {
          refreshLeavePeriods();
        },
      )
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'crew_days_owed',
          filter: `vessel_id=eq.${activeVesselId}`,
        },
        () => {
          refreshDaysOwedPeriods();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, activeVesselId, loadData, refreshLeavePeriods, refreshDaysOwedPeriods]);

  // Re-fetch when the user returns to this tab — cheap belt-and-braces
  // in case the realtime websocket missed a beat.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadData]);

  // ---- Dialog handlers ----
  const openDialog = (crewUserId: string | null) => {
    setDialogTarget(crewUserId);
    const existing = crewUserId === null
      ? rotations.find(r => r.crewUserId === null)
      : rotations.find(r => r.crewUserId === crewUserId);

    if (existing) {
      setFormOnValue(existing.onValue);
      setFormOnUnit(existing.onUnit);
      setFormOffValue(existing.offValue);
      setFormOffUnit(existing.offUnit);
      setFormStartDate(existing.startDate);
      setFormEndDate(existing.endDate ?? '');
      setFormNotes(existing.notes ?? '');
    } else {
      setFormOnValue(3);
      setFormOnUnit('months');
      setFormOffValue(1);
      setFormOffUnit('months');
      // Default start date to the crew member's vessel join date (if available)
      const crewRow = crewUserId ? crewMembers.find(c => c.userId === crewUserId) : null;
      setFormStartDate(crewRow?.startDate ?? format(new Date(), 'yyyy-MM-dd'));
      setFormEndDate('');
      setFormNotes('');
    }

    setDialogOpen(true);
  };

  const handleSaveRotation = async () => {
    if (!activeVesselId || isSavingDialog) return;
    if (!formStartDate) {
      toast({ title: 'Reference start date is required', variant: 'destructive' });
      return;
    }
    setIsSavingDialog(true);
    try {
      const existingRotation = dialogTarget === null
        ? rotations.find(r => r.crewUserId === null)
        : rotations.find(r => r.crewUserId === dialogTarget);

      const payload = {
        vesselId:   activeVesselId,
        crewUserId: dialogTarget ?? null,
        onValue:    formOnValue,
        onUnit:     formOnUnit,
        offValue:   formOffValue,
        offUnit:    formOffUnit,
        startDate:  formStartDate,
        endDate:    formEndDate || null,
        notes:      formNotes || null,
      };

      let res: Response;
      if (existingRotation) {
        res = await fetch(`/api/crew-rotation/${existingRotation.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/crew-rotation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save rotation');
      }

      // The rotation pattern has been changed — clear any stale
      // override timestamp on this crew's assignment(s) so the new
      // pattern can take effect right away. (For the vessel default
      // we leave per-crew overrides alone; those were intentional.)
      if (dialogTarget !== null && supabase) {
        try {
          await supabase
            .from('vessel_assignments')
            .update({ onboard_override_until: null })
            .eq('vessel_id', activeVesselId)
            .eq('user_id', dialogTarget)
            .is('end_date', null);
        } catch (clearErr) {
          console.warn('[CrewRotation] could not clear override after rotation save:', clearErr);
        }
      }

      toast({ title: 'Rotation saved' });
      setDialogOpen(false);
      await loadData();
      // Re-sync after changing rotations
      setHasSynced(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingDialog(false);
    }
  };

  const handleAdjustEndDate = async (crewUserId: string, newEndDate: string | null) => {
    const override       = rotations.find(r => r.crewUserId === crewUserId);
    const hasOverride    = !!override;
    const effectiveRotation = override ?? defaultRotation;

    if (!effectiveRotation) {
      toast({ title: 'No rotation found for this crew member', variant: 'destructive' });
      return;
    }

    if (hasOverride) {
      // ── Case 1: crew member already has a personal override — just PATCH it ──
      // Optimistic update
      setRotations(prev =>
        prev.map(r => r.id === override!.id ? { ...r, endDate: newEndDate } : r),
      );
      try {
        const res = await fetch(`/api/crew-rotation/${override!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endDate: newEndDate }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          // Revert
          setRotations(prev =>
            prev.map(r => r.id === override!.id ? { ...r, endDate: override!.endDate } : r),
          );
          throw new Error(err.error || 'Failed to update');
        }
        toast({
          title: newEndDate
            ? `Sign-off set to ${format(parseISO(newEndDate), 'd MMM yyyy')}`
            : 'Sign-off cleared — full rotation cycle restored',
        });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    } else {
      // ── Case 2: crew member uses the vessel default — create a personal override ──
      // Copy default values but apply the requested end date, so only this
      // crew member is affected (the shared default is never touched).
      const tempId = `temp-${crewUserId}`;
      const optimisticOverride: CrewRotation = {
        id:          tempId,
        vesselId:    activeVesselId!,
        crewUserId,
        onUnit:      effectiveRotation.onUnit,
        onValue:     effectiveRotation.onValue,
        offUnit:     effectiveRotation.offUnit,
        offValue:    effectiveRotation.offValue,
        startDate:   effectiveRotation.startDate,
        endDate:     newEndDate,
        notes:       null,
      };
      // Optimistic insert
      setRotations(prev => [...prev, optimisticOverride]);
      try {
        const res = await fetch('/api/crew-rotation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vesselId:   activeVesselId,
            crewUserId,
            onUnit:     effectiveRotation.onUnit,
            onValue:    effectiveRotation.onValue,
            offUnit:    effectiveRotation.offUnit,
            offValue:   effectiveRotation.offValue,
            startDate:  effectiveRotation.startDate,
            endDate:    newEndDate,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          // Revert optimistic insert
          setRotations(prev => prev.filter(r => r.id !== tempId));
          throw new Error(err.error || 'Failed to create override');
        }
        const json = await res.json();
        // Replace the temp entry with the real one from the server
        setRotations(prev =>
          prev.map(r => r.id === tempId ? json.rotation : r),
        );
        toast({
          title: newEndDate
            ? `Sign-off set to ${format(parseISO(newEndDate), 'd MMM yyyy')}`
            : 'Sign-off cleared — full rotation cycle',
          description: 'Personal override created — vessel default is unchanged.',
        });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    }
  };

  const handleDeleteRotation = async (rotationId: string) => {
    try {
      const res = await fetch(`/api/crew-rotation/${rotationId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ title: 'Rotation removed' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // ---- Loading / redirect guard ----
  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role === 'vessel' && !hasPremiumPlusTier) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <VesselPremiumFeatureGate
          title="Available on Vessel Premium"
          featureLabel="Onboard Tracker"
          description="Track who is on board, rotation patterns, leave, and days owed — synced with your crew roster in real time."
        />
      </div>
    );
  }

  if (!activeVesselId && role === 'vessel') {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No active vessel found. Set up a vessel from the Vessels page first.
      </div>
    );
  }

  // Currently-onboard count for the header pill
  const currentOnboardCount = crewMembers.filter((m) => m.onboard).length;
  const totalCrew = crewMembers.length;

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">Onboard Tracker</h1>
              {!isLoading && totalCrew > 0 && (
                <Badge variant="secondary" className="text-xs font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                  {currentOnboardCount} of {totalCrew} onboard now
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live view of who&apos;s on board right now — synced with the crew page in real time, backed by rotation patterns.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setHasSynced(false); runSync(); }}
          disabled={isSyncing}
        >
          {isSyncing
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <RefreshCw className="mr-2 h-4 w-4" />}
          Sync with rotation
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="current">Currently Onboard</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="setup">Rotation Patterns</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 0: Currently Onboard (live tracker)                          */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="current" className="mt-4">
          <CurrentlyOnboardPanel
            crewMembers={crewMembers}
            rotations={rotations}
            defaultRotation={defaultRotation}
            isLoading={isLoading}
            leavePeriods={leavePeriods}
            offBoardDatesByUser={offBoardDatesByUser}
            owedDatesByUser={owedDatesByUser}
            onToggleOnboard={handleToggleOnboard}
            togglingAssignmentId={togglingAssignmentId}
            onRunSync={() => { setHasSynced(false); runSync(); }}
            isSyncing={isSyncing}
            onViewTimeline={() => setActiveTab('timeline')}
          />
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 1: Setup                                                     */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="setup" className="space-y-6 mt-4">

          {/* Vessel Default */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Vessel Default Rotation</CardTitle>
                <CardDescription>
                  Applied to all crew members who don&apos;t have a personal override.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => openDialog(null)}>
                {defaultRotation ? 'Edit' : 'Set Default'}
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              ) : defaultRotation ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    {formatRotation(defaultRotation)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    from {format(parseISO(defaultRotation.startDate), 'd MMM yyyy')}
                  </span>
                  {defaultRotation.notes && (
                    <span className="text-xs text-muted-foreground italic">
                      — {defaultRotation.notes}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteRotation(defaultRotation.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No vessel default set. All crew will show as unscheduled until a rotation is configured.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Per-crew overrides */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-Crew Overrides</CardTitle>
              <CardDescription>
                Custom rotation for individual crew members. Others use the vessel default.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : crewMembers.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No active crew members found. Add crew from the Crew page first.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crew member</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Rotation</TableHead>
                      <TableHead>Status today</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crewMembers.map(cm => {
                      const override  = rotations.find(r => r.crewUserId === cm.userId);
                      const effective = override ?? defaultRotation;
                      const todayStatus = effective
                        ? getRotationStatus(effective, new Date())
                        : null;
                      // Active manual override (set from the Currently
                      // Onboard tab). While in effect, the actual
                      // `onboard` value is what's shown; the rotation
                      // prediction is only sub-text context.
                      const overrideExpiresAt = cm.onboardOverrideUntil
                        ? new Date(cm.onboardOverrideUntil)
                        : null;
                      const overrideActive = !!overrideExpiresAt && overrideExpiresAt > new Date();

                      return (
                        <TableRow key={cm.userId}>
                          <TableCell className="font-medium">{cm.displayName}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {cm.position ?? '—'}
                          </TableCell>
                          <TableCell>
                            {override ? (
                              <Badge>
                                {formatRotation(override)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                vessel default
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* Real status (matches the Currently Onboard
                                tab and the Timeline). Rotation prediction
                                is the secondary sub-line when it differs. */}
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {cm.onboard ? (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15">
                                    <Ship className="h-2.5 w-2.5 mr-1" />
                                    Onboard
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20 hover:bg-red-500/15">
                                    <Anchor className="h-2.5 w-2.5 mr-1" />
                                    Off board
                                  </Badge>
                                )}
                                {overrideActive && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                                    title={
                                      overrideExpiresAt
                                        ? `Override active until ${format(overrideExpiresAt, 'd MMM yyyy')}`
                                        : 'Override active'
                                    }
                                  >
                                    <CalendarClock className="h-2.5 w-2.5 mr-1" />
                                    Override
                                  </Badge>
                                )}
                              </div>
                              {effective && todayStatus && todayStatus !== 'not-started' && (
                                <span
                                  className={cn(
                                    'text-[10px] leading-tight',
                                    cm.onboard === (todayStatus === 'on')
                                      ? 'text-muted-foreground'
                                      : 'text-amber-600 dark:text-amber-400',
                                  )}
                                >
                                  Pattern: {todayStatus === 'on' ? 'On' : 'Off'}
                                  {overrideActive && overrideExpiresAt
                                    ? ` · resumes ${format(overrideExpiresAt, 'd MMM yyyy')}`
                                    : cm.onboard !== (todayStatus === 'on')
                                      ? ' · disagrees with status'
                                      : ''}
                                </span>
                              )}
                              {effective && todayStatus === 'not-started' && (
                                <span className="text-[10px] text-muted-foreground">Pattern not started</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDialog(cm.userId)}
                              >
                                {override ? 'Edit' : 'Set'}
                              </Button>
                              {override && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteRotation(override.id)}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Tab 2: Timeline                                                  */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="timeline" className="space-y-4 mt-4">
          {(() => {
            const today = startOfDay(new Date());
            const todayInRange = today >= rangeStart && today < rangeEnd;
            const currentYear = new Date().getFullYear();
            const goPrev  = () => setTimelineYear((y) => y - 1);
            const goNext  = () => setTimelineYear((y) => y + 1);
            const goToday = () => {
              setTimelineYear(currentYear);
              // Force re-centre even when already on the current year.
              setRecenterToken((t) => t + 1);
            };

            // Active crew counts for the summary strip — driven by the
            // same data already on the page so we don't double-fetch.
            const onboardNow = crewMembers.filter((c) => c.onboard).length;
            const todayIso = format(startOfDay(new Date()), 'yyyy-MM-dd');
            const owedCrewIds = new Set(
              daysOwedPeriods
                .filter((p) => p.endDate >= todayIso)
                .map((p) => p.crewUserId),
            );
            const owedNow = owedCrewIds.size;

            // Apply the in-view filter, then group/sort by department
            // (position). Crew without a position fall to the end.
            const filteredCrew = crewMembers
              .filter((c) => {
                if (timelineFilter === 'onboard') return c.onboard;
                if (timelineFilter === 'offboard') return !c.onboard;
                if (timelineFilter === 'owed') return owedCrewIds.has(c.userId);
                return true;
              })
              .slice()
              .sort((a, b) => {
                const posA = (a.position ?? '').trim().toLowerCase();
                const posB = (b.position ?? '').trim().toLowerCase();
                if (!posA && posB) return 1;
                if (posA && !posB) return -1;
                if (posA !== posB) return posA.localeCompare(posB);
                return a.displayName.localeCompare(b.displayName);
              });

            // Year options for the dropdown — 6 years before, current, 6 after.
            const yearOptions: number[] = [];
            for (let y = currentYear - 6; y <= currentYear + 6; y++) yearOptions.push(y);

            return (
              <>
                {/* Toolbar — year navigation + filters
                    Two labelled sections (Year · Filter) separated by a
                    subtle top border on the filter row. */}
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    {/* ── Year navigation ── */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide shrink-0">
                        Year
                      </span>
                      <Select
                        value={String(timelineYear)}
                        onValueChange={(v) => setTimelineYear(Number(v))}
                      >
                        <SelectTrigger className="h-8 px-2.5 text-xs font-medium tabular-nums gap-1 min-w-[88px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {yearOptions.map((y) => (
                            <SelectItem key={y} value={String(y)} className="text-xs tabular-nums">
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-0.5">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Previous year">
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Next year">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>

                      <Button
                        variant={todayInRange ? 'ghost' : 'default'}
                        size="sm"
                        onClick={goToday}
                        className="h-8"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Today
                      </Button>

                      <div className="ml-auto text-right hidden sm:block">
                        <p className="text-xs font-semibold leading-none">{rangeLabel}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                          {todayInRange ? 'Includes today' : `Today is in ${currentYear}`}
                        </p>
                      </div>
                    </div>

                    {/* ── Filter ── */}
                    <div className="mt-3 pt-3 border-t flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide mr-1">
                        Filter
                      </span>
                      <FilterPill active={timelineFilter === 'all'} onClick={() => setTimelineFilter('all')}>
                        All
                        <span className="ml-1.5 text-muted-foreground/70 tabular-nums">{crewMembers.length}</span>
                      </FilterPill>
                      <FilterPill active={timelineFilter === 'onboard'} onClick={() => setTimelineFilter('onboard')} tone="success">
                        Onboard
                        <span className="ml-1.5 tabular-nums">{onboardNow}</span>
                      </FilterPill>
                      <FilterPill active={timelineFilter === 'offboard'} onClick={() => setTimelineFilter('offboard')} tone="danger">
                        Off board
                        <span className="ml-1.5 tabular-nums">{crewMembers.length - onboardNow}</span>
                      </FilterPill>
                      {owedNow > 0 && (
                        <FilterPill active={timelineFilter === 'owed'} onClick={() => setTimelineFilter('owed')} tone="warn">
                          Days owed
                          <span className="ml-1.5 tabular-nums">{owedNow}</span>
                        </FilterPill>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline chart */}
                <Card>
                  <CardContent className="pt-4">
                    {isLoading ? (
                      <div className="space-y-3 min-w-[600px]">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                        ))}
                      </div>
                    ) : crewMembers.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No active crew members found.
                      </p>
                    ) : filteredCrew.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No crew match the current filter.
                      </p>
                    ) : (
                      <TimelineGrid
                        crewMembers={filteredCrew}
                        rotations={rotations}
                        defaultRotation={defaultRotation}
                        offBoardDatesByUser={offBoardDatesByUser}
                        owedDatesByUser={owedDatesByUser}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        recenterToken={recenterToken}
                        onEditCrew={openDialog}
                        onAdjustEndDate={handleAdjustEndDate}
                      />
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------------ */}
      {/* Conflict resolution dialog                                          */}
      {/*                                                                    */}
      {/* Shown when a manual toggle disagrees with what the rotation        */}
      {/* says today. Two paths: edit the rotation pattern, or override      */}
      {/* it until the next scheduled transition.                            */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={!!conflictDialog}
        onOpenChange={(open) => { if (!open) setConflictDialog(null); }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Rotation pattern conflict
            </DialogTitle>
            <DialogDescription className="pt-1">
              {conflictDialog && (
                <>
                  The current rotation pattern says{' '}
                  <span className="font-semibold text-foreground">
                    {conflictDialog.member.displayName}
                  </span>{' '}
                  should be{' '}
                  <span
                    className={cn(
                      'font-semibold',
                      conflictDialog.todayStatus === 'on'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {conflictDialog.todayStatus === 'on' ? 'on board' : 'off board'}
                  </span>{' '}
                  today, but you&apos;re marking them as{' '}
                  <span
                    className={cn(
                      'font-semibold',
                      conflictDialog.newValue
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {conflictDialog.newValue ? 'on board' : 'off board'}
                  </span>
                  . How should we handle this?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {conflictDialog && (
            <div className="space-y-3 mt-2">
              {/* Option 1 — Sign off while rotation says on board */}
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <button
                  type="button"
                  onClick={handleApplyOverride}
                  className="w-full text-left hover:opacity-95 transition-opacity"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 h-9 w-9 rounded-lg bg-muted text-foreground flex items-center justify-center">
                      <CalendarClock className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        Mark {conflictDialog.newValue ? 'on board' : 'off board'} anyway
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {conflictDialog.newValue ? (
                          <>Set {conflictDialog.member.displayName.split(' ')[0]} as on board even though the rotation says off board today.</>
                        ) : (
                          <>
                            Set {conflictDialog.member.displayName.split(' ')[0]} as off board even though the rotation says on board today
                            {conflictDialog.nextTransition ? (
                              <> until {format(conflictDialog.nextTransition, 'd MMM yyyy')}</>
                            ) : null}
                            .
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </button>

                {conflictDialog.todayStatus === 'on' && !conflictDialog.newValue && (
                  <div
                    className="rounded-lg border border-amber-300/70 dark:border-amber-700/70 bg-amber-50/80 dark:bg-amber-950/20 p-3 space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="record-days-owed"
                        checked={recordDaysOwed}
                        onCheckedChange={(checked) => setRecordDaysOwed(checked === true)}
                      />
                      <div className="space-y-1">
                        <Label htmlFor="record-days-owed" className="text-sm font-medium cursor-pointer">
                          Record as days owed to the vessel
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Highlights missed onboard days in gold on the timeline instead of off board.
                        </p>
                      </div>
                    </div>

                    {recordDaysOwed && (
                      <div className="space-y-2 pl-7">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="owed-until-mode"
                            className="mt-0.5"
                            checked={owedUntilMode === 'rotation_block'}
                            onChange={() => setOwedUntilMode('rotation_block')}
                          />
                          <span className="text-xs leading-relaxed">
                            <span className="font-medium">Remaining days in this onboard block</span>
                            {(() => {
                              const blockEnd = getEndOfOnBlock(conflictDialog.rotation, new Date());
                              if (!blockEnd) return null;
                              const count = differenceInDays(blockEnd, startOfDay(new Date())) + 1;
                              return (
                                <span className="text-muted-foreground">
                                  {' '}— {count} day{count === 1 ? '' : 's'} until{' '}
                                  {format(blockEnd, 'd MMM yyyy')}
                                </span>
                              );
                            })()}
                          </span>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="owed-until-mode"
                            className="mt-0.5"
                            checked={owedUntilMode === 'until_return'}
                            onChange={() => setOwedUntilMode('until_return')}
                          />
                          <span className="text-xs leading-relaxed">
                            <span className="font-medium">Until they return on board</span>
                            <span className="text-muted-foreground">
                              {' '}— keeps accruing owed days until you toggle them back onboard
                            </span>
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Option 2 — Edit the rotation pattern */}
              <button
                type="button"
                onClick={handleOpenRotationEditor}
                className="w-full text-left rounded-xl border border-border hover:bg-muted/40 transition-colors p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Pencil className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      Change the rotation pattern
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Open the rotation editor for{' '}
                      {conflictDialog.member.displayName.split(' ')[0]} so the
                      pattern itself reflects the new schedule going forward.
                    </p>
                  </div>
                </div>
              </button>

              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={() => setConflictDialog(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Rotation dialog                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {dialogTarget === null ? 'Vessel Default Rotation' : 'Crew Member Rotation Override'}
            </DialogTitle>
            <DialogDescription>
              {dialogTarget === null
                ? 'Set the vessel-wide default ON/OFF pattern applied to all crew without an override.'
                : `Set a custom rotation for ${crewMembers.find(c => c.userId === dialogTarget)?.displayName ?? 'this crew member'}.`}
            </DialogDescription>
          </DialogHeader>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-xs text-muted-foreground self-center mr-1">Presets:</span>
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFormOnValue(p.onValue);  setFormOnUnit(p.onUnit);
                  setFormOffValue(p.offValue); setFormOffUnit(p.offUnit);
                }}
                className="rounded-full border border-border px-3 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-3">
            {/* On period */}
            <div className="space-y-1.5">
              <Label>On period</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={formOnValue}
                  onChange={e => setFormOnValue(Math.max(1, Number(e.target.value)))}
                  className="w-20"
                />
                <Select value={formOnUnit} onValueChange={v => setFormOnUnit(v as RotationUnit)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">days</SelectItem>
                    <SelectItem value="weeks">weeks</SelectItem>
                    <SelectItem value="months">months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Off period */}
            <div className="space-y-1.5">
              <Label>Off period</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={formOffValue}
                  onChange={e => setFormOffValue(Math.max(1, Number(e.target.value)))}
                  className="w-20"
                />
                <Select value={formOffUnit} onValueChange={v => setFormOffUnit(v as RotationUnit)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">days</SelectItem>
                    <SelectItem value="weeks">weeks</SelectItem>
                    <SelectItem value="months">months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-4 mt-1">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={formStartDate}
                onChange={e => setFormStartDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">First day of the rotation cycle.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Sign-off date <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="date"
                value={formEndDate}
                min={formStartDate || undefined}
                onChange={e => setFormEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Last day on board this trip — leave blank for full rotation.</p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Contract period, special arrangement..."
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRotation} disabled={isSavingDialog}>
              {isSavingDialog && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Rotation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
