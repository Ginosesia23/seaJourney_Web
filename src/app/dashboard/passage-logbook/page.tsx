'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInHours, parse, startOfDay, endOfDay, isAfter, isBefore, eachDayOfInterval, parseISO, addYears } from 'date-fns';
import { PlusCircle, Loader2, Ship, MapPin, Calendar, Clock, ArrowRight, Edit, Trash2, CheckCircle2, CalendarDays, Navigation, Wind, Waves, Route, TrendingUp, Download, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import { cn } from '@/lib/utils';
import { generatePassageLogPDF, type PassageLogExportData } from '@/lib/pdf-generator';

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

/** Paid crew tiers that can use the passage log (excludes free and crew_limited). */
const PASSAGE_LOG_CREW_TIERS = new Set(['standard', 'premium', 'pro', 'professional']);

function passageOverlapsAssignment(passage: PassageLog, a: VesselAssignment): boolean {
  if (a.vesselId !== passage.vessel_id) return false;
  const assignStart = startOfDay(parse(a.startDate, 'yyyy-MM-dd', new Date()));
  const assignEnd = a.endDate
    ? endOfDay(parse(a.endDate, 'yyyy-MM-dd', new Date()))
    : endOfDay(addYears(new Date(), 50));
  const pStart = startOfDay(parseISO(passage.start_time));
  const pEnd = endOfDay(parseISO(passage.end_time));
  return pStart.getTime() <= assignEnd.getTime() && pEnd.getTime() >= assignStart.getTime();
}

function filterPassagesForCrewAssignments(passages: PassageLog[], assignments: VesselAssignment[]): PassageLog[] {
  if (assignments.length === 0) return [];
  return passages.filter((p) => assignments.some((a) => passageOverlapsAssignment(p, a)));
}

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

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const router = useRouter();

  // Fetch user profile to check subscription tier
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
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

  // Query vessels
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  const loadPassagesData = useCallback(async () => {
    if (!user?.id || !userProfile) return;

    const role = (userProfile.role as string) || 'crew';
    const activeVesselId =
      (userProfile as any).active_vessel_id ?? (userProfile as any).activeVesselId ?? null;

    let assignments: VesselAssignment[] = [];
    if (role !== 'vessel' && role !== 'admin') {
      try {
        assignments = await getVesselAssignments(supabase, user.id);
      } catch {
        assignments = [];
      }
    }
    setVesselAssignments(assignments);

    let data: PassageLog[];
    if (role === 'vessel') {
      if (!activeVesselId) {
        setPassages([]);
        return;
      }
      data = await getPassageLogsByVessel(supabase, activeVesselId);
    } else {
      data = await getPassageLogs(supabase, user.id);
      if (role !== 'admin' && role !== 'vessel') {
        data = filterPassagesForCrewAssignments(data, assignments);
      }
    }
    setPassages(data);
  }, [user?.id, userProfile, supabase]);

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
    if (!vessels?.length) return [];
    const role = (userProfile?.role as string) || 'crew';
    if (role === 'vessel') {
      const activeId = (userProfile as any).activeVesselId;
      if (!activeId) return [];
      const v = vessels.find((x) => x.id === activeId);
      return v ? [v] : [];
    }
    const assignedIds = new Set(vesselAssignments.map((a) => a.vesselId));
    return vessels.filter((v) => assignedIds.has(v.id));
  }, [vessels, userProfile, vesselAssignments]);

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
    if (!user?.id || passages.length === 0) {
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
  }, [user?.id, passages.length, supabase]);

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

  // Standard+ crew (not crew_limited), all active vessel tiers, admin
  const hasAccess = useMemo(() => {
    if (!userProfile || !userProfileRaw) return false;
    const tier = ((userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free').toLowerCase();
    const role = (userProfile as any).role || userProfile.role || 'crew';
    const entitled = hasActiveSubscription(userProfileRaw);

    if (role === 'admin') return true;

    if (role === 'vessel') {
      return (
        (tier.startsWith('vessel_') ||
          tier === 'vessel_lite' ||
          tier === 'vessel_basic' ||
          tier === 'vessel_pro' ||
          tier === 'vessel_fleet') &&
        entitled
      );
    }

    if (tier === 'crew_limited' && entitled) return false;

    return PASSAGE_LOG_CREW_TIERS.has(tier) && entitled;
  }, [userProfile, userProfileRaw]);

  const onSubmit = async (data: PassageFormValues) => {
    if (!user?.id || !hasAccess) {
      const role = (userProfile as any)?.role || userProfile?.role || 'crew';
      const message =
        role === 'vessel'
          ? 'Passage Log Book requires an active vessel subscription.'
          : 'Passage Log Book is available on Standard tier and above (not Crew Limited).';
      toast({
        title: 'Subscription Required',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    const vesselId =
      (userProfile?.role as string) === 'vessel' && (userProfile as any).activeVesselId
        ? (userProfile as any).activeVesselId
        : data.vesselId;
    if (!vesselId) {
      toast({
        title: 'Error',
        description: (userProfile?.role as string) === 'vessel' ? 'No active vessel set. Set your vessel in Profile.' : 'Please select a vessel.',
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
          source: 'manual',
        });

        toast({
          title: 'Passage Updated',
          description: 'Your passage has been updated successfully.',
        });
      } else {
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

      // Sync passage date range to Underway in the calendar
      const start = startOfDay(data.startTime);
      const end = endOfDay(data.endTime);
      const days = eachDayOfInterval({ start, end });
      const logs = days.map((d) => ({
        date: format(d, 'yyyy-MM-dd'),
        state: 'underway' as const,
      }));
      await updateStateLogsBatch(supabase, user.id, vesselId, logs);
      const updatedLogs = await getVesselStateLogs(supabase, vesselId, user.id);
      setStateLogsByVessel((prev) => ({ ...prev, [vesselId]: updatedLogs }));

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
      await deletePassageLog(supabase, passageId);
      setPassages(passages.filter(p => p.id !== passageId));
      toast({
        title: 'Passage Deleted',
        description: 'The passage has been removed.',
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
      const start = startOfDay(new Date(passage.start_time));
      const end = endOfDay(new Date(passage.end_time));
      const days = eachDayOfInterval({ start, end });
      const logs = days.map((d) => ({
        date: format(d, 'yyyy-MM-dd'),
        state: 'underway' as const,
      }));
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

  // Passage dates that are not set to Underway in the calendar (conflicts)
  const passageConflicts = useMemo(() => {
    const conflicts: { passage: PassageLog; datesNotUnderway: string[] }[] = [];
    for (const passage of passages) {
      const start = startOfDay(new Date(passage.start_time));
      const end = endOfDay(new Date(passage.end_time));
      const days = eachDayOfInterval({ start, end });
      const dateStrings = days.map((d) => format(d, 'yyyy-MM-dd'));
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
    return out;
  }, [passages, stateLogsByVessel]);

  const isLoading = isLoadingProfile || isLoadingVessels;

  if (isLoading || isLoadingPassages) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    const role = (userProfile as any)?.role || userProfile?.role || 'crew';
    const message =
      role === 'vessel'
        ? 'The Passage Log Book requires an active vessel subscription. Please subscribe to a plan to access this feature.'
        : 'The Passage Log Book is available on Standard tier and above. Upgrade your plan to access this feature.';
    const buttonText = role === 'vessel' ? 'View Plans' : 'View plans';
    
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Passage Log Book</CardTitle>
            <CardDescription>Subscription Required</CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Subscription Required</h3>
            <p className="text-muted-foreground mb-6">
              {message}
            </p>
            <Button className="rounded-xl" asChild>
              <a href="/offers">{buttonText}</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Passage Log Book</h1>
            <p className="text-muted-foreground">
            Record and track your voyages between ports
          </p>
          </div>
        </div>
      </div>

      {/* Calendar sync conflicts */}
      {passageConflicts.length > 0 && (
        <Alert variant="destructive" className="rounded-xl border-amber-500/50 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Calendar conflict</AlertTitle>
          <AlertDescription>
            {passageConflicts.length} passage{passageConflicts.length !== 1 ? 's' : ''} have dates that are not set to Underway in the calendar. Passages and vessel state should match: passage dates should be Underway. Use &quot;Set to Underway&quot; below to fix.
          </AlertDescription>
        </Alert>
      )}
      {/* Underway days with no passage (vice versa) */}
      {underwayDaysWithoutPassage.length > 0 && (
        <Alert className="rounded-xl border-blue-500/30 bg-blue-500/5">
          <Waves className="h-4 w-4" />
          <AlertTitle>Underway with no passage</AlertTitle>
          <AlertDescription>
            {underwayDaysWithoutPassage.length} day{underwayDaysWithoutPassage.length !== 1 ? 's' : ''} in the calendar are set to Underway but not covered by a passage. Consider logging a passage for these dates or updating the calendar on the Calendar page.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      {passages.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Distance</CardTitle>
              <Route className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalDistance.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">Nautical Miles</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Passages</CardTitle>
              <Ship className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalPassages}</div>
              <p className="text-xs text-muted-foreground">Passages Logged</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Longest Passage</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.longestDistance.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">
                {summaryStats.longestPassage 
                  ? `${summaryStats.longestPassage.departure_port || '—'} → ${summaryStats.longestPassage.arrival_port || '—'}`
                  : 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Distance</CardTitle>
              <Navigation className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.averageDistance.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">NM per Passage</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl">
                <Download className="h-4 w-4 mr-2" />
                Export Passages
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Export Passage Log</DialogTitle>
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
                    {exportFilter === 'all' && `Exporting all ${passages.length} passages`}
                    {exportFilter === 'vessel' && (userProfile?.role as string) !== 'vessel' && exportVesselId && `Exporting passages for ${getVesselName(exportVesselId)}`}
                    {exportFilter === 'date' && `Exporting passages between selected dates`}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setIsExportDialogOpen(false)}
                  disabled={isExporting}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-xl"
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
                      Export
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingPassage(null);
            form.reset();
          } else if (open && !editingPassage && (userProfile?.role as string) === 'vessel' && (userProfile as any).activeVesselId) {
            form.setValue('vesselId', (userProfile as any).activeVesselId);
          }
        }}>
          <DialogTrigger asChild className="rounded-xl">
          <Button>
              <PlusCircle className="h-4 w-4 mr-2 rounded-xl" />
              Add Passage
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                    className="rounded-xl"
                    onClick={() => {
                      setIsFormOpen(false);
                      setEditingPassage(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving} className="rounded-xl">
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
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No passages logged yet</h3>
            <p className="text-muted-foreground mb-4">
              Start tracking your voyages by logging your first passage.
            </p>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Log First Passage
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Passage History</CardTitle>
            <CardDescription>
              {passages.length} {passages.length === 1 ? 'passage' : 'passages'} recorded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {!isVesselAccount && <TableHead>Vessel</TableHead>}
                  <TableHead>Route</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Calendar</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passages.map((passage) => {
                  const status = getPassageStatus(passage);
                  const duration = calculateDuration(passage.start_time, passage.end_time);
                  const avgSpeed = calculateAvgSpeed(passage);
                  const conflict = passageConflicts.find((c) => c.passage.id === passage.id);
                  const isSyncing = syncingPassageId === passage.id;
                  return (
                    <TableRow key={passage.id}>
                      {!isVesselAccount && (
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Ship className="h-4 w-4 text-muted-foreground" />
                            {getVesselName(passage.vessel_id)}
                          </div>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-medium">{passage.departure_port || '—'}</span>
                            {passage.departure_country && (
                              <span className="text-xs text-muted-foreground ml-1">({passage.departure_country})</span>
                            )}
                          </div>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <div>
                            <span className="font-medium">{passage.arrival_port || '—'}</span>
                            {passage.arrival_country && (
                              <span className="text-xs text-muted-foreground ml-1">({passage.arrival_country})</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(passage.start_time), 'MMM d, yyyy HH:mm')}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <ArrowRight className="h-3 w-3" />
                            {format(new Date(passage.end_time), 'MMM d, yyyy HH:mm')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {duration}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {passage.distance_nm ? (
                            <>
                              {passage.distance_nm.toFixed(1)} NM
                              {avgSpeed && (
                                <div className="text-xs text-muted-foreground">
                                  {avgSpeed} kts avg
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === 'completed'
                              ? 'default'
                              : status === 'in-progress'
                              ? 'secondary'
                              : 'outline'
                          }
                          className={
                            status === 'completed'
                              ? 'bg-green-500/20 text-green-700 border-green-500/30'
                              : status === 'in-progress'
                              ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30'
                              : ''
                          }
                        >
                          {status === 'completed' ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Completed
                            </>
                          ) : status === 'in-progress' ? (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              In Progress
                            </>
                          ) : (
                            <>
                              <CalendarDays className="h-3 w-3 mr-1" />
                              Planned
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {conflict ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit text-amber-600 border-amber-500/50 bg-amber-500/10">
                              {conflict.datesNotUnderway.length} day{conflict.datesNotUnderway.length !== 1 ? 's' : ''} not Underway
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg h-8 text-xs"
                              onClick={() => handleSetPassageToUnderway(passage)}
                              disabled={isSyncing}
                            >
                              {isSyncing ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Waves className="h-3 w-3 mr-1" />
                              )}
                              Set to Underway
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="w-fit text-green-700 border-green-500/30 bg-green-500/10">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Synced
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(passage)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(passage.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
