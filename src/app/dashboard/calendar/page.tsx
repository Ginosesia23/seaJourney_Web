'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth, getDay, isSameMonth, isToday, isWithinInterval, startOfDay, endOfDay, isAfter, isBefore, parse, addDays } from 'date-fns';
import { Calendar as CalendarIcon, Waves, Anchor, Building, Briefcase, Ship, ChevronLeft, ChevronRight, Loader2, MousePointer2, BoxSelect, Clock } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselStateLogs, updateStateLogsBatch, getVesselAssignments } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Vessel, StateLog, DailyStatus, VesselAssignment } from '@/lib/types';
import { calculateStandbyDays } from '@/lib/standby-calculation';

const vesselStates: { value: DailyStatus; label: string; color: string; bgColor: string; icon: React.FC<any> }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', bgColor: 'hsl(217, 91%, 95%)', icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', bgColor: 'hsl(25, 95%, 95%)', icon: Anchor },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', bgColor: 'hsl(142, 76%, 95%)', icon: Building },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', bgColor: 'hsl(215, 16%, 95%)', icon: Briefcase },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', bgColor: 'hsl(0, 84%, 95%)', icon: Ship },
];

export default function CalendarPage() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedState, setSelectedState] = useState<DailyStatus | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stateLogs, setStateLogs] = useState<StateLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>('single');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  // Fetch user profile to get active vessel
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    
    const startDate = (userProfileRaw as any).start_date || (userProfileRaw as any).startDate || null;
    return {
      ...userProfileRaw,
      id: userProfileRaw.id,
      email: (userProfileRaw as any).email || '',
      username: (userProfileRaw as any).username || '',
      activeVesselId: activeVesselId || undefined,
      firstName: (userProfileRaw as any).first_name || (userProfileRaw as any).firstName,
      lastName: (userProfileRaw as any).last_name || (userProfileRaw as any).lastName,
      profilePicture: (userProfileRaw as any).profile_picture || (userProfileRaw as any).profilePicture,
      bio: (userProfileRaw as any).bio,
      registrationDate: (userProfileRaw as any).registration_date || (userProfileRaw as any).registrationDate,
      role: (userProfileRaw as any).role || 'crew',
      subscriptionTier: (userProfileRaw as any).subscription_tier || (userProfileRaw as any).subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || (userProfileRaw as any).subscriptionStatus || 'inactive',
      startDate: startDate || undefined,
    } as UserProfile;
  }, [userProfileRaw]);

  // Query all vessels
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  const currentVessel = useMemo(() => {
    if (!userProfile || !vessels || vessels.length === 0) return undefined;
    const activeVesselId = userProfile.activeVesselId;
    return vessels.find(v => v.id === activeVesselId);
  }, [vessels, userProfile]);

  // Check if captain has approved captaincy for current vessel and find vessel account user
  const [vesselAccountUserId, setVesselAccountUserId] = useState<string | null>(null);
  
  useEffect(() => {
    const checkCaptaincyAndFindVesselAccount = async () => {
      if (!currentVessel || !user?.id) {
        setVesselAccountUserId(null);
        return;
      }

      // Only check for captains
      if (userProfile?.role !== 'captain') {
        setVesselAccountUserId(null);
        return;
      }

      try {
        // Check if captain has approved captaincy
        const { data: captaincyData, error: captaincyError } = await supabase
          .from('vessel_claim_requests')
          .select('id, status')
          .eq('requested_by', user.id)
          .eq('vessel_id', currentVessel.id)
          .eq('status', 'approved')
          .maybeSingle();

        if (captaincyError || !captaincyData) {
          setVesselAccountUserId(null);
          return;
        }

        // Use vessel_manager_id from the vessel record (preferred method)
        const vesselManagerId = (currentVessel as any).vessel_manager_id || (currentVessel as any).vesselManagerId;
        
        if (vesselManagerId) {
          console.log('[CALENDAR PAGE] Found vessel_manager_id from vessel record:', vesselManagerId);
          setVesselAccountUserId(vesselManagerId);
        } else {
          // Fallback: Find the vessel account user (user with role='vessel' and active_vessel_id matching this vessel)
          console.log('[CALENDAR PAGE] No vessel_manager_id found, searching for vessel account user with:', {
            role: 'vessel',
            active_vessel_id: currentVessel.id
          });
          
          const { data: vesselAccount, error: vesselAccountError } = await supabase
            .from('users')
            .select('id, role, active_vessel_id, email')
            .eq('role', 'vessel')
            .eq('active_vessel_id', currentVessel.id)
            .limit(1)
            .maybeSingle();

          if (vesselAccountError) {
            console.error('[CALENDAR PAGE] Error finding vessel account:', vesselAccountError);
            setVesselAccountUserId(null);
          } else if (vesselAccount) {
            console.log('[CALENDAR PAGE] Found vessel account user via fallback search:', {
              vesselAccountId: vesselAccount.id,
              vesselId: currentVessel.id,
              email: vesselAccount.email
            });
            setVesselAccountUserId(vesselAccount.id);
          } else {
            console.log('[CALENDAR PAGE] No vessel account found for vessel:', currentVessel.id);
            setVesselAccountUserId(null);
          }
        }
      } catch (error) {
        console.error('[CALENDAR PAGE] Exception checking captaincy/vessel account:', error);
        setVesselAccountUserId(null);
      }
    };

    checkCaptaincyAndFindVesselAccount();
  }, [currentVessel?.id, user?.id, userProfile?.role, supabase]);

  // Fetch state logs from ALL vessels the user has assignments for
  // This allows viewing states from previous vessels and current vessel
  useEffect(() => {
    if (!user?.id || !vessels || vessels.length === 0) {
      setStateLogs([]);
      setIsLoadingLogs(false);
      return;
    }

    setIsLoadingLogs(true);
    
    const fetchAllLogs = async () => {
      try {
        // Get all unique vessel IDs from assignments
        const vesselIdsFromAssignments = new Set<string>();
        vesselAssignments.forEach(assignment => {
          vesselIdsFromAssignments.add(assignment.vesselId);
        });

        // Also include current vessel if it exists
        if (currentVessel) {
          vesselIdsFromAssignments.add(currentVessel.id);
        }

        // Fetch logs from all vessels the user has assignments for
        const allLogs: StateLog[] = [];
        
        for (const vesselId of vesselIdsFromAssignments) {
          const vessel = vessels.find(v => v.id === vesselId);
          if (!vessel) continue;

          // For captains with approved captaincy, fetch vessel account logs
          // Otherwise, fetch only logs for this user
          let userIdToFetch: string | undefined = user.id;
          
          if (userProfile?.role === 'captain') {
            try {
              const { data: captaincyData } = await supabase
                .from('vessel_claim_requests')
                .select('id')
                .eq('requested_by', user.id)
                .eq('vessel_id', vesselId)
                .eq('status', 'approved')
                .maybeSingle();
              
              if (captaincyData) {
                const vesselManagerId = (vessel as any).vessel_manager_id || (vessel as any).vesselManagerId;
                if (vesselManagerId) {
                  userIdToFetch = vesselManagerId;
                } else {
                  userIdToFetch = undefined; // Fetch all logs for vessel
                }
              }
            } catch (e) {
              console.error('[CALENDAR PAGE] Error checking captaincy for vessel:', vesselId, e);
            }
          }

          try {
            const logs = await getVesselStateLogs(supabase, vesselId, userIdToFetch);
            console.log('[CALENDAR PAGE] Fetched logs for vessel:', {
              vesselId,
              vesselName: vessel.name,
              logsCount: logs.length,
            });
            allLogs.push(...logs);
          } catch (error) {
            console.error(`[CALENDAR PAGE] Error fetching logs for vessel ${vesselId}:`, error);
          }
        }

        // Remove duplicates (same date + vessel combination)
        const uniqueLogs = Array.from(
          new Map(allLogs.map(log => [`${log.date}-${log.vesselId}`, log])).values()
        );

        console.log('[CALENDAR PAGE] Total logs fetched from all vessels:', {
          totalLogs: uniqueLogs.length,
          vesselsCount: vesselIdsFromAssignments.size,
        });

        setStateLogs(uniqueLogs);
        setIsLoadingLogs(false);
      } catch (error) {
        console.error('[CALENDAR PAGE] Error fetching all logs:', error);
        setStateLogs([]);
        setIsLoadingLogs(false);
      }
    };
    
    fetchAllLogs();
  }, [user?.id, vessels, vesselAssignments, userProfile?.role, supabase]);

  // Fetch vessel assignments to determine valid date ranges
  useEffect(() => {
    if (!user?.id) {
      setVesselAssignments([]);
      return;
    }

    const fetchAssignments = async () => {
      try {
        const assignments = await getVesselAssignments(supabase, user.id);
        setVesselAssignments(assignments);
      } catch (error) {
        console.error('Error fetching vessel assignments:', error);
        setVesselAssignments([]);
      }
    };

    fetchAssignments();
  }, [user?.id, supabase]);

  // Helper function to find which vessel a date belongs to based on assignments
  const findVesselForDate = useCallback((date: Date): { vessel: Vessel | null; assignment: VesselAssignment | null } => {
    if (!vessels || !vesselAssignments.length) {
      return { vessel: null, assignment: null };
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());

    // Find the assignment that contains this date
    for (const assignment of vesselAssignments) {
      const assignmentStart = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
      const assignmentEnd = assignment.endDate
        ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
        : null;

      // Check if date is within this assignment period [start_date, end_date)
      const isAfterOrEqualStart = !isBefore(dateObj, assignmentStart);
      const isBeforeEnd = !assignmentEnd || isBefore(dateObj, assignmentEnd);

      if (isAfterOrEqualStart && isBeforeEnd) {
        const vessel = vessels.find(v => v.id === assignment.vesselId);
        return { vessel: vessel || null, assignment };
      }
    }

    return { vessel: null, assignment: null };
  }, [vessels, vesselAssignments]);

  // Create a map of date to state for quick lookup
  // If multiple logs exist for the same date (from different vessels),
  // prioritize the log from the vessel that the date belongs to according to assignments
  const stateLogMap = useMemo(() => {
    const map = new Map<string, DailyStatus>();
    
    // Group logs by date
    const logsByDate = new Map<string, StateLog[]>();
    stateLogs.forEach(log => {
      if (!logsByDate.has(log.date)) {
        logsByDate.set(log.date, []);
      }
      logsByDate.get(log.date)!.push(log);
    });
    
    // For each date, determine which log to use
    logsByDate.forEach((logs, dateStr) => {
      if (logs.length === 1) {
        // Only one log for this date, use it
        map.set(dateStr, logs[0].state);
      } else {
        // Multiple logs for this date - find which vessel this date belongs to
        const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
        const { vessel } = findVesselForDate(dateObj);
        
        if (vessel) {
          // Find the log from the correct vessel
          const correctLog = logs.find(log => log.vesselId === vessel.id);
          if (correctLog) {
            map.set(dateStr, correctLog.state);
          } else {
            // Fallback to first log if no match found
            map.set(dateStr, logs[0].state);
          }
        } else {
          // No vessel found for this date, use first log
          map.set(dateStr, logs[0].state);
        }
      }
    });
    
    return map;
  }, [stateLogs, vesselAssignments, vessels, findVesselForDate]);

  // Calculate standby periods to identify standby dates
  const { standbyPeriods } = useMemo(() => {
    if (!stateLogs || stateLogs.length === 0) {
      return { standbyPeriods: [] };
    }
    const result = calculateStandbyDays(stateLogs);
    return { standbyPeriods: result.standbyPeriods };
  }, [stateLogs]);

  // Create a Set of dates that are counted as standby (for visual differentiation)
  const standbyDatesSet = useMemo(() => {
    const dates = new Set<string>();
    standbyPeriods.forEach(period => {
      // Only include dates that are actually counted (within the allowed limit)
      // period.startDate is already a Date object from calculateStandbyDays
      const startDate = period.startDate instanceof Date 
        ? period.startDate 
        : new Date(period.startDate);
      const countedDays = period.countedDays;
      for (let i = 0; i < countedDays; i++) {
        const date = addDays(startDate, i);
        dates.add(format(date, 'yyyy-MM-dd'));
      }
    });
    return dates;
  }, [standbyPeriods]);

  // Also create a set for all potential standby states (in-port, at-anchor) for visual indication
  const standbyStateDatesSet = useMemo(() => {
    const dates = new Set<string>();
    stateLogs.forEach(log => {
      if (log.state === 'in-port' || log.state === 'at-anchor') {
        dates.add(log.date);
      }
    });
    return dates;
  }, [stateLogs]);

  // Get list of vessels user has logged time on
  const vesselsWithLogs = useMemo(() => {
    if (!vessels || !vesselAssignments.length) return [];
    const vesselIds = new Set(vesselAssignments.map(a => a.vesselId));
    return vessels.filter(v => vesselIds.has(v.id));
  }, [vessels, vesselAssignments]);

  // Get all months for the selected year
  const yearStart = startOfYear(new Date(selectedYear, 0, 1));
  const yearEnd = endOfYear(new Date(selectedYear, 11, 31));
  const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });
  
  // Get current year for navigation restrictions
  const currentYear = new Date().getFullYear();
  const isCurrentYear = selectedYear >= currentYear;

  // Helper function to validate if a date is within valid vessel assignment period
  const isDateValidForStateChange = (date: Date): { valid: boolean; reason?: string; vessel?: Vessel } => {
    if (!user?.id) {
      return { valid: false, reason: 'You must be logged in.' };
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());

    // Find which vessel this date belongs to
    const { vessel, assignment } = findVesselForDate(date);

    if (!vessel || !assignment) {
      return {
        valid: false,
        reason: 'This date is not within any of your vessel assignment periods.',
      };
    }

    // For vessel accounts, allow editing from the vessel's start_date (if set) or vessel creation date
    if (userProfile?.role === 'vessel') {
      // Check if user has a start_date set
      const userStartDate = userProfile?.startDate 
        ? startOfDay(new Date(userProfile.startDate))
        : null;
      
      // Fallback to vessel created_at date if start_date is not set
      let earliestAllowedDate: Date | null = userStartDate;
      if (!earliestAllowedDate) {
        const vesselData = vessels?.find(v => v.id === vessel.id);
        if (vesselData && (vesselData as any).created_at) {
          earliestAllowedDate = startOfDay(new Date((vesselData as any).created_at));
        }
      }

      if (earliestAllowedDate && isBefore(dateObj, earliestAllowedDate)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(earliestAllowedDate, 'MMM d, yyyy')}${userStartDate ? ' (your official start date)' : ' (vessel launch date)'}.`,
          vessel,
        };
      }
      // No end date restriction for vessel accounts - they can edit any date from start to present
      return { valid: true, vessel };
    }

    // Check if date falls within the assignment period
    // Note: end_date is exclusive '[)' - meaning if end_date = 2025-01-10, 
    // valid dates are < 2025-01-10 (through 2025-01-09 inclusive)
    const assignmentStart = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
    const assignmentEnd = assignment.endDate
      ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
      : null;

    // Check if date is within this assignment period [start_date, end_date)
    // date >= start_date AND (end_date is null OR date < end_date)
    const isAfterOrEqualStart = !isBefore(dateObj, assignmentStart);
    const isBeforeEnd = !assignmentEnd || isBefore(dateObj, assignmentEnd);

    if (isAfterOrEqualStart && isBeforeEnd) {
      return { valid: true, vessel };
    }

    // Date is outside the assignment period
    if (isBefore(dateObj, assignmentStart)) {
      return {
        valid: false,
        reason: `You cannot change states before ${format(assignmentStart, 'MMM d, yyyy')} (when you joined this vessel).`,
        vessel,
      };
    }

    // end_date is exclusive, so if end_date = 2025-01-10, dates >= 2025-01-10 are invalid
    if (assignmentEnd && !isBefore(dateObj, assignmentEnd)) {
      return {
        valid: false,
        reason: `You cannot change states on or after ${format(assignmentEnd, 'MMM d, yyyy')} (when you left this vessel). Join a new vessel to continue logging.`,
        vessel,
      };
    }

    return { valid: false, reason: 'This date is not within your vessel assignment period.', vessel };
  };

  const handleDateClick = (date: Date) => {
    // Validate the date is within a vessel assignment period
    const validation = isDateValidForStateChange(date);
    if (!validation.valid) {
      toast({
        title: 'Invalid Date',
        description: validation.reason || 'You cannot change the state for this date.',
        variant: 'destructive',
      });
      return;
    }
    
    // For approved captains viewing vessel account logs, prevent editing
    if (vesselAccountUserId) {
      toast({
        title: 'View Only',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'default',
      });
      return;
    }
    
    // Check if date is in the future
    const today = startOfDay(new Date());
    const clickedDate = startOfDay(date);
    
    if (isAfter(clickedDate, today)) {
      toast({
        title: 'Future Date',
        description: 'You cannot update future dates.',
        variant: 'destructive',
      });
      return;
    }
    
    if (selectionMode === 'single') {
      // Single date selection
      setSelectedDate(date);
      const dateKey = format(date, 'yyyy-MM-dd');
      const existingState = stateLogMap.get(dateKey);
      setSelectedState(existingState || null);
      setDateRange(undefined);
      setIsDialogOpen(true);
    } else {
      // Range selection mode
      if (!dateRange?.from || (dateRange.from && dateRange.to)) {
        // Start new range - check if date is in future
        const today = startOfDay(new Date());
        const clickedDate = startOfDay(date);
        
        if (isAfter(clickedDate, today)) {
          toast({
            title: 'Future Date',
            description: 'You cannot start a range with a future date.',
            variant: 'destructive',
          });
          return;
        }

        // Validate date is within valid vessel assignment period
        const validation = isDateValidForStateChange(date);
        if (!validation.valid) {
          toast({
            title: 'Invalid Date',
            description: validation.reason || 'You cannot change the state for this date.',
            variant: 'destructive',
          });
          return;
        }
        
        // Start new range
        setDateRange({ from: date, to: undefined });
      } else if (dateRange.from && !dateRange.to) {
        // Check if clicking the same date (cancel range selection)
        if (format(date, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd')) {
          setDateRange(undefined);
          return;
        }
        
        // Complete the range
        const from = dateRange.from;
        const to = date;
        
        // Ensure from is before to
        let start = from < to ? from : to;
        let end = from < to ? to : from;
        
        // Restrict end date to today if it's in the future
        const today = startOfDay(new Date());
        if (isAfter(end, today)) {
          end = today;
          toast({
            title: 'Range Adjusted',
            description: 'The range end date has been adjusted to today. You cannot select future dates.',
            variant: 'default',
          });
        }
        
        // Restrict start date to today if it's in the future (shouldn't happen, but just in case)
        if (isAfter(start, today)) {
          start = today;
        }

        // Validate both start and end dates are within valid vessel assignment period
        const startValidation = isDateValidForStateChange(start);
        if (!startValidation.valid) {
          toast({
            title: 'Invalid Range Start',
            description: startValidation.reason || 'The start date is not valid for state changes.',
            variant: 'destructive',
          });
          setDateRange({ from: start, to: undefined });
          return;
        }

        const endValidation = isDateValidForStateChange(end);
        if (!endValidation.valid) {
          toast({
            title: 'Invalid Range End',
            description: endValidation.reason || 'The end date is not valid for state changes.',
            variant: 'destructive',
          });
          setDateRange({ from: start, to: undefined });
          return;
        }
        
        setDateRange({ from: start, to: end });
        setSelectedDate(null);
        setSelectedState(null);
        setIsDialogOpen(true);
      }
    }
  };

  const handleStateChange = async (state: DailyStatus) => {
    if (!user?.id) return;

    setIsSaving(true);

    try {
      // Group logs by vessel
      const logsByVessel = new Map<string, Array<{ date: string; state: DailyStatus }>>();
      
      if (dateRange?.from && dateRange?.to) {
        // Range update
        const today = startOfDay(new Date());
        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        
        for (const day of interval) {
          const dayStart = startOfDay(day);
          // Filter out future dates
          if (isAfter(dayStart, today)) continue;
          
          // Validate each date and find which vessel it belongs to
          const validation = isDateValidForStateChange(day);
          if (!validation.valid || !validation.vessel) continue;
          
          const dateKey = format(day, 'yyyy-MM-dd');
          const vesselId = validation.vessel.id;
          
          if (!logsByVessel.has(vesselId)) {
            logsByVessel.set(vesselId, []);
          }
          logsByVessel.get(vesselId)!.push({ date: dateKey, state });
        }
        
        if (logsByVessel.size === 0) {
          toast({
            title: 'Invalid Range',
            description: 'No valid dates in the selected range. Dates may be outside your vessel assignment periods or in the future.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else if (selectedDate) {
        // Single date update - validate one more time before saving
        const validation = isDateValidForStateChange(selectedDate);
        if (!validation.valid || !validation.vessel) {
          toast({
            title: 'Invalid Date',
            description: validation.reason || 'You cannot change the state for this date.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        logsByVessel.set(validation.vessel.id, [{ date: dateKey, state }]);
      } else {
        setIsSaving(false);
        return;
      }

      // For approved captains viewing vessel account logs, they should not be able to edit
      if (vesselAccountUserId) {
        toast({
          title: 'Cannot Edit',
          description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }
      
      // Update logs for each vessel
      for (const [vesselId, logs] of logsByVessel.entries()) {
        await updateStateLogsBatch(supabase, user.id, vesselId, logs);
      }
      
      // Refresh all state logs
      const allLogs: StateLog[] = [];
      for (const vesselId of logsByVessel.keys()) {
        const logs = await getVesselStateLogs(supabase, vesselId, user.id);
        allLogs.push(...logs);
      }
      
      // Remove duplicates
      const uniqueLogs = Array.from(
        new Map(allLogs.map(log => [`${log.date}-${log.vesselId}`, log])).values()
      );
      
      setStateLogs(uniqueLogs);
      
      setIsDialogOpen(false);
      setDateRange(undefined);
      setSelectedDate(null);
      
      const stateLabel = vesselStates.find(s => s.value === state)?.label || state;
      
      if (dateRange?.from && dateRange?.to) {
        // Calculate total days from all vessels
        let totalDays = 0;
        for (const vesselLogs of logsByVessel.values()) {
          totalDays += vesselLogs.length;
        }
        toast({
          title: 'States Updated',
          description: `${totalDays} day${totalDays > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) updated to ${stateLabel}.`,
        });
      } else {
        toast({
          title: 'State Updated',
          description: `${format(selectedDate!, 'MMM d, yyyy')} has been updated to ${stateLabel}.`,
        });
      }
    } catch (error) {
      console.error('Error updating state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update state.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderMonth = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const firstDayOfMonth = getDay(monthStart);
    const daysInMonth = getDaysInMonth(month);
    
    // Calculate state counts for this month
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
    
    const monthStateCounts: Record<string, number> = {
      underway: 0,
      'at-anchor': 0,
      'in-port': 0,
      'on-leave': 0,
      'in-yard': 0,
      standby: 0,
    };
    
    // Count states for this month
    stateLogs.forEach(log => {
      if (log.date >= monthStartStr && log.date <= monthEndStr) {
        if (log.state in monthStateCounts) {
          monthStateCounts[log.state as keyof typeof monthStateCounts]++;
        }
      }
    });
    
    // Count standby days for this month
    standbyDatesSet.forEach(dateStr => {
      if (dateStr >= monthStartStr && dateStr <= monthEndStr) {
        monthStateCounts.standby++;
      }
    });
    
    // Generate calendar grid - start from Sunday
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Add all days in the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(month.getFullYear(), month.getMonth(), i));
    }

    return (
      <Card key={month.toISOString()} className="rounded-xl border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">
            {format(month, 'MMMM yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col pb-6">
          <div className="flex-1 space-y-1">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }
                
                const dateKey = format(day, 'yyyy-MM-dd');
                const state = stateLogMap.get(dateKey);
                const stateInfo = state ? vesselStates.find(s => s.value === state) : null;
                const isCurrentDay = isToday(day);
                const isCurrentMonth = isSameMonth(day, month);
                
                // Check if this date is a standby date (in-port or at-anchor state)
                const isStandbyState = standbyStateDatesSet.has(dateKey);
                const isCountedStandby = standbyDatesSet.has(dateKey);
                
                // Check if date is in selected range
                let isInRange = false;
                let isRangeStart = false;
                let isRangeEnd = false;
                if (dateRange?.from && dateRange?.to) {
                  const dayStart = startOfDay(day);
                  const rangeStart = startOfDay(dateRange.from);
                  const rangeEnd = endOfDay(dateRange.to);
                  
                  isInRange = isWithinInterval(dayStart, { start: rangeStart, end: rangeEnd });
                  isRangeStart = format(dayStart, 'yyyy-MM-dd') === format(rangeStart, 'yyyy-MM-dd');
                  isRangeEnd = format(dayStart, 'yyyy-MM-dd') === format(rangeEnd, 'yyyy-MM-dd');
                } else if (dateRange?.from && !dateRange?.to) {
                  // Only start is selected
                  isRangeStart = format(day, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd');
                }
                
                // Check if date is in the future
                const today = startOfDay(new Date());
                const dayStart = startOfDay(day);
                const isFuture = isAfter(dayStart, today);

                // Determine styling for standby dates with diagonal split
                let standbyStyle: React.CSSProperties = {};
                let backgroundStyle: React.CSSProperties | undefined = undefined;
                
                if (isCountedStandby && stateInfo) {
                  // Only apply diagonal split to dates that are counted as standby
                  // Standby color - using a distinct purple for counted standby
                  const standbyColor = 'rgba(139, 92, 246, 0.85)'; // Purple for counted standby
                  
                  // Create diagonal split: 70% state color, 30% standby color
                  // Using linear gradient at 135 degrees (diagonal from top-left to bottom-right)
                  const stateColor = stateInfo.color;
                  backgroundStyle = {
                    background: `linear-gradient(135deg, ${stateColor} 0%, ${stateColor} 70%, ${standbyColor} 70%, ${standbyColor} 100%)`,
                  };
                  
                  // No border, just the diagonal split
                  standbyStyle = {};
                } else if (isCountedStandby && !stateInfo) {
                  // Counted standby but no state color (edge case - shouldn't happen normally)
                  backgroundStyle = {
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                  };
                  standbyStyle = {};
                }

                // Build tooltip content
                const tooltipContent = (
                  <div className="space-y-1.5 text-sm">
                    <div className="font-semibold">{format(day, 'EEEE, MMMM d, yyyy')}</div>
                    {isFuture ? (
                      <div className="text-muted-foreground">Future date - cannot be updated</div>
                    ) : stateInfo ? (
                      <>
                        <div className="flex items-center gap-2">
                          <stateInfo.icon className="h-4 w-4" style={{ color: stateInfo.color }} />
                          <span className="font-medium">{stateInfo.label}</span>
                        </div>
                        {isCountedStandby && (
                          <div className="flex items-center gap-2 text-purple-400">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Counted as Standby</span>
                          </div>
                        )}
                        {currentVessel && (
                          <div className="text-muted-foreground text-xs pt-1 border-t border-border/50">
                            Vessel: {currentVessel.name}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-muted-foreground">No state logged</div>
                    )}
                    {isCurrentDay && (
                      <div className="text-xs text-primary font-medium pt-1 border-t border-border/50">Today</div>
                    )}
                  </div>
                );

                return (
                  <Tooltip key={dateKey}>
                    <TooltipTrigger asChild>
                      <div className="aspect-square">
                  <button
                    onClick={() => handleDateClick(day)}
                    disabled={isFuture}
                    className={cn(
                            "w-full h-full rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                      !isFuture && "hover:scale-105 hover:shadow-md",
                      !isCurrentMonth && "opacity-40",
                      isFuture && "opacity-30 cursor-not-allowed",
                      isCurrentDay && !isInRange && "ring-2 ring-primary ring-offset-2",
                      isInRange && "ring-2 ring-primary/50",
                      (isRangeStart || isRangeEnd) && "ring-2 ring-primary ring-offset-1",
                      stateInfo 
                        ? "text-white" 
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                    style={
                      backgroundStyle
                        ? { ...standbyStyle, ...backgroundStyle }
                        : stateInfo 
                          ? { ...standbyStyle, backgroundColor: stateInfo.color } 
                          : isInRange 
                            ? { backgroundColor: 'hsl(var(--primary) / 0.15)', ...standbyStyle } 
                            : standbyStyle
                    }
                  >
                    <div className="flex flex-col items-center justify-center h-full relative">
                      <span className="relative z-10 text-center">{format(day, 'd')}</span>
                      {/* State icon in top-left corner (only for counted standby dates) */}
                      {isCountedStandby && stateInfo && (
                        <stateInfo.icon className="absolute top-1.5 left-1.5 h-2 w-2 opacity-90 z-10" />
                      )}
                      {/* State icon centered (for non-standby dates) */}
                      {!isCountedStandby && stateInfo && (
                        <stateInfo.icon className="h-2 w-2 mt-0.5 opacity-90 relative z-10" />
                      )}
                      {/* Standby icon in bottom-right corner (only for counted standby dates) */}
                      {isCountedStandby && (
                        <Clock className="absolute bottom-1.5 right-1.5 h-2 w-2 opacity-90 z-10" />
                      )}
                    </div>
                  </button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {tooltipContent}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
          
          {/* Month Summary Section */}
          <Separator className="mt-6 mb-4" />
          <div className="grid grid-cols-3 gap-3 text-sm">
            {vesselStates.map((state) => {
              const count = monthStateCounts[state.value] || 0;
              const StateIcon = state.icon;
              return (
                <div 
                  key={state.value} 
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ backgroundColor: state.bgColor }}
                >
                  <StateIcon className="h-4 w-4" style={{ color: state.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-muted-foreground truncate">{state.label}</div>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
            <div 
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ backgroundColor: 'hsla(271, 70%, 50%, 0.15)' }}
            >
              <Clock className="h-4 w-4 text-purple-600" />
              <div className="flex-1 min-w-0">
                <div className="text-muted-foreground truncate">Standby</div>
              </div>
              <span className="font-medium">{monthStateCounts.standby}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const isLoading = isLoadingProfile || isLoadingVessels || isLoadingLogs;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
              <p className="text-muted-foreground">
                View and manage your vessel states throughout the year.
              </p>
            </div>
          </div>
          <Separator />
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
              <p className="text-muted-foreground">
                View and manage your vessel states throughout the year. Click on any date to change its state, or use range mode to select multiple dates at once.
              </p>
          </div>
        </div>
        <Separator />
      </div>

      {/* Year Navigation and Mode Toggle */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-xl border">
          <CardContent className="flex items-center justify-between py-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear - 1)}
              className="rounded-xl"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <h2 className="text-2xl font-bold">{selectedYear}</h2>
              <p className="text-sm text-muted-foreground">
                {currentVessel 
                  ? currentVessel.name 
                  : vesselsWithLogs.length > 0 
                    ? `${vesselsWithLogs.length} vessel${vesselsWithLogs.length > 1 ? 's' : ''}`
                    : 'All Vessels'}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear + 1)}
              disabled={isCurrentYear}
              className="rounded-xl"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        
        <Card className="rounded-xl border">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Selection Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant={selectionMode === 'single' ? 'default' : 'outline'}
                onClick={() => {
                  setSelectionMode('single');
                  setDateRange(undefined);
                  setSelectedDate(null);
                }}
                className="rounded-xl flex-1"
              >
                <MousePointer2 className="mr-2 h-4 w-4" />
                Single Date
              </Button>
              <Button
                variant={selectionMode === 'range' ? 'default' : 'outline'}
                onClick={() => {
                  setSelectionMode('range');
                  setSelectedDate(null);
                  setDateRange(undefined);
                }}
                className="rounded-xl flex-1"
              >
                <BoxSelect className="mr-2 h-4 w-4" />
                Date Range
              </Button>
            </div>
            {selectionMode === 'range' && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Click a date to start the range, then click another date to complete it.
                </p>
                {dateRange?.from && !dateRange?.to && (
                  <p className="text-xs text-primary font-medium">
                    Range started: {format(dateRange.from, 'MMM d, yyyy')}. Click another date to complete.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle className="text-sm font-medium">State Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {vesselStates.map((state) => {
              const StateIcon = state.icon;
              return (
                <div key={state.value} className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: state.color }}
                  >
                    <StateIcon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium">{state.label}</span>
                </div>
              );
            })}
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div 
                  className="h-8 w-8 rounded relative"
                  style={{
                    background: `linear-gradient(135deg, hsl(var(--chart-orange)) 0%, hsl(var(--chart-orange)) 70%, rgba(139, 92, 246, 0.85) 70%, rgba(139, 92, 246, 0.85) 100%)`
                  }}
                >
                  <Anchor className="absolute top-1.5 left-1.5 h-2 w-2 opacity-90" />
                  <Clock className="absolute bottom-1.5 right-1.5 h-2 w-2 opacity-90" />
                </div>
                <span>Counted as Standby (state icon top-left, standby icon bottom-right)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Only dates that count toward standby days are marked with the diagonal split and icons in corners.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid - 3 columns on large screens, 2 on medium, 1 on small */}
      <TooltipProvider delayDuration={100}>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {months.map(renderMonth)}
      </div>
      </TooltipProvider>

      {/* State Change Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          // Reset selection when dialog closes
          if (selectionMode === 'range') {
            setDateRange(undefined);
          } else {
            setSelectedDate(null);
          }
        }
      }}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {dateRange?.from && dateRange?.to
                ? `Change State for ${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                : selectedDate
                ? `Change State for ${format(selectedDate, 'MMMM d, yyyy')}`
                : 'Change State'}
            </DialogTitle>
            {dateRange?.from && dateRange?.to && (
              <p className="text-sm text-muted-foreground mt-1">
                {eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length} day{eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length > 1 ? 's' : ''} selected
              </p>
            )}
          </DialogHeader>
          <div className="py-4">
            <RadioGroup
              value={selectedState || undefined}
              onValueChange={(value) => setSelectedState(value as DailyStatus)}
              className="space-y-3"
            >
              {vesselStates.map((state) => {
                const StateIcon = state.icon;
                return (
                  <div key={state.value} className="flex items-center space-x-3">
                    <RadioGroupItem value={state.value} id={state.value} />
                    <Label
                      htmlFor={state.value}
                      className="flex items-center gap-3 flex-1 cursor-pointer py-2 px-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div
                        className="h-8 w-8 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: state.color }}
                      >
                        <StateIcon className="h-4 w-4 text-white" />
                      </div>
                      <span className="font-medium">{state.label}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                if (selectionMode === 'range') {
                  setDateRange(undefined);
                } else {
                  setSelectedDate(null);
                }
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedState && handleStateChange(selectedState)}
              disabled={!selectedState || isSaving}
              className="rounded-xl"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

