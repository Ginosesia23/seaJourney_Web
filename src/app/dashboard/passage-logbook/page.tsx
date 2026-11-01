'use client';

import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInHours, differenceInCalendarDays, parse, startOfDay, endOfDay, isAfter, isBefore, eachDayOfInterval } from 'date-fns';
import { PlusCircle, Loader2, Ship, MapPin, Calendar, ArrowRight, Edit, Trash2, Wind, Waves, Route, Download, AlertTriangle, Map as MapIcon, Link2, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  PassageLogbookPageHeader,
  PassageLogbookSection,
  PassageLogbookStatTiles,
} from '@/components/dashboard/passage-logbook-page-ui';
import { PassageLogbookActivePassage } from '@/components/dashboard/passage-logbook-active-passage';
import { MIN_UNDERWAY_MS_FOR_SEA_DAY } from '@/lib/ais/sea-day-threshold';
import {
  PassageLogTrackMap,
  resolvePassageTrackCoordinates,
} from '@/components/dashboard/passage-log-track-map';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { useToast } from '@/hooks/use-toast';
import {
  getPassageLogs,
  getPassageLogsByVessel,
  createPassageLog,
  updatePassageLog,
  deletePassageLog,
  getVesselStateLogs,
  updateStateLogsBatch,
  getVesselAssignments,
} from '@/supabase/database/queries';
import type { Vessel, UserProfile, PassageLog, StateLog, VesselAssignment } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isVesselLinkedFeatureGranted, vesselLinkedOwnedVesselId } from '@/lib/vessel-linked-features';
import { useCrewVesselFeatureBoost } from '@/contexts/crew-vessel-feature-boost-context';
import {
  findLinkedOrOverlappingPassage,
  isAisSourcedPassage,
  passageSourceLabel,
  isPlaceholderPort,
} from '@/lib/passages/ais-logbook-link';
import { resolveEndpointLabel } from '@/lib/passages-map/nearest-port';
import {
  collapseDatesToLeavePeriods,
  type LeavePeriod,
} from '@/lib/passages-map/filter-by-leave-periods';
import {
  filterPassagesForCrewAssignments,
  filterPassagesOutsideLeave,
} from '@/lib/passages/filter-logbook-passages';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { cn } from '@/lib/utils';
import { generatePassageLogPDF, type PassageLogExportData } from '@/lib/pdf-generator';

/** Prefer stored port; for Open sea / empty use GPS when available. */
function displayPassagePort(
  port: string | null | undefined,
  lat?: number | null,
  lon?: number | null,
  trackCoords?: [number, number] | null,
): string {
  if (!isPlaceholderPort(port) && port?.trim()) return port.trim();
  const useLat = lat ?? trackCoords?.[1] ?? null;
  const useLon = lon ?? trackCoords?.[0] ?? null;
  if (
    useLat != null &&
    useLon != null &&
    Number.isFinite(useLat) &&
    Number.isFinite(useLon)
  ) {
    return resolveEndpointLabel(useLat, useLon);
  }
  return port?.trim() || '—';
}

function passageDurationHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 3_600_000);
}

function formatLoggedHours(hours: number): string {
  if (hours <= 0) return '';
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  if (days > 0) return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
  return `${hours}h`;
}

function formatMonthDateSpan(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '';
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return format(start, 'd MMM');
  }
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${format(start, 'd')}–${format(end, 'd MMM')}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM')}`;
  }
  return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
}

function uniqueMonthPorts(items: PassageLog[]): string[] {
  const ports: string[] = [];
  const ordered = [...items].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  for (const passage of ordered) {
    const dep = displayPassagePort(
      passage.departure_port,
      passage.departure_lat,
      passage.departure_lon,
      trackEndpointCoord(passage.track_data, 'start'),
    );
    const arr = displayPassagePort(
      passage.arrival_port,
      passage.arrival_lat,
      passage.arrival_lon,
      trackEndpointCoord(passage.track_data, 'end'),
    );
    for (const label of [dep, arr]) {
      if (!label || label === '—') continue;
      if (ports[ports.length - 1] !== label) ports.push(label);
    }
  }
  return ports;
}

function formatMonthRoute(ports: string[]): { from: string; to: string | null; via: string | null } | null {
  if (ports.length === 0) return null;
  if (ports.length === 1) return { from: ports[0]!, to: null, via: null };
  const via = ports.slice(1, -1);
  const viaText =
    via.length === 0
      ? null
      : via.length <= 2
        ? via.join(', ')
        : `${via[0]}, ${via[1]} +${via.length - 2}`;
  return { from: ports[0]!, to: ports[ports.length - 1]!, via: viaText };
}

/** One-line date range for compact history rows. */
function formatCompactPassageDates(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');
  if (sameDay) {
    return `${format(start, 'd MMM yyyy')} ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'd MMM HH:mm')} → ${format(end, 'd MMM yyyy HH:mm')}`;
  }
  return `${format(start, 'd MMM yyyy HH:mm')} → ${format(end, 'd MMM yyyy HH:mm')}`;
}

function trackEndpointCoord(
  trackData: unknown,
  which: 'start' | 'end',
): [number, number] | null {
  const coords = (trackData as { coordinates?: unknown } | null)?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const pick = which === 'start' ? coords[0] : coords[coords.length - 1];
  if (!Array.isArray(pick) || pick.length < 2) return null;
  const lon = typeof pick[0] === 'number' ? pick[0] : Number(pick[0]);
  const lat = typeof pick[1] === 'number' ? pick[1] : Number(pick[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

/**
 * Calendar days (yyyy-MM-dd) where the passage spends at least the
 * minimum sea-day time underway. Shorter days (e.g. a 2pm departure's
 * final hours, or an early-morning arrival) don't count as Underway.
 */
function passageSeaDayKeys(startIso: string | Date, endIso: string | Date): string[] {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  return eachDayOfInterval({ start: startOfDay(startMs), end: endOfDay(endMs) })
    .filter((day) => {
      const overlapMs =
        Math.min(endMs, endOfDay(day).getTime()) - Math.max(startMs, startOfDay(day).getTime());
      return overlapMs >= MIN_UNDERWAY_MS_FOR_SEA_DAY;
    })
    .map((day) => format(day, 'yyyy-MM-dd'));
}

const passageSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  departurePort: z.string().optional(),
  departureCountry: z.string().optional(),
  arrivalPort: z.string().optional(),
  arrivalCountry: z.string().optional(),
  startTime: z.date({ required_error: 'Departure date/time is required.' }),
  endTime: z.date({ required_error: 'Arrival date/time is required.' }),
  distanceNm: z.number().min(0).optional(),
  engineHours: z.number().min(0).optional(),
  passageType: z.string().optional(),
  weatherSummary: z.string().optional(),
  seaState: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  return data.endTime >= data.startTime;
}, {
  message: "Arrival time must be after departure time",
  path: ["endTime"],
});

type PassageFormValues = z.infer<typeof passageSchema>;

const passageTypes = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'guest_trip', label: 'Guest Trip' },
  { value: 'shipyard_move', label: 'Shipyard Move' },
  { value: 'charter', label: 'Charter' },
  { value: 'cruise', label: 'Cruise' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

const seaStateOptions = [
  { value: 'calm', label: 'Calm (0-1)' },
  { value: 'slight', label: 'Slight (2-3)' },
  { value: 'moderate', label: 'Moderate (4-5)' },
  { value: 'rough', label: 'Rough (6-7)' },
  { value: 'very_rough', label: 'Very Rough (8-9)' },
  { value: 'phenomenal', label: 'Phenomenal (10+)' },
];

/** Deep-link to Passage Tracks for a logbook row with AIS linkage. */
function passagesMapHrefForLog(passage: PassageLog): string | null {
  const hasLink =
    Boolean(passage.ais_fingerprint) ||
    isAisSourcedPassage(passage.source) ||
    Boolean(
      passage.track_data &&
        typeof passage.track_data === 'object' &&
        (passage.track_data as { aisFingerprint?: string }).aisFingerprint,
    );
  if (!hasLink) return null;
  const month = String(passage.start_time || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const params = new URLSearchParams({
    month,
    vessel: passage.vessel_id,
  });
  return `/dashboard/passages-map?${params.toString()}`;
}

/** Premium+ crew tiers that can use the passage log (excludes Standard, free, crew_limited). */
const PASSAGE_LOG_CREW_TIERS = new Set(['premium', 'pro', 'professional']);

async function loadLeavePeriodsByVessel(
  supabase: SupabaseClient,
  userId: string,
  vesselIds: string[],
): Promise<Map<string, LeavePeriod[]>> {
  const leaveByVessel = new Map<string, LeavePeriod[]>();
  if (vesselIds.length === 0) return leaveByVessel;

  const [{ data: leaveRows }, { data: onLeaveLogs }] = await Promise.all([
    supabase
      .from('crew_leave_periods')
      .select('vessel_id, start_date, end_date')
      .eq('crew_user_id', userId)
      .in('vessel_id', vesselIds),
    supabase
      .from('daily_state_logs')
      .select('vessel_id, date')
      .eq('user_id', userId)
      .eq('state', 'on-leave')
      .in('vessel_id', vesselIds),
  ]);

  for (const row of leaveRows ?? []) {
    const vesselId = String((row as { vessel_id: string }).vessel_id);
    const startDate = String((row as { start_date: string }).start_date).slice(0, 10);
    const endDate = String((row as { end_date: string }).end_date).slice(0, 10);
    let list = leaveByVessel.get(vesselId);
    if (!list) {
      list = [];
      leaveByVessel.set(vesselId, list);
    }
    list.push({ vesselId, startDate, endDate });
  }

  const datesByVessel = new Map<string, string[]>();
  for (const row of onLeaveLogs ?? []) {
    const vesselId = String((row as { vessel_id: string }).vessel_id);
    const d = String((row as { date: string }).date).slice(0, 10);
    let list = datesByVessel.get(vesselId);
    if (!list) {
      list = [];
      datesByVessel.set(vesselId, list);
    }
    list.push(d);
  }
  for (const [vesselId, dates] of datesByVessel) {
    const derived = collapseDatesToLeavePeriods(vesselId, dates);
    if (derived.length === 0) continue;
    const existing = leaveByVessel.get(vesselId) ?? [];
    leaveByVessel.set(vesselId, [...existing, ...derived]);
  }

  return leaveByVessel;
}

/** Format yyyy-MM-dd dates as readable ranges, e.g. "3–5 Jan 2026, 12 Jan 2026". */
function formatConflictDateList(dates: string[]): string {
  if (dates.length === 0) return '';
  const sorted = [...dates].sort();
  const ranges: { start: string; end: string }[] = [];
  let rangeStart = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prevDate = parse(prev, 'yyyy-MM-dd', new Date());
    const curDate = parse(cur, 'yyyy-MM-dd', new Date());
    if (differenceInCalendarDays(curDate, prevDate) === 1) {
      prev = cur;
      continue;
    }
    ranges.push({ start: rangeStart, end: prev });
    rangeStart = cur;
    prev = cur;
  }
  ranges.push({ start: rangeStart, end: prev });

  return ranges
    .map(({ start, end }) => {
      const startDate = parse(start, 'yyyy-MM-dd', new Date());
      const endDate = parse(end, 'yyyy-MM-dd', new Date());
      if (start === end) return format(startDate, 'd MMM yyyy');
      if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
        return `${format(startDate, 'd')}–${format(endDate, 'd MMM yyyy')}`;
      }
      if (startDate.getFullYear() === endDate.getFullYear()) {
        return `${format(startDate, 'd MMM')} – ${format(endDate, 'd MMM yyyy')}`;
      }
      return `${format(startDate, 'd MMM yyyy')} – ${format(endDate, 'd MMM yyyy')}`;
    })
    .join(', ');
}

