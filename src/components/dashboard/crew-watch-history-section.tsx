'use client';

/**
 * CrewWatchHistorySection — shown inside the vessel-side crew profile
 * dialog (`/dashboard/crew`) as the "Watches" tab.
 *
 * Pulls every `nav_watch_logs` row for this crew member (scoped to
 * the vessel when provided), runs them through
 * `summariseCrewWatchHistory`, and renders:
 *
 *   - header card with totals (hours, watches, days worked, active)
 *   - per-watch-type pill row (Bridge · 120 h · 30 watches …)
 *   - per-month accordion cards, each expandable to show the
 *     individual watches with date / time / type / hours
 *
 * The component is read-only — crew log their own watches on
 * `/dashboard/bridge-watch-log`. Later we'll surface the same view
 * on the crew member's own profile account once we sync; the helper
 * (`summariseCrewWatchHistory`) is shape-compatible with that future
 * surface so we won't have to refactor.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Clock,
  Loader2,
  Navigation,
  RefreshCw,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  summariseCrewWatchHistory,
  watchTypeAccent,
  watchTypeLabel,
  type CrewWatchHistorySummary,
  type MonthlyWatchBucket,
  type NavWatchLogRow,
  type WatchEntry,
} from '@/lib/watch-history-summary';

interface CrewWatchHistorySectionProps {
  supabase: SupabaseClient | null;
  /**
   * When provided, only watches stood on this vessel are loaded.
   * Pass `null` to load every watch the crew member has logged
   * across any vessel (used when this component is eventually
   * reused on the crew's own profile account).
   */
  vesselId: string | null;
  /** The crew member whose watch history we're displaying. */
  crewUserId: string;
  crewDisplayName?: string | null;
}

function fmtTimeRange(startIso: string, endIso: string | null): string {
  try {
    const startStr = format(parseISO(startIso), 'HH:mm');
    if (!endIso) return `${startStr} – in progress`;
    return `${startStr} – ${format(parseISO(endIso), 'HH:mm')}`;
  } catch {
    return endIso ? `${startIso} – ${endIso}` : startIso;
  }
}

function fmtDateShort(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE d MMM yyyy');
  } catch {
    return iso;
  }
}

/** Round to 1 dp but drop trailing `.0` so "4" stays "4 h" not "4.0 h". */
function fmtHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const isWhole = rounded === Math.trunc(rounded);
  return `${isWhole ? rounded.toFixed(0) : rounded.toFixed(1)} h`;
}

