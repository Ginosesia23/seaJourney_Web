/**
 * Per-crew watch-history summary, sourced from `nav_watch_logs`.
 *
 * `nav_watch_logs` stores the *actual* watches a crew member has
 * stood (with real start/end timestamps, weather, position, type,
 * etc.). This module produces:
 *
 *   - the total hours that crew member has logged,
 *   - per-month rollups so a long career compresses nicely in UI,
 *   - per-watch-type rollups (bridge / engine / lookout / …),
 *   - an entries array sorted most-recent first for detail views.
 *
 * The summary is *pure* — no React / Supabase deps. That keeps it
 * reusable for:
 *   - the vessel-side crew profile "Watches" tab,
 *   - the eventual sync to the individual crew profile account,
 *   - PDF exports / sea-time calculations that need watch hours.
 */

/** Allowed values mirror the CHECK constraint on nav_watch_logs.watch_type. */
export type WatchType =
  | 'bridge'
  | 'engine'
  | 'lookout'
  | 'helmsman'
  | 'officer_of_the_watch'
  | 'master'
  | 'other';

/**
 * The minimal shape of a `nav_watch_logs` row the summary needs.
 * Other columns (position, weather, lat/long, course, speed) are
 * preserved through the typing if callers pass the full row but
 * aren't required.
 */
export interface NavWatchLogRow {
  id: string;
  user_id: string;
  vessel_id: string | null;
  vessel_assignment_id?: string | null;
  start_time: string; // ISO timestamp
  end_time: string | null; // ISO timestamp; null = still active
  watch_type?: WatchType | string | null;
  position?: string | null;
  notes?: string | null;
  weather_conditions?: string | null;
  sea_state?: string | null;
  visibility?: string | null;
  passage_id?: string | null;
}

export interface WatchEntry {
  id: string;
  vesselId: string | null;
  startTime: string;
  endTime: string | null;
  /** Hours rounded to 2 dp. `null` when the watch is still active. */
  hours: number | null;
  /** YYYY-MM-DD bucket the watch is grouped under (anchored to start_time). */
  dayKey: string;
  watchType: WatchType | string | null;
  position: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface WatchTypeBreakdown {
  watchType: WatchType | string;
  /** Pretty label suitable for display (e.g. "Officer of the watch"). */
  label: string;
  hours: number;
  watches: number;
}

export interface MonthlyWatchBucket {
  /** YYYY-MM key for stable sorting / grouping. */
  monthKey: string;
  /** Pretty label, e.g. "May 2026". */
  monthLabel: string;
  hours: number;
  watches: number;
  daysWorked: number;
  entries: WatchEntry[];
}

export interface CrewWatchHistorySummary {
  crewUserId: string;
  /** Total hours across every logged watch with an end_time. */
  totalHours: number;
  /** Total number of distinct watches (entries with or without end_time). */
  totalWatches: number;
  /** Distinct YYYY-MM-DD dates the crew member stood at least one watch. */
  totalDaysWorked: number;
  /** Number of watches currently in progress (end_time IS NULL). */
  activeWatches: number;
  /** All entries sorted by start_time DESC (most recent first). */
  entries: WatchEntry[];
  /** Per-month rollup sorted by monthKey DESC (newest month first). */
  months: MonthlyWatchBucket[];
  /** Per-watch-type rollup sorted by hours DESC. */
  byWatchType: WatchTypeBreakdown[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pretty label for a watch_type value (handles the snake_case enum). */
export function watchTypeLabel(t: WatchType | string | null | undefined): string {
  if (!t) return 'Other';
  switch (t) {
    case 'bridge':
      return 'Bridge';
    case 'engine':
      return 'Engine';
    case 'lookout':
      return 'Lookout';
    case 'helmsman':
      return 'Helmsman';
    case 'officer_of_the_watch':
      return 'Officer of the watch';
    case 'master':
      return 'Master';
    case 'other':
      return 'Other';
    default:
      // Fallback for anything unexpected — title-case the underscore form
      return String(t)
        .split('_')
        .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
        .join(' ');
  }
}

/** Convenience colour token (Tailwind class fragment) per watch type. */
export function watchTypeAccent(t: WatchType | string | null | undefined): string {
  switch (t) {
    case 'bridge':
      return 'bg-blue-500';
    case 'engine':
      return 'bg-orange-500';
    case 'lookout':
      return 'bg-emerald-500';
    case 'helmsman':
      return 'bg-violet-500';
    case 'officer_of_the_watch':
      return 'bg-indigo-500';
    case 'master':
      return 'bg-rose-500';
    default:
      return 'bg-slate-500';
  }
}

/** Diff start_time/end_time into hours (rounded 2 dp). null if active. */
export function watchHours(start: string, end: string | null): number | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 3600000) * 100) / 100;
}

