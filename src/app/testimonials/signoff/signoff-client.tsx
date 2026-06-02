// app/testimonials/signoff/signoff-client.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, parse, eachDayOfInterval } from 'date-fns';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Ship,
  AlertCircle,
  Calendar,
  Eye,
  EyeOff,
  Info,
  Anchor,
  Building,
  Briefcase,
  Waves,
  Wrench,
  Clock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DateComparisonView } from '@/app/dashboard/inbox/date-comparison-view';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { calendarStateSolid } from '@/lib/calendar-state-colors';
import { cn } from '@/lib/utils';
import type { DailyStatus, StateLog } from '@/lib/types';
import Logo from '@/components/logo';

interface TestimonialSummary {
  id: string;
  vessel_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  at_sea_days: number;
  standby_days: number;
  yard_days: number;
  leave_days: number;
  captain_name: string | null;
  captain_email: string | null;
  crew_member_name?: string | null;
  crew_member_position?: string | null;
  vessel: {
    id: string;
    name: string;
    type: string | null;
    imo?: string | null;
    mmsi?: string | null;
    flag?: string | null;
    gross_tonnage?: number | null;
    length_m?: number | null;
    beam?: number | null;
    draft?: number | null;
    call_sign?: string | null;
    [key: string]: unknown;
  } | null;
}

