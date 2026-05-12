'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { useCollection } from '@/supabase/database';
import { format as formatDate, differenceInDays } from 'date-fns';
import { FileText, Users, Loader2, Calendar, ChevronRight, Clock, Download, CheckCircle2, Send, ShieldCheck, Table2, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';
import type { UserProfile, VesselAssignment, Vessel, VesselGeneratedTestimonial, StateLog, Testimonial } from '@/lib/types';
import { getActiveVesselAssignmentsByVessel, getVesselStateLogs } from '@/supabase/database/queries';
import { getVesselCalculationCategory, isAllDaysExceptLeaveCountAsSea } from '@/lib/vessel-calculation-categories';
import { computeSeaTimeInDateRange } from '@/lib/sea-time-in-range';
import {
  generateTestimonialPDF,
  generateMCADeckhandTestimonial,
  generateMCAOfficerTestimonial,
  generateProofOfServicePDF,
  generateSeaServiceBreakdownPDF,
  type TestimonialPDFFormat,
  type TestimonialPDFOutput,
} from '@/lib/pdf-generator';
import { requestCaptainSignoff } from '@/lib/testimonial-signoff';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomTemplatesTab } from '@/components/document-scanner/custom-templates-tab';
import {
  templateHasDateRangedCalculation,
  type VesselDocumentTemplate,
} from '@/lib/vessel-document-templates';
import {
  fillScannedDocument,
  downloadBlob,
  type FillableField,
} from '@/lib/fill-scanned-document';

interface CrewOption {
  profile: UserProfile;
  assignment: VesselAssignment;
}

const DOCUMENT_TYPES = [
  { value: 'testimonial', label: 'Sea service testimonial', icon: FileText },
  { value: 'proof_of_service', label: 'Proof of Service', icon: ShieldCheck },
  {
    value: 'sea_service_breakdown',
    label: 'Sea service breakdown (reference)',
    icon: Table2,
  },
] as const;