function dayKey(iso: string): string {
  // YYYY-MM-DD in local timezone — anchored to start_time. Watches that
  // span midnight are intentionally attributed to the start day to keep
  // a single source of truth per watch.
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthLabelFromKey(key: string): string {
  const [y, m] = key.split('-');
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${MONTH_LABELS[idx]} ${y}`;
}

// ---------------------------------------------------------------------------
// Main summariser
// ---------------------------------------------------------------------------

export function summariseCrewWatchHistory(
  rows: NavWatchLogRow[],
  crewUserId: string,
): CrewWatchHistorySummary {
  if (!crewUserId) {
    return {
      crewUserId,
      totalHours: 0,
      totalWatches: 0,
      totalDaysWorked: 0,
      activeWatches: 0,
      entries: [],
      months: [],
      byWatchType: [],
    };
  }

  // Defensive filter — callers may pass an unfiltered fetch result.
  const own = rows.filter((r) => r.user_id === crewUserId);

  // Build entries up-front so the rollups can share them.
  const entries: WatchEntry[] = own
    .map((r) => {
      const hrs = watchHours(r.start_time, r.end_time ?? null);
      return {
        id: r.id,
        vesselId: r.vessel_id,
        startTime: r.start_time,
        endTime: r.end_time ?? null,
        hours: hrs,
        dayKey: dayKey(r.start_time),
        watchType: (r.watch_type ?? null) as WatchType | string | null,
        position: r.position ?? null,
        notes: r.notes ?? null,
        isActive: !r.end_time,
      };
    })
    .sort((a, b) => (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0));

  // Per-month rollup.
  const monthMap = new Map<string, MonthlyWatchBucket>();
  for (const e of entries) {
    const key = monthKey(e.startTime);
    let bucket = monthMap.get(key);
    if (!bucket) {
      bucket = {
        monthKey: key,
        monthLabel: monthLabelFromKey(key),
        hours: 0,
        watches: 0,
        daysWorked: 0,
        entries: [],
      };
      monthMap.set(key, bucket);
    }
    bucket.entries.push(e);
    bucket.watches += 1;
    bucket.hours += e.hours ?? 0;
  }
  // Compute daysWorked per month off entries (we couldn't do this in
  // the loop because we wanted a single Set per bucket).
  for (const bucket of monthMap.values()) {
    bucket.daysWorked = new Set(bucket.entries.map((e) => e.dayKey)).size;
  }
  const months = Array.from(monthMap.values()).sort((a, b) =>
    a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
  );

  // Per-watch-type rollup.
  const typeMap = new Map<string, WatchTypeBreakdown>();
  for (const e of entries) {
    const key = (e.watchType ?? 'other') as string;
    let bucket = typeMap.get(key);
    if (!bucket) {
      bucket = {
        watchType: key as WatchType,
        label: watchTypeLabel(key),
        hours: 0,
        watches: 0,
      };
      typeMap.set(key, bucket);
    }
    bucket.watches += 1;
    bucket.hours += e.hours ?? 0;
  }
  const byWatchType = Array.from(typeMap.values()).sort((a, b) => b.hours - a.hours);

  return {
    crewUserId,
    totalHours: entries.reduce((sum, e) => sum + (e.hours ?? 0), 0),
    totalWatches: entries.length,
    totalDaysWorked: new Set(entries.map((e) => e.dayKey)).size,
    activeWatches: entries.filter((e) => e.isActive).length,
    entries,
    months,
    byWatchType,
  };
}
