'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, subMonths } from 'date-fns';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Loader2,
  MapPin,
  Radio,
  Search,
  Ship,
  Sparkles,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AisHistoryPageHeader,
  AisHistorySection,
  AisHistoryStatTiles,
} from '@/components/dashboard/ais-history-page-ui';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';
import { calendarStateSolid, calendarStateWash } from '@/lib/calendar-state-colors';
import {
  AIS_HISTORY_MAX_DAYS,
  formatAisCoordinates,
  getAisLocationDisplayName,
  getAisLocationTooltipLines,
  formatMonthLabel,
  getMonthDateRange,
  monthKeyFromDate,
  shiftMonthKey,
  type AisHistoryPositionSample,
  type AisHistoryPreviewDay,
  type AisHistoryPreviewSummary,
} from '@/lib/ais/historical-import';
import type { DailyStatus, UserProfile, Vessel } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { useCrewVesselFeatureBoost } from '@/contexts/crew-vessel-feature-boost-context';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselAssignments } from '@/supabase/database/queries';
import { useSupabase, useUser } from '@/supabase';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatAssignmentPeriodLabel,
  getAssignmentSegmentsInRange,
  getEarliestAssignmentStart,
  getLatestAssignmentEnd,
  todayDateKey,
} from '@/lib/vessel-assignment-dates';
import type { VesselAssignment } from '@/lib/types';

const STATE_LABELS: Record<DailyStatus, string> = {
  underway: 'Underway',
  'at-anchor': 'At Anchor',
  'in-port': 'Moored',
  'on-leave': 'On Leave',
  'in-yard': 'In Yard',
};

const CHANGE_BADGE: Record<
  AisHistoryPreviewDay['changeType'],
  { label: string; className: string }