export default function DocumentsGeneratorPage() {
  const { user } = useUser();
  const { supabase, session } = useSupabase();
  const { data: currentUserProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  const currentUserProfile = useMemo(() => {
    if (!currentUserProfileRaw) return null;
    const p = currentUserProfileRaw as any;
    return {
      ...currentUserProfileRaw,
      activeVesselId: p.active_vessel_id ?? p.activeVesselId,
      role: p.role ?? 'crew',
    } as UserProfile;
  }, [currentUserProfileRaw]);

  const { data: vesselsCollection } = useCollection<Vessel>('vessels');
  const activeVesselId = currentUserProfile?.role === 'vessel' ? (currentUserProfile as any).active_vessel_id ?? (currentUserProfile as any).activeVesselId : null;
  const vessel = useMemo(() => 
    vesselsCollection?.find((v: any) => v.id === activeVesselId),
    [vesselsCollection, activeVesselId]
  );

  const [crewList, setCrewList] = useState<CrewOption[]>([]);
  const [loadingCrew, setLoadingCrew] = useState(true);
  const [documentType, setDocumentType] = useState<string>('testimonial');
  const [selectedCrewId, setSelectedCrewId] = useState<string>('');
  const [documentStartDate, setDocumentStartDate] = useState<Date | undefined>(undefined);
  const [documentEndDate, setDocumentEndDate] = useState<Date | undefined>(undefined);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedSeaTime, setCalculatedSeaTime] = useState<{
    totalDays: number;
    atSeaDays: number;
    standbyDays: number;
    yardDays: number;
    leaveDays: number;
    underwayDays: number;
    atAnchorDays: number;
    inPortDays: number;
    otherDays?: number;
    isOfficer: boolean;
    standbyPeriodsForPdf?: Array<{ passageStartDate: string; passageEndDate: string; standbyDays: number }>;
    /** Data source used for this calculation: 'crew' | 'vessel' */
    dataSource: 'crew' | 'vessel';
  } | null>(null);
  const [selectedDataSource, setSelectedDataSource] = useState<'crew' | 'vessel' | null>(null);
  const [accessRequestStatus, setAccessRequestStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeCaptain, setActiveCaptain] = useState<{ id: string; name: string } | null>(null);
  const [selectedNewDocFormat, setSelectedNewDocFormat] = useState<TestimonialPDFFormat>('mca');
  const [sendTestimonialByEmailOpen, setSendTestimonialByEmailOpen] = useState(false);
  const [sendTestimonialByEmailValue, setSendTestimonialByEmailValue] = useState('');
  const [isSendingToCaptain, setIsSendingToCaptain] = useState(false);
  const [isSendingTestimonialByEmail, setIsSendingTestimonialByEmail] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);
  const [isSavingProofOfService, setIsSavingProofOfService] = useState(false);
  const [generatingProofOfServicePDF, setGeneratingProofOfServicePDF] = useState(false);
  const [generatingBreakdownPDF, setGeneratingBreakdownPDF] = useState(false);
  const [leavePeriods, setLeavePeriods] = useState<Array<{ startDate: string; endDate: string }>>([]);
  const [leavePeriodsFromLogs, setLeavePeriodsFromLogs] = useState<Array<{ startDate: string; endDate: string; notes?: string }>>([]);

  // Top-level page tab. Only two tabs now — the AI Scanner has been
  // folded into the Form Builder tab (scanning is triggered inline when
  // the user starts a new form).
  const [pageTab, setPageTab] = useState<'generator' | 'custom-templates'>('generator');

  // Form-builder templates available on this vessel. We list them alongside
  // the built-in document types in the Document type dropdown so vessel
  // managers can generate a custom form straight from the Generator tab.
  const [formTemplates, setFormTemplates] = useState<VesselDocumentTemplate[]>([]);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  const selectedCrew = useMemo(
    () => crewList.find((c) => c.profile.id === selectedCrewId) ?? null,
    [crewList, selectedCrewId]
  );

  const crewSelectOptions = useMemo(
    () =>
      crewList.map((c) => {
        const name = [c.profile.firstName, c.profile.lastName].filter(Boolean).join(' ') || c.profile.username || c.profile.email || 'Unknown';
        const email = c.profile.email ? ` (${c.profile.email})` : '';
        return { value: c.profile.id, label: `${name}${email}` };
      }),
    [crewList]
  );

  useEffect(() => {
    if (currentUserProfile?.role !== 'vessel' && currentUserProfile?.role !== 'admin') return;
    const vesselId = currentUserProfile.role === 'vessel' ? activeVesselId : null;
    if (!vesselId && currentUserProfile.role === 'vessel') {
      setCrewList([]);
      setLoadingCrew(false);
      return;
    }
    if (currentUserProfile.role === 'admin') {
      setCrewList([]);
      setLoadingCrew(false);
      return;
    }
    let cancelled = false;
    setLoadingCrew(true);
    (async () => {
      try {
        const assignments = await getActiveVesselAssignmentsByVessel(supabase, vesselId!);
        if (cancelled || assignments.length === 0) {
          setCrewList([]);
          return;
        }
        const userIds = assignments.map((a) => a.userId);
        const { data: profiles, error } = await supabase.from('users').select('*').in('id', userIds);
        if (error || !profiles?.length) {
          setCrewList([]);
          return;
        }
        const filtered = profiles.filter((p: any) => p.role !== 'vessel');
        const profileMap = new Map(
          filtered.map((profile: any) => [
            profile.id,
            {
              ...profile,
              id: profile.id,
              email: profile.email ?? '',
              username: profile.username ?? '',
              firstName: profile.first_name ?? profile.firstName,
              lastName: profile.last_name ?? profile.lastName,
              role: profile.role ?? 'crew',
            } as UserProfile,
          ])
        );
        const options: CrewOption[] = assignments
          .map((a) => {
            const profile = profileMap.get(a.userId);
            if (!profile) return null;
            return { profile, assignment: a };
          })
          .filter((x): x is CrewOption => x !== null);
        if (!cancelled) setCrewList(options);
      } finally {
        if (!cancelled) setLoadingCrew(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserProfile?.role, activeVesselId]);

  // Pull the list of form-builder templates for this vessel so we can offer
  // them in the "Document type" dropdown. Silently ignores errors — if
  // templates can't load we just fall back to the built-in options.
  useEffect(() => {
    if (!activeVesselId || !session?.access_token) {
      setFormTemplates([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/document-templates?vesselId=${encodeURIComponent(activeVesselId)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!res.ok) {
          if (!cancelled) setFormTemplates([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setFormTemplates(data.templates ?? []);
      } catch {
        if (!cancelled) setFormTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeVesselId, session?.access_token]);

  const activeFormTemplate = useMemo(() => {
    if (!documentType.startsWith('template:')) return null;
    const id = documentType.slice('template:'.length);
    return formTemplates.find((t) => t.id === id) ?? null;
  }, [documentType, formTemplates]);

  // A template needs a date range (and therefore sea-time calculation)
  // whenever ANY of:
  //   - one of its fields is bound to a service-period / day-count
  //     profile key, OR
  //   - any calculated field references a date-range-scoped site value
  //     (totalDays, atSeaDays, etc.) — added with the new "site values"
  //     calculation source.
  // Mirrors the logic in the Form Builder tab's Use dialog.
  const templateNeedsSeaTime = useMemo(() => {
    if (!activeFormTemplate) return false;
    const seaTimeKeys = new Set([
      'servicePeriodStart',
      'servicePeriodEnd',
      'totalDays',
      'atSeaDays',
      'standbyDays',
      'yardDays',
      'leaveDays',
    ]);
    if (
      activeFormTemplate.fields.some(
        (f) => f.profileKey && seaTimeKeys.has(f.profileKey),
      )
    ) {
      return true;
    }
    return templateHasDateRangedCalculation(activeFormTemplate.fields);
  }, [activeFormTemplate]);

  useEffect(() => {
    if (!selectedCrewId || !currentUserProfile?.activeVesselId || !user?.id) {
      setAccessRequestStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('vessel_sea_time_access_requests')
        .select('status')
        .eq('vessel_user_id', currentUserProfile.id)
        .eq('crew_user_id', selectedCrewId)
        .eq('vessel_id', activeVesselId)
        .eq('status', 'approved')
        .maybeSingle();
      if (!cancelled) setAccessRequestStatus(data?.status ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedCrewId, currentUserProfile?.id, activeVesselId, user?.id]);

  // Fetch manual leave periods for selected crew
  useEffect(() => {
    if (!selectedCrewId || !activeVesselId) {
      setLeavePeriods([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/crew-leave-periods?crewUserId=${encodeURIComponent(selectedCrewId)}&vesselId=${encodeURIComponent(activeVesselId)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && data.leavePeriods?.length) {
          setLeavePeriods(data.leavePeriods.map((p: { startDate: string; endDate: string }) => ({ startDate: p.startDate, endDate: p.endDate })));
        } else if (!cancelled) {
          setLeavePeriods([]);
        }
      } catch {
        if (!cancelled) setLeavePeriods([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCrewId, activeVesselId]);

  // Fetch leave periods from logs when crew has approved access (so we can show presets from their data)
  useEffect(() => {
    if (
      accessRequestStatus !== 'approved' ||
      !selectedCrewId ||
      !user?.id ||
      currentUserProfile?.role !== 'vessel' ||
      !activeVesselId ||
      !selectedCrew?.assignment?.startDate
    ) {
      setLeavePeriodsFromLogs([]);
      return;
    }
    const rangeStart = selectedCrew.assignment.startDate;
    const rangeEnd =
      selectedCrew.assignment.endDate ?? formatDate(new Date(), 'yyyy-MM-dd');
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          crewUserId: selectedCrewId,
          vesselUserId: user.id,
          rangeStart,
          rangeEnd,
          vesselId: activeVesselId,
        });
        const res = await fetch(`/api/vessel-sea-time-access/sea-time-data?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && data.leavePeriodsFromLogs?.length) {
          setLeavePeriodsFromLogs(data.leavePeriodsFromLogs);
        } else if (!cancelled) {
          setLeavePeriodsFromLogs([]);
        }
      } catch {
        if (!cancelled) setLeavePeriodsFromLogs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accessRequestStatus,
    selectedCrewId,
    selectedCrew?.assignment?.startDate,
    selectedCrew?.assignment?.endDate,
    user?.id,
    currentUserProfile?.role,
    activeVesselId,
  ]);

  const hasApprovedAccess = accessRequestStatus === 'approved';
  const effectiveDataSource = selectedDataSource ?? 'vessel';

  const getVesselDetails = (vesselId: string) =>
    vesselsCollection?.find((v: any) => v.id === vesselId) ?? null;

  // Preset date ranges: periods between leave (from manual leave + leave from logs when available)
  const availablePeriodsBetweenLeave = useMemo(() => {
    if (!selectedCrew?.assignment) return [];

    const allLeavePeriods: Array<{ startDate: string; endDate: string }> = [];
    leavePeriods.forEach((p) => allLeavePeriods.push({ startDate: p.startDate, endDate: p.endDate }));
    leavePeriodsFromLogs.forEach((p) => allLeavePeriods.push({ startDate: p.startDate, endDate: p.endDate }));
    if (allLeavePeriods.length === 0) return [];

    const sorted = [...allLeavePeriods].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const normalize = (dateStr: string | null | undefined): Date => {
      if (!dateStr) return new Date(new Date().setHours(0, 0, 0, 0));
      const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const assignmentStart = normalize(selectedCrew.assignment.startDate);
    const assignmentEnd = normalize(selectedCrew.assignment.endDate ?? undefined);
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    const effectiveEnd = assignmentEnd > today ? today : assignmentEnd;
    const periods: Array<{ startDate: Date; endDate: Date; label: string }> = [];

    const firstStart = normalize(sorted[0].startDate);
    if (assignmentStart < firstStart) {
      const periodEnd = new Date(firstStart);
      periodEnd.setDate(periodEnd.getDate() - 1);
      periodEnd.setHours(0, 0, 0, 0);
      if (periodEnd >= assignmentStart) {
        periods.push({
          startDate: assignmentStart,
          endDate: periodEnd,
          label: `Before first leave (${formatDate(assignmentStart, 'MMM dd')} - ${formatDate(periodEnd, 'MMM dd, yyyy')})`,
        });
      }
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = normalize(sorted[i].endDate);
      const nextStart = normalize(sorted[i + 1].startDate);
      const periodStart = new Date(currentEnd);
      periodStart.setDate(periodStart.getDate() + 1);
      periodStart.setHours(0, 0, 0, 0);
      const periodEnd = new Date(nextStart);
      periodEnd.setDate(periodEnd.getDate() - 1);
      periodEnd.setHours(0, 0, 0, 0);
      if (periodStart <= periodEnd) {
        periods.push({
          startDate: periodStart,
          endDate: periodEnd,
          label: `Between leave (${formatDate(periodStart, 'MMM dd')} - ${formatDate(periodEnd, 'MMM dd, yyyy')})`,
        });
      }
    }
    const lastEnd = normalize(sorted[sorted.length - 1].endDate);
    const afterStart = new Date(lastEnd);
    afterStart.setDate(afterStart.getDate() + 1);
    afterStart.setHours(0, 0, 0, 0);
    if (afterStart <= effectiveEnd) {
      periods.push({
        startDate: afterStart,
        endDate: effectiveEnd,
        label: `After last leave (${formatDate(afterStart, 'MMM dd')} - ${formatDate(effectiveEnd, 'MMM dd, yyyy')})`,
      });
    }
    return periods;
  }, [selectedCrew?.assignment, leavePeriods, leavePeriodsFromLogs]);

  // Proof of Service quick range: start on vessel → today (or end date if crew has left)
  const proofOfServiceFullRange = useMemo(() => {
    if (!selectedCrew?.assignment?.startDate) return null;
    const start = (() => {
      const s = selectedCrew.assignment.startDate;
      if (!s) return null;
      const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    if (!start) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDateStr = selectedCrew.assignment.endDate;
    const end = endDateStr
      ? (() => {
          const d = endDateStr.includes('T') ? new Date(endDateStr) : new Date(endDateStr + 'T00:00:00');
          d.setHours(0, 0, 0, 0);
          return d > today ? today : d;
        })()
      : today;
    if (start > end) return null;
    return { startDate: start, endDate: end };
  }, [selectedCrew?.assignment?.startDate, selectedCrew?.assignment?.endDate]);

  useEffect(() => {
    const loadActiveCaptain = async () => {
      if (currentUserProfile?.role !== 'vessel' || !activeVesselId || !supabase) {
        setActiveCaptain(null);
        return;
      }
      try {
        const { data: signingAuthorities, error } = await supabase
          .from('vessel_signing_authorities')
          .select('captain_user_id, is_primary')
          .eq('vessel_id', activeVesselId)
          .is('end_date', null)
          .order('is_primary', { ascending: false })
          .limit(1);
        if (error || !signingAuthorities?.length) {
          setActiveCaptain(null);
          return;
        }
        const captainId = signingAuthorities[0].captain_user_id;
        if (!captainId) {
          setActiveCaptain(null);
          return;
        }
        const { data: captainUser } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', captainId)
          .maybeSingle();
        const name = captainUser
          ? [captainUser.first_name, captainUser.last_name].filter(Boolean).join(' ').trim() || 'Captain'
          : 'Captain';
        setActiveCaptain({ id: captainId, name });
      } catch {
        setActiveCaptain(null);
      }
    };
    loadActiveCaptain();
  }, [currentUserProfile?.role, activeVesselId, supabase]);

  const handleCalculateSeaTime = async () => {
    if (!selectedCrew || !activeVesselId || !documentStartDate || !documentEndDate) {
      toast({ title: 'Error', description: 'Please select a crew member and date range.', variant: 'destructive' });
      return;
    }
    if (documentStartDate > documentEndDate) {
      toast({ title: 'Error', description: 'Start date must be before end date.', variant: 'destructive' });
      return;
    }
    setIsCalculating(true);
    setCalculatedSeaTime(null);
    try {
      const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
      const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
      // Use crew or vessel logs according to selected data source (crew only when access approved)
      const useCrewLogs = hasApprovedAccess && effectiveDataSource === 'crew';
      const targetUserId = useCrewLogs ? selectedCrew.profile.id : (vessel as any)?.vessel_manager_id || currentUserProfile?.id;
      const logs = await getVesselStateLogs(supabase, activeVesselId, targetUserId);
      const filteredLogs = logs.filter((log) => log.date >= startDateStr && log.date <= endDateStr);
      if (filteredLogs.length === 0) {
        toast({
          title: 'No Data',
          description: 'No state logs found for the selected date range.',
          variant: 'destructive',
        });
        return;
      }
      let watchDates = new Set<string>();
      const position = (selectedCrew.profile.position ?? '').toLowerCase();
      const role = (selectedCrew.profile.role ?? '').toLowerCase();
      const officerPositions = [
        'captain', 'master', 'chief officer', 'first officer', 'first mate',
        'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
        'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer',
      ];
      const isOfficer = role === 'captain' || role === 'admin' || officerPositions.some((op) => position.includes(op));
      if (isOfficer && selectedCrew.profile.id) {
        const { data: watchLogs } = await supabase
          .from('watch_logs')
          .select('watch_start')
          .eq('user_id', selectedCrew.profile.id)
          .eq('vessel_id', activeVesselId)
          .gte('watch_start', `${startDateStr}T00:00:00`)
          .lte('watch_start', `${endDateStr}T23:59:59`);
        watchLogs?.forEach((log: any) => watchDates.add(formatDate(new Date(log.watch_start), 'yyyy-MM-dd')));
      }
      const category = getVesselCalculationCategory(vessel?.type ?? null);
      const result = computeSeaTimeInDateRange({
        filteredLogs,
        rangeStart: startDateStr,
        rangeEnd: endDateStr,
        useCrewLogs,
        vesselType: vessel?.type ?? null,
        watchDates,
      });
      setCalculatedSeaTime({
        totalDays: result.totalDays,
        atSeaDays: result.atSeaDays,
        standbyDays: result.standbyDays,
        yardDays: result.yardDays,
        leaveDays: result.leaveDays,
        underwayDays: result.underwayDays,
        atAnchorDays: result.atAnchorDays,
        inPortDays: result.inPortDays,
        otherDays: result.otherDays,
        isOfficer,
        standbyPeriodsForPdf: result.standbyPeriodsForPdf,
        dataSource: result.dataSource,
      });
      toast({
        title: 'Calculated',
        description: isAllDaysExceptLeaveCountAsSea(category)
          ? 'Sea time calculated for the selected range (commercial rules: all days onboard count except leave).'
          : 'Sea time calculated for the selected range.',
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to calculate sea time.', variant: 'destructive' });
    } finally {
      setIsCalculating(false);
    }
  };

  const saveTestimonialPayload = () => {
    if (!selectedCrew || !activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime) return null;
    const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
    const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
    const totalDays = calculatedSeaTime.totalDays;
    const standbyDaysToSave = Math.min(calculatedSeaTime.standbyDays, totalDays, calculatedSeaTime.atSeaDays);
    return {
      startDateStr,
      endDateStr,
      totalDays,
      standbyDaysToSave,
      testimonialToSave: {
        crew_user_id: selectedCrew.profile.id,
        vessel_id: activeVesselId,
        vessel_user_id: currentUserProfile!.id,
        start_date: startDateStr,
        end_date: endDateStr,
        total_days: totalDays,
        at_sea_days: calculatedSeaTime.atSeaDays,
        standby_days: standbyDaysToSave,
        yard_days: calculatedSeaTime.yardDays,
        leave_days: calculatedSeaTime.leaveDays,
        generated_by_name:
          currentUserProfile!.firstName && currentUserProfile!.lastName
            ? `${currentUserProfile!.firstName} ${currentUserProfile!.lastName}`
            : currentUserProfile!.email || 'Vessel Manager',
        generated_by_email: currentUserProfile!.email ?? null,
        data_source: (hasApprovedAccess ? (calculatedSeaTime?.dataSource ?? effectiveDataSource) : 'vessel') as 'crew' | 'vessel',
        notes: null,
        pdf_format: selectedNewDocFormat,
      },
    };
  };

  const handleSaveDocument = async () => {
    const payload = saveTestimonialPayload();
    if (!payload) {
      toast({ title: 'Error', description: 'Please select crew, dates, and calculate sea time first.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const { error: saveError } = await supabase
        .from('vessel_generated_testimonials')
        .insert(payload.testimonialToSave)
        .select()
        .single();
      if (saveError) throw saveError;
      toast({ title: 'Success', description: 'Document saved. It has been added to the crew member\'s page.' });
      setCalculatedSeaTime(null);
      setDocumentStartDate(undefined);
      setDocumentEndDate(undefined);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to save document.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    const payload = saveTestimonialPayload();
    if (!payload || !vessel || !calculatedSeaTime) {
      toast({ title: 'Error', description: 'Please select crew, dates, and calculate sea time first.', variant: 'destructive' });
      return;
    }
    setGeneratingPDF('date-range');
    try {
      const { data: savedTestimonial, error: saveError } = await supabase
        .from('vessel_generated_testimonials')
        .insert(payload.testimonialToSave)
        .select()
        .single();
      if (saveError) throw saveError;
      const testimonial = savedTestimonial as VesselGeneratedTestimonial;
      const testimonialData = {
        testimonial: {
          id: testimonial.id,
          start_date: testimonial.start_date,
          end_date: testimonial.end_date,
          total_days: testimonial.total_days,
          at_sea_days: testimonial.at_sea_days,
          standby_days: testimonial.standby_days,
          yard_days: testimonial.yard_days,
          leave_days: testimonial.leave_days,
          captain_name: testimonial.generated_by_name,
          captain_email: testimonial.generated_by_email,
          captain_position: null,
          captain_signature: null,
          captain_comment_conduct: null,
          captain_comment_ability: null,
          captain_comment_general: null,
          official_body: null,
          official_reference: null,
          notes: null,
          testimonial_code: null,
          status: 'approved' as const,
          signoff_used_at: null,
          approved_at: testimonial.created_at,
          created_at: testimonial.created_at,
          updated_at: testimonial.updated_at,
        },
        userProfile: {
          firstName: selectedCrew!.profile.firstName,
          lastName: selectedCrew!.profile.lastName,
          username: selectedCrew!.profile.username,
          email: selectedCrew!.profile.email ?? '',
          dateOfBirth: (selectedCrew!.profile as any).date_of_birth ?? (selectedCrew!.profile as any).dateOfBirth ?? null,
          position: selectedCrew!.profile.position ?? null,
          dischargeBookNumber: (selectedCrew!.profile as any).discharge_book_number ?? (selectedCrew!.profile as any).dischargeBookNumber ?? null,
          mobile: (selectedCrew!.profile as any).mobile ?? null,
          telephone: (selectedCrew!.profile as any).telephone ?? null,
        },
        vessel: {
          name: vessel.name,
          type: vessel.type ?? null,
          officialNumber: (vessel as any).officialNumber ?? (vessel as any).imo ?? null,
          flag_state: (vessel as any).flag_state ?? (vessel as any).flag ?? null,
          length_m: (vessel as any).length_m ?? null,
          gross_tonnage: (vessel as any).gross_tonnage ?? null,
          call_sign: (vessel as any).call_sign ?? null,
          company_contact: (vessel as any).company_contact ?? null,
        },
        captainProfile: null,
        companyDetails: {
          name: (vessel as any).management_company ?? null,
          address: (vessel as any).company_address ?? null,
          contactDetails: (vessel as any).company_contact ?? null,
        },
        standbyPeriods: calculatedSeaTime.standbyPeriodsForPdf?.length ? calculatedSeaTime.standbyPeriodsForPdf : undefined,
      };
      const format = selectedNewDocFormat;
      if (format === 'mca') {
        const receiptData = {
          documentId: testimonial.id,
          sjCode: null,
          documentType: 'testimonial' as const,
          generatedAt: new Date().toISOString(),
          generatedBy: {
            userId: currentUserProfile?.id,
            email: currentUserProfile?.email || undefined,
            name: testimonial.generated_by_name,
          },
        };
        if (calculatedSeaTime.isOfficer) {
          await generateMCAOfficerTestimonial({ ...testimonialData, receiptData }, 'download' as TestimonialPDFOutput);
        } else {
          await generateMCADeckhandTestimonial({ ...testimonialData, receiptData }, 'download' as TestimonialPDFOutput);
        }
      } else {
        const payload =
          format === 'amsa'
            ? {
                ...testimonialData,
                receiptData: {
                  documentId: testimonial.id,
                  sjCode: null,
                  documentType: 'testimonial' as const,
                  generatedAt: new Date().toISOString(),
                  generatedBy: {
                    userId: currentUserProfile?.id,
                    email: currentUserProfile?.email || undefined,
                    name: testimonial.generated_by_name,
                  },
                },
              }
            : testimonialData;

        await generateTestimonialPDF(payload, format, 'download');
      }
      toast({ title: 'Success', description: 'PDF generated and saved to the crew member\'s page.' });
      setCalculatedSeaTime(null);
      setDocumentStartDate(undefined);
      setDocumentEndDate(undefined);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to generate PDF.', variant: 'destructive' });
    } finally {
      setGeneratingPDF(null);
    }
  };

  const handleSaveProofOfService = async () => {
    if (!selectedCrew || !activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime || !vessel || !currentUserProfile) {
      toast({ title: 'Error', description: 'Please select crew, dates, and calculate sea time first.', variant: 'destructive' });
      return;
    }
    setIsSavingProofOfService(true);
    try {
      const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
      const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
      const totalDays = calculatedSeaTime.totalDays;
      const standbyCap = Math.min(calculatedSeaTime.standbyDays, totalDays, calculatedSeaTime.atSeaDays);
      const crewName = [selectedCrew.profile.firstName, selectedCrew.profile.lastName].filter(Boolean).join(' ').trim() || selectedCrew.profile.username || 'Crew member';
      const generatedByName = currentUserProfile.firstName && currentUserProfile.lastName
        ? `${currentUserProfile.firstName} ${currentUserProfile.lastName}`
        : currentUserProfile.email || 'Vessel Manager';
      const dataSource = (hasApprovedAccess ? (calculatedSeaTime?.dataSource ?? effectiveDataSource) : 'vessel') as 'crew' | 'vessel';

      const { error } = await supabase.from('proof_of_service').insert({
        crew_user_id: selectedCrew.profile.id,
        vessel_id: activeVesselId,
        vessel_user_id: currentUserProfile.id,
        start_date: startDateStr,
        end_date: endDateStr,
        total_days: totalDays,
        at_sea_days: calculatedSeaTime.atSeaDays,
        standby_days: standbyCap,
        yard_days: calculatedSeaTime.yardDays,
        leave_days: calculatedSeaTime.leaveDays,
        vessel_name: vessel.name,
        vessel_type: vessel.type ?? null,
        vessel_imo: (vessel as any).imo ?? (vessel as any).officialNumber ?? null,
        crew_name: crewName,
        crew_position: selectedCrew.profile.position ?? null,
        generated_by_name: generatedByName,
        generated_by_email: currentUserProfile.email ?? null,
        data_source: dataSource,
        notes: null,
      });
      if (error) throw error;
      toast({ title: 'Saved', description: 'Proof of Service has been saved to the crew member\'s profile. They can view and download it from Proof of Service.' });
      setCalculatedSeaTime(null);
      setDocumentStartDate(undefined);
      setDocumentEndDate(undefined);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to save Proof of Service.', variant: 'destructive' });
    } finally {
      setIsSavingProofOfService(false);
    }
  };

  const handleDownloadProofOfServicePDF = async () => {
    if (!selectedCrew || !documentStartDate || !documentEndDate || !calculatedSeaTime || !vessel || !currentUserProfile) {
      toast({ title: 'Error', description: 'Please select crew, dates, and calculate sea time first.', variant: 'destructive' });
      return;
    }
    setGeneratingProofOfServicePDF(true);
    try {
      const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
      const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
      const totalDays = calculatedSeaTime.totalDays;
      const standbyCap = Math.min(calculatedSeaTime.standbyDays, totalDays, calculatedSeaTime.atSeaDays);
      const crewName = [selectedCrew.profile.firstName, selectedCrew.profile.lastName].filter(Boolean).join(' ').trim() || selectedCrew.profile.username || 'Crew member';
      const generatedByName = currentUserProfile.firstName && currentUserProfile.lastName
        ? `${currentUserProfile.firstName} ${currentUserProfile.lastName}`
        : currentUserProfile.email || 'Vessel Manager';

      await generateProofOfServicePDF({
        vesselName: vessel.name,
        vesselType: vessel.type ?? null,
        vesselImo: (vessel as any).imo ?? (vessel as any).officialNumber ?? null,
        crewName,
        crewPosition: selectedCrew.profile.position ?? null,
        startDate: startDateStr,
        endDate: endDateStr,
        totalDays,
        atSeaDays: calculatedSeaTime.atSeaDays,
        standbyDays: standbyCap,
        yardDays: calculatedSeaTime.yardDays,
        leaveDays: calculatedSeaTime.leaveDays,
        generatedByName,
        generatedByEmail: currentUserProfile.email ?? null,
        notes: null,
      }, 'download');
      toast({ title: 'Downloaded', description: 'Proof of Service PDF generated.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to generate PDF.', variant: 'destructive' });
    } finally {
      setGeneratingProofOfServicePDF(false);
    }
  };

  const handleDownloadSeaServiceBreakdownPDF = async () => {
    if (!selectedCrew || !documentStartDate || !documentEndDate || !calculatedSeaTime || !vessel || !currentUserProfile) {
      toast({ title: 'Error', description: 'Please select crew, dates, and calculate sea time first.', variant: 'destructive' });
      return;
    }
    setGeneratingBreakdownPDF(true);
    try {
      const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
      const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
      const totalDays = calculatedSeaTime.totalDays;
      const standbyCap = Math.min(calculatedSeaTime.standbyDays, totalDays, calculatedSeaTime.atSeaDays);
      const crewName =
        [selectedCrew.profile.firstName, selectedCrew.profile.lastName].filter(Boolean).join(' ').trim() ||
        selectedCrew.profile.username ||
        'Crew member';
      const generatedByName =
        currentUserProfile.firstName && currentUserProfile.lastName
          ? `${currentUserProfile.firstName} ${currentUserProfile.lastName}`
          : currentUserProfile.email || 'Vessel Manager';
      const dataSourceLabel =
        calculatedSeaTime.dataSource === 'crew' ? "Crew member's logs" : 'Vessel logs';
      const category = getVesselCalculationCategory(vessel.type ?? null);
      const calculationNote = isAllDaysExceptLeaveCountAsSea(category)
        ? 'Commercial-style counting in SeaJourney: every day in the selected range except days marked on leave counts as sea service. Standby is not calculated separately for this vessel category.'
        : 'MCA-aligned rules in SeaJourney: sea time from sea passages, officer watch where applicable, and active passage; qualifying standby days (capped by sea days); yard and leave shown separately.';

      await generateSeaServiceBreakdownPDF(
        {
          vesselName: vessel.name,
          vesselType: vessel.type ?? null,
          vesselImo: (vessel as any).imo ?? (vessel as any).officialNumber ?? null,
          crewName,
          crewPosition: selectedCrew.profile.position ?? null,
          startDate: startDateStr,
          endDate: endDateStr,
          totalDays,
          underwayDays: calculatedSeaTime.underwayDays,
          atAnchorDays: calculatedSeaTime.atAnchorDays,
          inPortDays: calculatedSeaTime.inPortDays,
          standbyDays: standbyCap,
          yardDays: calculatedSeaTime.yardDays,
          dataSourceLabel,
          calculationNote,
          generatedByName,
          generatedByEmail: currentUserProfile.email ?? null,
          standbyPeriods: calculatedSeaTime.standbyPeriodsForPdf,
        },
        'download',
      );
      toast({
        title: 'Downloaded',
        description: 'Reference breakdown PDF generated. It is not saved to the crew profile.',
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message ?? 'Failed to generate PDF.', variant: 'destructive' });
    } finally {
      setGeneratingBreakdownPDF(false);
    }
  };

  const handleSendToCaptain = async () => {
    if (!selectedCrew || !activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime || !activeCaptain) {
      toast({ title: 'Error', description: 'Please select dates, calculate sea time, and ensure a captain is available.', variant: 'destructive' });
      return;
    }
    const v = getVesselDetails(activeVesselId);
    if (!v) {
      toast({ title: 'Error', description: 'Vessel details not found.', variant: 'destructive' });
      return;
    }
    setIsSendingToCaptain(true);
    try {
      const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
      const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
      const calendarDays = differenceInDays(documentEndDate, documentStartDate) + 1;
      const standbyCap = Math.min(calculatedSeaTime.standbyDays, calendarDays, calculatedSeaTime.atSeaDays);
      const atSea = calculatedSeaTime.atSeaDays;
      const yard = calculatedSeaTime.yardDays;
      const leave = calculatedSeaTime.leaveDays;
      const totalDays = atSea + standbyCap + yard + leave;
      const testimonialData = {
        user_id: selectedCrew.profile.id,
        vessel_id: activeVesselId,
        start_date: startDateStr,
        end_date: endDateStr,
        total_days: totalDays,
        at_sea_days: atSea,
        standby_days: standbyCap,
        yard_days: yard,
        leave_days: leave,
        status: 'pending_captain' as const,
        captain_user_id: activeCaptain.id,
        captain_email: null,
        captain_name: null,
        captain_position: null,
        captain_signature: null,
        captain_comment_conduct: null,
        captain_comment_ability: null,
        captain_comment_general: null,
        official_body: null,
        official_reference: null,
        notes: `Generated by vessel manager on ${formatDate(new Date(), 'dd MMMM yyyy')}. Awaiting captain approval.`,
        testimonial_code: null,
        generated_by_user_id: user?.id ?? null,
      };
      const { error: createError } = await supabase.from('testimonials').insert(testimonialData).select().single();
      if (createError) throw createError;
      toast({
        title: 'Sent to Captain',
        description: `Testimonial request has been sent to ${activeCaptain.name}'s inbox. Once approved, it will receive a verification code (SJ-XXX) and appear in the testimonials list.`,
      });
      setCalculatedSeaTime(null);
      setDocumentStartDate(undefined);
      setDocumentEndDate(undefined);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to send testimonial to captain.', variant: 'destructive' });
    } finally {
      setIsSendingToCaptain(false);
    }
  };

  const handleSendTestimonialToCaptainByEmail = async () => {
    const captainEmail = sendTestimonialByEmailValue?.trim();
    if (!captainEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captainEmail)) {
      toast({ title: 'Invalid email', description: 'Please enter a valid captain email address.', variant: 'destructive' });
      return;
    }
    if (!selectedCrew || !activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime) {
      toast({ title: 'Error', description: 'Please select dates and calculate sea time first.', variant: 'destructive' });
      return;
    }
    const v = getVesselDetails(activeVesselId);
    if (!v) {
      toast({ title: 'Error', description: 'Vessel details not found.', variant: 'destructive' });
      return;
    }
    if (!session?.access_token) {
      toast({ title: 'Error', description: 'Your session has expired. Please refresh and try again.', variant: 'destructive' });
      return;
    }
    setIsSendingTestimonialByEmail(true);
    try {
      const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
      const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
      const calendarDays = differenceInDays(documentEndDate, documentStartDate) + 1;
      const standbyCap = Math.min(calculatedSeaTime.standbyDays, calendarDays, calculatedSeaTime.atSeaDays);
      const atSea = calculatedSeaTime.atSeaDays;
      const yard = calculatedSeaTime.yardDays;
      const leave = calculatedSeaTime.leaveDays;
      const totalDays = atSea + standbyCap + yard + leave;
      const testimonialData = {
        user_id: selectedCrew.profile.id,
        vessel_id: activeVesselId,
        start_date: startDateStr,
        end_date: endDateStr,
        total_days: totalDays,
        at_sea_days: atSea,
        standby_days: standbyCap,
        yard_days: yard,
        leave_days: leave,
        status: 'pending_captain' as const,
        captain_user_id: null,
        captain_email: captainEmail,
        captain_name: null,
        captain_position: null,
        captain_signature: null,
        captain_comment_conduct: null,
        captain_comment_ability: null,
        captain_comment_general: null,
        official_body: null,
        official_reference: null,
        notes: `Generated by vessel manager on ${formatDate(new Date(), 'dd MMMM yyyy')}. Awaiting captain approval.`,
        testimonial_code: null,
        generated_by_user_id: user?.id ?? null,
      };
      const { data: createdTestimonial, error: createError } = await supabase.from('testimonials').insert(testimonialData).select().single();
      if (createError) throw createError;
      const tokenRes = await fetch('/api/testimonials/create-signoff-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ testimonialId: createdTestimonial.id, captainEmail }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.token) throw new Error(tokenData.error || 'Failed to create sign-off link');
      await requestCaptainSignoff(supabase, { ...(createdTestimonial as Testimonial), vessel_name: v.name, signoffToken: tokenData.token }, toast);
      toast({ title: 'Sent', description: 'Captain will receive an email with a secure link to approve the testimonial.' });
      setSendTestimonialByEmailOpen(false);
      setSendTestimonialByEmailValue('');
      setCalculatedSeaTime(null);
      setDocumentStartDate(undefined);
      setDocumentEndDate(undefined);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to send.', variant: 'destructive' });
    } finally {
      setIsSendingTestimonialByEmail(false);
    }
  };


  /**
   * Resolve values for a form-builder template against the currently
   * selected crew member (+ optional sea-time), fetch the original PDF,
   * stamp the values onto it, and trigger a download. Mirrors the Use
   * dialog inside the Form Builder tab so selecting a template from the
   * Generator dropdown yields the same filled PDF.
   */
  const handleDownloadFormTemplate = async () => {
    if (!activeFormTemplate) return;
    if (!selectedCrew || !activeVesselId) {
      toast({ title: 'Missing info', description: 'Select a crew member first.', variant: 'destructive' });
      return;
    }
    if (!session?.access_token) {
      toast({ title: 'Not signed in', description: 'Refresh and try again.', variant: 'destructive' });
      return;
    }
    if (templateNeedsSeaTime && !calculatedSeaTime) {
      toast({
        title: 'Calculate sea time',
        description: 'This form needs a date range. Pick dates and run calculate first.',
        variant: 'destructive',
      });
      return;
    }
    setIsGeneratingTemplate(true);
    try {
      const body: Record<string, unknown> = {
        crewUserId: selectedCrew.profile.id,
      };
      if (templateNeedsSeaTime && calculatedSeaTime && documentStartDate && documentEndDate) {
        const standbyCap = Math.min(
          calculatedSeaTime.standbyDays,
          calculatedSeaTime.totalDays,
          calculatedSeaTime.atSeaDays,
        );
        body.startDate = formatDate(documentStartDate, 'yyyy-MM-dd');
        body.endDate = formatDate(documentEndDate, 'yyyy-MM-dd');
        body.seaTime = {
          totalDays: calculatedSeaTime.totalDays,
          atSeaDays: calculatedSeaTime.atSeaDays,
          standbyDays: standbyCap,
          yardDays: calculatedSeaTime.yardDays,
          leaveDays: calculatedSeaTime.leaveDays,
          underwayDays: calculatedSeaTime.underwayDays,
          atAnchorDays: calculatedSeaTime.atAnchorDays,
          inPortDays: calculatedSeaTime.inPortDays,
        };
      }
      const resolveRes = await fetch(
        `/api/document-templates/${activeFormTemplate.id}/resolve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        },
      );
      const resolveData = await resolveRes.json();
      if (!resolveRes.ok) throw new Error(resolveData.error || 'Failed to resolve field values');
      const values = (resolveData.values ?? {}) as Record<string, string | null>;

      const fileRes = await fetch(
        `/api/document-templates/${activeFormTemplate.id}/file`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!fileRes.ok) {
        const errJson = await fileRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load template file');
      }
      const fileBlob = await fileRes.blob();
      const fileType =
        activeFormTemplate.fileType || fileBlob.type || 'application/pdf';
      const file = new File(
        [fileBlob],
        activeFormTemplate.originalFilename || `${activeFormTemplate.name}.pdf`,
        { type: fileType },
      );

      const fillable: FillableField[] = activeFormTemplate.fields
        .filter((f) => values[f.id] != null && values[f.id] !== '')
        .map((f) => ({
          id: f.id,
          label: f.label,
          value: String(values[f.id] ?? ''),
          page: f.page,
          bbox: f.bbox,
          type: f.type === 'signature' ? 'signature' : 'text',
        }));

      if (!fillable.length) {
        toast({
          title: 'No values to stamp',
          description:
            'No fields could be resolved with values. Edit the template to bind fields to data.',
          variant: 'destructive',
        });
        return;
      }

      const { blob: filled, filledCount } = await fillScannedDocument(
        file,
        fillable,
      );
      const baseName = activeFormTemplate.name.replace(/\s+/g, '_').toLowerCase();
      const safeCrew =
        [selectedCrew.profile.firstName, selectedCrew.profile.lastName]
          .filter(Boolean)
          .join('_')
          .toLowerCase() ||
        (selectedCrew.profile.username ?? 'crew').toLowerCase();
      downloadBlob(filled, `${baseName}-${safeCrew}.pdf`);
      toast({
        title: 'Generated',
        description: `Filled ${filledCount} field${filledCount === 1 ? '' : 's'} and downloaded the PDF.`,
      });
    } catch (err: any) {
      console.error('[documents] template generate failed', err);
      toast({
        title: 'Generate failed',
        description: err?.message ?? 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const isVessel = currentUserProfile?.role === 'vessel';
  const noVessel = isVessel && !activeVesselId;

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (currentUserProfile?.role !== 'vessel' && currentUserProfile?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">You don’t have access to the document generator.</p>
        </CardContent>
      </Card>
    );
  }

  if (noVessel) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">No active vessel selected. Select a vessel in your profile to generate documents.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generator</h1>
        <p className="text-muted-foreground">
          Pick a <span className="text-foreground/90">document type</span> (including any{' '}
          <span className="text-foreground/90">Form Builder</span> templates saved for this vessel), then (for sea service testimonials) a{' '}
          <span className="text-foreground/90">PDF format</span>, then crew member and dates. Or jump to the{' '}
          <span className="text-foreground/90">Form Builder</span> to scan a document and turn it into a reusable, fillable form.
        </p>
      </div>

      {/* Top-level tabs */}
      <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'generator' | 'custom-templates')}>
        <TabsList className="h-10 rounded-xl p-1">
          <TabsTrigger value="generator" className="rounded-lg px-4 h-8 text-sm gap-2">
            <FileText className="h-4 w-4" />
            Generator
          </TabsTrigger>
          <TabsTrigger value="custom-templates" className="rounded-lg px-4 h-8 text-sm gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Form Builder
            <Badge variant="outline" className="ml-1 h-5 rounded-md text-[10px] font-semibold border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10">
              BETA
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/*
          forceMount keeps both panels' component trees alive across
          switches. Without this, Radix unmounts the inactive panel and
          all local state inside the Generator / Form Builder is wiped —
          so users have to re-pick crew, re-calculate, re-upload, etc.
          every time they toggle tabs. We hide the inactive one with
          data-attrs.
        */}
        <TabsContent
          value="custom-templates"
          forceMount
          className="mt-6 data-[state=inactive]:hidden"
        >
          <CustomTemplatesTab
            supabase={supabase}
            session={session}
            activeVesselId={activeVesselId}
            vessel={vessel as any}
            currentUserProfile={currentUserProfile}
            crewList={crewList}
            loadingCrew={loadingCrew}
          />
        </TabsContent>

        <TabsContent
          value="generator"
          forceMount
          className="mt-6 space-y-6 data-[state=inactive]:hidden"
        >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document type
            </CardTitle>
            <CardDescription>Choose the type of document to generate.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={documentType}
              onValueChange={(v) => {
                setDocumentType(v);
                setCalculatedSeaTime(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
                {formTemplates.length > 0 && (
                  <div className="mt-1 border-t border-border/60 pt-1">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Form Builder
                    </div>
                    {formTemplates.map((t) => (
                      <SelectItem key={t.id} value={`template:${t.id}`}>
                        <span className="flex w-full items-center gap-2">
                          <LayoutTemplate className="h-4 w-4 shrink-0" />
                          <span className="truncate">{t.name}</span>
                          <span className="ml-auto flex items-center gap-2 shrink-0 pl-2">
                            <Badge
                              variant="outline"
                              className="h-5 rounded-md px-1.5 text-[10px] font-semibold border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                            >
                              Form Builder
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              Added {formatDate(new Date(t.createdAt), 'd MMM yyyy')}
                            </span>
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                )}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Crew member
            </CardTitle>
            <CardDescription>Select the crew member this document is for.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCrew ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading crew…
              </div>
            ) : (
              <SearchableSelect
                options={crewSelectOptions}
                value={selectedCrewId}
                onValueChange={(v) => {
                  setSelectedCrewId(v);
                  setCalculatedSeaTime(null);
                  setLeavePeriods([]);
                  setLeavePeriodsFromLogs([]);
                }}
                placeholder="Select crew member"
                searchPlaceholder="Search by name or email…"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {selectedCrew && documentType === 'testimonial' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              PDF format
            </CardTitle>
            <CardDescription>
              Choose how the testimonial is laid out. This is saved with the document on the crew profile — downloads from the Crew page use this format (MCA, AMSA, or SeaJourney branded).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedNewDocFormat}
              onValueChange={(v) => setSelectedNewDocFormat(v as TestimonialPDFFormat)}
            >
              <SelectTrigger className="w-full max-w-md rounded-xl">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seajourney">SeaJourney</SelectItem>
                <SelectItem value="mca">MCA</SelectItem>
                <SelectItem value="amsa">AMSA (771)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {selectedCrew &&
        (documentType === 'testimonial' ||
          documentType === 'proof_of_service' ||
          documentType === 'sea_service_breakdown' ||
          (activeFormTemplate && templateNeedsSeaTime)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date range & generate
            </CardTitle>
            <CardDescription>
              {activeFormTemplate
                ? `This form includes service-period or day-count fields — pick a date range and calculate so we can stamp those values onto "${activeFormTemplate.name}".`
                : documentType === 'proof_of_service'
                ? 'Set the date range and calculate sea time, then save to the crew member’s profile or download.'
                : documentType === 'sea_service_breakdown'
                  ? 'Pick the period you need for an external form, calculate, then download a one-page PDF with day counts. Nothing is saved to the crew profile.'
                  : 'Set the date range, choose data source if the crew member has given access, then calculate sea time and save or generate.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(documentType === 'proof_of_service' || documentType === 'sea_service_breakdown') &&
              proofOfServiceFullRange && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Quick select</Label>
                <p className="text-xs text-muted-foreground">
                  From start on vessel to today{selectedCrew?.assignment?.endDate ? ' (or their end date if set)' : ''}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDocumentStartDate(proofOfServiceFullRange.startDate);
                      setDocumentEndDate(proofOfServiceFullRange.endDate);
                    }}
                    className="rounded-xl text-xs h-auto py-2 px-3 whitespace-normal hover:bg-primary hover:text-primary-foreground"
                  >
                    {formatDate(proofOfServiceFullRange.startDate, 'dd MMM yyyy')} → {formatDate(proofOfServiceFullRange.endDate, 'dd MMM yyyy')}
                  </Button>
                </div>
              </div>
            )}
            {(documentType === 'testimonial' || documentType === 'sea_service_breakdown') &&
              availablePeriodsBetweenLeave.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Quick select: periods between leave</Label>
                <p className="text-xs text-muted-foreground">
                  Presets use this crew member&apos;s leave data (manual and, when access is approved, from their logs).
                </p>
                <div className="flex flex-wrap gap-2">
                  {availablePeriodsBetweenLeave.map((period, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDocumentStartDate(period.startDate);
                        setDocumentEndDate(period.endDate);
                      }}
                      className="rounded-xl text-xs h-auto py-2 px-3 whitespace-normal hover:bg-primary hover:text-primary-foreground"
                    >
                      {period.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('w-full justify-start text-left font-normal', !documentStartDate && 'text-muted-foreground')}
                    >
                      {documentStartDate ? formatDate(documentStartDate, 'PPP') : 'Pick start date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={documentStartDate}
                      onSelect={setDocumentStartDate}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('w-full justify-start text-left font-normal', !documentEndDate && 'text-muted-foreground')}
                    >
                      {documentEndDate ? formatDate(documentEndDate, 'PPP') : 'Pick end date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={documentEndDate}
                      onSelect={setDocumentEndDate}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {hasApprovedAccess && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Data Source</Label>
                <Select
                  value={selectedDataSource ?? 'vessel'}
                  onValueChange={(value) => {
                    setSelectedDataSource(value as 'crew' | 'vessel');
                    setCalculatedSeaTime(null);
                  }}
                >
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crew">Crew Member&apos;s Logs</SelectItem>
                    <SelectItem value="vessel">Vessel Logs</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Crew member&apos;s logs include watch days for officers. Vessel logs use the vessel&apos;s general state logs.
                </p>
              </div>
            )}

            <Button
              onClick={handleCalculateSeaTime}
              disabled={isCalculating || !documentStartDate || !documentEndDate || documentStartDate > documentEndDate}
              className="w-full rounded-xl h-11"
              size="lg"
            >
              {isCalculating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculating…
                </>
              ) : documentType === 'proof_of_service' ? (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Calculate
                </>
              ) : documentType === 'sea_service_breakdown' ? (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Calculate breakdown
                </>
              ) : (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Calculate Sea Time
                </>
              )}
            </Button>

            {calculatedSeaTime && (() => {
              const standbyCappedForExport = Math.min(
                calculatedSeaTime.standbyDays,
                calculatedSeaTime.totalDays,
                calculatedSeaTime.atSeaDays,
              );
              const seaServiceUnderwayPlusStandby =
                calculatedSeaTime.underwayDays + standbyCappedForExport;
              return (
              <Card className="bg-muted/50 border-2">
                <CardHeader>
                  <CardTitle className="text-base">Calculated Sea Time</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Using {calculatedSeaTime.dataSource === 'crew' ? "Crew Member's Logs" : 'Vessel Logs'}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 dark:bg-primary/10 px-4 py-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Sea service (underway + qualifying standby)
                    </div>
                    <div className="text-2xl font-bold text-primary">{seaServiceUnderwayPlusStandby} days</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Same total as the sea service breakdown PDF. &quot;At sea (MCA aggregate)&quot; below can be higher when passage, watch, or anchor rules count extra sea days beyond logged underway.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Total Days</div>
                      <div className="text-2xl font-bold">{calculatedSeaTime.totalDays}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">At sea (MCA aggregate)</div>
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{calculatedSeaTime.atSeaDays}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Standby (qualifying)</div>
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{calculatedSeaTime.standbyDays}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Yard Days</div>
                      <div className="text-2xl font-bold">{calculatedSeaTime.yardDays}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Leave Days</div>
                      <div className="text-2xl font-bold">{calculatedSeaTime.leaveDays}</div>
                    </div>
                    {(calculatedSeaTime.otherDays ?? 0) > 0 && (
                      <div className="space-y-1 col-span-2 md:col-span-5">
                        <div className="text-xs text-muted-foreground">Other (in port/at anchor, not counted as standby — standby cannot exceed at-sea days)</div>
                        <div className="text-lg font-semibold">{calculatedSeaTime.otherDays}</div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border/60">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Underway (logged)</div>
                      <div className="text-xl font-semibold">{calculatedSeaTime.underwayDays}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">At anchor (logged)</div>
                      <div className="text-xl font-semibold">{calculatedSeaTime.atAnchorDays}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">In port (logged)</div>
                      <div className="text-xl font-semibold">{calculatedSeaTime.inPortDays}</div>
                    </div>
                  </div>

                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {documentType === 'testimonial' && (
                      <>
                    <Button
                      onClick={handleSaveDocument}
                      disabled={isSaving || generatingPDF === 'date-range' || generatingBreakdownPDF}
                      variant="outline"
                      className="rounded-xl"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Save Document
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDownloadPDF}
                      disabled={generatingPDF === 'date-range' || isSaving || generatingBreakdownPDF}
                      className="rounded-xl"
                    >
                      {generatingPDF === 'date-range' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </>
                      )}
                    </Button>
                    {activeCaptain && (
                      <Button
                        onClick={handleSendToCaptain}
                        disabled={isSendingToCaptain || generatingBreakdownPDF}
                        className="rounded-xl"
                      >
                        {isSendingToCaptain ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Send to Captain
                          </>
                        )}
                      </Button>
                    )}
                    {!activeCaptain && (
                      <Button
                        onClick={() => setSendTestimonialByEmailOpen(true)}
                        disabled={isSendingTestimonialByEmail || generatingBreakdownPDF}
                        variant="outline"
                        className="rounded-xl"
                      >
                        {isSendingTestimonialByEmail ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send to captain by email
                          </>
                        )}
                      </Button>
                    )}
                      </>
                    )}
                    {documentType === 'sea_service_breakdown' && (
                      <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <Button
                          variant="default"
                          onClick={handleDownloadSeaServiceBreakdownPDF}
                          disabled={
                            generatingBreakdownPDF ||
                            generatingPDF === 'date-range' ||
                            isSaving ||
                            generatingProofOfServicePDF ||
                            isSavingProofOfService
                          }
                          className="rounded-xl w-full sm:w-auto"
                        >
                          {generatingBreakdownPDF ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Generating…
                            </>
                          ) : (
                            <>
                              <Download className="mr-2 h-4 w-4" />
                              Download breakdown PDF
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground max-w-md">
                          Reference only — not stored on the crew profile. Use the figures to fill other forms manually.
                        </p>
                      </div>
                    )}
                    {documentType === 'proof_of_service' && (
                      <>
                    <Button
                      variant="outline"
                      onClick={handleSaveProofOfService}
                      disabled={isSavingProofOfService || generatingProofOfServicePDF || generatingBreakdownPDF}
                      className="rounded-xl"
                    >
                      {isSavingProofOfService ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Save as Proof of Service
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDownloadProofOfServicePDF}
                      disabled={isSavingProofOfService || generatingProofOfServicePDF || generatingBreakdownPDF}
                      className="rounded-xl"
                    >
                      {generatingProofOfServicePDF ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Proof of Service
                        </>
                      )}
                    </Button>
                      </>
                    )}
                    {activeFormTemplate && (
                      <Button
                        onClick={handleDownloadFormTemplate}
                        disabled={isGeneratingTemplate}
                        className="rounded-xl"
                      >
                        {isGeneratingTemplate ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Download filled form
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {selectedCrew && activeFormTemplate && !templateNeedsSeaTime && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              Generate form
            </CardTitle>
            <CardDescription>
              We&apos;ll resolve the fields in &quot;{activeFormTemplate.name}&quot; from the
              selected crew member&apos;s profile and download a filled PDF. This
              form doesn&apos;t need a date range.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleDownloadFormTemplate}
              disabled={isGeneratingTemplate}
              className="rounded-xl"
              size="lg"
            >
              {isGeneratingTemplate ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download filled form
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={sendTestimonialByEmailOpen} onOpenChange={(open) => { setSendTestimonialByEmailOpen(open); if (!open) setSendTestimonialByEmailValue(''); }}>
        <DialogContent className="rounded-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Send testimonial to captain</DialogTitle>
            <DialogDescription>
              No active captain is assigned to this vessel. Enter the captain&apos;s email to send this testimonial for approval. They will receive a secure link to view, add comments, and approve or reject—same as the crew-to-captain flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="doc-captain-email">Captain email</Label>
              <Input
                id="doc-captain-email"
                type="email"
                placeholder="captain@example.com"
                value={sendTestimonialByEmailValue}
                onChange={(e) => setSendTestimonialByEmailValue(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSendTestimonialByEmailOpen(false)} disabled={isSendingTestimonialByEmail}>
                Cancel
              </Button>
              <Button onClick={handleSendTestimonialToCaptainByEmail} disabled={isSendingTestimonialByEmail}>
                {isSendingTestimonialByEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send for approval
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {crewList.length === 0 && !loadingCrew && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">No active crew members on your vessel. Add crew from the Crew page first.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/dashboard/crew">
                Go to Crew
                <ChevronRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
