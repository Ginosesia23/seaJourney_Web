/**
 * Shared visual chrome for SeaJourney month calendars (dashboard + landing).
 * Keep day-state colors in calendar-state-colors.ts; this file is layout only.
 */

export const CALENDAR_DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Tailwind tokens for month shells / day cells — match landing hero calendar. */
export const calendarChrome = {
  monthCard: 'rounded-[14px] border border-border/80 bg-card/50 shadow-none',
  monthCardCompact: 'rounded-xl border border-border/80 bg-card/50 shadow-none',
  monthHeader: 'border-b border-border/60 bg-muted/30 px-4 py-2.5',
  monthHeaderCompact: 'px-3 py-2 pb-1',
  monthTitle: 'text-sm font-semibold tracking-tight',
  monthTitleCompact: 'text-xs font-semibold tracking-tight',
  dowRow: 'grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
  dowRowCompact: 'grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground',
  dayGrid: 'grid grid-cols-7 gap-1',
  dayGridCompact: 'grid grid-cols-7 gap-1',
  /** Outer day wrapper — clips the colored fill to rounded corners */
  dayCell: 'aspect-square overflow-hidden rounded-[8px]',
  /** Inner interactive / fill surface (also set via calendarDayCellStyle borderRadius) */
  daySurface: 'rounded-[8px]',
  /** Secondary strip at bottom of a day (watch / passage / standby) */
  dayStrip:
    'pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[8px]',
} as const;