const SignoffLayout = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) => (
  <div className="min-h-screen flex flex-col">
    <header
      className="sticky top-0 z-50 w-full border-b backdrop-blur-md shrink-0"
      style={{
        backgroundColor: '#000b15',
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo className="text-white" />
        {title && (
          <span className="text-sm font-medium text-white/80 hidden sm:block">
            {title}
          </span>
        )}
      </div>
    </header>
    <main className="flex-1 flex flex-col bg-white">{children}</main>
    <footer
      className="shrink-0 border-t py-6"
      style={{ backgroundColor: '#000b15', borderColor: 'rgba(255, 255, 255, 0.1)' }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-white/60">
        <span>&copy; {new Date().getFullYear()} SeaJourney. All rights reserved.</span>
        <Link href="/verify" className="text-white/70 hover:text-white transition-colors">
          Verify records
        </Link>
      </div>
    </footer>
  </div>
);

// Mirror the dashboard calendar's state palette/icons so the captain sees
// the exact same visual vocabulary they (and the vessel manager) use elsewhere.
type VesselStateMeta = {
  value: DailyStatus;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

const VESSEL_STATES: VesselStateMeta[] = [
  { value: 'underway', label: 'Underway', color: calendarStateSolid('underway'), icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: calendarStateSolid('at-anchor'), icon: Anchor },
  { value: 'in-port', label: 'In Port', color: calendarStateSolid('in-port'), icon: Building },
  { value: 'on-leave', label: 'On Leave', color: calendarStateSolid('on-leave'), icon: Briefcase },
  { value: 'in-yard', label: 'In Yard', color: calendarStateSolid('in-yard'), icon: Wrench },
];

function getStateMeta(state: string | null | undefined): VesselStateMeta | null {
  if (!state) return null;
  return VESSEL_STATES.find((s) => s.value === state) || null;
}

/**
 * Date-range breakdown shown when we can't (or shouldn't) display the full
 * crew-vs-vessel comparison. This happens when:
 *   - the testimonial was generated from the vessel's own logs, or
 *   - the testimonial was generated from the crew's logs but the crew member
 *     hasn't granted the vessel access to view them (so we keep them private).
 *
 * The captain still gets a polished day-by-day record they're signing for,
 * complete with MCA-style standby day indicators.
 */
function VesselBreakdownView({
  start,
  end,
  vesselLogs,
  source,
  accessApproved,
}: {
  start: string;
  end: string;
  vesselLogs: StateLog[];
  source: 'crew' | 'vessel' | null;
  accessApproved: boolean;
}) {
  // Resolve standby and "part of active passage" days for the requested
  // period. Standby uses MCA-compliant rules (no `vesselManagerSeaTime`),
  // matching how the testimonial's at_sea_days / standby_days were
  // computed in download-vessel-generated-testimonial-for-crew.ts and
  // applications/page.tsx.
  //
  // Indicators:
  //   - Standby (purple strip): counted standby days. A block can include
  //     consecutive 'in-port' AND 'at-anchor' days immediately following
  //     a voyage, capped per the standard rules (≤ voyage length, max 14).
  //   - Passage (blue strip): days the vessel flagged
  //     `is_part_of_active_passage` on a non-'underway' state. The standby
  //     calc already excludes these, so the two strips never collide.
  const { logByDate, standbyDates, passageDates, summary } = useMemo(() => {
    const startDate = parse(start, 'yyyy-MM-dd', new Date());
    const endDate = parse(end, 'yyyy-MM-dd', new Date());

    const logByDate = new Map<string, StateLog>();
    const partOfActivePassageDates = new Set<string>();
    for (const log of vesselLogs) {
      if (!log?.date) continue;
      logByDate.set(log.date, log);
      if (log.isPartOfActivePassage) partOfActivePassageDates.add(log.date);
    }

    let standbyDates = new Set<string>();
    let totalStandby = 0;
    try {
      const result = calculateStandbyDays(vesselLogs, undefined, partOfActivePassageDates, {
        rangeStart: start,
        rangeEnd: end,
      });
      totalStandby = result.totalStandbyDays;
      // `countedDays` are always the first N days of a standby period after
      // the per-period caps (max 14, ≤ preceding voyage length). The calc
      // **may skip** mid-period days flagged as watch/passage without
      // ending the block — which means the literal date offsets we get
      // from `addDays(period.startDate, i)` for the first `countedDays`
      // don't necessarily land on a real standby day in the log. We walk
      // each period day-by-day and pick the first `countedDays` dates
      // whose log is actually a standby state (in-port or at-anchor) and
      // wasn't a passage override.
      const dayMs = 24 * 60 * 60 * 1000;
      for (const period of result.standbyPeriods) {
        let collected = 0;
        const periodLen = Math.round(
          (period.endDate.getTime() - period.startDate.getTime()) / dayMs
        ) + 1;
        for (let i = 0; i < periodLen && collected < period.countedDays; i++) {
          const d = format(new Date(period.startDate.getTime() + i * dayMs), 'yyyy-MM-dd');
          if (d < start || d > end) continue;
          if (partOfActivePassageDates.has(d)) continue;
          const log = logByDate.get(d);
          if (!log) continue;
          if (log.state === 'in-port' || log.state === 'at-anchor') {
            standbyDates.add(d);
            collected++;
          }
        }
      }
    } catch (err) {
      console.warn('[signoff] standby calc failed:', err);
      standbyDates = new Set();
    }

    // Only flag days as "passage" when they aren't already an 'underway'
    // day — those already render with the blue Underway fill, so the
    // additional strip would be redundant. This mirrors how the dashboard
    // calendar treats the bar (it surfaces when it adds information).
    const passageDates = new Set<string>();
    let passageCount = 0;
    const inRangeDates = eachDayOfInterval({ start: startDate, end: endDate }).map((d) =>
      format(d, 'yyyy-MM-dd'),
    );
    for (const dateStr of inRangeDates) {
      const log = logByDate.get(dateStr);
      if (log && log.isPartOfActivePassage && log.state !== 'underway') {
        passageDates.add(dateStr);
        passageCount += 1;
      }
    }

    const counts: Record<string, number> = {
      underway: 0,
      'at-anchor': 0,
      'in-port': 0,
      'on-leave': 0,
      'in-yard': 0,
    };
    let notLogged = 0;
    for (const dateStr of inRangeDates) {
      const log = logByDate.get(dateStr);
      if (log && log.state in counts) counts[log.state] += 1;
      else if (!log) notLogged += 1;
    }

    return {
      logByDate,
      standbyDates,
      passageDates,
      summary: {
        totalDays: inRangeDates.length,
        underway: counts['underway'],
        atAnchor: counts['at-anchor'],
        inPort: counts['in-port'],
        inYard: counts['in-yard'],
        onLeave: counts['on-leave'],
        standby: totalStandby,
        passage: passageCount,
        notLogged,
      },
    };
  }, [start, end, vesselLogs]);

  // Build the list of months that touch the testimonial period.
  const months = useMemo(() => {
    const startDate = parse(start, 'yyyy-MM-dd', new Date());
    const endDate = parse(end, 'yyyy-MM-dd', new Date());
    const out: Date[] = [];
    for (
      let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      cursor <= new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      out.push(new Date(cursor));
    }
    return out;
  }, [start, end]);

  const reason =
    source === 'vessel'
      ? 'Generated from the vessel’s own logs — the crew member’s personal logs are not shown.'
      : !accessApproved
        ? 'The crew member has not granted access to their personal logs, so only the vessel’s record is shown.'
        : 'No crew logs are available for this period — only the vessel’s record is shown.';

  return (
    <div className="space-y-4">
      {/* Context banner */}
      <Card className="rounded-xl border">
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-border">
            {source === 'vessel' ? (
              <Ship className="h-5 w-5" />
            ) : accessApproved ? (
              <Eye className="h-5 w-5" />
            ) : (
              <EyeOff className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Vessel record — day-by-day</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{reason}</p>
          </div>
          <Badge variant="outline" className="hidden self-center font-normal sm:inline-flex">
            {summary.totalDays} {summary.totalDays === 1 ? 'day' : 'days'}
          </Badge>
        </CardContent>
      </Card>

      {/* Period summary — same chip layout as the dashboard month summary */}
      <Card className="rounded-xl border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Period summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-1.5 text-xs leading-tight sm:grid-cols-3 lg:grid-cols-7">
            {VESSEL_STATES.map((state) => {
              const StateIcon = state.icon;
              const count =
                state.value === 'underway'
                  ? summary.underway
                  : state.value === 'at-anchor'
                    ? summary.atAnchor
                    : state.value === 'in-port'
                      ? summary.inPort
                      : state.value === 'on-leave'
                        ? summary.onLeave
                        : summary.inYard;
              return (
                <div key={state.value} className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
                  <StateIcon className="h-3 w-3 shrink-0" style={{ color: state.color }} />
                  <div className="min-w-0 flex-1 truncate text-muted-foreground">{state.label}</div>
                  <span className="shrink-0 font-medium tabular-nums">{count}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
              <Ship className="h-3 w-3 shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1 truncate text-muted-foreground">Part of passage</div>
              <span className="shrink-0 font-medium tabular-nums">{summary.passage}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
              <Clock className="h-3 w-3 shrink-0 text-purple-600" />
              <div className="min-w-0 flex-1 truncate text-muted-foreground">Standby</div>
              <span className="shrink-0 font-medium tabular-nums">{summary.standby}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
              <span className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/40" />
              <div className="min-w-0 flex-1 truncate text-muted-foreground">Not logged</div>
              <span className="shrink-0 font-medium tabular-nums">{summary.notLogged}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Months — matches the dashboard calendar card */}
      <TooltipProvider delayDuration={200}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {months.map((month) => (
            <SignoffMonthCalendar
              key={month.toISOString()}
              month={month}
              start={start}
              end={end}
              logByDate={logByDate}
              standbyDates={standbyDates}
              passageDates={passageDates}
            />
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

/**
 * Single-month calendar card. Mirrors `renderMonth` from
 * /dashboard/calendar/page.tsx as closely as possible:
 *   - Card / CardHeader / CardContent shell
 *   - Sun…Sat header row
 *   - aspect-square day cells with solid state color and white numbers
 *   - 20% purple bottom strip for counted MCA standby days
 *   - Per-month state count strip below the grid
 *   - Tooltip on hover with full context
 * Differences vs the dashboard:
 *   - Read-only: no click handlers, no dialog
 *   - Days outside the testimonial period are visible but muted so the
 *     captain can see which slice of the month they're signing for
 */
function SignoffMonthCalendar({
  month,
  start,
  end,
  logByDate,
  standbyDates,
  passageDates,
}: {
  month: Date;
  start: string;
  end: string;
  logByDate: Map<string, StateLog>;
  standbyDates: Set<string>;
  passageDates: Set<string>;
}) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const firstDayOfMonth = monthStart.getDay(); // 0 Sun … 6 Sat
  const daysInMonth = monthEnd.getDate();

  const cells: ({ key: string } & ({ kind: 'blank' } | { kind: 'day'; date: Date }))[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push({ key: `b-${i}`, kind: 'blank' });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(month.getFullYear(), month.getMonth(), d);
    cells.push({ key: format(date, 'yyyy-MM-dd'), kind: 'day', date });
  }

  // Per-month state counts (drives the strip under the grid).
  const monthCounts: Record<string, number> = {
    underway: 0,
    'at-anchor': 0,
    'in-port': 0,
    'on-leave': 0,
    'in-yard': 0,
    standby: 0,
    passage: 0,
  };
  for (const [dateStr, log] of logByDate) {
    if (dateStr < monthStartStr || dateStr > monthEndStr) continue;
    if (dateStr < start || dateStr > end) continue;
    if (log.state in monthCounts) monthCounts[log.state]++;
  }
  for (const dateStr of standbyDates) {
    if (dateStr >= monthStartStr && dateStr <= monthEndStr) monthCounts.standby++;
  }
  for (const dateStr of passageDates) {
    if (dateStr >= monthStartStr && dateStr <= monthEndStr) monthCounts.passage++;
  }

  return (
    <Card className="rounded-xl border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">{format(month, 'MMMM yyyy')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col pb-6">
        <div className="flex-1 space-y-1">
          <div className="mb-2 grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              if (cell.kind === 'blank') {
                return <div key={cell.key} className="aspect-square" />;
              }
              const key = format(cell.date, 'yyyy-MM-dd');
              return (
                <SignoffDayCell
                  key={cell.key}
                  date={cell.date}
                  start={start}
                  end={end}
                  log={logByDate.get(key) || null}
                  isStandby={standbyDates.has(key)}
                  isPassage={passageDates.has(key)}
                />
              );
            })}
          </div>
        </div>

        {/* Per-month summary chips */}
        <Separator className="mb-2 mt-4" />
        <div className="grid grid-cols-3 gap-1.5 text-[10px] leading-tight sm:gap-2 sm:text-xs">
          {VESSEL_STATES.map((state) => {
            const StateIcon = state.icon;
            const count = monthCounts[state.value] || 0;
            return (
              <div key={state.value} className="flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-1 sm:gap-1.5">
                <StateIcon className="h-3 w-3 shrink-0" style={{ color: state.color }} />
                <div className="min-w-0 flex-1 truncate text-muted-foreground">{state.label}</div>
                <span className="shrink-0 font-medium tabular-nums">{count}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-1 sm:gap-1.5">
            <Ship className="h-3 w-3 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1 truncate text-muted-foreground">Part of passage</div>
            <span className="shrink-0 font-medium tabular-nums">{monthCounts.passage}</span>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-1 sm:gap-1.5">
            <Clock className="h-3 w-3 shrink-0 text-purple-600" />
            <div className="min-w-0 flex-1 truncate text-muted-foreground">Standby</div>
            <span className="shrink-0 font-medium tabular-nums">{monthCounts.standby}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Day cell. Replicates the dashboard cell visual: solid colored fill on
 * state, white text, optional 20%-height bottom strip for the active
 * secondary indicator (passage > standby — same precedence the dashboard
 * uses), scale-on-hover, and a tooltip that lists the state + flags.
 */
function SignoffDayCell({
  date,
  start,
  end,
  log,
  isStandby,
  isPassage,
}: {
  date: Date;
  start: string;
  end: string;
  log: StateLog | null;
  isStandby: boolean;
  isPassage: boolean;
}) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const inRange = dateStr >= start && dateStr <= end;
  const stateMeta = getStateMeta(log?.state);
  const StateIcon = stateMeta?.icon;

  // Match dashboard priority: watch > passage > standby. We don't fetch
  // watch logs here, so passage wins when both flags are set.
  const indicator: 'passage' | 'standby' | null = isPassage
    ? 'passage'
    : isStandby
      ? 'standby'
      : null;

  const tooltipContent = (
    <div className="space-y-1.5 text-sm">
      <div className="font-semibold">{format(date, 'EEEE, d MMMM yyyy')}</div>
      {stateMeta ? (
        <div className="flex items-center gap-2">
          {StateIcon && <StateIcon className="h-4 w-4" style={{ color: stateMeta.color }} />}
          <span className="font-medium">{stateMeta.label}</span>
        </div>
      ) : (
        <div className="text-muted-foreground">
          {inRange ? 'No state logged' : 'Outside testimonial period'}
        </div>
      )}
      {isPassage && (
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
          <Ship className="h-3.5 w-3.5" />
          <span>Part of Active Passage (Counts as At Sea)</span>
        </div>
      )}
      {isStandby && !isPassage && (
        <div className="flex items-center gap-2 text-purple-600">
          <Clock className="h-3.5 w-3.5" />
          <span>Counted as Standby</span>
        </div>
      )}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="aspect-square overflow-hidden rounded-[6px]">
          <div
            className={cn(
              'relative h-full w-full overflow-hidden rounded-[6px] text-sm font-medium transition-all',
              stateMeta
                ? 'text-white'
                : inRange
                  ? 'bg-muted/50 text-muted-foreground'
                  : 'bg-transparent text-muted-foreground/50',
              inRange && 'hover:scale-105 hover:shadow-md',
              !inRange && 'opacity-40',
            )}
            style={stateMeta ? { backgroundColor: stateMeta.color } : undefined}
          >
            <div className="relative z-[1] flex h-full flex-col items-center justify-center">
              <span className="relative z-10 text-center">{format(date, 'd')}</span>
            </div>
            {indicator === 'passage' && (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[6px] bg-blue-600"
              />
            )}
            {indicator === 'standby' && (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[6px] bg-purple-600"
              />
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}

export default function SignoffClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [testimonial, setTestimonial] = useState<TestimonialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [commentConduct, setCommentConduct] = useState('');
  const [commentAbility, setCommentAbility] = useState('');
  const [commentGeneral, setCommentGeneral] = useState('');

  // Review-context data (crew logs / vessel logs / source). Loaded
  // separately from the testimonial summary because it requires
  // server-admin access to daily_state_logs.
  const [dataSource, setDataSource] = useState<'crew' | 'vessel' | null>(null);
  const [accessApproved, setAccessApproved] = useState<boolean>(false);
  const [crewLogs, setCrewLogs] = useState<StateLog[]>([]);
  const [vesselLogs, setVesselLogs] = useState<StateLog[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!token || !email) {
        setError('Invalid sign-off link.');
        setLoading(false);
        setComparisonLoading(false);
        return;
      }

      const res = await fetch(
        `/api/captain/signoff?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
      );
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || 'This sign-off link is invalid or has expired.');
        setLoading(false);
        setComparisonLoading(false);
        return;
      }

      setTestimonial(json.testimonial);
      setLoading(false);

      // Fetch the comparison context in parallel (own try/catch — if this
      // fails we still let the captain sign off, just without the rich
      // day-by-day view).
      try {
        const cmpRes = await fetch(
          `/api/captain/signoff-comparison?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
        );
        const cmpJson = await cmpRes.json();
        if (cmpRes.ok && cmpJson.success) {
          setDataSource(cmpJson.dataSource ?? null);
          setAccessApproved(Boolean(cmpJson.accessApproved));
          setCrewLogs(Array.isArray(cmpJson.crewLogs) ? cmpJson.crewLogs : []);
          setVesselLogs(Array.isArray(cmpJson.vesselLogs) ? cmpJson.vesselLogs : []);
        } else {
          console.warn('[signoff] comparison endpoint returned error:', cmpJson?.error);
        }
      } catch (err) {
        console.warn('[signoff] comparison endpoint failed:', err);
      } finally {
        setComparisonLoading(false);
      }
    }

    load();
  }, [token, email]);

  async function handleDecision(decision: 'approve' | 'reject') {
    if (!token || !email || !testimonial) return;

    if (decision === 'reject' && !rejectionReason.trim()) {
      setError('Please provide a reason for rejection.');
      return;
    }

    setProcessing(true);
    setError(null);
    setMessage(null);

    const res = await fetch('/api/captain/signoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        email,
        decision,
        rejectionReason: decision === 'reject' ? rejectionReason.trim() : undefined,
        commentConduct: decision === 'approve' ? commentConduct.trim() : undefined,
        commentAbility: decision === 'approve' ? commentAbility.trim() : undefined,
        commentGeneral: decision === 'approve' ? commentGeneral.trim() : undefined,
      }),
    });

    const json = await res.json();
    setProcessing(false);

    if (!json.success) {
      setError(json.error || 'Failed to record your decision. Please try again later.');
      return;
    }

    setMessage(
      decision === 'approve'
        ? 'Thank you. Your approval has been recorded.'
        : 'Your rejection has been recorded.',
    );
    setAction(decision);
  }

  if (loading) {
    return (
      <SignoffLayout title="Captain sign-off">
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-6">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Loading testimonial…</p>
            </div>
          </div>
        </div>
      </SignoffLayout>
    );
  }

  if (error && !testimonial) {
    return (
      <SignoffLayout title="Captain sign-off">
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md mx-auto rounded-xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <AlertCircle className="h-7 w-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Unable to load</h2>
            <p className="mt-2 text-muted-foreground">{error}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              If you believe this is an error, please contact the person who requested this testimonial.
            </p>
            </div>
          </div>
        </div>
      </SignoffLayout>
    );
  }

  if (message && action) {
    const isApproved = action === 'approve';

    return (
      <SignoffLayout title="Captain sign-off">
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-lg mx-auto rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="text-center">
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                  isApproved ? 'bg-emerald-50' : 'bg-red-50'
                }`}
              >
                {isApproved ? (
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                ) : (
                  <XCircle className="h-7 w-7 text-red-600" />
                )}
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {isApproved ? 'Testimonial approved' : 'Testimonial rejected'}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {isApproved
                  ? 'Thank you for confirming this sea service record. The crew member has been notified.'
                  : 'Your response has been recorded. The crew member has been notified with your reason.'}
              </p>
            </div>
            {testimonial && (
              <div className="mt-6 pt-6 border-t space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Summary</h3>
                {(testimonial.crew_member_name || testimonial.crew_member_position) && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Testimonial for</p>
                    <p className="font-medium text-sm text-foreground">{testimonial.crew_member_name || 'Crew member'}</p>
                    {testimonial.crew_member_position && (
                      <p className="text-xs text-muted-foreground mt-0.5">{testimonial.crew_member_position}</p>
                    )}
                  </div>
                )}
                {testimonial.vessel && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Ship className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{testimonial.vessel.name}</p>
                      {testimonial.vessel.type && (
                        <p className="text-xs text-muted-foreground mt-0.5">{testimonial.vessel.type}</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Service period</p>
                    <p className="font-medium text-xs leading-tight text-foreground">
                      {format(parse(testimonial.start_date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')} –{' '}
                      {format(parse(testimonial.end_date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Total days</p>
                    <p className="font-medium text-lg text-foreground">{testimonial.total_days}</p>
                  </div>
                </div>
              </div>
            )}
            <p className="mt-6 text-xs text-center text-muted-foreground">
              This link is no longer valid and cannot be used again.
            </p>
            </div>
          </div>
        </div>
      </SignoffLayout>
    );
  }

  if (!testimonial) return null;

  const startDate = parse(testimonial.start_date, 'yyyy-MM-dd', new Date());
  const endDate = parse(testimonial.end_date, 'yyyy-MM-dd', new Date());

  return (
    <SignoffLayout title="Captain sign-off">
      <div className="flex-1 w-full py-8 sm:py-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Sea service testimonial
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Review the sea service record below and approve or reject this request.
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 xl:gap-8">
            {/* Left: Sea service details (crew data) */}
            <div className="xl:col-span-2 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Sea service details
              </h2>
              <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                {/* Testimonial for (crew member) */}
                {(testimonial.crew_member_name || testimonial.crew_member_position) && (
                  <div className="p-5 sm:p-6 border-b border-border">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Testimonial for</p>
                    <p className="text-xl font-semibold text-foreground">
                      {testimonial.crew_member_name || 'Crew member'}
                    </p>
                    {testimonial.crew_member_position && (
                      <p className="text-sm text-muted-foreground mt-1">{testimonial.crew_member_position}</p>
                    )}
                  </div>
                )}
                {/* Vessel */}
                <div className="p-5 sm:p-6 border-b border-border">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Vessel</p>
                  <p className="text-xl font-semibold text-foreground">
                    {testimonial.vessel?.name || 'Unknown vessel'}
                  </p>
                  {testimonial.vessel?.type && (
                    <p className="text-sm text-muted-foreground mt-1">{testimonial.vessel.type}</p>
                  )}
                  {(testimonial.vessel?.imo || testimonial.vessel?.mmsi || testimonial.vessel?.flag || testimonial.vessel?.gross_tonnage != null) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                      {testimonial.vessel?.imo && <span><span className="font-medium">IMO</span> {testimonial.vessel.imo}</span>}
                      {testimonial.vessel?.mmsi && <span><span className="font-medium">MMSI</span> {testimonial.vessel.mmsi}</span>}
                      {testimonial.vessel?.flag && <span><span className="font-medium">Flag</span> {testimonial.vessel.flag}</span>}
                      {testimonial.vessel?.gross_tonnage != null && <span><span className="font-medium">GT</span> {testimonial.vessel.gross_tonnage}</span>}
                    </div>
                  )}
                </div>

                {/* Service period */}
                <div className="p-5 sm:p-6 border-b border-border">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Service period</p>
                  <p className="text-base font-medium text-foreground">
                    {format(startDate, 'd MMMM yyyy')} – {format(endDate, 'd MMMM yyyy')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{testimonial.total_days} days total</p>
                </div>

                {/* Breakdown stats */}
                <div className="p-5 sm:p-6">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Days breakdown</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'At sea', value: testimonial.at_sea_days },
                      { label: 'Standby', value: testimonial.standby_days },
                      { label: 'In yard', value: testimonial.yard_days },
                      { label: 'On leave', value: testimonial.leave_days },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="rounded-lg border border-border bg-background px-4 py-3"
                      >
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Your response (comments, rejection, actions) */}
            <div className="xl:col-span-3 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Your response
              </h2>
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6 lg:p-8 space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Comments (optional)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Included on the testimonial document.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="comment-conduct" className="text-sm text-foreground">Conduct</Label>
                      <Textarea
                        id="comment-conduct"
                        placeholder="Conduct…"
                        value={commentConduct}
                        onChange={(e) => setCommentConduct(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="comment-ability" className="text-sm text-foreground">Ability</Label>
                      <Textarea
                        id="comment-ability"
                        placeholder="Ability…"
                        value={commentAbility}
                        onChange={(e) => setCommentAbility(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-1">
                      <Label htmlFor="comment-general" className="text-sm text-foreground">General</Label>
                      <Textarea
                        id="comment-general"
                        placeholder="General comments…"
                        value={commentGeneral}
                        onChange={(e) => setCommentGeneral(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="rejection-reason" className="text-sm font-semibold text-foreground">
                    Rejection reason <span className="text-muted-foreground font-normal">(required if rejecting)</span>
                  </Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="If you reject, provide a reason for the crew member…"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <Button
                    onClick={() => handleDecision('reject')}
                    disabled={processing}
                    variant="destructive"
                    className="flex-1 h-11 font-medium"
                  >
                    {processing ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
                    ) : (
                      <><XCircle className="mr-2 h-4 w-4" /> Reject</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleDecision('approve')}
                    disabled={processing}
                    className="flex-1 h-11 font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {processing ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
                    ) : (
                      <><CheckCircle2 className="mr-2 h-4 w-4" /> Approve</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Day-by-day review section.
              - If the testimonial was generated from the crew member's logs
                AND the crew has granted access AND we got logs back, we show
                the full crew-vs-vessel comparison (same component the inbox
                uses for vessel managers).
              - Otherwise we show the vessel-side date-range breakdown so the
                captain can still see exactly which days they are signing off
                on, just without the crew member's private records. */}
          {testimonial && (
            <div className="mt-10 space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Day-by-day review
                </h2>
              </div>

              {comparisonLoading ? (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading day-by-day record…
                </div>
              ) : dataSource === 'crew' && accessApproved && crewLogs.length > 0 ? (
                <>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      This testimonial was generated from the crew member’s own logs and they have
                      granted access for review. The comparison below shows their logs alongside the
                      vessel’s record for each day.
                    </AlertDescription>
                  </Alert>
                  <DateComparisonView
                    requestedStart={testimonial.start_date}
                    requestedEnd={testimonial.end_date}
                    requestedDays={testimonial.total_days}
                    actualLogs={crewLogs}
                    vesselLogs={vesselLogs}
                    testimonial={testimonial}
                  />
                </>
              ) : (
                <VesselBreakdownView
                  start={testimonial.start_date}
                  end={testimonial.end_date}
                  vesselLogs={vesselLogs}
                  source={dataSource}
                  accessApproved={accessApproved}
                />
              )}
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground">
            This link expires after use. Questions? Contact the person who requested this testimonial.
          </p>
        </div>
      </div>
    </SignoffLayout>
  );
}
