'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  Clock,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  FolderOpen,
  History,
  Loader2,
  Search,
  Settings2,
  Ship,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { addDays, eachDayOfInterval, differenceInDays, format, isToday, isWeekend, parseISO, startOfWeek } from 'date-fns';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';
import {
  isLinkedVesselWatchViewer,
  vesselLinkedOwnedVesselId,
} from '@/lib/vessel-linked-features';
import {
  assignmentsOnWatchNow,
  fmtWatchHour,
  type OnWatchNow,
} from '@/lib/watch-schedule-now';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';

import type {
  SchedulableCrew,
  WatchAssignment,
  WatchSchedule,
} from '@/lib/watch-schedule-types';
import { generateWatchSchedulePDF } from '@/lib/watch-schedule-pdf';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RANGE_DAYS = 28;

// Palette used to colour each crew member's blocks on the schedule
// grid. We removed the old "watch system" presets (4-on/8-off etc.)
// because they were never actually applied to assignments — the
// manager always drags blocks manually — so all we need now is a
// per-crew colour cycle.
const SHIFT_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

function crewColor(idx: number): string {
  return SHIFT_COLORS[idx % SHIFT_COLORS.length];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function fmtHour(h: number): string {
  const actual = h === 24 ? 0 : h;
  return `${String(actual).padStart(2, '0')}:00`;
}

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function WatchSchedulePage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { supabase, session } = useSupabase();
  const { data: profileRaw, isLoading: isProfileLoading } = useDoc<Record<string, unknown>>(
    'users',
    user?.id,
  );

  const role = (profileRaw?.role as string) || 'crew';
  const isLinkedViewer = isLinkedVesselWatchViewer(profileRaw);
  const linkedVesselId = vesselLinkedOwnedVesselId(profileRaw);
  const activeVesselId =
    linkedVesselId || (profileRaw?.active_vessel_id as string) || null;
  const [linkedVesselName, setLinkedVesselName] = useState<string | null>(null);
  const vesselName =
    linkedVesselName ||
    (profileRaw?.vessel_name as string) ||
    (profileRaw?.active_vessel_name as string) ||
    'Vessel';
  const readOnly = isLinkedViewer;
  const { isEnabled: isFeatureEnabled } = useFeatureFlags();

  // ---- Auth guard ----
  useEffect(() => {
    if (isUserLoading || isProfileLoading) return;
    if (!user) { router.replace('/dashboard'); return; }
    if (profileRaw && role !== 'vessel' && !isLinkedViewer) {
      router.replace('/dashboard');
    }
  }, [isUserLoading, isProfileLoading, user, profileRaw, role, isLinkedViewer, router]);

  const hasPremiumPlusTier = isFeatureEnabled('watch_schedule');

  // ---- State ----
  const [crewPool, setCrewPool] = useState<SchedulableCrew[]>([]);
  const [isLoadingCrew, setIsLoadingCrew] = useState(false);

  const [schedule, setSchedule] = useState<WatchSchedule | null>(null);
  const [savedSchedules, setSavedSchedules] = useState<WatchSchedule[]>([]);
  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Setup form
  const [scheduleName, setScheduleName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [buildError, setBuildError] = useState<string | null>(null);

  // Crew selection for schedule
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);

  // ---- Fetch crew ----
  const fetchCrew = useCallback(async () => {
    if (!supabase || !activeVesselId || isLinkedViewer) return;
    setIsLoadingCrew(true);
    try {
      const [linkedRes, assignRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, email, first_name, last_name, role, position')
          .eq('managed_by_vessel_id', activeVesselId),
        supabase
          .from('vessel_assignments')
          .select('user_id, position, onboard')
          .eq('vessel_id', activeVesselId)
          .is('end_date', null)
          .eq('onboard', true),
      ]);

      const seen = new Set<string>();
      const pool: SchedulableCrew[] = [];

      for (const row of linkedRes.data ?? []) {
        const r = row as Record<string, any>;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        const name =
          [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || r.id;
        pool.push({ id: r.id, displayName: name, position: r.position ?? null, source: 'linked_account' });
      }

      const onboardAssignments = assignRes.data ?? [];
      if (onboardAssignments.length > 0) {
        const userIds = onboardAssignments
          .map((a: any) => a.user_id)
          .filter((id: string) => !seen.has(id));

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .in('id', userIds);

          const positionByUserId = new Map<string, string | null>();
          for (const a of onboardAssignments as any[]) {
            positionByUserId.set(a.user_id, a.position ?? null);
          }

          for (const u of profiles ?? []) {
            const r = u as Record<string, any>;
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            const name =
              [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || r.id;
            pool.push({
              id: r.id,
              displayName: name,
              position: positionByUserId.get(r.id) ?? null,
              source: 'vessel_assignment',
            });
          }
        }
      }

      setCrewPool(pool);
    } catch (err) {
      console.error('[WATCH SCHEDULE] Failed to load crew:', err);
    } finally {
      setIsLoadingCrew(false);
    }
  }, [supabase, activeVesselId, isLinkedViewer]);

  useEffect(() => {
    if (activeVesselId && !isLinkedViewer) void fetchCrew();
  }, [activeVesselId, fetchCrew, isLinkedViewer]);

  // ---- DB probe — loads all saved schedules ----
  const tryLoadFromDb = useCallback(async () => {
    if (!supabase || !activeVesselId || isLinkedViewer) return;
    try {
      const { data, error } = await supabase
        .from('watch_schedules')
        .select('*')
        .eq('vessel_id', activeVesselId)
        .order('created_at', { ascending: false });

      if (error) { setDbAvailable(false); return; }
      setDbAvailable(true);

      const parsed: WatchSchedule[] = (data ?? []).map((d: Record<string, any>) => ({
        id: d.id,
        vesselId: d.vessel_id,
        createdBy: d.created_by,
        name: d.name,
        startDate: d.start_date,
        endDate: d.end_date,
        watchSystem: d.watch_system,
        shifts: d.shifts ?? [],
        assignments: d.assignments ?? [],
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));

      setSavedSchedules(parsed);

      // NOTE: We intentionally do NOT auto-load a saved schedule into
      // the editor on page mount. The user has explicitly asked for
      // the schedule grid to only appear once they click a saved rota
      // (or build a new one). The saved list above acts as the entry
      // point — keeping the editor hidden makes the page feel clean
      // on every visit and matches how vessel managers actually use
      // the page (browse first, then choose what to open).
    } catch {
      setDbAvailable(false);
    }
  }, [supabase, activeVesselId, isLinkedViewer]);

  useEffect(() => {
    if (activeVesselId && !isLinkedViewer) void tryLoadFromDb();
  }, [activeVesselId, tryLoadFromDb, isLinkedViewer]);

  const loadLinkedWatchBoard = useCallback(async () => {
    if (!isLinkedViewer) return;
    const token = session?.access_token;
    if (!token) return;
    setIsLoadingCrew(true);
    try {
      const res = await fetch('/api/watch-schedule', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setDbAvailable(false);
        return;
      }
      const json = await res.json();
      setLinkedVesselName(
        typeof json.vesselName === 'string' ? json.vesselName : null,
      );
      setSavedSchedules(
        Array.isArray(json.schedules) ? (json.schedules as WatchSchedule[]) : [],
      );
      setCrewPool(Array.isArray(json.crew) ? (json.crew as SchedulableCrew[]) : []);
      setDbAvailable(true);
    } catch (err) {
      console.error('[WATCH SCHEDULE] linked load failed', err);
      setDbAvailable(false);
    } finally {
      setIsLoadingCrew(false);
    }
  }, [isLinkedViewer, session?.access_token]);

  useEffect(() => {
    if (isLinkedViewer) void loadLinkedWatchBoard();
  }, [isLinkedViewer, loadLinkedWatchBoard]);

  // ---- Build schedule ----
  // We persist `watchSystem: 'custom'` and `shifts: []` so the DB
  // payload still satisfies the legacy schema, but neither value
  // is used for anything user-facing — the manager just drags
  // blocks straight onto the timeline.
  const handleBuildSchedule = useCallback(() => {
    setBuildError(null);
    if (!startDate || !endDate) { setBuildError('Please enter both a start and end date.'); return; }
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (end < start) { setBuildError('End date must be after the start date.'); return; }
    const diff = differenceInDays(end, start);
    if (diff > MAX_RANGE_DAYS) {
      setBuildError(`Date range is too long (${diff} days). Maximum is ${MAX_RANGE_DAYS} days.`);
      return;
    }
    if (!user) return;
    const name = scheduleName.trim() || `Watch Schedule ${format(start, 'd MMM yyyy')}`;
    setSchedule((prev) => ({
      id: prev?.id,
      vesselId: activeVesselId ?? '',
      createdBy: user.id,
      name,
      startDate,
      endDate,
      watchSystem: 'custom',
      shifts: [],
      assignments: prev?.assignments ?? [],
    }));
    setScheduleName(name);
  }, [startDate, endDate, scheduleName, user, activeVesselId]);

  // ---- Saved schedule helpers ----
  const handleLoadSchedule = useCallback((s: WatchSchedule) => {
    setSchedule(s);
    setScheduleName(s.name);
    setStartDate(s.startDate);
    setEndDate(s.endDate);
  }, []);

  const handleNewSchedule = useCallback(() => {
    setSchedule(null);
    setScheduleName('');
    setStartDate('');
    setEndDate('');
    setBuildError(null);
  }, []);

  // Quick template: clone the most recently created schedule into a
  // fresh, unsaved draft. Date range gets shifted forward (so it
  // starts the day after the previous rota ends, or tomorrow if the
  // last one is already in the past), and every block gets the same
  // delta applied so the relative shape of the rota is preserved.
  // Assignments belonging to crew that have since left the vessel are
  // silently dropped.
  const handleDuplicateLast = useCallback(() => {
    const last = savedSchedules[0];
    if (!last || !user || !activeVesselId) return;
    try {
      const lastStart = parseISO(last.startDate);
      const lastEnd   = parseISO(last.endDate);
      const duration  = differenceInDays(lastEnd, lastStart);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const candidate = addDays(lastEnd, 1);
      const newStart  = candidate > today ? candidate : addDays(today, 1);
      const newEnd    = addDays(newStart, duration);
      const shiftDays = differenceInDays(newStart, lastStart);

      const validCrew = new Set(crewPool.map((c) => c.id));
      const shifted = last.assignments
        .filter((a) => validCrew.has(a.userId))
        .map((a) => ({
          ...a,
          id: uid(),
          date: format(addDays(parseISO(a.date), shiftDays), 'yyyy-MM-dd'),
        }));

      const cloneName = `${last.name} (next)`;
      const startStr  = format(newStart, 'yyyy-MM-dd');
      const endStr    = format(newEnd,   'yyyy-MM-dd');

      setScheduleName(cloneName);
      setStartDate(startStr);
      setEndDate(endStr);
      setSelectedCrewIds(Array.from(new Set(shifted.map((a) => a.userId))));
      setSchedule({
        vesselId:    activeVesselId,
        createdBy:   user.id,
        name:        cloneName,
        startDate:   startStr,
        endDate:     endStr,
        watchSystem: 'custom',
        shifts:      [],
        assignments: shifted,
      });
      toast({
        title: 'Schedule duplicated',
        description: 'Adjust dates, crew, or hours before saving the new copy.',
      });
    } catch (err: any) {
      toast({
        title: 'Could not duplicate',
        description: err?.message ?? 'Unexpected error',
        variant: 'destructive',
      });
    }
  }, [savedSchedules, user, activeVesselId, crewPool]);

  const handleDeleteSchedule = useCallback(async (scheduleId: string) => {
    if (!supabase) return;
    setDeletingId(scheduleId);
    try {
      const { error } = await supabase.from('watch_schedules').delete().eq('id', scheduleId);
      if (error) throw error;
      setSavedSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      if (schedule?.id === scheduleId) handleNewSchedule();
      toast({ title: 'Schedule deleted' });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }, [supabase, schedule, handleNewSchedule]);

  const handleExportSavedPDF = useCallback(async (s: WatchSchedule) => {
    setExportingId(s.id ?? null);
    try {
      const generatedByName =
        [profileRaw?.first_name, profileRaw?.last_name].filter(Boolean).join(' ') ||
        user?.email || 'Unknown';
      await generateWatchSchedulePDF({ schedule: s, vesselName, generatedByName: String(generatedByName) });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setExportingId(null);
    }
  }, [profileRaw, user, vesselName]);

  // ---- Assignment helpers ----
  const addBlock = useCallback((userId: string, userName: string, userPosition: string | null, date: string, startHour: number, endHour: number, shiftName?: string) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      const block: WatchAssignment = {
        id: uid(),
        date,
        userId,
        userName,
        userPosition,
        startHour,
        endHour,
        shiftName,
      };
      return { ...prev, assignments: [...prev.assignments, block] };
    });
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      return { ...prev, assignments: prev.assignments.filter((a) => a.id !== blockId) };
    });
  }, []);

  // Resize an existing block by patching its startHour/endHour.
  // Used by the resize handles on each schedule block in DayCell.
  const resizeBlock = useCallback((blockId: string, startHour: number, endHour: number) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map((a) =>
          a.id === blockId ? { ...a, startHour, endHour } : a,
        ),
      };
    });
  }, []);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    if (!schedule || !supabase || !user || !activeVesselId) return;
    setIsSaving(true);
    try {
      const payload = {
        vessel_id: schedule.vesselId,
        created_by: schedule.createdBy,
        name: schedule.name,
        start_date: schedule.startDate,
        end_date: schedule.endDate,
        watch_system: schedule.watchSystem,
        shifts: schedule.shifts,
        assignments: schedule.assignments,
        updated_at: new Date().toISOString(),
      };

      if (schedule.id) {
        const { error } = await supabase.from('watch_schedules').update(payload).eq('id', schedule.id);
        if (error) throw error;
        const updated: WatchSchedule = { ...schedule, updatedAt: payload.updated_at };
        setSavedSchedules((prev) =>
          prev.map((s) => (s.id === schedule.id ? updated : s)),
        );
      } else {
        const { data, error } = await supabase.from('watch_schedules').insert(payload).select('id').single();
        if (error) throw error;
        const newId = (data as any).id as string;
        const inserted: WatchSchedule = {
          ...schedule,
          id: newId,
          createdAt: payload.updated_at,
          updatedAt: payload.updated_at,
        };
        setSchedule((prev) => (prev ? { ...prev, id: newId } : prev));
        setSavedSchedules((prev) => [inserted, ...prev]);
      }
      toast({ title: 'Schedule saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [schedule, supabase, user, activeVesselId]);

  // ---- Export PDF ----
  const handleExportPDF = useCallback(async () => {
    if (!schedule) return;
    setIsExporting(true);
    try {
      const generatedByName =
        [profileRaw?.first_name, profileRaw?.last_name].filter(Boolean).join(' ') ||
        user?.email ||
        'Unknown';
      await generateWatchSchedulePDF({ schedule, vesselName, generatedByName: String(generatedByName) });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [schedule, vesselName, profileRaw, user]);

  // ---- Derived ----
  const scheduleDays = useMemo(() => {
    if (!schedule) return [];
    try {
      return eachDayOfInterval({ start: parseISO(schedule.startDate), end: parseISO(schedule.endDate) });
    } catch { return []; }
  }, [schedule]);

  // Split saved schedules into "Active & upcoming" (endDate >= today)
  // and "Past" (endDate < today) so the user can find the most-relevant
  // schedules at a glance without scrolling past months of history.
  // Both lists keep the original ordering (most-recently created first,
  // matching the DB query). The Past list is hidden behind a toggle so
  // it doesn't dominate the page on long-running vessels.
  const splitSavedSchedules = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming: WatchSchedule[] = [];
    const past: WatchSchedule[] = [];
    for (const s of savedSchedules) {
      try {
        const end = parseISO(s.endDate);
        if (end < today) past.push(s);
        else upcoming.push(s);
      } catch {
        // Treat malformed dates as upcoming so they stay visible.
        upcoming.push(s);
      }
    }
    // Past list: most-recently-finished schedule first (endDate DESC)
    // so a long history doesn't bury what just ended.
    past.sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0));
    return { upcoming, past };
  }, [savedSchedules]);

  const currentlyOnWatch = useMemo(
    () => assignmentsOnWatchNow(savedSchedules),
    [savedSchedules],
  );

  // Show-all-past toggle — defaults to false so the most-relevant
  // schedules stay visible and the page doesn't get long.
  const [showPastSchedules, setShowPastSchedules] = useState(false);

  // The crew rows to show in the grid — selected crew if any, else all pool
  const gridCrew = useMemo(() => {
    if (selectedCrewIds.length === 0) return crewPool;
    return crewPool.filter((c) => selectedCrewIds.includes(c.id));
  }, [crewPool, selectedCrewIds]);

  // ---- Editor / overview state -------------------------------------
  // IMPORTANT: these hooks must live ABOVE every early-return below so
  // the hook-call order stays stable across renders. (Moving them
  // beneath the guards causes "change in the order of Hooks"
  // warnings, because the guards short-circuit the first few renders.)
  // When the editor is open the setup form is collapsed behind a
  // "Settings" toggle, so the user can still edit dates / shift
  // system if they need to.
  const [showSetupInEditor, setShowSetupInEditor] = useState(false);

  // Today (start-of-day) — used to label saved schedules by status.
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ---- Render guards ----
  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || (role !== 'vessel' && !isLinkedViewer)) return null;

  if (!isLinkedViewer && !hasPremiumPlusTier) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader />
        <VesselPremiumFeatureGate
          title="Available on Vessel Premium"
          featureLabel="Watch schedules"
          description="Build and assign bridge and deck watch rotas for your crew, then export proof PDFs for each member."
        />
      </div>
    );
  }

  if (!activeVesselId) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader />
        <Alert>
          <Ship className="h-4 w-4" />
          <AlertTitle>No active vessel</AlertTitle>
          <AlertDescription>
            Select an active vessel in your account before building a watch schedule.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // True whenever an editor is open. When false the page shows the
  // overview (saved schedules + build form); when true the page hides
  // those sections so the user can focus on the editor.
  const isEditorOpen = schedule !== null;

  // ---- Build-form derived values ----------------------------------
  // Computed once at the component level so the form (renderSetupFields)
  // and the new Build-card footer can share the same live preview.
  const setupPreviewDays = (() => {
    if (!startDate || !endDate) return null;
    try {
      const diff = differenceInDays(parseISO(endDate), parseISO(startDate));
      return diff < 0 ? null : diff + 1;
    } catch { return null; }
  })();
  const setupPreviewCrew =
    selectedCrewIds.length > 0 ? selectedCrewIds.length : crewPool.length;
  const setupOverflow =
    setupPreviewDays !== null && setupPreviewDays > MAX_RANGE_DAYS;
  const setupReady =
    setupPreviewDays !== null && !setupOverflow && crewPool.length > 0;

  function statusFor(s: WatchSchedule): {
    label: string;
    tone: 'active' | 'upcoming' | 'past';
  } {
    try {
      const start = parseISO(s.startDate);
      const end   = parseISO(s.endDate);
      if (end < todayStart) return { label: 'Ended', tone: 'past' };
      if (start > todayStart) return { label: 'Upcoming', tone: 'upcoming' };
      return { label: 'Active now', tone: 'active' };
    } catch {
      return { label: 'Upcoming', tone: 'upcoming' };
    }
  }

  // ---- Render ----
  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader readOnly={readOnly} vesselName={readOnly ? vesselName : undefined}>
        {isEditorOpen ? (
          <>
            <Button variant="ghost" onClick={handleNewSchedule}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to schedules
            </Button>
            <Button disabled={isExporting} onClick={handleExportPDF} variant="outline">
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export PDF
            </Button>
            {dbAvailable && !readOnly && (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save to vessel
              </Button>
            )}
          </>
        ) : null}
      </PageHeader>

      {/* =====================================================
         OVERVIEW MODE (no editor open)
         — Stats strip
         — Saved-schedules card grid
         — Setup card so the user can build a new rota
         ===================================================== */}
      {!isEditorOpen && (
        <>
          {currentlyOnWatch.length > 0 ? (
            <CurrentlyOnWatchCard
              people={currentlyOnWatch}
              onOpenSchedule={(scheduleId) => {
                const match = savedSchedules.find((s) => s.id === scheduleId);
                if (match) handleLoadSchedule(match);
              }}
            />
          ) : readOnly && savedSchedules.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" />
                  On watch now
                </CardTitle>
                <CardDescription>
                  Nobody is assigned to a watch slot at this hour. Open an active plan below to see the full board.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {/* Stats strip — only shown when there are saved schedules so
              new vessels don't see a row of zeroes. */}
          {dbAvailable && savedSchedules.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                icon={<BookOpen className="h-4 w-4" />}
                label="Total schedules"
                value={savedSchedules.length}
              />
              <StatTile
                icon={<CalendarRange className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                label="Active now"
                value={savedSchedules.filter((s) => statusFor(s).tone === 'active').length}
                tone="success"
              />
              <StatTile
                icon={<CalendarDays className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
                label="Upcoming"
                value={savedSchedules.filter((s) => statusFor(s).tone === 'upcoming').length}
                tone="info"
              />
              <StatTile
                icon={<Users className="h-4 w-4" />}
                label="Crew onboard"
                value={crewPool.length}
              />
            </div>
          )}

          {/* Saved schedules card grid */}
          {dbAvailable && savedSchedules.length > 0 && (() => {
            const { upcoming, past } = splitSavedSchedules;
            const renderCard = (s: WatchSchedule) => {
              const crewCount = new Set(s.assignments.map((a) => a.userId)).size;
              const totalHours = s.assignments.reduce(
                (sum, a) => sum + (a.endHour - a.startHour),
                0,
              );
              // Coverage = days that have at least one assignment / total days
              const status = statusFor(s);
              const dateRange = (() => {
                try {
                  return `${format(parseISO(s.startDate), 'd MMM')} – ${format(parseISO(s.endDate), 'd MMM yyyy')}`;
                } catch { return `${s.startDate} – ${s.endDate}`; }
              })();
              // Build a per-day density sparkline (capped at ~30 days).
              // We render a thin row of bars so the user can see at a
              // glance which days are dense vs uncovered.
              const sparkline = (() => {
                try {
                  const days = eachDayOfInterval({
                    start: parseISO(s.startDate),
                    end:   parseISO(s.endDate),
                  });
                  const max = 24 * Math.max(crewCount, 1); // theoretical maximum
                  return days.slice(0, 30).map((d) => {
                    const dateStr = format(d, 'yyyy-MM-dd');
                    const dayTotal = s.assignments
                      .filter((a) => a.date === dateStr)
                      .reduce((sum, a) => sum + (a.endHour - a.startHour), 0);
                    return { dateStr, intensity: max > 0 ? dayTotal / max : 0, hours: dayTotal };
                  });
                } catch {
                  return [] as { dateStr: string; intensity: number; hours: number }[];
                }
              })();
              const totalDays = sparkline.length;
              const daysCovered = sparkline.filter((d) => d.hours > 0).length;
              const coveragePct = totalDays > 0 ? Math.round((daysCovered / totalDays) * 100) : 0;

              const toneClasses =
                status.tone === 'active'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : status.tone === 'upcoming'
                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                  : 'bg-muted text-muted-foreground';

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleLoadSchedule(s)}
                  className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/60 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{s.name}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClasses}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {dateRange}
                    </span>
                    {crewCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {crewCount} crew
                      </span>
                    )}
                    {totalHours > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {totalHours}h
                      </span>
                    )}
                  </div>

                  {/* Day-by-day density bar — bars get more saturated
                      on busier days. Uncovered days render as a thin
                      empty rail so gaps stand out. */}
                  {sparkline.length > 0 && (
                    <div className="mt-1 space-y-1">
                      <div className="flex h-3 items-end gap-px overflow-hidden rounded-md">
                        {sparkline.map((d) => (
                          <span
                            key={d.dateStr}
                            className="flex-1 rounded-sm"
                            style={{
                              backgroundColor:
                                d.hours === 0
                                  ? 'rgba(148,163,184,0.25)' // muted grey for gaps
                                  : `rgba(59,130,246,${0.3 + Math.min(0.7, d.intensity)})`,
                              minWidth: 2,
                              height: d.hours === 0 ? '40%' : '100%',
                            }}
                            title={`${d.dateStr}: ${d.hours}h`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {daysCovered} of {totalDays} days covered · {coveragePct}%
                      </p>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <FolderOpen className="h-3 w-3" />
                      {readOnly ? 'Open schedule' : 'Open editor'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        disabled={exportingId === s.id}
                        onClick={(e) => { e.stopPropagation(); handleExportSavedPDF(s); }}
                        title="Export PDF"
                      >
                        {exportingId === s.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />}
                      </button>
                      {!readOnly && (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                        disabled={deletingId === s.id}
                        onClick={(e) => { e.stopPropagation(); s.id && handleDeleteSchedule(s.id); }}
                        title="Delete schedule"
                      >
                        {deletingId === s.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                      )}
                    </div>
                  </div>
                </button>
              );
            };

            return (
              <div className="space-y-5">
                {upcoming.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h2 className="flex items-center gap-2 text-base font-semibold">
                          <BookOpen className="h-4 w-4" />
                          Active &amp; upcoming
                          <span className="text-xs font-normal text-muted-foreground">
                            ({upcoming.length})
                          </span>
                        </h2>
                        <p className="text-xs text-muted-foreground">
                        Click a schedule to open it.
                      </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {upcoming.map(renderCard)}
                    </div>
                  </section>
                )}

                {past.length > 0 && (
                  <section>
                    <button
                      type="button"
                      onClick={() => setShowPastSchedules((v) => !v)}
                      aria-expanded={showPastSchedules}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <div>
                        <h2 className="flex items-center gap-2 text-sm font-semibold">
                          <History className="h-4 w-4" />
                          Past schedules
                          <span className="text-xs font-normal text-muted-foreground">
                            ({past.length})
                          </span>
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Already-ended schedules. Open one to review or re-export.
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showPastSchedules ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showPastSchedules && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {past.map(renderCard)}
                      </div>
                    )}
                  </section>
                )}
              </div>
            );
          })()}

          {/* Empty state — no saved schedules yet */}
          {dbAvailable && savedSchedules.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
              <CalendarRange className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h2 className="text-base font-semibold">No saved watch schedules yet</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {readOnly
                  ? 'No watch plans have been saved for this vessel yet. They will appear here once the vessel builds a rota.'
                  : "Build your first watch rota below. Once saved, you'll be able to open it again, edit it, or export to PDF from this page."}
              </p>
            </div>
          )}

          {/* No-crew notice (only relevant when building from scratch) */}
          {!readOnly && !isLoadingCrew && crewPool.length === 0 && (
            <Alert>
              <Users className="h-4 w-4" />
              <AlertTitle>No crew currently onboard</AlertTitle>
              <AlertDescription>
                No crew are marked as onboard. Use the{' '}
                <button className="underline underline-offset-2" onClick={() => router.push('/dashboard/crew')}>
                  Crew page
                </button>{' '}
                to mark crew as onboard before assigning watch slots.
              </AlertDescription>
            </Alert>
          )}

          {/* Build-new-schedule card — only visible in overview mode
              so the user can start a new rota. Re-designed as a
              three-band layout (hero, form, action footer) so the
              "create" intent is obvious and the primary CTA is
              impossible to miss. Settings inside the editor reuse the
              same form fields via `renderSetupFields()`. */}
          {!readOnly && (
          <Card className="overflow-hidden">
            {/* ── Hero band ───────────────────────────────────────── */}
            <div className="relative border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 py-6">
              {/* Subtle dotted texture so the hero reads as a distinct
                  surface from the form below. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                  backgroundSize: '12px 12px',
                }}
              />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight">
                    Build a new schedule
                  </h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Set the period, pick the crew, and the editor opens with a blank 24-hour timeline you can drag straight onto.
                  </p>
                </div>

                {/* Smart shortcut — clone the most recent rota, shifted
                    forward in time. Only shown when there's something
                    to clone. */}
                {savedSchedules.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDuplicateLast}
                    className="gap-1.5 shrink-0 bg-background"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Duplicate last schedule
                  </Button>
                )}
              </div>
            </div>

            {/* ── Form band ───────────────────────────────────────── */}
            <CardContent className="space-y-5 p-6">
              {renderSetupFields()}
            </CardContent>

            {/* ── Action footer ──────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4">
              {/* Readiness summary — mirrors the live preview but in
                  the language of "are we ready to build?". */}
              <div className="min-w-0 text-sm">
                {crewPool.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Mark crew as onboard first to build a schedule.
                  </span>
                ) : setupPreviewDays === null ? (
                  <span className="text-muted-foreground">
                    Pick a start and end date to continue.
                  </span>
                ) : setupOverflow ? (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Range exceeds the {MAX_RANGE_DAYS}-day limit.
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Ready to build · {setupPreviewDays} day{setupPreviewDays === 1 ? '' : 's'} · {setupPreviewCrew} crew
                  </span>
                )}
              </div>
              <Button
                onClick={handleBuildSchedule}
                size="lg"
                disabled={!setupReady}
                className="gap-2 shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                Build schedule
                <span aria-hidden>→</span>
              </Button>
            </div>
          </Card>
          )}
        </>
      )}

      {/* =====================================================
         EDITOR MODE
         — Schedule details + status + actions
         — Optional "settings" panel (dates / system / crew)
         — Weekly grid
         ===================================================== */}
      {isEditorOpen && schedule && (() => {
        // Live coverage stats for the editor header.
        const totalHoursScheduled = schedule.assignments.reduce(
          (sum, a) => sum + (a.endHour - a.startHour),
          0,
        );
        const totalCrewAssigned = new Set(schedule.assignments.map((a) => a.userId)).size;
        const totalDays = scheduleDays.length;
        // "Coverage" = average crew-hours per day in the schedule
        const avgHoursPerDay = totalDays > 0 ? totalHoursScheduled / totalDays : 0;
        // Identify days with ZERO assignments to surface uncovered days.
        const coveredDates = new Set(schedule.assignments.map((a) => a.date));
        const uncoveredDays = scheduleDays.filter(
          (d) => !coveredDates.has(format(d, 'yyyy-MM-dd')),
        ).length;
        const daysCovered = totalDays - uncoveredDays;

        return (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-4 w-4" />
                    {schedule.name || 'Untitled schedule'}
                  </CardTitle>
                  {(() => {
                    const status = statusFor(schedule);
                    const tone =
                      status.tone === 'active'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : status.tone === 'upcoming'
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                        : 'bg-muted text-muted-foreground';
                    return (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
                        {status.label}
                      </span>
                    );
                  })()}
                  {!schedule.id && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      Not saved yet
                    </span>
                  )}
                </div>
                <CardDescription className="mt-1">
                  {(() => {
                    try {
                      return `${format(parseISO(schedule.startDate), 'd MMM')} – ${format(parseISO(schedule.endDate), 'd MMM yyyy')}`;
                    } catch { return `${schedule.startDate} – ${schedule.endDate}`; }
                  })()}
                  {' '}&middot; {scheduleDays.length} days{readOnly ? '' : ' · drag to add, drag edges to resize'}
                </CardDescription>
              </div>
              {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSetupInEditor((v) => !v)}
                className="gap-1.5"
              >
                <Settings2 className="h-3.5 w-3.5" />
                {showSetupInEditor ? 'Hide settings' : 'Edit settings'}
              </Button>
              )}
            </div>

            {/* Live coverage strip */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <EditorStat
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Hours scheduled"
                value={totalHoursScheduled === 0 ? '0' : `${totalHoursScheduled}h`}
              />
              <EditorStat
                icon={<Users className="h-3.5 w-3.5" />}
                label="Crew assigned"
                value={`${totalCrewAssigned} of ${gridCrew.length || crewPool.length}`}
              />
              <EditorStat
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Days covered"
                value={`${daysCovered} of ${totalDays}`}
                tone={uncoveredDays > 0 ? 'warn' : 'ok'}
              />
              <EditorStat
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Avg hours / day"
                value={avgHoursPerDay > 0 ? `${avgHoursPerDay.toFixed(1)}h` : '—'}
              />
            </div>
          </CardHeader>

          {showSetupInEditor && (
            <CardContent className="border-t bg-muted/20 pt-4 pb-4 space-y-4">
              {renderSetupFields()}
              <Button onClick={handleBuildSchedule} size="sm" variant="outline">
                Apply changes
              </Button>
            </CardContent>
          )}

          <CardContent className="p-0">
            {/* Crew legend */}
            {gridCrew.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-y bg-muted/20 px-4 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Crew
                </span>
                {gridCrew.map((crew, crewIdx) => (
                  <span key={crew.id} className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
                    <span
                      className="inline-block h-3 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: crewColor(crewIdx) }}
                    />
                    {crew.displayName}
                    {crew.position && (
                      <span className="text-muted-foreground">· {crew.position}</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {gridCrew.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {crewPool.length === 0
                  ? 'No crew onboard — mark crew as onboard from the Crew page.'
                  : 'No crew selected — choose crew members from the settings above.'}
              </p>
            ) : (
              <WeeklyScheduleGrid
                scheduleDays={scheduleDays}
                gridCrew={gridCrew}
                assignments={schedule.assignments}
                addBlock={addBlock}
                removeBlock={removeBlock}
                resizeBlock={resizeBlock}
                readOnly={readOnly}
              />
            )}
          </CardContent>
        </Card>
        );
      })()}
    </div>
  );

  // ---- Setup field helpers ---------------------------------------
  // Extracted to a function so the same fields can render inside
  // either the "Build new" overview card or the "Edit settings" panel
  // inside the editor.
  function renderSetupFields() {
    // Apply a "starting from today, N days long" quick-pick.
    const applyDuration = (days: number) => {
      const t = new Date();
      const s = format(t, 'yyyy-MM-dd');
      const e = format(addDays(t, days - 1), 'yyyy-MM-dd');
      setStartDate(s);
      setEndDate(e);
    };

    // Apply "this calendar week" (Mon-Sun) — useful for short rotas.
    const applyThisWeek = () => {
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      const sunday = addDays(monday, 6);
      setStartDate(format(monday, 'yyyy-MM-dd'));
      setEndDate(format(sunday,   'yyyy-MM-dd'));
    };

    // Live preview info — only meaningful when both dates are valid.
    // Sourced from component-level vars so the footer Build button can
    // mirror the same readiness state without duplicate logic.
    const previewDays     = setupPreviewDays;
    const previewCrew     = setupPreviewCrew;
    const previewOverflow = setupOverflow;

    return (
      <>
        {/* Section 1 — name */}
        <div className="space-y-1.5">
          <Label htmlFor="sched-name">Schedule name</Label>
          <Input
            id="sched-name"
            value={scheduleName}
            onChange={(e) => setScheduleName(e.target.value)}
            placeholder="e.g. Atlantic crossing"
          />
        </div>

        {/* Section 2 — dates + quick picks */}
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sched-start">Start date</Label>
              <Input id="sched-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-end">End date</Label>
              <Input id="sched-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Quick-pick chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              Quick pick:
            </span>
            {[
              { label: 'This week',   apply: applyThisWeek },
              { label: 'Next 7 days', apply: () => applyDuration(7) },
              { label: 'Next 14 days', apply: () => applyDuration(14) },
              { label: 'Next 21 days', apply: () => applyDuration(21) },
              { label: 'Next 28 days', apply: () => applyDuration(28) },
            ].map(({ label, apply }) => (
              <button
                key={label}
                type="button"
                onClick={apply}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/50 hover:bg-muted transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Live preview */}
          {previewDays !== null && (
            <div className={[
              'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs',
              previewOverflow
                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                : 'border-border bg-muted/30 text-muted-foreground',
            ].join(' ')}>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {previewDays} day{previewDays === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {previewCrew} crew {selectedCrewIds.length > 0 ? 'selected' : 'onboard'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {previewDays * 24}h available per crew
              </span>
              {previewOverflow && (
                <span className="ml-auto inline-flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Over {MAX_RANGE_DAYS}-day limit
                </span>
              )}
            </div>
          )}
        </div>

        {/* Section 3 — crew picker */}
        {crewPool.length > 0 && (
          <CrewMultiSelectPicker
            crewPool={crewPool}
            selectedIds={selectedCrewIds}
            onChange={setSelectedCrewIds}
          />
        )}

        {buildError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{buildError}</span>
          </div>
        )}
      </>
    );
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageHeader({
  children,
  readOnly,
  vesselName,
}: {
  children?: React.ReactNode;
  readOnly?: boolean;
  vesselName?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Watch Schedule</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {readOnly
            ? `Active watch plans for ${vesselName || 'this vessel'}. See who is on watch now, then open a rota to review the full board.`
            : 'Plan crew watch rotations for a voyage or period. Drag on a crew member\'s row to mark their working hours, then export as a PDF or save to the vessel.'}
        </p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatTile — compact stat card used on the overview's stats strip
// ---------------------------------------------------------------------------

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'success' | 'info';
}) {
  const ringClass =
    tone === 'success' ? 'ring-emerald-500/20 dark:ring-emerald-400/20'
    : tone === 'info' ? 'ring-sky-500/20 dark:ring-sky-400/20'
    : 'ring-border/60';
  return (
    <div className={`flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm ring-1 ${ringClass}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function CurrentlyOnWatchCard({
  people,
  onOpenSchedule,
}: {
  people: OnWatchNow[];
  onOpenSchedule: (scheduleId: string | null) => void;
}) {
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/[0.06]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          On watch now
        </CardTitle>
        <CardDescription>
          {people.length === 1
            ? '1 person is on watch right now.'
            : `${people.length} people are on watch right now.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {people.map((person) => (
          <button
            key={`${person.userId}-${person.startHour}-${person.endHour}`}
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background/70 px-3 py-2.5 text-left transition-colors hover:bg-background"
            onClick={() => onOpenSchedule(person.scheduleId)}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{person.userName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[person.userPosition, person.scheduleName].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {fmtWatchHour(person.startHour)}–{fmtWatchHour(person.endHour)}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// EditorStat — slim live-stat tile used in the editor header
// Different from StatTile because it sits inside an already-bordered
// card and uses a more horizontal compact layout.
// ---------------------------------------------------------------------------

function EditorStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-foreground';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`text-sm font-semibold tabular-nums ${valueClass}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CrewMultiSelectPicker — searchable, grouped checklist for picking
// which crew members appear on the schedule. Designed to scale to
// 60+ crew without dominating the page: collapses behind a popover
// trigger, groups by position/department, supports search and bulk
// selection helpers.
// ---------------------------------------------------------------------------

interface CrewMultiSelectPickerProps {
  crewPool:     SchedulableCrew[];
  selectedIds:  string[];
  onChange:     (next: string[]) => void;
}

function CrewMultiSelectPicker({ crewPool, selectedIds, onChange }: CrewMultiSelectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const isAllSelected =
    selectedIds.length === 0 ||
    selectedIds.length === crewPool.length;

  // Apply the live search filter.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return crewPool;
    return crewPool.filter((c) => {
      const haystack = `${c.displayName} ${c.position ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [crewPool, query]);

  // Group the filtered crew by position so departments scan at a glance.
  const grouped = useMemo(() => {
    const groups = new Map<string, SchedulableCrew[]>();
    for (const c of filtered) {
      const key = c.position?.trim() || 'No position';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Selected crew, ordered by their position in the pool, for chip display
  // above the trigger so the user can remove one without re-opening the
  // popover.
  const selectedCrew = useMemo(() => {
    const set = new Set(selectedIds);
    return crewPool.filter((c) => set.has(c.id));
  }, [crewPool, selectedIds]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  const selectAll = () => onChange(crewPool.map((c) => c.id));
  const clearAll  = () => onChange([]);

  // Select every visible (filtered) crew without touching the rest.
  const selectFiltered = () => {
    const ids = new Set(selectedIds);
    for (const c of filtered) ids.add(c.id);
    onChange(Array.from(ids));
  };

  // Maximum chips shown inline before we collapse into "+N more".
  const CHIP_CAP = 6;
  const visibleChips = selectedCrew.slice(0, CHIP_CAP);
  const hiddenChipCount = Math.max(0, selectedCrew.length - CHIP_CAP);

  // Department breakdown — used in the trigger to give the manager
  // a quick "what's the make-up of this selection?" signal without
  // opening the popover.
  const departmentSummary = useMemo(() => {
    const source = selectedCrew.length > 0 ? selectedCrew : crewPool;
    const counts = new Map<string, number>();
    for (const c of source) {
      const key = c.position?.trim() || 'No position';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedCrew, crewPool]);

  // First two initials of a name — used for the avatar stack inside
  // the big trigger so the picker isn't all numbers and words.
  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + (parts[parts.length - 1][0] ?? '')).toUpperCase();
  };

  const avatarStack = (selectedCrew.length > 0 ? selectedCrew : crewPool).slice(0, 5);
  const avatarHidden = Math.max(0, (selectedCrew.length > 0 ? selectedCrew.length : crewPool.length) - avatarStack.length);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="space-y-3">
        {/* ── Big trigger card ───────────────────────────────────── */}
        <PopoverTrigger asChild>
          <button
            type="button"
            className={[
              'group relative flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-all',
              'hover:border-primary/60 hover:shadow-sm',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              open ? 'border-primary/60 shadow-sm' : 'border-border',
            ].join(' ')}
          >
            {/* Avatar stack — overlapping circles with initials */}
            <div className="flex shrink-0 items-center -space-x-2">
              {avatarStack.map((c, i) => (
                <span
                  key={c.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-[10px] font-semibold uppercase text-primary"
                  style={{ zIndex: avatarStack.length - i }}
                  title={c.displayName}
                >
                  {initials(c.displayName)}
                </span>
              ))}
              {avatarHidden > 0 && (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
                  +{avatarHidden}
                </span>
              )}
              {avatarStack.length === 0 && (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="h-4 w-4" />
                </span>
              )}
            </div>

            {/* Headline + sub-summary */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold">Schedule crew</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {isAllSelected
                    ? `All ${crewPool.length} crew onboard`
                    : `${selectedIds.length} of ${crewPool.length} crew selected`}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {departmentSummary.length === 0
                  ? 'No crew onboard yet.'
                  : departmentSummary
                      .slice(0, 4)
                      .map(([pos, n]) => `${n} ${pos.toLowerCase()}`)
                      .join(' · ')}
                {departmentSummary.length > 4 && ' · …'}
              </p>
            </div>

            {/* Right rail: action hint + chevron */}
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden text-xs font-medium text-primary sm:inline-flex items-center gap-1">
                <Search className="h-3.5 w-3.5" />
                Manage
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </div>
          </button>
        </PopoverTrigger>

        {/* Selected chip strip — only when not "all selected" */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleChips.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                <span className="truncate max-w-[140px]">{c.displayName}</span>
                <button
                  type="button"
                  onClick={() => onChange(selectedIds.filter((x) => x !== c.id))}
                  className="text-primary/70 hover:text-primary"
                  aria-label={`Remove ${c.displayName} from schedule`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {hiddenChipCount > 0 && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/80"
              >
                +{hiddenChipCount} more
              </button>
            )}
            {selectedIds.length > 1 && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0"
        sideOffset={8}
      >
            {/* Header — search + bulk actions */}
            <div className="border-b p-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search crew or position…"
                  className="h-9 pl-8"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {selectedIds.length} of {crewPool.length} selected
                </span>
                <div className="flex items-center gap-1">
                  {query
                    ? (
                      <button
                        type="button"
                        onClick={selectFiltered}
                        className="rounded px-2 py-1 text-primary hover:bg-muted"
                      >
                        Select shown
                      </button>
                    )
                    : (
                      <button
                        type="button"
                        onClick={selectAll}
                        className="rounded px-2 py-1 text-primary hover:bg-muted"
                      >
                        Select all
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={selectedIds.length === 0}
                    className="rounded px-2 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Grouped checklist */}
            <div className="max-h-[320px] overflow-y-auto">
              {grouped.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No crew match &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <div className="divide-y">
                  {grouped.map(([position, members]) => {
                    const allInGroupSelected = members.every((m) => selectedIds.includes(m.id));
                    return (
                      <div key={position} className="py-1.5">
                        <div className="flex items-center justify-between px-3 py-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {position} ({members.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const groupIds = new Set(members.map((m) => m.id));
                              if (allInGroupSelected) {
                                onChange(selectedIds.filter((id) => !groupIds.has(id)));
                              } else {
                                const next = new Set(selectedIds);
                                for (const m of members) next.add(m.id);
                                onChange(Array.from(next));
                              }
                            }}
                            className="text-[10px] text-primary hover:underline"
                          >
                            {allInGroupSelected ? 'Deselect' : 'Select group'}
                          </button>
                        </div>
                        {members.map((m) => {
                          const checked = selectedIds.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggle(m.id)}
                              className={[
                                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                                checked ? 'bg-primary/5' : 'hover:bg-muted/60',
                              ].join(' ')}
                            >
                              <span
                                className={[
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                  checked
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-muted-foreground/40 bg-background',
                                ].join(' ')}
                              >
                                {checked ? <Check className="h-3 w-3" /> : null}
                              </span>
                              <span className="truncate">{m.displayName}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer — close */}
            <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {isAllSelected ? 'All crew will appear.' : `${selectedIds.length} crew will appear.`}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// DayCell — a 24-hour timeline for one crew member × one date
// ---------------------------------------------------------------------------

interface CopiedBlocks {
  ranges: { startHour: number; endHour: number }[];
}

interface DayCellProps {
  blocks: WatchAssignment[];
  color: string;
  /** When true, the cell renders with a primary tint so today's
   *  column reads at a glance across the grid. */
  isToday?: boolean;
  readOnly?: boolean;
  onAdd:    (startHour: number, endHour: number) => void;
  onRemove: (blockId: string) => void;
  onResize: (blockId: string, startHour: number, endHour: number) => void;
  clipboard: CopiedBlocks | null;
  onCopy:   (ranges: CopiedBlocks['ranges']) => void;
  onPaste:  () => void;
}

// Format a duration in hours as "4h" / "4h 30m" — used in ghost
// labels and inside existing blocks when they're wide enough.
function fmtDuration(start: number, end: number): string {
  const total = Math.max(0, end - start);
  const hours = Math.floor(total);
  const mins  = Math.round((total - hours) * 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Drag state — three distinct modes, distinguished by `kind`.
// 'create' draws a new ghost block on the empty bar.
// 'resize-left' / 'resize-right' drag one edge of an existing block.
type DragState =
  | { kind: 'create'; anchor: number; ghost: { start: number; end: number } }
  | {
      kind: 'resize-left' | 'resize-right';
      blockId: string;
      origStart: number;
      origEnd: number;
      ghost: { start: number; end: number };
    };

function DayCell({ blocks, color, isToday: isTodayDay, readOnly, onAdd, onRemove, onResize, clipboard, onCopy, onPaste }: DayCellProps) {
  const [cellHovered, setCellHovered] = useState(false);
  const barRef  = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragGhost, setDragGhost] = useState<DragState | null>(null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  // Total day hours — shown in the cell footer when blocks exist.
  const totalHours = blocks.reduce((sum, b) => sum + (b.endHour - b.startHour), 0);

  const hourAt = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.round(Math.max(0, Math.min(24, ((clientX - rect.left) / rect.width) * 24)));
  };

  // ---- Create (drag on empty bar) -------------------------------------
  const startCreate = (clientX: number) => {
    const h = hourAt(clientX);
    const initial = { start: h, end: Math.min(h + 1, 24) };
    const state: DragState = { kind: 'create', anchor: h, ghost: initial };
    dragRef.current = state;
    setDragGhost(state);
  };

  const moveCreate = useCallback((clientX: number) => {
    const d = dragRef.current;
    if (!d || d.kind !== 'create') return;
    const h = hourAt(clientX);
    const anchor = d.anchor;
    const s = Math.min(anchor, h);
    const e = Math.max(anchor, h);
    const next = e > s ? { start: s, end: e } : { start: s, end: Math.min(s + 1, 24) };
    const updated: DragState = { ...d, ghost: next };
    dragRef.current = updated;
    setDragGhost(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Resize (drag a block edge) -------------------------------------
  const startResize = (clientX: number, block: WatchAssignment, edge: 'left' | 'right') => {
    const state: DragState = {
      kind: edge === 'left' ? 'resize-left' : 'resize-right',
      blockId: block.id,
      origStart: block.startHour,
      origEnd:   block.endHour,
      ghost: { start: block.startHour, end: block.endHour },
    };
    dragRef.current = state;
    setDragGhost(state);
    void clientX;
  };

  const moveResize = useCallback((clientX: number) => {
    const d = dragRef.current;
    if (!d || (d.kind !== 'resize-left' && d.kind !== 'resize-right')) return;
    const h = hourAt(clientX);
    let next: { start: number; end: number };
    if (d.kind === 'resize-left') {
      // Left edge can move between 0 and (origEnd - 1)
      next = { start: Math.max(0, Math.min(h, d.origEnd - 1)), end: d.origEnd };
    } else {
      // Right edge can move between (origStart + 1) and 24
      next = { start: d.origStart, end: Math.max(d.origStart + 1, Math.min(h, 24)) };
    }
    const updated: DragState = { ...d, ghost: next };
    dragRef.current = updated;
    setDragGhost(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- End of any drag --------------------------------------------------
  const endDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragGhost(null);
    if (!d) return;
    if (d.kind === 'create') {
      if (d.ghost.end > d.ghost.start) onAdd(d.ghost.start, d.ghost.end);
    } else {
      // Only commit if the edge actually moved.
      if (d.ghost.start !== d.origStart || d.ghost.end !== d.origEnd) {
        onResize(d.blockId, d.ghost.start, d.ghost.end);
      }
    }
  }, [onAdd, onResize]);

  // ---- Mouse / touch listeners ----------------------------------------
  const attachMouse = (move: (clientX: number) => void) => {
    const onMove = (ev: MouseEvent) => move(ev.clientX);
    const onUp = () => {
      endDrag();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const attachTouch = (move: (clientX: number) => void) => {
    const onMove = (ev: TouchEvent) => move(ev.touches[0].clientX);
    const onEnd = () => {
      endDrag();
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  };

  const handleBarMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) return;
    setHoverHour(hourAt(e.clientX));
  };

  const handleBarMouseLeave = () => setHoverHour(null);

  const handleBarMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    // Defer to block / handle / button click targets.
    const target = e.target as HTMLElement;
    if (target.closest('[data-handle]') || target.closest('[data-remove]')) return;
    e.preventDefault();
    setHoverHour(null);
    startCreate(e.clientX);
    attachMouse(moveCreate);
  };

  const handleBarTouchStart = (e: React.TouchEvent) => {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-handle]') || target.closest('[data-remove]')) return;
    startCreate(e.touches[0].clientX);
    attachTouch(moveCreate);
  };

  const handleHandleMouseDown = (e: React.MouseEvent, block: WatchAssignment, edge: 'left' | 'right') => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    startResize(e.clientX, block, edge);
    attachMouse(moveResize);
  };

  const handleHandleTouchStart = (e: React.TouchEvent, block: WatchAssignment, edge: 'left' | 'right') => {
    startResize(e.touches[0].clientX, block, edge);
    attachTouch(moveResize);
  };

  // While resizing a particular block we hide the original block and
  // show a ghost in its place so the user sees real-time feedback.
  const resizingBlockId =
    dragGhost && (dragGhost.kind === 'resize-left' || dragGhost.kind === 'resize-right')
      ? dragGhost.blockId
      : null;

  return (
    <div
      className="space-y-1 select-none"
      onMouseEnter={() => setCellHovered(true)}
      onMouseLeave={() => setCellHovered(false)}
    >
      {/* 24-hour drag strip */}
      <div
        ref={barRef}
        className={[
          'relative h-11 w-full rounded-lg border overflow-visible shadow-inner transition-colors',
          readOnly ? 'cursor-default' : 'cursor-crosshair',
          isTodayDay
            ? 'border-primary/40 bg-primary/5'
            : 'border-border bg-muted/30',
        ].join(' ')}
        onMouseDown={handleBarMouseDown}
        onMouseMove={handleBarMouseMove}
        onMouseLeave={handleBarMouseLeave}
        onTouchStart={handleBarTouchStart}
        title="Drag to add working hours"
      >
        {/* Soft background bands — alternating shading every 6 hours
            so the eye can navigate to morning / afternoon quickly. */}
        {[0, 12].map((h) => (
          <div
            key={`band-${h}`}
            className="absolute inset-y-0 pointer-events-none bg-muted/30"
            style={{ left: `${(h / 24) * 100}%`, width: `${(6 / 24) * 100}%` }}
          />
        ))}
        {/* Major hour ticks every 6h — slightly stronger */}
        {[6, 12, 18].map((h) => (
          <div
            key={`major-${h}`}
            className="absolute inset-y-0 w-px bg-border/70 pointer-events-none"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        {/* Minor ticks every 3h — bottom dashes */}
        {[3, 9, 15, 21].map((h) => (
          <div
            key={`minor-${h}`}
            className="absolute bottom-0 w-px h-1.5 bg-border/50 pointer-events-none"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        {/* Empty-state hint — only shown when the cell has no blocks
            and the cursor is hovering, so it's a gentle nudge for new
            users without distracting once the row is being edited. */}
        {blocks.length === 0 && cellHovered && !dragGhost && !readOnly && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] font-medium text-muted-foreground/80 italic">
              Drag to add hours
            </span>
          </div>
        )}
        {/* Existing blocks */}
        {blocks.map((b) => {
          if (b.id === resizingBlockId) return null; // hidden while resizing
          const widthPct = ((b.endHour - b.startHour) / 24) * 100;
          const isWide = widthPct > 12; // show labels when ≥ ~3h
          return (
            <div
              key={b.id}
              className="absolute inset-y-0 flex items-center justify-between rounded-md ring-1 ring-black/5 group"
              style={{
                left: `${(b.startHour / 24) * 100}%`,
                width: `${widthPct}%`,
                backgroundColor: color,
                boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
              }}
              title={`${fmtHour(b.startHour)}–${fmtHour(b.endHour)} (${fmtDuration(b.startHour, b.endHour)})`}
            >
              {/* Left resize handle — invisible grip with a small dot
                  pattern that fades in on block hover so the affordance
                  is discoverable without being noisy. */}
              <div
                data-handle="left"
                className="group/handle absolute inset-y-0 left-0 w-2.5 cursor-ew-resize rounded-l-md hover:bg-white/30 touch-none flex items-center justify-center"
                onMouseDown={(e) => handleHandleMouseDown(e, b, 'left')}
                onTouchStart={(e) => handleHandleTouchStart(e, b, 'left')}
              >
                <span className="block h-3 w-px bg-white/0 group-hover:bg-white/70 transition-colors" />
              </div>
              {/* Right resize handle */}
              <div
                data-handle="right"
                className="group/handle absolute inset-y-0 right-0 w-2.5 cursor-ew-resize rounded-r-md hover:bg-white/30 touch-none flex items-center justify-center"
                onMouseDown={(e) => handleHandleMouseDown(e, b, 'right')}
                onTouchStart={(e) => handleHandleTouchStart(e, b, 'right')}
              >
                <span className="block h-3 w-px bg-white/0 group-hover:bg-white/70 transition-colors" />
              </div>
              {/* Centered duration label (wide blocks only) */}
              {isWide && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-white drop-shadow-sm pointer-events-none select-none">
                  {fmtDuration(b.startHour, b.endHour)}
                </span>
              )}
              {/* Time range label — only on hover, fades in */}
              <span className="absolute top-0.5 left-1.5 text-[9px] tabular-nums leading-none text-white/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
                {fmtHour(b.startHour)}–{fmtHour(b.endHour)}
              </span>
              {/* Remove button — always visible (subtle), brighter on hover */}
              {!readOnly && (
              <button
                data-remove="1"
                className="absolute top-0.5 right-1 h-4 w-4 flex items-center justify-center rounded-full bg-black/30 text-white opacity-60 hover:opacity-100 hover:bg-destructive transition-opacity"
                onClick={(e) => { e.stopPropagation(); onRemove(b.id); }}
                title="Remove"
              >
                <X className="h-2.5 w-2.5" />
              </button>
              )}
            </div>
          );
        })}
        {/* Drag ghost — used for both create and resize */}
        {dragGhost && (
          <div
            className="absolute inset-y-0 flex items-center justify-center pointer-events-none rounded-md"
            style={{
              left:  `${(dragGhost.ghost.start / 24) * 100}%`,
              width: `${((dragGhost.ghost.end - dragGhost.ghost.start) / 24) * 100}%`,
              backgroundColor: color,
              opacity: dragGhost.kind === 'create' ? 0.4 : 0.85,
              outline: `2px solid ${color}`,
              outlineOffset: '-1px',
            }}
          >
            <span className="px-1.5 text-[10px] tabular-nums font-semibold text-white drop-shadow-sm select-none whitespace-nowrap">
              {fmtHour(dragGhost.ghost.start)}–{fmtHour(dragGhost.ghost.end)}
              <span className="ml-1 opacity-80">· {fmtDuration(dragGhost.ghost.start, dragGhost.ghost.end)}</span>
            </span>
          </div>
        )}
        {/* Hover time indicator — vertical line + time bubble */}
        {hoverHour !== null && !dragGhost && (
          <div
            className="absolute inset-y-0 pointer-events-none"
            style={{ left: `${(hoverHour / 24) * 100}%` }}
          >
            <div className="absolute inset-y-0 w-px bg-foreground/40" />
            <div className="absolute bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] tabular-nums font-semibold text-background shadow">
              {fmtHour(hoverHour)}
            </div>
          </div>
        )}
        {/* Copy / paste — top-right, visible on cell hover */}
        {cellHovered && !dragGhost && !readOnly && (
          <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 z-20">
            <button
              type="button"
              data-remove="1"
              disabled={blocks.length === 0}
              onClick={(e) => { e.stopPropagation(); onCopy(blocks.map((b) => ({ startHour: b.startHour, endHour: b.endHour }))); }}
              className="h-5 w-5 flex items-center justify-center rounded bg-background/80 backdrop-blur border border-border/50 text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-colors"
              title={blocks.length === 0 ? 'No blocks to copy' : "Copy this day's hours"}
            >
              <ClipboardCopy className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              data-remove="1"
              disabled={!clipboard || clipboard.ranges.length === 0}
              onClick={(e) => { e.stopPropagation(); onPaste(); }}
              className="h-5 w-5 flex items-center justify-center rounded bg-background/80 backdrop-blur border border-border/50 text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-colors"
              title={!clipboard ? 'Nothing copied yet' : `Paste ${clipboard.ranges.length} block${clipboard.ranges.length !== 1 ? 's' : ''}`}
            >
              <ClipboardPaste className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>
      {/* Footer — hour scale on the left, day total on the right */}
      <div className="flex items-center justify-between gap-2 px-0">
        <div className="flex flex-1 justify-between pointer-events-none">
          {['00', '06', '12', '18', '24'].map((h) => (
            <span key={h} className="text-[9px] tabular-nums text-muted-foreground/70 leading-none">{h}</span>
          ))}
        </div>
        {totalHours > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold tabular-nums leading-none text-muted-foreground">
            {fmtDuration(0, totalHours)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeeklyScheduleGrid — renders the schedule in 7-day-wide weekly blocks
// so that long voyages (3+ weeks) stay readable and don't squash columns.
// ---------------------------------------------------------------------------

interface WeeklyScheduleGridProps {
  scheduleDays: Date[];
  gridCrew: SchedulableCrew[];
  assignments: WatchAssignment[];
  addBlock: (userId: string, userName: string, userPosition: string | null, date: string, startHour: number, endHour: number) => void;
  removeBlock: (blockId: string) => void;
  resizeBlock: (blockId: string, startHour: number, endHour: number) => void;
  readOnly?: boolean;
}

function WeeklyScheduleGrid({
  scheduleDays,
  gridCrew,
  assignments,
  addBlock,
  removeBlock,
  resizeBlock,
  readOnly,
}: WeeklyScheduleGridProps) {
  // Per-crew clipboard: maps userId → copied time ranges
  const [clipboards, setClipboards] = useState<Record<string, CopiedBlocks>>({});

  // Split days into chunks of 7 (one per calendar week row)
  const weeks: Date[][] = [];
  for (let i = 0; i < scheduleDays.length; i += 7) {
    weeks.push(scheduleDays.slice(i, i + 7));
  }

  // Pre-bucket assignments by `userId:date` for O(1) lookups during render
  // (with 28 days × 10+ crew × 100+ blocks the naive filter was getting
  // expensive on every keystroke).
  const blocksByCrewDate = useMemo(() => {
    const map = new Map<string, WatchAssignment[]>();
    for (const a of assignments) {
      const key = `${a.userId}:${a.date}`;
      const arr = map.get(key);
      if (arr) arr.push(a); else map.set(key, [a]);
    }
    return map;
  }, [assignments]);

  // Sum a crew member's hours across a set of days.
  const sumCrewHoursAcross = (crewId: string, days: Date[]) => {
    let total = 0;
    for (const d of days) {
      const arr = blocksByCrewDate.get(`${crewId}:${format(d, 'yyyy-MM-dd')}`) ?? [];
      for (const b of arr) total += b.endHour - b.startHour;
    }
    return total;
  };

  // Sum every crew member's hours on a given day.
  const sumDayHours = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    let total = 0;
    for (const c of gridCrew) {
      const arr = blocksByCrewDate.get(`${c.id}:${dateStr}`) ?? [];
      for (const b of arr) total += b.endHour - b.startHour;
    }
    return total;
  };

  return (
    <div className="divide-y">
      {weeks.map((weekDays, weekIdx) => (
        <div key={weekIdx}>
          {/* Week header */}
          <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Week {weekIdx + 1}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(weekDays[0], 'd MMM')}
                {weekDays.length > 1 && ` – ${format(weekDays[weekDays.length - 1], 'd MMM yyyy')}`}
              </span>
            </div>
            {/* Week-wide total — sums across all crew + days */}
            <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {gridCrew.reduce((s, c) => s + sumCrewHoursAcross(c.id, weekDays), 0)}h this week
            </span>
          </div>
          {/* Week table */}
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-left text-xs font-semibold text-muted-foreground backdrop-blur min-w-[150px] max-w-[180px]">
                    Crew member
                  </th>
                  {weekDays.map((day) => {
                    const today = isToday(day);
                    const weekend = isWeekend(day);
                    return (
                      <th
                        key={day.toISOString()}
                        className={[
                          'px-2 py-2 text-center text-xs font-semibold whitespace-nowrap min-w-[180px] relative',
                          today
                            ? 'bg-primary/10 text-primary'
                            : weekend
                            ? 'bg-muted/50 text-muted-foreground'
                            : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        <span className="block">{format(day, 'EEE')}</span>
                        <span className={`block font-normal ${today ? 'text-primary/80' : 'text-muted-foreground/70'}`}>
                          {format(day, 'd/M')}
                        </span>
                        {today && (
                          <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary/70" />
                        )}
                      </th>
                    );
                  })}
                  {/* Trailing weekly-total column */}
                  <th className="sticky right-0 z-10 bg-muted/60 px-3 py-2 text-right text-xs font-semibold text-muted-foreground backdrop-blur min-w-[68px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gridCrew.map((crew, crewIdx) => {
                  const color = crewColor(crewIdx);
                  const crewClipboard = clipboards[crew.id] ?? null;
                  const weeklyTotal = sumCrewHoursAcross(crew.id, weekDays);
                  return (
                    <tr key={crew.id} className="hover:bg-muted/10 transition-colors">
                      {/* Sticky crew name column */}
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 backdrop-blur min-w-[150px] max-w-[180px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3 w-1 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-xs leading-tight truncate">{crew.displayName}</div>
                            {crew.position && (
                              <div className="text-[10px] text-muted-foreground truncate">{crew.position}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* One cell per day in this week */}
                      {weekDays.map((day) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const blocks = blocksByCrewDate.get(`${crew.id}:${dateStr}`) ?? [];
                        const today = isToday(day);
                        const weekend = isWeekend(day);
                        return (
                          <td
                            key={dateStr}
                            className={[
                              'px-2 py-2 align-top',
                              today ? 'bg-primary/5'
                                : weekend ? 'bg-muted/20'
                                : '',
                            ].join(' ')}
                          >
                            <DayCell
                              blocks={blocks}
                              color={color}
                              isToday={today}
                              readOnly={readOnly}
                              onAdd={(startHour, endHour) =>
                                addBlock(crew.id, crew.displayName, crew.position ?? null, dateStr, startHour, endHour)
                              }
                              onRemove={removeBlock}
                              onResize={resizeBlock}
                              clipboard={crewClipboard}
                              onCopy={(ranges) =>
                                setClipboards((prev) => ({ ...prev, [crew.id]: { ranges } }))
                              }
                              onPaste={() => {
                                if (!crewClipboard) return;
                                for (const r of crewClipboard.ranges) {
                                  addBlock(crew.id, crew.displayName, crew.position ?? null, dateStr, r.startHour, r.endHour);
                                }
                              }}
                            />
                          </td>
                        );
                      })}
                      {/* Trailing weekly-total cell */}
                      <td className="sticky right-0 z-10 bg-background px-3 py-2 text-right backdrop-blur">
                        {weeklyTotal > 0 ? (
                          <span
                            className="inline-flex h-6 items-center justify-center rounded-full px-2 text-[11px] font-semibold tabular-nums"
                            style={{ backgroundColor: `${color}22`, color }}
                          >
                            {weeklyTotal}h
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Footer row — total hours per day across all crew */}
                <tr className="bg-muted/20">
                  <td className="sticky left-0 z-10 bg-muted/40 px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    Day total
                  </td>
                  {weekDays.map((day) => {
                    const dayTotal = sumDayHours(day);
                    const today = isToday(day);
                    const weekend = isWeekend(day);
                    return (
                      <td
                        key={`total-${day.toISOString()}`}
                        className={[
                          'px-2 py-1.5 text-center',
                          today ? 'bg-primary/5' : weekend ? 'bg-muted/30' : '',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'inline-flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-semibold tabular-nums',
                            dayTotal === 0
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                              : 'bg-background text-muted-foreground',
                          ].join(' ')}
                          title={dayTotal === 0 ? 'No crew scheduled this day' : `${dayTotal} crew-hours scheduled`}
                        >
                          {dayTotal === 0 ? 'No cover' : `${dayTotal}h`}
                        </span>
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-muted/40 px-3 py-1.5 text-right backdrop-blur">
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {weekDays.reduce((s, d) => s + sumDayHours(d), 0)}h
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