> = {
  new: {
    label: 'New',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  same: {
    label: 'Matches',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
  conflict: {
    label: 'Conflict',
    className: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  },
};

type PreviewResponse = {
  days: AisHistoryPreviewDay[];
  summary: AisHistoryPreviewSummary;
  rawPositionCount: number;
  datalasticRequestCount?: number;
  allowedSegments?: Array<{ from: string; to: string }>;
  assignmentPeriods?: Array<{ startDate: string; endDate: string | null }>;
  importEarliestDate?: string;
  importLatestDate?: string;
};

const STEPS = [
  { id: 1, label: 'Choose month' },
  { id: 2, label: 'Review AIS data' },
  { id: 3, label: 'Import to logs' },
] as const;

export default function AISImportPage() {
  const { user } = useUser();
  const { session, supabase } = useSupabase();
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    'users',
    user?.id,
  );
  const { boost: vesselBoost } = useCrewVesselFeatureBoost();
  const { isEnabled: isFeatureEnabled, isLoading: isFlagsLoading } = useFeatureFlags();

  const userProfile = userProfileRaw
    ? ({
        ...userProfileRaw,
        activeVesselId:
          (userProfileRaw as unknown as Record<string, unknown>).active_vessel_id ||
          (userProfileRaw as unknown as Record<string, unknown>).activeVesselId,
        role:
          (userProfileRaw as unknown as Record<string, unknown>).role ||
          userProfileRaw.role ||
          'crew',
      } as UserProfile)
    : null;

  const isVesselManager = userProfile?.role === 'vessel';
  const eligible = isFeatureEnabled('ais_history_import');
  const activeVesselId = userProfile?.activeVesselId;

  const [selectedVesselId, setSelectedVesselId] = useState<string>('');
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);

  const { data: vesselsData } = useCollection<Vessel>('vessels');

  const { data: vesselData } = useDoc<Vessel>(
    'vessels',
    (isVesselManager ? activeVesselId : selectedVesselId) || null,
  );

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    let cancelled = false;

    async function loadAssignments() {
      setIsLoadingAssignments(true);
      try {
        const assignments = await getVesselAssignments(supabase, userId);
        if (cancelled) return;
        setVesselAssignments(assignments);

        if (isVesselManager && activeVesselId) {
          setSelectedVesselId(activeVesselId);
        } else if (assignments.length > 0) {
          const preferred =
            assignments.find((a) => a.vesselId === activeVesselId && !a.endDate) ??
            assignments.find((a) => a.vesselId === activeVesselId) ??
            assignments[0];
          setSelectedVesselId(preferred.vesselId);
        } else {
          setSelectedVesselId('');
        }
      } catch (error) {
        console.error('[AIS IMPORT] Failed to load assignments:', error);
      } finally {
        if (!cancelled) setIsLoadingAssignments(false);
      }
    }

    void loadAssignments();
    return () => {
      cancelled = true;
    };
  }, [user?.id, supabase, isVesselManager, activeVesselId]);

  const availableVessels = useMemo(() => {
    if (isVesselManager) {
      return vesselData ? [vesselData] : [];
    }
    if (!vesselsData?.length || !vesselAssignments.length) return [];
    const assignedIds = new Set(vesselAssignments.map((a) => a.vesselId));
    return vesselsData.filter((v) => assignedIds.has(v.id));
  }, [isVesselManager, vesselData, vesselsData, vesselAssignments]);

  const assignmentsForSelectedVessel = useMemo(
    () => vesselAssignments.filter((a) => a.vesselId === selectedVesselId),
    [vesselAssignments, selectedVesselId],
  );

  const importDateBounds = useMemo(() => {
    if (isVesselManager) {
      const startDate =
        (userProfile?.startDate as string | undefined) ||
        (vesselData as { createdAt?: string; created_at?: string } | null)?.createdAt?.slice(0, 10) ||
        (vesselData as { created_at?: string } | null)?.created_at?.slice(0, 10) ||
        null;
      return {
        earliestDate: startDate,
        latestDate: todayDateKey(),
        assignmentLabels: [] as string[],
      };
    }

    const periods = assignmentsForSelectedVessel.map((a) => ({
      startDate: a.startDate,
      endDate: a.endDate ?? null,
    }));

    return {
      earliestDate: getEarliestAssignmentStart(periods),
      latestDate: getLatestAssignmentEnd(periods),
      assignmentLabels: assignmentsForSelectedVessel.map((a) =>
        formatAssignmentPeriodLabel({ startDate: a.startDate, endDate: a.endDate ?? null }),
      ),
    };
  }, [isVesselManager, userProfile, vesselData, assignmentsForSelectedVessel]);

  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyFromDate(new Date()));
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const monthRange = useMemo(() => getMonthDateRange(selectedMonth), [selectedMonth]);
  const [fromDate, setFromDate] = useState(() => getMonthDateRange(monthKeyFromDate(new Date())).from);
  const [toDate, setToDate] = useState(() => getMonthDateRange(monthKeyFromDate(new Date())).to);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [overwriteConflicts, setOverwriteConflicts] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!useCustomRange) {
      setFromDate(monthRange.from);
      setToDate(monthRange.to);
      setPreview(null);
    }
  }, [monthRange.from, monthRange.to, useCustomRange]);

  const applyMonth = (monthKey: string) => {
    setUseCustomRange(false);
    setCustomRangeOpen(false);
    setSelectedMonth(monthKey);
    const range = getMonthDateRange(monthKey);
    setFromDate(range.from);
    setToDate(range.to);
    setPreview(null);
  };

  const activeFrom = useCustomRange ? fromDate : monthRange.from;
  const activeTo = useCustomRange ? toDate : monthRange.to;
  const isCurrentMonth = selectedMonth === monthKeyFromDate(new Date());
  const isFutureMonth = selectedMonth > monthKeyFromDate(new Date());
  const currentStep = preview ? 2 : 1;

  const importableLatestDate = importDateBounds.latestDate ?? todayDateKey();
  const importableEarliestDate = importDateBounds.earliestDate;
  const hasVesselSelected = isVesselManager ? !!activeVesselId : !!selectedVesselId;

  const selectedRangeOverlapsAssignment = useMemo(() => {
    if (isVesselManager || assignmentsForSelectedVessel.length === 0) return true;
    const periods = assignmentsForSelectedVessel.map((a) => ({
      startDate: a.startDate,
      endDate: a.endDate ?? null,
    }));
    return getAssignmentSegmentsInRange(activeFrom, activeTo, periods).length > 0;
  }, [isVesselManager, assignmentsForSelectedVessel, activeFrom, activeTo]);

  useEffect(() => {
    setPreview(null);
  }, [selectedVesselId]);

  const importableDays = useMemo(() => {
    if (!preview) return [];
    return preview.days.filter((day) => {
      if (day.changeType === 'new') return true;
      if (day.changeType === 'conflict' && overwriteConflicts) return true;
      return false;
    });
  }, [preview, overwriteConflicts]);

  useEffect(() => {
    if (!preview) return;
    setSelectedDates(new Set(importableDays.map((d) => d.date)));
  }, [preview, importableDays]);

  const runLookup = async (from: string, to: string) => {
    if (!session?.access_token || !selectedVesselId) return;

    setIsLookingUp(true);
    setPreview(null);
    setExpandedDate(null);
    try {
      const res = await fetch('/api/ais/history/preview', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vesselId: selectedVesselId,
          from,
          to,
          timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');

      setPreview(data as PreviewResponse);

      if (data.summary?.totalDays === 0) {
        toast({
          title: 'No AIS positions found',
          description: 'Try a different month or check the vessel MMSI on your profile.',
        });
      }
    } catch (err: unknown) {
      toast({
        title: 'AIS lookup failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLookup = () => runLookup(activeFrom, activeTo);

  const goToPreviousMonth = async () => {
    const prev = shiftMonthKey(selectedMonth, -1);
    applyMonth(prev);
    const range = getMonthDateRange(prev);
    await runLookup(range.from, range.to);
  };

  const handleImport = async () => {
    if (!session?.access_token || !selectedVesselId || !preview || selectedDates.size === 0) return;

    const entries = preview.days
      .filter((day) => selectedDates.has(day.date))
      .map((day) => ({
        date: day.date,
        state: day.proposedState,
        navStatus: day.navStatus,
        speed: day.speed,
      }));

    setIsImporting(true);
    try {
      const res = await fetch('/api/ais/history/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vesselId: selectedVesselId,
          entries,
          overwriteConflicts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      toast({
        title: 'AIS history imported',
        description: `${data.imported} day${data.imported === 1 ? '' : 's'} added to your ${isVesselManager ? 'vessel state logs' : 'sea-time calendar'}.`,
      });

      await runLookup(activeFrom, activeTo);
    } catch (err: unknown) {
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleDate = (date: string, checked: boolean) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (checked) next.add(date);
      else next.delete(date);
      return next;
    });
  };

  const toggleAllImportable = (checked: boolean) => {
    if (checked) {
      setSelectedDates(new Set(importableDays.map((d) => d.date)));
    } else {
      setSelectedDates(new Set());
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6">
        <AisHistoryPageHeader title="AIS history" />
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AIS history…
        </div>
      </div>
    );
  }

  const hasIdentifier = !!(vesselData?.mmsi || vesselData?.imo || vesselData?.officialNumber);
  const rangeLabel = useCustomRange
    ? `${format(new Date(`${fromDate}T12:00:00`), 'd MMM yyyy')} – ${format(new Date(`${toDate}T12:00:00`), 'd MMM yyyy')}`
    : `${format(new Date(`${monthRange.from}T12:00:00`), 'd MMM')} – ${format(new Date(`${monthRange.to}T12:00:00`), 'd MMM yyyy')}${isCurrentMonth ? ' (up to today)' : ''}`;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <AisHistoryPageHeader
        title="AIS history"
        description="Backfill your calendar from Datalastic AIS history — one month at a time, with a full review before anything is saved."
        actions={
          vesselData ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
              <Ship className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground">{vesselData.name}</span>
              <Separator orientation="vertical" className="mx-0.5 h-3.5" />
              <span className="text-muted-foreground">
                MMSI{' '}
                <span className="font-mono text-foreground">{vesselData.mmsi || '—'}</span>
              </span>
              {!hasIdentifier && (
                <Link
                  href={isVesselManager ? '/dashboard/profile' : '/dashboard/current'}
                  className="font-medium text-amber-700 underline dark:text-amber-400"
                >
                  {isVesselManager ? 'Add MMSI' : 'Set current vessel'}
                </Link>
              )}
            </div>
          ) : undefined
        }
      />

      {eligible && (
        <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  currentStep >= step.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-[5px] text-[10px] font-bold',
                    currentStep >= step.id
                      ? 'bg-sky-600 text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {step.id}
                </span>
                {step.label}
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="mx-0.5 hidden h-3.5 w-3.5 text-muted-foreground/50 sm:block" />
              )}
            </div>
          ))}
        </div>
      )}

      {!eligible ? (
        <VesselPremiumFeatureGate
          title={
            isVesselManager
              ? 'Available on Vessel Premium'
              : 'Available on Premium or Professional'
          }
          featureLabel="AIS history import"
          plansLabel={
            isVesselManager
              ? 'Vessel Premium, Vessel Professional, and Fleet'
              : 'Premium and Professional'
          }
          description={
            isVesselManager
              ? 'Import historical vessel states from AIS when your vessel is on Premium or Professional.'
              : 'Import historical vessel states from AIS into your personal sea-time calendar.'
          }
        />
      ) : (
        <>
          {!isVesselManager && !isLoadingAssignments && vesselAssignments.length === 0 && (
            <Alert variant="destructive" className="rounded-md">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No vessel assignments</AlertTitle>
              <AlertDescription>
                AIS history can only be imported for vessels you were assigned to. Add a current or
                past vessel on{' '}
                <Link href="/dashboard/current" className="underline font-medium">
                  Current Service
                </Link>{' '}
                or{' '}
                <Link href="/dashboard/vessel-history" className="underline font-medium">
                  Vessel History
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}

          {isVesselManager && !activeVesselId && (
            <Alert variant="destructive" className="rounded-md">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Current vessel required</AlertTitle>
              <AlertDescription>
                Set your current vessel on the{' '}
                <Link href="/dashboard/current" className="underline font-medium">
                  Current Service
                </Link>{' '}
                page before importing AIS history.
              </AlertDescription>
            </Alert>
          )}

          {hasVesselSelected && !selectedRangeOverlapsAssignment && (
            <Alert variant="destructive" className="rounded-md">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Date range outside assignment</AlertTitle>
              <AlertDescription>
                {isVesselManager
                  ? `AIS import is only available from ${importDateBounds.earliestDate ?? 'your start date'} through today.`
                  : `The selected dates do not overlap your assignment on this vessel${
                      importDateBounds.assignmentLabels.length > 0
                        ? ` (${importDateBounds.assignmentLabels.join('; ')})`
                        : ''
                    }.`}
              </AlertDescription>
            </Alert>
          )}

          {hasVesselSelected &&
            selectedRangeOverlapsAssignment &&
            !isVesselManager &&
            importDateBounds.assignmentLabels.length > 0 && (
              <Alert className="rounded-md border-sky-500/20 bg-sky-500/5">
                <CalendarDays className="h-4 w-4 text-sky-600" />
                <AlertTitle>Assignment period</AlertTitle>
                <AlertDescription>
                  Import is limited to dates while you were assigned to this vessel:{' '}
                  {importDateBounds.assignmentLabels.join('; ')}.
                </AlertDescription>
              </Alert>
            )}

          {!hasIdentifier && hasVesselSelected && (
            <Alert variant="destructive" className="rounded-md">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>MMSI required</AlertTitle>
              <AlertDescription>
                {isVesselManager ? (
                  <>
                    Add an MMSI on your{' '}
                    <Link href="/dashboard/profile" className="underline font-medium">
                      vessel profile
                    </Link>{' '}
                    before looking up AIS history.
                  </>
                ) : (
                  <>
                    This vessel needs an MMSI or IMO before AIS history can be fetched. Ask your
                    vessel manager to add it, or pick a vessel that already has one on{' '}
                    <Link href="/dashboard/current" className="underline font-medium">
                      Current Service
                    </Link>
                    .
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            <AisHistorySection
              title="Select period"
              description="Navigate month by month while backfilling your logs."
            >
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
                  <div className="overflow-hidden rounded-md border border-border bg-background">
                    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md"
                        aria-label="Previous month"
                        disabled={useCustomRange}
                        onClick={() => applyMonth(shiftMonthKey(selectedMonth, -1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="min-w-0 flex-1 text-center">
                        <p className="truncate text-lg font-medium tracking-tight">
                          {formatMonthLabel(selectedMonth)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md"
                        aria-label="Next month"
                        disabled={isCurrentMonth || useCustomRange}
                        onClick={() => applyMonth(shiftMonthKey(selectedMonth, 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2.5">
                      <Button
                        type="button"
                        variant={isCurrentMonth && !useCustomRange ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-7 rounded-md text-xs"
                        disabled={useCustomRange || isCurrentMonth}
                        onClick={() => applyMonth(monthKeyFromDate(new Date()))}
                      >
                        This month
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-md text-xs"
                        disabled={useCustomRange}
                        onClick={() => applyMonth(monthKeyFromDate(subMonths(new Date(), 1)))}
                      >
                        Last month
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-md text-xs"
                        disabled={useCustomRange}
                        onClick={() => applyMonth(monthKeyFromDate(subMonths(new Date(), 2)))}
                      >
                        2 months ago
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                      <Label
                        htmlFor="ais-month"
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        Jump to
                      </Label>
                      <Input
                        id="ais-month"
                        type="month"
                        value={selectedMonth}
                        min={importableEarliestDate?.slice(0, 7)}
                        max={importableLatestDate.slice(0, 7)}
                        disabled={useCustomRange || !hasVesselSelected}
                        onChange={(e) => {
                          if (e.target.value) applyMonth(e.target.value);
                        }}
                        className="h-8 flex-1 rounded-md text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    {!isVesselManager && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ais-vessel"
                          className="text-[11px] font-medium text-muted-foreground"
                        >
                          Vessel
                        </Label>
                        <Select
                          value={selectedVesselId}
                          onValueChange={(id) => setSelectedVesselId(id)}
                          disabled={isLoadingAssignments || availableVessels.length === 0}
                        >
                          <SelectTrigger id="ais-vessel" className="h-9 rounded-md text-sm">
                            <SelectValue
                              placeholder={
                                isLoadingAssignments ? 'Loading vessels…' : 'Select a vessel'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableVessels.map((vessel) => (
                              <SelectItem key={vessel.id} value={vessel.id}>
                                <div className="flex items-center gap-2">
                                  <Ship className="h-4 w-4" />
                                  {vessel.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Only vessels you are or were assigned to.
                        </p>
                      </div>
                    )}

                    <Button
                      className="h-9 w-full rounded-md text-sm font-medium"
                      disabled={
                        !hasVesselSelected ||
                        !hasIdentifier ||
                        isLookingUp ||
                        isFutureMonth ||
                        activeFrom > activeTo ||
                        !selectedRangeOverlapsAssignment
                      }
                      onClick={() => void handleLookup()}
                    >
                      {isLookingUp ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Fetching AIS data…
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-3.5 w-3.5" />
                          Look up {useCustomRange ? 'custom range' : formatMonthLabel(selectedMonth)}
                        </>
                      )}
                    </Button>

                    <Collapsible open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full justify-between rounded-md text-xs text-muted-foreground"
                        >
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Advanced: custom date range
                          </span>
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 transition-transform',
                              customRangeOpen && 'rotate-180',
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 pt-2">
                        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                          <Switch
                            id="custom-range"
                            checked={useCustomRange}
                            onCheckedChange={(v) => {
                              setUseCustomRange(v);
                              if (v) setPreview(null);
                            }}
                          />
                          <Label htmlFor="custom-range" className="text-xs leading-snug">
                            Use custom range (max {AIS_HISTORY_MAX_DAYS} days)
                          </Label>
                        </div>
                        {useCustomRange && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label htmlFor="ais-from" className="text-xs">
                                From
                              </Label>
                              <Input
                                id="ais-from"
                                type="date"
                                value={fromDate}
                                min={importableEarliestDate ?? undefined}
                                max={importableLatestDate}
                                onChange={(e) => {
                                  setFromDate(e.target.value);
                                  setPreview(null);
                                }}
                                className="h-8 rounded-md text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="ais-to" className="text-xs">
                                To
                              </Label>
                              <Input
                                id="ais-to"
                                type="date"
                                value={toDate}
                                min={importableEarliestDate ?? undefined}
                                max={importableLatestDate}
                                onChange={(e) => {
                                  setToDate(e.target.value);
                                  setPreview(null);
                                }}
                                className="h-8 rounded-md text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>

                <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
                  <div className="flex gap-3">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                    <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
                      <p className="font-medium text-foreground">How it works</p>
                      <p>
                        Every day&apos;s state is computed from <em>all</em> AIS fixes — distance,
                        time underway, and the dominant nav status — with a confidence rating.
                        Import adds an{' '}
                        <span className="font-mono text-[10px]">[AIS import]</span> note to your
                        calendar.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </AisHistorySection>

            <div className="min-w-0 space-y-4">
              {!preview && !isLookingUp && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-6 py-14 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40">
                    <Database className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="max-w-sm space-y-1">
                    <p className="text-sm font-medium">No data loaded yet</p>
                    <p className="text-xs text-muted-foreground">
                      Choose a month and click look up to preview daily vessel states before
                      importing them to your logs.
                    </p>
                  </div>
                </div>
              )}

              {isLookingUp && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border py-16">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading AIS history…
                  </div>
                  <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
                </div>
              )}

              {preview && !isLookingUp && (
                <AisHistorySection
                  title="Review & import"
                  description={`${formatMonthLabel(selectedMonth)} · ${preview.rawPositionCount} AIS positions${
                    preview.datalasticRequestCount && preview.datalasticRequestCount > 1
                      ? ` · ${preview.datalasticRequestCount} API requests`
                      : ''
                  }`}
                  action={
                    !useCustomRange ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-md text-xs shrink-0"
                        disabled={isLookingUp}
                        onClick={() => void goToPreviousMonth()}
                      >
                        <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                        {formatMonthLabel(shiftMonthKey(selectedMonth, -1))}
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="space-y-4">
                    <AisHistoryStatTiles
                      items={[
                        {
                          label: 'Days with AIS',
                          value: preview.summary.totalDays,
                          tone: 'sky',
                        },
                        {
                          label: 'New to import',
                          value: preview.summary.newDays,
                          tone: 'emerald',
                        },
                        {
                          label: 'Already match',
                          value: preview.summary.sameDays,
                          tone: 'default',
                        },
                        {
                          label: 'Conflicts',
                          value: preview.summary.conflictDays,
                          tone: 'amber',
                          hint:
                            preview.summary.conflictDays > 0
                              ? 'Toggle overwrite below'
                              : undefined,
                        },
                      ]}
                    />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          id="overwrite-conflicts"
                          checked={overwriteConflicts}
                          onCheckedChange={setOverwriteConflicts}
                        />
                        <Label htmlFor="overwrite-conflicts" className="text-sm leading-snug">
                          Overwrite conflicting days
                        </Label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-md text-xs"
                          disabled={importableDays.length === 0}
                          onClick={() => toggleAllImportable(true)}
                        >
                          Select all
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-md text-xs"
                          onClick={() => toggleAllImportable(false)}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>

                    {preview.summary.totalDays === 0 ? (
                      <div className="py-10 text-center">
                        <Radio className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium">No AIS positions for this period</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Try another month or confirm your MMSI is correct.
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-[min(52vh,520px)] overflow-auto rounded-md border border-border">
                        <TooltipProvider delayDuration={200}>
                        <Table>
                          <TableHeader className="sticky top-0 z-10">
                            <TableRow className="border-border hover:bg-transparent">
                              <TableHead className="h-9 w-10 bg-muted/40 pl-4 text-[11px] font-normal text-muted-foreground" />
                              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                                Date
                              </TableHead>
                              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground md:table-cell">
                                AIS
                              </TableHead>
                              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground lg:table-cell">
                                Location
                              </TableHead>
                              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                                Proposed
                              </TableHead>
                              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground sm:table-cell">
                                Current
                              </TableHead>
                              <TableHead className="h-9 bg-muted/40 pr-4 text-right text-[11px] font-normal text-muted-foreground">
                                Status
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.days.map((day) => {
                              const canImport =
                                day.changeType === 'new' ||
                                (day.changeType === 'conflict' && overwriteConflicts);
                              const badge = CHANGE_BADGE[day.changeType];
                              const isSelected = selectedDates.has(day.date);
                              const locationName = getAisLocationDisplayName(day);
                              const isExpanded = expandedDate === day.date;
                              const canExpand = day.positionCount > 0;

                              return (
                                <Fragment key={day.date}>
                                  <TableRow
                                    className={cn(
                                      'border-border transition-colors',
                                      canImport && isSelected && 'bg-sky-500/5',
                                      !canImport && 'opacity-60',
                                      isExpanded && 'border-b-0',
                                    )}
                                    style={
                                      canImport
                                        ? {
                                            boxShadow: `inset 3px 0 0 ${calendarStateSolid(day.proposedState)}`,
                                          }
                                        : undefined
                                    }
                                  >
                                    <TableCell className="pl-4">
                                      <Checkbox
                                        checked={isSelected}
                                        disabled={!canImport}
                                        onCheckedChange={(checked) =>
                                          toggleDate(day.date, checked === true)
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <button
                                        type="button"
                                        disabled={!canExpand}
                                        onClick={() =>
                                          setExpandedDate(isExpanded ? null : day.date)
                                        }
                                        className={cn(
                                          'group inline-flex max-w-full items-center gap-1.5 text-left',
                                          canExpand &&
                                            'cursor-pointer rounded-md px-1 -mx-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500/40',
                                        )}
                                        title={
                                          canExpand
                                            ? isExpanded
                                              ? 'Hide raw AIS samples for this day'
                                              : `Show raw AIS samples (${day.positionCount} fix${day.positionCount === 1 ? '' : 'es'})`
                                            : undefined
                                        }
                                      >
                                        {canExpand ? (
                                          isExpanded ? (
                                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground" />
                                          )
                                        ) : (
                                          <span className="h-4 w-4 shrink-0" />
                                        )}
                                        <span>
                                          <span className="block font-medium leading-tight">
                                            {format(new Date(`${day.date}T12:00:00`), 'EEE d MMM')}
                                          </span>
                                          {canExpand && (
                                            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                                              {day.positionCount} fix
                                              {day.positionCount === 1 ? '' : 'es'}
                                            </span>
                                          )}
                                        </span>
                                      </button>
                                      <div className="space-y-0.5 pt-1 text-xs text-muted-foreground md:hidden">
                                        <div>{day.navStatus || '—'}</div>
                                        {locationName && (
                                          <LocationCell day={day} compact />
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden max-w-[200px] md:table-cell">
                                      <span className="truncate text-sm text-muted-foreground">
                                        {day.navStatus || '—'}
                                        {day.speed != null ? (
                                          <span className="text-foreground/70">
                                            {' '}
                                            · {day.speed.toFixed(1)} kn
                                          </span>
                                        ) : null}
                                      </span>
                                    </TableCell>
                                    <TableCell className="hidden max-w-[240px] lg:table-cell">
                                      <LocationCell day={day} />
                                    </TableCell>
                                    <TableCell>
                                      <ProposedStateCell day={day} />
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                      {day.existingState ? (
                                        <StatePill state={day.existingState} muted />
                                      ) : (
                                        <span className="text-xs text-muted-foreground">Empty</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="pr-4 text-right">
                                      <Badge
                                        variant="outline"
                                        className={cn('text-[10px]', badge.className)}
                                      >
                                        {badge.label}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>

                                  {isExpanded && (
                                    <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                                      <TableCell colSpan={7} className="p-0">
                                        <RawSamplesPanel day={day} />
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                        </TooltipProvider>
                      </div>
                    )}

                    <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-background/95 px-0 py-3 backdrop-blur sm:static supports-[backdrop-filter]:bg-background/90">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold tabular-nums text-foreground">
                            {selectedDates.size}
                          </span>{' '}
                          day{selectedDates.size === 1 ? '' : 's'} selected
                          {importableDays.length > 0 && (
                            <span className="hidden sm:inline">
                              {' '}
                              · {importableDays.length} importable
                            </span>
                          )}
                        </p>
                        <Button
                          className="h-8 rounded-md px-4 text-xs font-medium"
                          disabled={selectedDates.size === 0 || isImporting}
                          onClick={() => void handleImport()}
                        >
                          {isImporting ? (
                            <>
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              Importing…
                            </>
                          ) : (
                            <>
                              <Upload className="mr-2 h-3.5 w-3.5" />
                              Import to {isVesselManager ? 'vessel logs' : 'calendar'}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </AisHistorySection>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LocationCell({
  day,
  compact = false,
}: {
  day: AisHistoryPreviewDay;
  compact?: boolean;
}) {
  const displayName = getAisLocationDisplayName(day);
  const tooltipLines = getAisLocationTooltipLines(day);
  const coords = formatAisCoordinates(day.latitude, day.longitude);

  if (!displayName && tooltipLines.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const inner = (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1',
        compact ? 'text-xs text-muted-foreground' : 'text-sm text-foreground',
        tooltipLines.length > 0 && 'cursor-help underline decoration-dotted underline-offset-2',
      )}
    >
      <MapPin className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5 text-muted-foreground')} />
      <span className="truncate">{displayName || 'Unknown area'}</span>
    </span>
  );

  if (tooltipLines.length === 0) {
    return inner;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex min-w-0 max-w-full text-left">
          {inner}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1 text-xs">
          {tooltipLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {coords && (
            <a
              href={`https://www.google.com/maps?q=${day.latitude},${day.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
              View on map
            </a>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const CONFIDENCE_BADGE: Record<
  NonNullable<AisHistoryPreviewDay['confidence']>,
  { label: string; className: string }
> = {
  high: {
    label: 'High',
    className:
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  medium: {
    label: 'Medium',
    className:
      'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  },
  low: {
    label: 'Low',
    className:
      'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  },
};

function ProposedStateCell({ day }: { day: AisHistoryPreviewDay }) {
  const reason = day.reason;
  const confidence = day.confidence;
  const pill = <StatePill state={day.proposedState} />;
  const badge = confidence ? (
    <Badge variant="outline" className={cn('text-[9px]', CONFIDENCE_BADGE[confidence].className)}>
      {CONFIDENCE_BADGE[confidence].label}
    </Badge>
  ) : null;

  const inner = (
    <div className="inline-flex items-center gap-1.5">
      {pill}
      {badge}
    </div>
  );

  if (!reason) return inner;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-left">
          {inner}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="font-medium">{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-background/80 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs font-medium">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function formatNm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 0.1) return `${(value * 1852).toFixed(0)} m`;
  return `${value.toFixed(2)} NM`;
}

function formatKn(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} kn`;
}

function formatHours(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '0 h';
  const hours = ms / 3600000;
  if (hours < 1) {
    const minutes = Math.round(ms / 60000);
    return `${minutes} min`;
  }
  return `${hours.toFixed(1)} h`;
}

function RawSamplesPanel({ day }: { day: AisHistoryPreviewDay }) {
  const samples = day.samples ?? [];
  if (samples.length === 0) {
    return (
      <div className="px-6 py-4 text-xs text-muted-foreground">
        No individual AIS fixes were retained for this day.
      </div>
    );
  }

  const hasMore = day.positionCount > samples.length;

  return (
    <div className="space-y-2 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Raw Datalastic positions for{' '}
          <span className="font-medium text-foreground">
            {format(new Date(`${day.date}T12:00:00`), 'EEE d MMM yyyy')}
          </span>{' '}
          · proposed state derived from full-day analysis
          {hasMore && (
            <>
              {' '}
              · showing {samples.length} of {day.positionCount} fixes
              <span className="ml-1 italic">(evenly downsampled)</span>
            </>
          )}
        </div>
      </div>

      {(day.reason || day.distanceTraveledNm != null) && (
        <div className="space-y-2 rounded-md border border-border bg-background/60 px-3 py-2.5">
          {day.reason && (
            <div className="flex items-start gap-2 text-xs">
              {day.confidence && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] shrink-0',
                    CONFIDENCE_BADGE[day.confidence].className,
                  )}
                >
                  {CONFIDENCE_BADGE[day.confidence].label} confidence
                </Badge>
              )}
              <span className="leading-snug">{day.reason}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            <MetricTile label="Distance" value={formatNm(day.distanceTraveledNm)} />
            <MetricTile
              label="Underway time"
              value={formatHours(day.underwayDurationMs)}
              hint="≥ 4h required"
            />
            <MetricTile
              label="Radius"
              value={formatNm(day.radiusOfMovementNm)}
              hint="from centroid"
            />
            <MetricTile
              label="Avg / peak"
              value={`${formatKn(day.avgSpeed)} / ${formatKn(day.maxSpeed)}`}
            />
            <MetricTile
              label="Dominant status"
              value={day.dominantNavStatus || '—'}
            />
          </div>
        </div>
      )}
      <div className="max-h-72 overflow-auto rounded-md border border-border bg-background">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="h-9 w-32 bg-muted/40 pl-4 text-[11px] font-normal text-muted-foreground">
                Time (UTC)
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                AIS nav status
              </TableHead>
              <TableHead className="h-9 w-24 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground">
                Speed
              </TableHead>
              <TableHead className="h-9 w-44 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Lat / Lon
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground lg:table-cell">
                Destination
              </TableHead>
              <TableHead className="h-9 w-32 bg-muted/40 pr-4 text-[11px] font-normal text-muted-foreground">
                Maps to
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {samples.map((sample, idx) => (
              <RawSampleRow
                key={`${sample.timeUtc}-${idx}`}
                sample={sample}
                expectedState={day.proposedState}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RawSampleRow({
  sample,
  expectedState,
}: {
  sample: AisHistoryPositionSample;
  expectedState: DailyStatus;
}) {
  const t = new Date(sample.timeUtc);
  const time = `${format(t, 'HH:mm')}:${String(t.getUTCSeconds()).padStart(2, '0')}`;
  const showRawDifference =
    sample.rawNavStatus &&
    sample.navStatus &&
    sample.rawNavStatus.trim().toLowerCase() !== sample.navStatus.trim().toLowerCase();
  const coords = formatAisCoordinates(sample.latitude, sample.longitude);
  const driftFromDay = sample.proposedState !== expectedState;

  return (
    <TableRow
      className={cn(
        'text-xs transition-colors',
        sample.isSelectedForDay && 'bg-sky-500/8',
      )}
    >
      <TableCell className="pl-4 font-mono tabular-nums">
        {time}
        {sample.isSelectedForDay && (
          <span
            className="ml-1.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
            title="Last AIS fix recorded that day"
          >
            Last
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="font-medium text-foreground">{sample.navStatus || '—'}</div>
        {showRawDifference && (
          <div className="text-[10px] text-muted-foreground">raw: {sample.rawNavStatus}</div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {sample.speed != null ? `${sample.speed.toFixed(1)} kn` : '—'}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {coords && sample.latitude != null && sample.longitude != null ? (
          <a
            href={`https://www.google.com/maps?q=${sample.latitude},${sample.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
          >
            <span className="font-mono text-[11px]">{coords}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="hidden max-w-[180px] truncate text-muted-foreground lg:table-cell">
        {sample.destination || '—'}
      </TableCell>
      <TableCell className="pr-4">
        <span
          className={cn(
            'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium',
            driftFromDay && 'ring-1 ring-amber-500/40',
          )}
          style={{
            backgroundColor: calendarStateWash(sample.proposedState, 22),
            color: calendarStateSolid(sample.proposedState),
          }}
          title={
            driftFromDay
              ? `This sample alone would map to "${STATE_LABELS[sample.proposedState]}" — different from the day's proposed state.`
              : undefined
          }
        >
          {STATE_LABELS[sample.proposedState]}
        </span>
      </TableCell>
    </TableRow>
  );
}

function StatePill({ state, muted }: { state: DailyStatus; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        muted ? 'opacity-75' : 'text-white',
      )}
      style={{
        backgroundColor: muted
          ? calendarStateWash(state, 22)
          : calendarStateSolid(state),
        color: muted ? calendarStateSolid(state) : undefined,
      }}
    >
      {STATE_LABELS[state]}
    </span>
  );
}