export function CrewWatchHistorySection({
  supabase,
  vesselId,
  crewUserId,
  crewDisplayName,
}: CrewWatchHistorySectionProps) {
  const [rows, setRows] = useState<NavWatchLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  // null = haven't probed yet; set after first load.
  const [tableExists, setTableExists] = useState<boolean | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!supabase || !crewUserId) return;
    setLoading(true);
    try {
      let q = supabase
        .from('nav_watch_logs')
        .select(
          'id, user_id, vessel_id, vessel_assignment_id, start_time, end_time, watch_type, position, notes, weather_conditions, sea_state, visibility, passage_id',
        )
        .eq('user_id', crewUserId)
        .order('start_time', { ascending: false });
      if (vesselId) q = q.eq('vessel_id', vesselId);

      const { data, error } = await q;

      if (error) {
        // 42P01 = relation does not exist → table not yet provisioned.
        if ((error as any).code === '42P01') {
          setTableExists(false);
          setRows([]);
          return;
        }
        throw error;
      }

      setTableExists(true);
      setRows((data ?? []) as unknown as NavWatchLogRow[]);
    } catch (err: any) {
      console.error('[CREW WATCH HISTORY] load failed:', err);
      toast({
        title: 'Could not load watches',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, vesselId, crewUserId]);

  useEffect(() => {
    setRows([]);
    setExpandedMonths(new Set());
    void load();
  }, [load]);

  const summary: CrewWatchHistorySummary = useMemo(
    () => summariseCrewWatchHistory(rows, crewUserId),
    [rows, crewUserId],
  );

  // Auto-expand the most-recent month so users see detail immediately
  // without an extra click. Honour their explicit collapse later.
  useEffect(() => {
    if (summary.months.length > 0 && expandedMonths.size === 0) {
      setExpandedMonths(new Set([summary.months[0].monthKey]));
    }
    // We intentionally don't depend on expandedMonths to avoid undoing
    // user collapses; only react when months changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.months]);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tableExists === false) {
    return (
      <Alert>
        <AlertTitle>Watch history not available</AlertTitle>
        <AlertDescription>
          The <code className="text-xs">nav_watch_logs</code> table
          isn&apos;t provisioned on this project yet. Once a crew member
          logs their first watch on{' '}
          <code className="text-xs">/dashboard/bridge-watch-log</code>,
          the record will show up here automatically.
        </AlertDescription>
      </Alert>
    );
  }

  const nameForCopy = crewDisplayName?.trim() || 'this crew member';

  return (
    <div className="space-y-4">
      {/* Header summary card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Watch record
              </CardTitle>
              <CardDescription>
                Every watch {nameForCopy} has logged
                {vesselId ? ' on this vessel.' : ' across every vessel.'}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryStat label="Total hours" value={fmtHours(summary.totalHours)} tone="primary" />
            <SummaryStat label="Watches" value={String(summary.totalWatches)} tone="default" />
            <SummaryStat label="Days worked" value={String(summary.totalDaysWorked)} tone="default" />
            <SummaryStat
              label="Active now"
              value={String(summary.activeWatches)}
              tone={summary.activeWatches > 0 ? 'accent' : 'default'}
            />
          </div>

          {/* Per watch type breakdown */}
          {summary.byWatchType.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {summary.byWatchType.map((b) => (
                <span
                  key={b.watchType}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-0.5 text-xs"
                >
                  <span className={cn('h-2 w-2 rounded-full', watchTypeAccent(b.watchType))} />
                  <span className="font-medium">{b.label}</span>
                  <span className="text-muted-foreground">
                    · {fmtHours(b.hours)} · {b.watches} watch
                    {b.watches === 1 ? '' : 'es'}
                  </span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-month detail */}
      {summary.months.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No watches logged for {nameForCopy} yet. Watches recorded on{' '}
            <code className="text-xs">/dashboard/bridge-watch-log</code> will appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {summary.months.map((m) => (
            <MonthCard
              key={m.monthKey}
              month={m}
              expanded={expandedMonths.has(m.monthKey)}
              onToggle={() => toggleMonth(m.monthKey)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MonthCard({
  month,
  expanded,
  onToggle,
}: {
  month: MonthlyWatchBucket;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-sm truncate">{month.monthLabel}</CardTitle>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-base font-semibold tabular-nums">{fmtHours(month.hours)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {month.watches} watch{month.watches === 1 ? '' : 'es'} · {month.daysWorked} day
                {month.daysWorked === 1 ? '' : 's'}
              </div>
            </div>
            <ChevronDown
              className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')}
            />
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-1">
            {month.entries.map((e) => (
              <WatchEntryRow key={e.id} entry={e} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function WatchEntryRow({ entry }: { entry: WatchEntry }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors',
        entry.isActive ? 'bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted/40',
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', watchTypeAccent(entry.watchType))} />
      <span className="text-sm font-medium min-w-[8.5rem] shrink-0">{fmtDateShort(entry.startTime)}</span>
      <span className="text-sm text-muted-foreground tabular-nums shrink-0">
        {fmtTimeRange(entry.startTime, entry.endTime)}
      </span>
      <Badge
        variant="secondary"
        className="text-[10px] font-medium uppercase tracking-wide shrink-0"
      >
        {watchTypeLabel(entry.watchType)}
      </Badge>
      {entry.position && (
        <span className="text-xs text-muted-foreground italic truncate">
          <Navigation className="inline h-3 w-3 mr-0.5 align-text-bottom" />
          {entry.position}
        </span>
      )}
      <span className="ml-auto text-xs font-medium tabular-nums shrink-0">
        {entry.isActive ? (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Active
          </span>
        ) : entry.hours != null ? (
          fmtHours(entry.hours)
        ) : (
          '—'
        )}
      </span>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'accent' | 'default';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'primary' && 'border-primary/30 bg-primary/5 dark:bg-primary/10',
        tone === 'accent' && 'border-amber-300/60 bg-amber-50 dark:bg-amber-950/20',
        tone === 'default' && 'border-border bg-muted/30',
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-2xl font-semibold tabular-nums',
          tone === 'primary' && 'text-primary',
          tone === 'accent' && 'text-amber-700 dark:text-amber-400',
        )}
      >
        {value}
      </div>
    </div>
  );
}