type EnrichProposal = {
  passageId: string;
  vesselId: string;
  status: 'enrichable' | 'matched_complete' | 'no_match';
  method?: 'fingerprint' | 'overlap';
  overlapRatio?: number;
  log: {
    startTime: string;
    endTime: string;
    distanceNm: number | null;
    avgSpeedKnots: number | null;
    departurePort: string | null;
    arrivalPort: string | null;
    source: string | null;
  };
  ais?: {
    startTime: string;
    endTime: string;
    distanceNm: number | null;
    avgSpeedKn: number | null;
    departurePort: string | null;
    arrivalPort: string | null;
  };
  fieldsFilled?: string[];
  proposed?: {
    startTime?: string;
    endTime?: string;
    distanceNm?: number;
    avgSpeedKnots?: number;
    departurePort?: string;
    arrivalPort?: string;
  };
};

export default function PassageLogbookPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPassage, setEditingPassage] = useState<PassageLog | null>(null);
  const [passages, setPassages] = useState<PassageLog[]>([]);
  const [isLoadingPassages, setIsLoadingPassages] = useState(true);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFilter, setExportFilter] = useState<'all' | 'vessel' | 'date'>('all');
  const [exportVesselId, setExportVesselId] = useState<string>('');
  const [exportStartDate, setExportStartDate] = useState<Date | undefined>(undefined);
  const [exportEndDate, setExportEndDate] = useState<Date | undefined>(undefined);
  const [stateLogsByVessel, setStateLogsByVessel] = useState<Record<string, StateLog[]>>({});
  const [syncingPassageId, setSyncingPassageId] = useState<string | null>(null);
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
  const [isEnrichDialogOpen, setIsEnrichDialogOpen] = useState(false);
  const [isScanningAis, setIsScanningAis] = useState(false);
  const [isApplyingEnrich, setIsApplyingEnrich] = useState(false);
  const [enrichProposals, setEnrichProposals] = useState<EnrichProposal[]>([]);
  const [enrichSummary, setEnrichSummary] = useState<{
    total: number;
    enrichable: number;
    matchedComplete: number;
    noMatch: number;
  } | null>(null);
  const [enrichAisCount, setEnrichAisCount] = useState(0);
  const [selectedEnrichIds, setSelectedEnrichIds] = useState<Set<string>>(new Set());
  const [isImportingFromMap, setIsImportingFromMap] = useState(false);
  const autoImportKeyRef = useRef<string | null>(null);
  const [calendarConflictsOpen, setCalendarConflictsOpen] = useState(false);
  const [underwayWithoutPassageOpen, setUnderwayWithoutPassageOpen] = useState(false);
  const [mapMissingCount, setMapMissingCount] = useState<number | null>(null);
  const [mapCachedMonthCount, setMapCachedMonthCount] = useState<number | null>(null);
  const [mapEnrichableCount, setMapEnrichableCount] = useState<number | null>(null);
  const [expandedPassageId, setExpandedPassageId] = useState<string | null>(null);
  const [expandedHistoryMonths, setExpandedHistoryMonths] = useState<Set<string>>(
    () => new Set([format(new Date(), 'yyyy-MM')]),
  );
  const [historyMonthsInitialized, setHistoryMonthsInitialized] = useState(false);

  const { user } = useUser();
  const { supabase, session } = useSupabase();
  const { toast } = useToast();
  const { isEnabled: isFeatureEnabled, isLoading: isFlagsLoading } =
    useFeatureFlags();
  const passageLogFeatureOn = isFeatureEnabled('passage_logbook');

  // Fetch user profile to check subscription tier
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  const { boost: vesselBoost } = useCrewVesselFeatureBoost();
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    const subscriptionTier = (userProfileRaw as any).subscription_tier || userProfileRaw.subscriptionTier || 'free';
    const subscriptionStatus = (userProfileRaw as any).subscription_status || userProfileRaw.subscriptionStatus || 'inactive';
    const activeVesselId = (userProfileRaw as any).active_vessel_id ?? (userProfileRaw as any).activeVesselId ?? null;
    return {
      ...userProfileRaw,
      role: role,
      subscriptionTier: subscriptionTier,
      subscriptionStatus: subscriptionStatus,
      activeVesselId: activeVesselId ?? undefined,
    } as UserProfile & { activeVesselId?: string | null };
  }, [userProfileRaw]);

  const isVesselAccount = (userProfile?.role as string) === 'vessel';
  const linkedLogbookVesselId = useMemo(
    () =>
      isVesselLinkedFeatureGranted(userProfileRaw, 'passage_logbook')
        ? vesselLinkedOwnedVesselId(userProfileRaw)
        : null,
    [userProfileRaw],
  );
  const isVesselScopedLogbook = isVesselAccount || Boolean(linkedLogbookVesselId);

  // Query vessels
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels_public_identity' : null,
    user?.id ? { orderBy: 'name', ascending: true } : undefined
  );

  const [linkedVesselRow, setLinkedVesselRow] = useState<Vessel | null>(null);

  const loadPassagesData = useCallback(async () => {
    if (!user?.id || !userProfile) return;

    const role = (userProfile.role as string) || 'crew';
    const activeVesselId =
      (userProfile as any).active_vessel_id ?? (userProfile as any).activeVesselId ?? null;

    let assignments: VesselAssignment[] = [];
    if (role !== 'vessel' && role !== 'admin' && !linkedLogbookVesselId) {
      try {
        assignments = await getVesselAssignments(supabase, user.id);
      } catch {
        assignments = [];
      }
    }
    setVesselAssignments(assignments);

    let data: PassageLog[];
    if (isVesselScopedLogbook) {
      const vesselId =
        role === 'vessel' ? activeVesselId : linkedLogbookVesselId;
      if (!vesselId) {
        setPassages([]);
        return;
      }
      if (linkedLogbookVesselId) {
        const token = session?.access_token;
        if (!token) {
          setPassages([]);
          return;
        }
        const res = await fetch(
          `/api/passage-logbook?vesselId=${encodeURIComponent(vesselId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          throw new Error('Failed to load vessel passages');
        }
        const json = await res.json();
        data = Array.isArray(json.passages) ? json.passages : [];
        if (json.vessel && json.vessel.id) {
          setLinkedVesselRow({
            id: json.vessel.id,
            name: json.vessel.name || 'Vessel',
            type: json.vessel.type || '',
          } as Vessel);
        }
      } else {
        data = await getPassageLogsByVessel(supabase, vesselId);
      }
    } else {
      data = await getPassageLogs(supabase, user.id);
      if (role !== 'admin' && role !== 'vessel') {
        data = filterPassagesForCrewAssignments(data, assignments);
        const vesselIds = Array.from(
          new Set([
            ...assignments.map((a) => a.vesselId),
            ...data.map((p) => p.vessel_id),
          ]),
        );
        const leaveByVessel = await loadLeavePeriodsByVessel(
          supabase,
          user.id,
          vesselIds,
        );
        data = filterPassagesOutsideLeave(data, leaveByVessel);
      }
    }
    setPassages(data);
  }, [user?.id, userProfile, supabase, linkedLogbookVesselId, isVesselScopedLogbook, session?.access_token]);

  useEffect(() => {
    if (!user?.id || !userProfile) {
      setVesselAssignments([]);
      setIsLoadingPassages(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setIsLoadingPassages(true);
        await loadPassagesData();
      } catch (error: any) {
        console.error('Error loading passages:', error);
        if (!cancelled) {
          toast({
            title: 'Error',
            description: 'Failed to load passages. Please refresh the page.',
            variant: 'destructive',
          });
          setPassages([]);
        }
      } finally {
        if (!cancelled) setIsLoadingPassages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, userProfile, loadPassagesData, toast]);

  // Vessel options for passage form: vessel account = single active vessel (no dropdown); crew = only assigned vessels
  const vesselsForPassageForm = useMemo(() => {
    const role = (userProfile?.role as string) || 'crew';
    if (isVesselScopedLogbook) {
      const activeId = role === 'vessel'
        ? (userProfile as any).activeVesselId
        : linkedLogbookVesselId;
      if (!activeId) return [];
      const fromCollection = vessels?.find((x) => x.id === activeId);
      if (fromCollection) return [fromCollection];
      if (linkedVesselRow && linkedVesselRow.id === activeId) return [linkedVesselRow];
      return [];
    }
    if (!vessels?.length) return [];
    const assignedIds = new Set(vesselAssignments.map((a) => a.vesselId));
    return vessels.filter((v) => assignedIds.has(v.id));
  }, [vessels, userProfile, vesselAssignments, linkedLogbookVesselId, linkedVesselRow]);

  // When export dialog opens: vessel accounts use their active vessel only (no "By Vessel" option)
  useEffect(() => {
    if (!isExportDialogOpen) return;
    if ((userProfile?.role as string) === 'vessel') {
      setExportFilter('all');
      if ((userProfile as any).activeVesselId) {
        setExportVesselId((userProfile as any).activeVesselId);
      }
    }
  }, [isExportDialogOpen, userProfile]);

  // Load state logs for all vessels that have passages (to detect calendar conflicts)
  useEffect(() => {
    if (!user?.id || passages.length === 0 || linkedLogbookVesselId) {
      setStateLogsByVessel({});
      return;
    }
    const vesselIds = [...new Set(passages.map((p) => p.vessel_id))];
    let cancelled = false;
    (async () => {
      const map: Record<string, StateLog[]> = {};
      for (const vesselId of vesselIds) {
        if (cancelled) return;
        try {
          const logs = await getVesselStateLogs(supabase, vesselId, user.id);
          map[vesselId] = logs;
        } catch (e) {
          console.error('Error loading state logs for vessel', vesselId, e);
          map[vesselId] = [];
        }
      }
      if (!cancelled) setStateLogsByVessel(map);
    })();
    return () => { cancelled = true; };
  }, [user?.id, passages.length, supabase, linkedLogbookVesselId]);

  const form = useForm<PassageFormValues>({
    resolver: zodResolver(passageSchema),
    defaultValues: {
      vesselId: '',
      departurePort: undefined,
      departureCountry: '',
      arrivalPort: undefined,
      arrivalCountry: '',
      startTime: new Date(),
      endTime: new Date(),
      distanceNm: undefined,
      engineHours: undefined,
      passageType: '',
      weatherSummary: '',
      seaState: '',
      notes: '',
    },
  });

  const hasAccess = passageLogFeatureOn;

  const canMatchAis = isFeatureEnabled('passages_map');

  const refreshMapMissingCount = useCallback(async () => {
    if (!canMatchAis) {
      setMapMissingCount(null);
      setMapCachedMonthCount(null);
      setMapEnrichableCount(null);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/passages-map/sync-logbook', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setMapMissingCount(
        typeof json.missingCount === 'number' ? json.missingCount : 0,
      );
      setMapCachedMonthCount(
        typeof json.cachedMonthCount === 'number' ? json.cachedMonthCount : 0,
      );
      setMapEnrichableCount(
        typeof json.enrichableCount === 'number' ? json.enrichableCount : 0,
      );
    } catch {
      /* optional chrome */
    }
  }, [canMatchAis, supabase]);

  useEffect(() => {
    if (!hasAccess || !canMatchAis) return;
    void refreshMapMissingCount();
  }, [hasAccess, canMatchAis, passages.length, refreshMapMissingCount]);

  const importFromPassagesMap = useCallback(async (opts?: { quiet?: boolean }) => {
    setIsImportingFromMap(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/passages-map/sync-logbook', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      const createdCount = json.createdCount ?? 0;
      if (createdCount > 0) {
        toast({
          title: 'AIS voyages added to the log',
          description:
            json.message ||
            `Added ${createdCount} passage${createdCount === 1 ? '' : 's'} from Passage Tracks.`,
        });
      } else if (!opts?.quiet) {
        toast({
          title: 'Logbook already up to date',
          description: json.message || 'Every cached AIS voyage is already in the log.',
        });
      }
      await loadPassagesData();
      await refreshMapMissingCount();
    } catch (err) {
      if (!opts?.quiet) {
        toast({
          title: 'Could not add AIS voyages',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsImportingFromMap(false);
    }
  }, [supabase, toast, loadPassagesData, refreshMapMissingCount]);

  useEffect(() => {
    if (!hasAccess || !canMatchAis || isImportingFromMap) return;
    if ((mapCachedMonthCount ?? 0) === 0) return;
    if ((mapMissingCount ?? 0) === 0) return;
    const key = `${mapCachedMonthCount}:${mapMissingCount}`;
    if (autoImportKeyRef.current === key) return;
    autoImportKeyRef.current = key;
    void importFromPassagesMap({ quiet: true });
  }, [
    hasAccess,
    canMatchAis,
    isImportingFromMap,
    mapCachedMonthCount,
    mapMissingCount,
    importFromPassagesMap,
  ]);

  const scanAisMatches = useCallback(async () => {
    setIsScanningAis(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/passages-map/enrich', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to match AIS tracks');
      const proposals = (json.proposals || []) as EnrichProposal[];
      setEnrichProposals(proposals);
      setEnrichSummary(json.summary ?? null);
      setEnrichAisCount(json.aisPassageCount ?? 0);
      setSelectedEnrichIds(
        new Set(proposals.filter((p) => p.status === 'enrichable').map((p) => p.passageId)),
      );
    } catch (err) {
      toast({
        title: 'AIS match failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsScanningAis(false);
    }
  }, [supabase, toast]);

  const openEnrichDialog = useCallback(async () => {
    setIsEnrichDialogOpen(true);
    setEnrichProposals([]);
    setEnrichSummary(null);
    await scanAisMatches();
  }, [scanAisMatches]);

  const applyAisEnrichment = useCallback(async () => {
    if (selectedEnrichIds.size === 0) {
      toast({
        title: 'Nothing selected',
        description: 'Select at least one matched passage to fill from AIS.',
      });
      return;
    }
    setIsApplyingEnrich(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/passages-map/enrich', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          passageIds: [...selectedEnrichIds],
          updateTimes: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to apply AIS data');
      toast({
        title: 'Passages updated from AIS',
        description: `Filled ${json.updatedCount ?? 0} passage${(json.updatedCount ?? 0) === 1 ? '' : 's'} with distance, times, and speed where missing.`,
      });
      setIsEnrichDialogOpen(false);
      await loadPassagesData();
      await refreshMapMissingCount();
    } catch (err) {
      toast({
        title: 'Could not apply AIS data',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsApplyingEnrich(false);
    }
  }, [selectedEnrichIds, supabase, toast, loadPassagesData, refreshMapMissingCount]);

  const onSubmit = async (data: PassageFormValues) => {
    if (!user?.id || !hasAccess) {
      const role = (userProfile as any)?.role || userProfile?.role || 'crew';
      const message =
        role === 'vessel'
          ? 'Passage Log Book requires an active vessel subscription.'
          : 'Passage Log Book is available on Crew Premium and Professional plans.';
      toast({
        title: 'Subscription Required',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    const vesselId =
      isVesselScopedLogbook &&
      ((userProfile as any).activeVesselId || linkedLogbookVesselId)
        ? ((userProfile?.role as string) === 'vessel'
            ? (userProfile as any).activeVesselId
            : linkedLogbookVesselId)
        : data.vesselId;
    if (!vesselId) {
      toast({
        title: 'Error',
        description:
          isVesselScopedLogbook
            ? 'No active vessel set. Set your vessel in Profile.'
            : 'Please select a vessel.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      if (editingPassage) {
        await updatePassageLog(supabase, editingPassage.id, {
          vesselId,
          startTime: data.startTime,
          endTime: data.endTime,
          departurePort: data.departurePort?.trim() || undefined,
          departureCountry: data.departureCountry?.trim() || undefined,
          arrivalPort: data.arrivalPort?.trim() || undefined,
          arrivalCountry: data.arrivalCountry || undefined,
          distanceNm: data.distanceNm,
          engineHours: data.engineHours,
          passageType: data.passageType || undefined,
          weatherSummary: data.weatherSummary || undefined,
          seaState: data.seaState || undefined,
          notes: data.notes || undefined,
          source: editingPassage.source || 'manual',
        });

        toast({
          title: 'Passage Updated',
          description: 'Your passage has been updated successfully.',
        });
      } else {
        const overlap = findLinkedOrOverlappingPassage(passages, {
          vesselId,
          startTime: data.startTime.toISOString(),
          endTime: data.endTime.toISOString(),
        });
        if (overlap) {
          toast({
            title: 'Passage already recorded',
            description: isAisSourcedPassage(overlap.source)
              ? 'This voyage already exists from the AIS map. Edit that logbook entry instead of creating a duplicate.'
              : 'An overlapping passage already exists for this vessel and date range.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }

        await createPassageLog(supabase, {
          crewId: user.id,
          vesselId,
          startTime: data.startTime,
          endTime: data.endTime,
          departurePort: data.departurePort?.trim() || undefined,
          departureCountry: data.departureCountry?.trim() || undefined,
          arrivalPort: data.arrivalPort?.trim() || undefined,
          arrivalCountry: data.arrivalCountry || undefined,
          distanceNm: data.distanceNm,
          engineHours: data.engineHours,
          passageType: data.passageType || undefined,
          weatherSummary: data.weatherSummary || undefined,
          seaState: data.seaState || undefined,
          notes: data.notes || undefined,
          source: 'manual',
        });

        toast({
          title: 'Passage Added',
          description: 'Your passage has been logged successfully.',
        });
      }

      await loadPassagesData();

      // Sync passage sea days to Underway in the calendar
      const logs = passageSeaDayKeys(data.startTime, data.endTime).map((date) => ({
        date,
        state: 'underway' as const,
      }));
      if (logs.length > 0) {
        await updateStateLogsBatch(supabase, user.id, vesselId, logs);
        const updatedLogs = await getVesselStateLogs(supabase, vesselId, user.id);
        setStateLogsByVessel((prev) => ({ ...prev, [vesselId]: updatedLogs }));
      }

      setIsFormOpen(false);
      setEditingPassage(null);
      form.reset();
    } catch (error: any) {
      console.error('Error saving passage:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save passage. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (passage: PassageLog) => {
    setEditingPassage(passage);
    form.reset({
      vesselId: passage.vessel_id,
      departurePort: passage.departure_port ?? '',
      departureCountry: passage.departure_country || '',
      arrivalPort: passage.arrival_port ?? '',
      arrivalCountry: passage.arrival_country || '',
      startTime: new Date(passage.start_time),
      endTime: new Date(passage.end_time),
      distanceNm: passage.distance_nm || undefined,
      engineHours: passage.engine_hours || undefined,
      passageType: passage.passage_type || '',
      weatherSummary: passage.weather_summary || '',
      seaState: passage.sea_state || '',
      notes: passage.notes || '',
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (passageId: string) => {
    if (!confirm('Are you sure you want to delete this passage?')) return;

    try {
      const removed = passages.find((p) => p.id === passageId);
      await deletePassageLog(supabase, passageId);
      setPassages(passages.filter(p => p.id !== passageId));
      const isAisVoyage = Boolean(
        removed?.ais_fingerprint ||
          String(removed?.source || '').toLowerCase().startsWith('ais'),
      );
      toast({
        title: 'Passage Deleted',
        description: isAisVoyage
          ? 'This AIS voyage has been removed and will not be added again.'
          : 'The passage has been removed.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete passage. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSetPassageToUnderway = async (passage: PassageLog) => {
    if (!user?.id) return;
    setSyncingPassageId(passage.id);
    try {
      const logs = passageSeaDayKeys(passage.start_time, passage.end_time).map((date) => ({
        date,
        state: 'underway' as const,
      }));
      if (logs.length === 0) return;
      await updateStateLogsBatch(supabase, user.id, passage.vessel_id, logs);
      const updatedLogs = await getVesselStateLogs(supabase, passage.vessel_id, user.id);
      setStateLogsByVessel((prev) => ({ ...prev, [passage.vessel_id]: updatedLogs }));
      toast({
        title: 'Calendar updated',
        description: `${logs.length} day(s) set to Underway for this passage.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update calendar.',
        variant: 'destructive',
      });
    } finally {
      setSyncingPassageId(null);
    }
  };

  const getVesselName = (vesselId: string) => {
    return vessels?.find(v => v.id === vesselId)?.name || 'Unknown Vessel';
  };

  const getPassageStatus = (passage: PassageLog) => {
    const now = new Date();
    const start = new Date(passage.start_time);
    const end = new Date(passage.end_time);

    if (end < now) return 'completed';
    if (start <= now && end >= now) return 'in-progress';
    return 'planned';
  };

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const hours = differenceInHours(end, start);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${hours}h`;
  };

  const calculateAvgSpeed = (passage: PassageLog) => {
    if (!passage.distance_nm) return null;
    const hours = differenceInHours(new Date(passage.end_time), new Date(passage.start_time));
    if (hours === 0) return null;
    return (passage.distance_nm / hours).toFixed(1);
  };

  const passageTypeLabel = (value?: string | null) =>
    passageTypes.find((t) => t.value === value)?.label || value || null;

  const seaStateLabel = (value?: string | null) =>
    seaStateOptions.find((s) => s.value === value)?.label || value || null;

  const formatCoordPair = (lat?: number | null, lon?: number | null) => {
    if (
      lat == null ||
      lon == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(3)}°${ns} ${Math.abs(lon).toFixed(3)}°${ew}`;
  };

  const handleExport = async () => {
    if (!user?.id || !userProfile) return;

    setIsExporting(true);

    try {
      // Restrict to allowed vessels only (crew: assigned vessels; vessel account: active vessel only)
      const allowedVesselIds = new Set(vesselsForPassageForm.map((v) => v.id));
      let filteredPassages = passages.filter((p) => allowedVesselIds.has(p.vessel_id));

      const filterInfo: PassageLogExportData['filterInfo'] = {};

      if (exportFilter === 'vessel' && exportVesselId) {
        filteredPassages = filteredPassages.filter(p => p.vessel_id === exportVesselId);
        const vessel = vesselsForPassageForm.find(v => v.id === exportVesselId);
        filterInfo.vesselName = vessel?.name;
      } else if (exportFilter === 'date') {
        if (exportStartDate) {
          const start = startOfDay(exportStartDate);
          filteredPassages = filteredPassages.filter(p => 
            isAfter(new Date(p.start_time), start) || 
            new Date(p.start_time).getTime() === start.getTime()
          );
          filterInfo.startDate = exportStartDate;
        }
        if (exportEndDate) {
          const end = endOfDay(exportEndDate);
          filteredPassages = filteredPassages.filter(p => 
            isBefore(new Date(p.end_time), end) || 
            new Date(p.end_time).getTime() === end.getTime()
          );
          filterInfo.endDate = exportEndDate;
        }
      }

      // Prepare export data
      const exportData: PassageLogExportData = {
        passages: filteredPassages.map(passage => ({
          id: passage.id,
          vessel_id: passage.vessel_id,
          vessel_name: getVesselName(passage.vessel_id),
          departure_port: passage.departure_port ?? '',
          departure_country: passage.departure_country,
          arrival_port: passage.arrival_port ?? '',
          arrival_country: passage.arrival_country,
          start_time: passage.start_time,
          end_time: passage.end_time,
          distance_nm: passage.distance_nm,
          engine_hours: passage.engine_hours,
          passage_type: passage.passage_type,
          weather_summary: passage.weather_summary,
          sea_state: passage.sea_state,
          notes: passage.notes,
        })),
        userProfile: {
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          username: userProfile.username || '',
          email: userProfile.email || '',
        },
        filterInfo: Object.keys(filterInfo).length > 0 ? filterInfo : undefined,
      };

      const baseName = 'Passage-Log-Extract';
      const namePart = [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ').trim()
        || userProfile.username
        || 'Export';
      const safeName = namePart.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
      const dateStr = format(new Date(), 'yyyy-MM-dd');
      let filename: string;
      if (filterInfo.vesselName) {
        const safeVessel = filterInfo.vesselName.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
        filename = `${baseName} - ${safeName} - ${safeVessel} - ${dateStr}.pdf`;
      } else if (filterInfo.startDate && filterInfo.endDate) {
        const start = format(filterInfo.startDate, 'yyyy-MM-dd');
        const end = format(filterInfo.endDate, 'yyyy-MM-dd');
        filename = `${baseName} - ${safeName} - ${start} to ${end}.pdf`;
      } else {
        filename = `${baseName} - ${safeName} - ${dateStr}.pdf`;
      }

      await generatePassageLogPDF(exportData, { output: 'download', filename });

      toast({
        title: 'Export Complete',
        description: 'Your passage log has been exported successfully.',
      });

      setIsExportDialogOpen(false);
    } catch (error: any) {
      console.error('Error exporting passages:', error);
      toast({
        title: 'Export Error',
        description: error.message || 'Failed to export passages. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (passages.length === 0) {
      return {
        totalDistance: 0,
        totalPassages: 0,
        longestPassage: null as PassageLog | null,
        longestDistance: 0,
        longestDuration: '',
        averageDistance: 0,
      };
    }

    const totalDistance = passages.reduce((sum, p) => sum + (p.distance_nm || 0), 0);
    const totalPassages = passages.length;
    
    // Find longest passage by distance
    const longestByDistance = passages.reduce((longest, p) => {
      const currentDistance = p.distance_nm || 0;
      return currentDistance > (longest?.distance_nm || 0) ? p : longest;
    }, null as PassageLog | null);

    // Find longest passage by duration
    const longestByDuration = passages.reduce((longest, p) => {
      const currentDuration = differenceInHours(new Date(p.end_time), new Date(p.start_time));
      const longestDuration = longest 
        ? differenceInHours(new Date(longest.end_time), new Date(longest.start_time))
        : 0;
      return currentDuration > longestDuration ? p : longest;
    }, null as PassageLog | null);

    const longestDuration = longestByDuration 
      ? calculateDuration(longestByDuration.start_time, longestByDuration.end_time)
      : '0h';

    const averageDistance = totalDistance / totalPassages;

    return {
      totalDistance,
      totalPassages,
      longestPassage: longestByDistance,
      longestDistance: longestByDistance?.distance_nm || 0,
      longestDuration,
      averageDistance,
    };
  }, [passages]);

  const passagesByMonth = useMemo(() => {
    const map = new Map<string, PassageLog[]>();
    for (const p of passages) {
      const key = format(new Date(p.start_time), 'yyyy-MM');
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return Array.from(map.entries()).map(([monthKey, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );
      const first = sorted[0]!;
      const last = sorted.reduce(
        (acc, p) => (new Date(p.end_time) > new Date(acc.end_time) ? p : acc),
        first,
      );
      let durationHours = 0;
      let distanceNm = 0;
      let aisCount = 0;
      const vesselIds = new Set<string>();
      const seaDayKeys = new Set<string>();
      for (const p of sorted) {
        durationHours += passageDurationHours(p.start_time, p.end_time);
        distanceNm += p.distance_nm || 0;
        if (p.ais_fingerprint || isAisSourcedPassage(p.source)) aisCount += 1;
        vesselIds.add(p.vessel_id);
        for (const day of passageSeaDayKeys(p.start_time, p.end_time)) {
          seaDayKeys.add(day);
        }
      }
      return {
        monthKey,
        items: sorted,
        labelDate: new Date(first.start_time),
        summary: {
          count: sorted.length,
          distanceNm,
          durationHours,
          seaDayCount: seaDayKeys.size,
          firstStart: first.start_time,
          lastEnd: last.end_time,
          ports: uniqueMonthPorts(sorted),
          vesselIds: Array.from(vesselIds),
          aisCount,
        },
      };
    });
  }, [passages]);

  // Expand the newest month that has passages if the current calendar month is empty
  useEffect(() => {
    if (historyMonthsInitialized || passages.length === 0) return;
    const currentKey = format(new Date(), 'yyyy-MM');
    const hasCurrent = passages.some(
      (p) => format(new Date(p.start_time), 'yyyy-MM') === currentKey,
    );
    if (!hasCurrent) {
      const latestKey = format(new Date(passages[0]!.start_time), 'yyyy-MM');
      setExpandedHistoryMonths(new Set([latestKey]));
    }
    setHistoryMonthsInitialized(true);
  }, [passages, historyMonthsInitialized]);

  const toggleHistoryMonth = useCallback((monthKey: string) => {
    setExpandedHistoryMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
    setExpandedPassageId(null);
  }, []);

  // Passage dates that are not set to Underway in the calendar (conflicts)
  const passageConflicts = useMemo(() => {
    const conflicts: { passage: PassageLog; datesNotUnderway: string[] }[] = [];
    for (const passage of passages) {
      const dateStrings = passageSeaDayKeys(passage.start_time, passage.end_time);
      const logs = stateLogsByVessel[passage.vessel_id] || [];
      const logByDate = new Map(logs.map((l) => [l.date, l]));
      const datesNotUnderway = dateStrings.filter(
        (dateStr) => !logByDate.get(dateStr) || (logByDate.get(dateStr)!.state as string) !== 'underway'
      );
      if (datesNotUnderway.length > 0) {
        conflicts.push({ passage, datesNotUnderway });
      }
    }
    return conflicts;
  }, [passages, stateLogsByVessel]);

  // Underway dates in the calendar not covered by any passage (vice versa)
  const underwayDaysWithoutPassage = useMemo(() => {
    const out: { vesselId: string; date: string }[] = [];
    for (const [vesselId, logs] of Object.entries(stateLogsByVessel)) {
      const underwayDates = new Set(
        logs.filter((l) => (l.state as string) === 'underway').map((l) => l.date)
      );
      for (const dateStr of underwayDates) {
        const inPassage = passages.some((p) => {
          if (p.vessel_id !== vesselId) return false;
          const start = startOfDay(new Date(p.start_time));
          const end = endOfDay(new Date(p.end_time));
          const d = parse(dateStr, 'yyyy-MM-dd', new Date());
          return !isBefore(d, start) && !isAfter(d, end);
        });
        if (!inPassage) out.push({ vesselId, date: dateStr });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.vesselId.localeCompare(b.vesselId));
  }, [passages, stateLogsByVessel]);

  const underwayWithoutPassageByVessel = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { vesselId, date } of underwayDaysWithoutPassage) {
      const list = map.get(vesselId) ?? [];
      list.push(date);
      map.set(vesselId, list);
    }
    return [...map.entries()]
      .map(([vesselId, dates]) => ({ vesselId, dates: [...dates].sort() }))
      .sort((a, b) => a.vesselId.localeCompare(b.vesselId));
  }, [underwayDaysWithoutPassage]);

  const isLoading = isLoadingProfile || isLoadingVessels || isFlagsLoading;
  const hasEnrichableMatches = (mapEnrichableCount ?? 0) > 0;
  const aisMonthsLoaded = (mapCachedMonthCount ?? 0) > 0;
  const toolbarBtn =
    'h-7 rounded-[5px] px-2.5 text-xs font-medium shadow-none';
  const monthStatPill =
    'inline-flex h-6 max-w-full items-center rounded-full border border-border bg-background px-2.5 text-[11px] font-medium tabular-nums text-foreground/80';
  const historyBadge =
    'inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium leading-none';
  const historyHead =
    'h-8 sticky top-0 z-[1] bg-muted/50 px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground first:pl-4 last:pr-4';

  if (isLoading || isLoadingPassages) {
    return (
      <div className="flex flex-col gap-6">
        <PassageLogbookPageHeader
          title="Passage log"
          description={
            canMatchAis
              ? 'AIS voyages from Passage Tracks are added here automatically. This log also holds notes, weather, and documentary details.'
              : 'Record voyages between ports with notes, weather, and distance for your records.'
          }
        />
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading passage log…
        </div>
      </div>
    );
  }

  if (!passageLogFeatureOn || isFlagsLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PassageLogbookPageHeader title="Passage log" />
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading passage log…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PassageLogbookPageHeader
        title="Passage log"
        description={
          canMatchAis
            ? 'AIS voyages from Passage Tracks are added here automatically. This log also holds notes, weather, and documentary details.'
            : 'Record voyages between ports with notes, weather, and distance for your records.'
        }
      />

      {/* Calendar sync conflicts */}
      {passageConflicts.length > 0 && (
        <Collapsible open={calendarConflictsOpen} onOpenChange={setCalendarConflictsOpen}>
          <Alert variant="destructive" className="rounded-md border-amber-500/50 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="flex flex-wrap items-center gap-2 pr-0">
              <span>Calendar conflict</span>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs font-normal text-amber-900 hover:bg-amber-500/10 dark:text-amber-200"
                >
                  {calendarConflictsOpen ? 'Hide days' : 'Show days'}
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      calendarConflictsOpen && 'rotate-180',
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
            </AlertTitle>
            <AlertDescription>
              <p>
                {passageConflicts.length} passage{passageConflicts.length !== 1 ? 's' : ''} have dates that are not set to Underway in the calendar. Passages and vessel state should match: passage dates should be Underway. Days with less than 4 hours at sea are not counted. Use &quot;Set to Underway&quot; below to fix.
              </p>
              <CollapsibleContent>
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto border-t border-amber-500/20 pt-3 text-sm">
                  {passageConflicts.map(({ passage, datesNotUnderway }) => (
                    <li key={passage.id} className="rounded-md bg-amber-500/10 px-3 py-2">
                      <div className="font-medium text-foreground">
                        {passage.departure_port || '—'} → {passage.arrival_port || '—'}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          · {getVesselName(passage.vessel_id)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {datesNotUnderway.length} day{datesNotUnderway.length !== 1 ? 's' : ''} not Underway:{' '}
                        <span className="text-foreground/90">
                          {formatConflictDateList(datesNotUnderway)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </AlertDescription>
          </Alert>
        </Collapsible>
      )}
      {/* Underway days with no passage (vice versa) */}
      {underwayDaysWithoutPassage.length > 0 && (
        <Collapsible open={underwayWithoutPassageOpen} onOpenChange={setUnderwayWithoutPassageOpen}>
          <Alert className="rounded-md border-blue-500/30 bg-blue-500/5">
            <Waves className="h-4 w-4" />
            <AlertTitle className="flex flex-wrap items-center gap-2 pr-0">
              <span>Underway with no passage</span>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs font-normal"
                >
                  {underwayWithoutPassageOpen ? 'Hide days' : 'Show days'}
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      underwayWithoutPassageOpen && 'rotate-180',
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
            </AlertTitle>
            <AlertDescription>
              <p>
                {underwayDaysWithoutPassage.length} day{underwayDaysWithoutPassage.length !== 1 ? 's' : ''} in the calendar are set to Underway but not covered by a passage. Consider logging a passage for these dates or updating the calendar on the Calendar page.
              </p>
              <CollapsibleContent>
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto border-t border-blue-500/20 pt-3 text-sm">
                  {underwayWithoutPassageByVessel.map(({ vesselId, dates }) => (
                    <li key={vesselId} className="rounded-md bg-blue-500/10 px-3 py-2">
                      <div className="font-medium text-foreground">
                        {getVesselName(vesselId)}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          · {dates.length} day{dates.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        <span className="text-foreground/90">{formatConflictDateList(dates)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </AlertDescription>
          </Alert>
        </Collapsible>
      )}

      {canMatchAis && mapCachedMonthCount === 0 && (
        <Alert className="rounded-md border-amber-500/30 bg-amber-500/5">
          <MapIcon className="h-4 w-4" />
          <AlertTitle>No AIS months loaded yet</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Load months on Passage Tracks first so AIS voyages can appear in this log automatically.
            </span>
            <Button type="button" size="sm" className="h-8 shrink-0 rounded-md text-xs" asChild>
              <Link href="/dashboard/passages-map">
                <MapIcon className="h-4 w-4 mr-2" />
                Open Passage Tracks
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {canMatchAis && <PassageLogbookActivePassage accessToken={session?.access_token} />}

      {passages.length > 0 && (
        <PassageLogbookStatTiles
          items={[
            {
              label: 'Total distance',
              value: summaryStats.totalDistance.toFixed(1),
              hint: 'Nautical miles',
              tone: 'sky',
            },
            {
              label: 'Total passages',
              value: summaryStats.totalPassages,
              hint: 'Passages logged',
            },
            {
              label: 'Longest passage',
              value: summaryStats.longestDistance.toFixed(1),
              hint: summaryStats.longestPassage
                ? `${summaryStats.longestPassage.departure_port || '—'} → ${summaryStats.longestPassage.arrival_port || '—'}`
                : 'N/A',
              tone: 'emerald',
            },
            {
              label: 'Avg distance',
              value: summaryStats.averageDistance.toFixed(1),
              hint: 'NM per passage',
            },
          ]}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {(canMatchAis || passages.length > 0) && (
        <div className="inline-flex w-fit flex-wrap items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
          {canMatchAis && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={toolbarBtn}
              asChild
            >
              <Link href="/dashboard/passages-map">
                <MapIcon className="h-3.5 w-3.5 mr-1.5" />
                Map
              </Link>
            </Button>
          )}
          {canMatchAis && aisMonthsLoaded && isImportingFromMap && (
            <span className="inline-flex items-center px-2.5 text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Adding AIS voyages…
            </span>
          )}
          {canMatchAis && aisMonthsLoaded && hasEnrichableMatches && (
            <Dialog
              open={isEnrichDialogOpen}
              onOpenChange={(open) => {
                setIsEnrichDialogOpen(open);
                if (!open) {
                  setEnrichProposals([]);
                  setSelectedEnrichIds(new Set());
                }
              }}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={toolbarBtn}
                onClick={() => void openEnrichDialog()}
                title="Fill existing logbook rows from matching AIS tracks"
              >
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                Match
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {mapEnrichableCount}
                </span>
              </Button>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-md">
                <DialogHeader>
                  <DialogTitle>Match existing entries with AIS</DialogTitle>
                  <DialogDescription>
                    Compare your logbook rows to cached Passage Tracks. Matching voyages
                    can fill missing distance, times, and average speed without creating duplicates.
                    New AIS voyages are added to this log automatically.
                  </DialogDescription>
                </DialogHeader>
                {isScanningAis ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Matching against AIS tracks…
                  </div>
                ) : (
                  <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-2">
                    {enrichSummary && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
                        <div className="rounded-md border p-2">
                          <div className="font-semibold text-sky-700">{enrichSummary.enrichable}</div>
                          <div className="text-xs text-muted-foreground">Can fill</div>
                        </div>
                        <div className="rounded-md border p-2">
                          <div className="font-semibold">{enrichSummary.matchedComplete}</div>
                          <div className="text-xs text-muted-foreground">Already complete</div>
                        </div>
                        <div className="rounded-md border p-2">
                          <div className="font-semibold text-muted-foreground">{enrichSummary.noMatch}</div>
                          <div className="text-xs text-muted-foreground">No AIS match</div>
                        </div>
                        <div className="rounded-md border p-2">
                          <div className="font-semibold">{enrichAisCount}</div>
                          <div className="text-xs text-muted-foreground">AIS passages</div>
                        </div>
                      </div>
                    )}
                    {enrichAisCount === 0 && (
                      <Alert>
                        <MapIcon className="h-4 w-4" />
                        <AlertTitle>No AIS tracks cached yet</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2">
                          <span>
                            Open Passage Tracks and load months for your vessels first, then run Match again.
                          </span>
                          <Button type="button" size="sm" variant="outline" className="h-8 w-fit rounded-md text-xs" asChild>
                            <Link href="/dashboard/passages-map">Open Passage Tracks</Link>
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}
                    {enrichProposals.filter((p) => p.status === 'enrichable').length === 0 &&
                      enrichAisCount > 0 && (
                        <p className="text-sm text-muted-foreground">
                          No logbook rows need filling from a matching AIS track right now.
                        </p>
                      )}
                    <ul className="space-y-2">
                      {enrichProposals
                        .filter((p) => p.status === 'enrichable')
                        .map((p) => {
                          const checked = selectedEnrichIds.has(p.passageId);
                          const vesselName = getVesselName(p.vesselId);
                          return (
                            <li
                              key={p.passageId}
                              className="rounded-md border p-3 text-sm space-y-2"
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    setSelectedEnrichIds((prev) => {
                                      const next = new Set(prev);
                                      if (v) next.add(p.passageId);
                                      else next.delete(p.passageId);
                                      return next;
                                    });
                                  }}
                                  className="mt-0.5"
                                />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="font-medium truncate">
                                    {vesselName}: {p.log.departurePort || '—'} → {p.log.arrivalPort || '—'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Match {(p.overlapRatio != null ? Math.round(p.overlapRatio * 100) : 100)}%
                                    {p.method === 'fingerprint' ? ' (linked)' : ' (dates)'}
                                  </div>
                                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                                    <div className="rounded bg-muted/50 p-2">
                                      <div className="font-medium mb-1">Logbook</div>
                                      <div>
                                        {format(new Date(p.log.startTime), 'MMM d HH:mm')} →{' '}
                                        {format(new Date(p.log.endTime), 'MMM d HH:mm')}
                                      </div>
                                      <div>
                                        {p.log.distanceNm != null
                                          ? `${p.log.distanceNm.toFixed(1)} NM`
                                          : 'No distance'}
                                        {p.log.avgSpeedKnots != null
                                          ? ` · ${p.log.avgSpeedKnots.toFixed(1)} kn`
                                          : ''}
                                      </div>
                                    </div>
                                    <div className="rounded bg-sky-500/10 p-2">
                                      <div className="font-medium mb-1 text-sky-800">From AIS</div>
                                      {p.ais && (
                                        <>
                                          <div>
                                            {format(new Date(p.ais.startTime), 'MMM d HH:mm')} →{' '}
                                            {format(new Date(p.ais.endTime), 'MMM d HH:mm')}
                                          </div>
                                          <div>
                                            {p.ais.distanceNm != null
                                              ? `${p.ais.distanceNm.toFixed(1)} NM`
                                              : '—'}
                                            {p.ais.avgSpeedKn != null
                                              ? ` · ${p.ais.avgSpeedKn.toFixed(1)} kn`
                                              : ''}
                                          </div>
                                          {(p.ais.departurePort || p.ais.arrivalPort) && (
                                            <div className="truncate">
                                              {p.ais.departurePort || 'Open sea'} →{' '}
                                              {p.ais.arrivalPort || 'Open sea'}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {p.fieldsFilled && p.fieldsFilled.length > 0 && (
                                    <div className="text-[11px] text-muted-foreground">
                                      Will update: {p.fieldsFilled.filter((f) => f !== 'aisFingerprint').join(', ')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md"
                    onClick={() => void scanAisMatches()}
                    disabled={isScanningAis || isApplyingEnrich}
                  >
                    Rescan
                  </Button>
                  <Button
                    type="button"
                    className="rounded-md"
                    onClick={() => void applyAisEnrichment()}
                    disabled={
                      isScanningAis ||
                      isApplyingEnrich ||
                      selectedEnrichIds.size === 0
                    }
                  >
                    {isApplyingEnrich ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      `Fill ${selectedEnrichIds.size || ''} selected`
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {passages.length > 0 && (
          <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className={toolbarBtn}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-md">
              <DialogHeader>
                <DialogTitle>Export Passage Log</DialogTitle>
                <DialogDescription>
                  Download an official PDF extract dated today, with passages
                  sorted and grouped by calendar month.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Filter By</label>
                  <Select
                    value={(userProfile?.role as string) === 'vessel' && exportFilter === 'vessel' ? 'all' : exportFilter}
                    onValueChange={(value: 'all' | 'vessel' | 'date') => setExportFilter(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Passages</SelectItem>
                      {(userProfile?.role as string) !== 'vessel' && (
                        <SelectItem value="vessel">By Vessel</SelectItem>
                      )}
                      <SelectItem value="date">By Date Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {exportFilter === 'vessel' && (userProfile?.role as string) !== 'vessel' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Vessel</label>
                    <SearchableSelect
                      options={vesselsForPassageForm.map(v => ({ value: v.id, label: v.name }))}
                      value={exportVesselId}
                      onValueChange={setExportVesselId}
                      placeholder={vesselsForPassageForm.length === 0 ? 'No vessels' : 'Select a vessel'}
                    />
                  </div>
                )}

                {exportFilter === 'date' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal rounded-lg",
                              !exportStartDate && "text-muted-foreground"
                            )}
                          >
                            {exportStartDate ? (
                              format(exportStartDate, 'PPP')
                            ) : (
                              <span>Pick start date</span>
                            )}
                            <Calendar className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={exportStartDate}
                            onSelect={setExportStartDate}
                            disabled={(date) => exportEndDate ? date > exportEndDate : false}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">End Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal rounded-lg",
                              !exportEndDate && "text-muted-foreground"
                            )}
                          >
                            {exportEndDate ? (
                              format(exportEndDate, 'PPP')
                            ) : (
                              <span>Pick end date</span>
                            )}
                            <Calendar className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={exportEndDate}
                            onSelect={setExportEndDate}
                            disabled={(date) => exportStartDate ? date < exportStartDate : false}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">
                    {exportFilter === 'all' &&
                      `Official PDF of all ${passages.length} passages, grouped by month`}
                    {exportFilter === 'vessel' &&
                      (userProfile?.role as string) !== 'vessel' &&
                      exportVesselId &&
                      `Official PDF for ${getVesselName(exportVesselId)}, grouped by month`}
                    {exportFilter === 'date' &&
                      'Official PDF for the selected dates, grouped by month'}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="rounded-md"
                  onClick={() => setIsExportDialogOpen(false)}
                  disabled={isExporting}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-md"
                  onClick={handleExport}
                  disabled={isExporting || (exportFilter === 'vessel' && (userProfile?.role as string) !== 'vessel' && !exportVesselId)}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
        )}

        <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingPassage(null);
            form.reset();
          } else if (open && !editingPassage && (userProfile?.role as string) === 'vessel' && (userProfile as any).activeVesselId) {
            form.setValue('vesselId', (userProfile as any).activeVesselId);
          }
        }}>
          <DialogTrigger asChild>
          <Button size="sm" className="h-8 rounded-md px-3 text-xs">
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-md">
            <DialogHeader>
              <DialogTitle>{editingPassage ? 'Edit Passage' : 'Log New Passage'}</DialogTitle>
              <DialogDescription>
                Saving will set all dates in this passage range to Underway on your calendar so passage log and vessel state stay in sync.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {(userProfile?.role as string) === 'vessel' ? (
                  (userProfile as any).activeVesselId && (
                    <FormField
                      control={form.control}
                      name="vesselId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vessel</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {getVesselName((userProfile as any).activeVesselId)}
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )
                ) : (
                  <FormField
                    control={form.control}
                    name="vesselId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vessel</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={vesselsForPassageForm.map(v => ({ value: v.id, label: v.name }))}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder={vesselsForPassageForm.length === 0 ? 'No vessels from your assignments' : 'Select a vessel'}
                          />
                        </FormControl>
                        <FormDescription>
                          Only vessels you have logged (past or current) are shown.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="departurePort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Departure Port (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Monaco" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="departureCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Departure Country (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Monaco" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="arrivalPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Arrival Port (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ibiza" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="arrivalCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Arrival Country (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Spain" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Departure Date & Time</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal rounded-lg",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP 'at' HH:mm")
                                ) : (
                                  <span>Pick departure date & time</span>
                                )}
                                <Calendar className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date > new Date()}
                              initialFocus
                            />
                            <div className="p-3 border-t">
                              <Input
                                type="time"
                                value={field.value ? format(field.value, "HH:mm") : ''}
                                onChange={(e) => {
                                  const time = e.target.value;
                                  if (time && field.value) {
                                    const [hours, minutes] = time.split(':');
                                    const newDate = new Date(field.value);
                                    newDate.setHours(parseInt(hours), parseInt(minutes));
                                    field.onChange(newDate);
                                  }
                                }}
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Arrival Date & Time</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal rounded-lg",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP 'at' HH:mm")
                                ) : (
                                  <span>Pick arrival date & time</span>
                                )}
                                <Calendar className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const depDate = form.getValues('startTime');
                                return date > new Date() || (depDate && date < depDate);
                              }}
                              initialFocus
                            />
                            <div className="p-3 border-t">
                              <Input
                                type="time"
                                value={field.value ? format(field.value, "HH:mm") : ''}
                                onChange={(e) => {
                                  const time = e.target.value;
                                  if (time && field.value) {
                                    const [hours, minutes] = time.split(':');
                                    const newDate = new Date(field.value);
                                    newDate.setHours(parseInt(hours), parseInt(minutes));
                                    field.onChange(newDate);
                                  }
                                }}
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="distanceNm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Distance (NM)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="engineHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engine Hours</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="passageType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Passage Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {passageTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="weatherSummary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weather Summary</FormLabel>
                        <FormControl>
                          <Input placeholder="Clear skies, light winds" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="seaState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sea State</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select sea state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {seaStateOptions.map((state) => (
                              <SelectItem key={state.value} value={state.value}>
                                {state.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any additional notes about the passage..."
                          {...field}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md"
                    onClick={() => {
                      setIsFormOpen(false);
                      setEditingPassage(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving} className="rounded-md">
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingPassage ? 'Update Passage' : 'Log Passage'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {passages.length === 0 ? (
        <PassageLogbookSection title="Passage history">
          <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-medium text-foreground">No passages logged yet</h3>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              {canMatchAis
                ? isImportingFromMap
                  ? 'Adding AIS voyages from Passage Tracks…'
                  : 'AIS voyages from Passage Tracks appear here automatically. You can also add a manual passage with notes and weather.'
                : 'Start tracking your voyages by logging your first passage.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {canMatchAis && (
                <Button variant="outline" size="sm" className="h-8 rounded-md text-xs" asChild>
                  <Link href="/dashboard/passages-map">
                    <MapIcon className="h-4 w-4 mr-2" />
                    Open Passage Tracks
                  </Link>
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={() => setIsFormOpen(true)}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                {canMatchAis ? 'Add manual passage' : 'Log First Passage'}
              </Button>
            </div>
          </div>
        </PassageLogbookSection>
      ) : (
        <PassageLogbookSection
          title="Passage history"
          description={`${passages.length} ${passages.length === 1 ? 'passage' : 'passages'} recorded · click a month or row to expand`}
          flush
        >
            <Table className="min-w-[860px] text-[13px]">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className={cn(historyHead, 'w-8')} />
                  {!isVesselAccount && (
                    <TableHead className={historyHead}>Vessel</TableHead>
                  )}
                  <TableHead className={historyHead}>Route</TableHead>
                  <TableHead className={historyHead}>Dates</TableHead>
                  <TableHead className={historyHead}>Duration</TableHead>
                  <TableHead className={historyHead}>Distance</TableHead>
                  <TableHead className={historyHead}>Source</TableHead>
                  <TableHead className={historyHead}>Status</TableHead>
                  <TableHead className={historyHead}>Calendar</TableHead>
                  <TableHead className={cn(historyHead, 'text-right')}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passagesByMonth.map(({ monthKey, items, summary, labelDate }) => {
                  const monthOpen = expandedHistoryMonths.has(monthKey);
                  const route = formatMonthRoute(summary.ports);
                  const dateSpan = formatMonthDateSpan(summary.firstStart, summary.lastEnd);
                  const durationLabel = formatLoggedHours(summary.durationHours);
                  const monthConflicts = items.filter((p) =>
                    passageConflicts.some((c) => c.passage.id === p.id),
                  ).length;
                  const inProgress = items.some((p) => getPassageStatus(p) === 'in-progress');
                  const vesselLabel = !isVesselAccount
                    ? summary.vesselIds.length === 1
                      ? getVesselName(summary.vesselIds[0]!)
                      : summary.vesselIds.length > 1
                        ? `${summary.vesselIds.length} vessels`
                        : null
                    : null;
                  return (
                    <Fragment key={monthKey}>
                      <TableRow
                        className={cn(
                          'cursor-pointer border-border hover:bg-muted/60',
                          monthOpen ? 'bg-muted/50' : 'bg-muted/35',
                        )}
                        onClick={() => toggleHistoryMonth(monthKey)}
                        aria-expanded={monthOpen}
                      >
                        <TableCell
                          colSpan={isVesselAccount ? 9 : 10}
                          className={cn(
                            'px-4 py-3 text-left',
                            monthOpen && 'border-l-2 border-l-foreground/20',
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                            {monthOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1 basis-48">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-sm font-medium tracking-tight text-foreground">
                                  {format(labelDate, 'MMMM yyyy')}
                                </span>
                                {dateSpan ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    {dateSpan}
                                  </span>
                                ) : null}
                                {inProgress ? (
                                  <span className={`${monthStatPill} border-yellow-500/30 bg-yellow-500/15 text-yellow-800 dark:text-yellow-200`}>
                                    Underway
                                  </span>
                                ) : null}
                                {monthConflicts > 0 ? (
                                  <span className={`${monthStatPill} border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200`}>
                                    {monthConflicts} calendar {monthConflicts === 1 ? 'issue' : 'issues'}
                                  </span>
                                ) : null}
                              </div>
                              {route ? (
                                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <span className="truncate font-medium text-foreground/80">
                                    {route.from}
                                  </span>
                                  {route.to ? (
                                    <>
                                      <ArrowRight className="h-3 w-3 shrink-0" />
                                      <span className="truncate font-medium text-foreground/80">
                                        {route.to}
                                      </span>
                                    </>
                                  ) : null}
                                  {route.via ? (
                                    <span className="hidden truncate sm:inline">
                                      via {route.via}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                              <span className={monthStatPill}>
                                {summary.count}{' '}
                                {summary.count === 1 ? 'passage' : 'passages'}
                              </span>
                              <span className={monthStatPill}>
                                {summary.seaDayCount}{' '}
                                {summary.seaDayCount === 1 ? 'sea day' : 'sea days'}
                              </span>
                              {summary.distanceNm > 0 ? (
                                <span className={monthStatPill}>
                                  {Math.round(summary.distanceNm).toLocaleString()} NM
                                </span>
                              ) : null}
                              {durationLabel ? (
                                <span className={monthStatPill}>{durationLabel}</span>
                              ) : null}
                              {vesselLabel ? (
                                <span className={`${monthStatPill} hidden max-w-[160px] truncate sm:inline-flex`}>
                                  {vesselLabel}
                                </span>
                              ) : null}
                              {summary.aisCount > 0 ? (
                                <span className={monthStatPill}>
                                  {summary.aisCount === summary.count
                                    ? 'AIS'
                                    : `${summary.aisCount} AIS`}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {monthOpen
                        ? items.map((passage) => {
                  const status = getPassageStatus(passage);
                  const duration = calculateDuration(passage.start_time, passage.end_time);
                  const avgSpeed = calculateAvgSpeed(passage);
                  const conflict = passageConflicts.find((c) => c.passage.id === passage.id);
                  const isSyncing = syncingPassageId === passage.id;
                  const isExpanded = expandedPassageId === passage.id;
                  const colSpan = isVesselAccount ? 9 : 10;
                  const depLabel = displayPassagePort(
                    passage.departure_port,
                    passage.departure_lat,
                    passage.departure_lon,
                    trackEndpointCoord(passage.track_data, 'start'),
                  );
                  const arrLabel = displayPassagePort(
                    passage.arrival_port,
                    passage.arrival_lat,
                    passage.arrival_lon,
                    trackEndpointCoord(passage.track_data, 'end'),
                  );
                  const depCoord = formatCoordPair(
                    passage.departure_lat ??
                      trackEndpointCoord(passage.track_data, 'start')?.[1],
                    passage.departure_lon ??
                      trackEndpointCoord(passage.track_data, 'start')?.[0],
                  );
                  const arrCoord = formatCoordPair(
                    passage.arrival_lat ??
                      trackEndpointCoord(passage.track_data, 'end')?.[1],
                    passage.arrival_lon ??
                      trackEndpointCoord(passage.track_data, 'end')?.[0],
                  );
                  const typeLabel = passageTypeLabel(passage.passage_type);
                  const seaLabel = seaStateLabel(passage.sea_state);
                  const storedAvg =
                    passage.avg_speed_knots != null &&
                    Number.isFinite(Number(passage.avg_speed_knots))
                      ? Number(passage.avg_speed_knots).toFixed(1)
                      : avgSpeed;
                  return (
                    <Fragment key={passage.id}>
                    <TableRow
                      className={cn(
                        'group/row cursor-pointer border-border/70 bg-background transition-colors',
                        isExpanded ? 'bg-muted/30' : 'hover:bg-muted/25',
                      )}
                      onClick={() =>
                        setExpandedPassageId((prev) =>
                          prev === passage.id ? null : passage.id,
                        )
                      }
                      aria-expanded={isExpanded}
                    >
                      <TableCell className="w-8 px-4 py-2.5 pr-0">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      {!isVesselAccount && (
                        <TableCell className="whitespace-nowrap px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Ship className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-medium text-foreground">
                              {getVesselName(passage.vessel_id)}
                            </span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="max-w-[240px] px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{depLabel}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{arrLabel}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2.5 text-[12px] tabular-nums text-muted-foreground">
                        {formatCompactPassageDates(passage.start_time, passage.end_time)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2.5 tabular-nums text-foreground/90">
                        {duration}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-3 py-2.5">
                        {passage.distance_nm ? (
                          <div className="leading-tight">
                            <span className="tabular-nums font-medium">
                              {passage.distance_nm.toFixed(1)}
                            </span>
                            <span className="text-muted-foreground"> NM</span>
                            {avgSpeed ? (
                              <div className="text-[11px] tabular-nums text-muted-foreground">
                                {avgSpeed} kn avg
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span
                          className={cn(
                            historyBadge,
                            isAisSourcedPassage(passage.source)
                              ? 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200'
                              : passage.source === 'calendar'
                                ? 'border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200'
                                : 'border-border bg-muted/40 text-muted-foreground',
                          )}
                          title={
                            isAisSourcedPassage(passage.source)
                              ? 'Linked from AIS Passages Map'
                              : undefined
                          }
                        >
                          {passageSourceLabel(passage.source)}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span
                          className={cn(
                            historyBadge,
                            status === 'completed'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                              : status === 'in-progress'
                                ? 'border-yellow-500/30 bg-yellow-500/15 text-yellow-800 dark:text-yellow-200'
                                : 'border-border bg-muted/40 text-muted-foreground',
                          )}
                        >
                          {status === 'completed'
                            ? 'Done'
                            : status === 'in-progress'
                              ? 'Underway'
                              : 'Planned'}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        {conflict ? (
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span
                              title={`${conflict.datesNotUnderway.length} day${conflict.datesNotUnderway.length !== 1 ? 's' : ''} not set to Underway`}
                              className={cn(
                                historyBadge,
                                'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
                              )}
                            >
                              {conflict.datesNotUnderway.length}d
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              title="Set these dates to Underway"
                              className="h-6 rounded-full px-2 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetPassageToUnderway(passage);
                              }}
                              disabled={isSyncing}
                            >
                              {isSyncing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Fix'
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span
                            className={cn(
                              historyBadge,
                              'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
                            )}
                          >
                            Synced
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 pr-4 text-right">
                        <div
                          className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover/row:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canMatchAis && passagesMapHrefForLog(passage) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                              title="Open on Passage Tracks"
                              asChild
                            >
                              <Link href={passagesMapHrefForLog(passage)!}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                            onClick={() => handleEdit(passage)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(passage.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="border-border hover:bg-transparent">
                        <TableCell
                          colSpan={colSpan}
                          className="border-b bg-muted/15 p-0"
                        >
                          <div className="space-y-3 px-4 py-4">
                            <div className="overflow-hidden rounded-md border border-border bg-background">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                  Passage chart
                                </div>
                                {passagesMapHrefForLog(passage) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1.5 px-2 text-xs"
                                    asChild
                                  >
                                    <Link href={passagesMapHrefForLog(passage)!}>
                                      <MapIcon className="h-3.5 w-3.5" />
                                      Open on Passage Tracks
                                      <ExternalLink className="h-3 w-3 opacity-70" />
                                    </Link>
                                  </Button>
                                )}
                              </div>
                              <div className="p-3">
                                <PassageLogTrackMap
                                  key={passage.id}
                                  coordinates={resolvePassageTrackCoordinates(passage)}
                                />
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="rounded-md border border-border bg-background px-3 py-2.5">
                              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Route
                              </div>
                              <p className="mt-1.5 text-sm font-medium">
                                {depLabel} → {arrLabel}
                              </p>
                              {(depCoord || arrCoord) && (
                                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                  {depCoord || '—'} → {arrCoord || '—'}
                                </p>
                              )}
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2.5">
                              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Timing
                              </div>
                              <p className="mt-1.5 text-sm">
                                {format(new Date(passage.start_time), 'PPp')}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                to {format(new Date(passage.end_time), 'PPp')} · {duration}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2.5">
                              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Performance
                              </div>
                              <p className="mt-1.5 text-sm">
                                {passage.distance_nm != null
                                  ? `${Number(passage.distance_nm).toFixed(1)} NM`
                                  : 'Distance not set'}
                                {storedAvg ? ` · ${storedAvg} kn avg` : ''}
                              </p>
                              {passage.engine_hours != null && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  Engine hours: {Number(passage.engine_hours).toFixed(1)}
                                </p>
                              )}
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2.5">
                              <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                <Route className="h-3 w-3" />
                                Passage type
                              </div>
                              <p className="mt-1.5 text-sm">{typeLabel || '—'}</p>
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2.5">
                              <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                <Wind className="h-3 w-3" />
                                Weather
                              </div>
                              <p className="mt-1.5 whitespace-pre-wrap text-sm">
                                {passage.weather_summary?.trim() || '—'}
                              </p>
                              {seaLabel && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  Sea state: {seaLabel}
                                </p>
                              )}
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2.5">
                              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Source
                              </div>
                              <p className="mt-1.5 text-sm">
                                {passageSourceLabel(passage.source)}
                              </p>
                              {passage.ais_fingerprint && (
                                <p className="mt-0.5 break-all text-[10px] text-muted-foreground">
                                  AIS link: {passage.ais_fingerprint}
                                </p>
                              )}
                            </div>
                            <div className="rounded-md border border-border bg-background px-3 py-2.5 sm:col-span-2 lg:col-span-3">
                              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Notes
                              </div>
                              <p className="mt-1.5 whitespace-pre-wrap text-sm">
                                {passage.notes?.trim() || 'No notes yet.'}
                              </p>
                            </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                        })
                        : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
        </PassageLogbookSection>
      )}
    </div>
  );
}
