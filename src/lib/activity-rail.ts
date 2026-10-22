export type ActivityRailSeverity = 'critical' | 'warning' | 'info';

export type ActivityRailCategory = 'overdue' | 'upcoming' | 'missing' | 'issue';

export type ActivityRailKind =
  | 'certificate_expired'
  | 'certificate_expiring'
  | 'visa_expired'
  | 'visa_expiring'
  | 'crew_certificate_expired'
  | 'crew_certificate_expiring'
  | 'profile_incomplete'
  | 'vessel_incomplete'
  | 'signature_missing'
  | 'pending_signoff'
  | 'pending_sea_time'
  | 'pending_sea_time_offer'
  | 'pending_sea_time_access'
  | 'pending_plan_coverage'
  | 'pending_testimonial'
  | 'pending_training_signoff'
  | 'ais_sync_error'
  | 'pending_claim'
  | 'pending_captaincy'
  | 'open_ais_report'
  | 'open_feedback'
  | 'log_today_missing'
  | 'log_days_missing';

export const ACTIVITY_RAIL_LOG_LOOKBACK_DAYS = 90;
export const ACTIVITY_RAIL_INBOX_HREF = '/dashboard/inbox?view=incoming';
export const ACTIVITY_RAIL_REFRESH_EVENT = 'sea-activity-rail-refresh';

/** Ask the dashboard attention bar to refetch. Safe on the server (no-op). */
export function requestActivityRailRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACTIVITY_RAIL_REFRESH_EVENT));
}

function parseYmdUtc(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.slice(0, 10));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatYmdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addActivityRailUtcDays(ymd: string, days: number): string | null {
  const date = parseYmdUtc(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmdUtc(date);
}

export function laterActivityRailYmd(a: string, b: string): string {
  return a > b ? a : b;
}

export function resolveActivityRailLogWindowStart(args: {
  today: string;
  assignmentStart?: string | null;
  lookbackDays?: number;
}): string | null {
  const today = args.today.slice(0, 10);
  if (!parseYmdUtc(today)) return null;
  const lookback = args.lookbackDays ?? ACTIVITY_RAIL_LOG_LOOKBACK_DAYS;
  const lookbackStart = addActivityRailUtcDays(today, -Math.max(0, lookback));
  if (!lookbackStart) return null;
  const assignment = args.assignmentStart?.slice(0, 10) || null;
  if (assignment && parseYmdUtc(assignment)) {
    if (assignment > today) return null;
    return laterActivityRailYmd(assignment, lookbackStart);
  }
  return lookbackStart;
}

export function summarizeActivityRailLogGaps(args: {
  today: string;
  windowStart: string;
  loggedDates: Iterable<string>;
}): { todayMissing: boolean; missingExcludingToday: string[] } {
  const today = args.today.slice(0, 10);
  const windowStart = args.windowStart.slice(0, 10);
  if (!parseYmdUtc(today) || !parseYmdUtc(windowStart) || windowStart > today) {
    return { todayMissing: false, missingExcludingToday: [] };
  }
  const logged = new Set(
    Array.from(args.loggedDates, (value) => String(value).slice(0, 10)).filter(Boolean),
  );
  const missingExcludingToday: string[] = [];
  let cursor: string | null = windowStart;
  while (cursor && cursor < today) {
    if (!logged.has(cursor)) missingExcludingToday.push(cursor);
    cursor = addActivityRailUtcDays(cursor, 1);
  }
  return {
    todayMissing: !logged.has(today),
    missingExcludingToday,
  };
}

export interface ActivityRailItem {
  id: string;
  kind: ActivityRailKind;
  category: ActivityRailCategory;
  severity: ActivityRailSeverity;
  title: string;
  description: string;
  href: string;
  dueAt?: string | null;
  daysUntil?: number | null;
  meta?: string | null;
}

export interface ActivityRailCounts {
  overdue: number;
  upcoming: number;
  missing: number;
  issues: number;
  total: number;
}

export interface ActivityRailPayload {
  items: ActivityRailItem[];
  counts: ActivityRailCounts;
}

export const ACTIVITY_RAIL_CATEGORIES: {
  id: ActivityRailCategory;
  label: string;
}[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'missing', label: 'Missing details' },
  { id: 'issue', label: 'Issues' },
];

export function emptyActivityRailCounts(): ActivityRailCounts {
  return { overdue: 0, upcoming: 0, missing: 0, issues: 0, total: 0 };
}

export function countActivityRailItems(items: ActivityRailItem[]): ActivityRailCounts {
  const counts = emptyActivityRailCounts();
  for (const item of items) {
    if (item.category === 'overdue') counts.overdue += 1;
    else if (item.category === 'upcoming') counts.upcoming += 1;
    else if (item.category === 'missing') counts.missing += 1;
    else counts.issues += 1;
  }
  counts.total = items.length;
  return counts;
}

export function activityRailDaysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatActivityRailDue(daysUntil: number | null | undefined): string | null {
  if (daysUntil == null || !Number.isFinite(daysUntil)) return null;
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return n === 1 ? '1 day overdue' : `${n} days overdue`;
  }
  if (daysUntil === 0) return 'Due today';
  if (daysUntil === 1) return 'Due tomorrow';
  return `In ${daysUntil} days`;
}

const SEVERITY_RANK: Record<ActivityRailSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const CATEGORY_RANK: Record<ActivityRailCategory, number> = {
  overdue: 0,
  upcoming: 1,
  issue: 2,
  missing: 3,
};

export function sortActivityRailItems(items: ActivityRailItem[]): ActivityRailItem[] {
  return [...items].sort((a, b) => {
    const cat = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (cat !== 0) return cat;
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    const aDays = a.daysUntil ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysUntil ?? Number.POSITIVE_INFINITY;
    if (aDays !== bDays) return aDays - bDays;
    return a.title.localeCompare(b.title);
  });
}
