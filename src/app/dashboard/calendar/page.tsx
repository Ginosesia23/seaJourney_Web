'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth, getDay, isSameMonth, isToday, isWithinInterval, startOfDay, endOfDay, isAfter, isBefore, parse, addDays } from 'date-fns';
import { Calendar as CalendarIcon, Waves, Anchor, Building, Briefcase, Ship, Wrench, ChevronLeft, ChevronRight, Loader2, MousePointer2, BoxSelect, CheckSquare, Clock, User, XCircle } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselStateLogs, updateStateLogsBatch, getVesselAssignments, deleteStateLogsForDates, getPassageLogs, createPassageLog } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Vessel, StateLog, DailyStatus, VesselAssignment } from '@/lib/types';
import { calculateStandbyDays } from '@/lib/standby-calculation';

const vesselStates: { value: DailyStatus; label: string; color: string; icon: React.FC<any> }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: Briefcase },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Wrench },
];

// Helper function to get CSS variable name for a state
const getStateColorVar = (state: DailyStatus): string => {
  const colorMap: Record<DailyStatus, string> = {
    'underway': 'chart-blue',
    'at-anchor': 'chart-orange',
    'in-port': 'chart-green',
    'on-leave': 'chart-gray',
    'in-yard': 'chart-red',
  };
  return colorMap[state];
};

export default function CalendarPage() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedState, setSelectedState] = useState<DailyStatus | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stateLogs, setStateLogs] = useState<StateLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'single' | 'range' | 'multi'>('single');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [multiSelectedDates, setMultiSelectedDates] = useState<Set<string>>(new Set());
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
  const [isPartOfActivePassageInDialog, setIsPartOfActivePassageInDialog] = useState<boolean>(false);
  const [isWatchInDialog, setIsWatchInDialog] = useState<boolean>(false);
  const [notesInDialog, setNotesInDialog] = useState<string>('');
  const [watchDates, setWatchDates] = useState<Set<string>>(new Set());
  
  // View mode for captains: 'personal' (their own sea time) or 'vessel' (vessel's sea time)
  const [captainViewMode, setCaptainViewMode] = useState<'personal' | 'vessel'>('personal');

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

  // Check if user is captain
  const isCaptain = useMemo(() => {
    return userProfile?.role === 'captain';
  }, [userProfile?.role]);

  // Check if user is an officer (rank or higher)
  const isOfficer = useMemo(() => {
    if (!userProfile) return false;
    const position = (userProfile.position || '').toLowerCase();
    const role = (userProfile.role || '').toLowerCase();
    
    // Officers include: Captain, Chief Officer, First Officer, First Mate, Second Officer, Third Officer, OOW, Deck Officer
    // Also Chief Engineer, First Engineer, Second Engineer, Third Engineer, Fourth Engineer
    const officerPositions = [
      'captain', 'master', 'chief officer', 'first officer', 'first mate', 
      'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
      'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
    ];
    
    return role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
  }, [userProfile]);

  // Check if user is a vessel account (vessel accounts don't show standby - they only show official states)
  const isVesselAccount = useMemo(() => {
    if (!userProfile) return false;
    const role = (userProfile.role || '').toLowerCase();
    return role === 'vessel';
  }, [userProfile]);

  // Fetch watch logs for the user (officers only)
  useEffect(() => {
    const fetchWatchLogs = async () => {
      if (!user?.id || !isOfficer) {
        setWatchDates(new Set());
        return;
      }

      try {
        const { data: watchLogs, error } = await supabase
          .from('watch_logs')
          .select('watch_start')
          .eq('user_id', user.id);

        if (error) throw error;

        // Extract dates from watch logs (watch_start timestamps)
        const dates = new Set<string>();
        if (watchLogs) {
          watchLogs.forEach(log => {
            const dateStr = format(new Date(log.watch_start), 'yyyy-MM-dd');
            dates.add(dateStr);
          });
        }
        setWatchDates(dates);
      } catch (error) {
        console.error('Error fetching watch logs:', error);
        setWatchDates(new Set());
      }
    };

    fetchWatchLogs();
  }, [user?.id, isOfficer, supabase]);

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
  const [isApprovedCaptain, setIsApprovedCaptain] = useState(false);
  
  useEffect(() => {
    const checkCaptaincyAndFindVesselAccount = async () => {
      if (!currentVessel || !user?.id) {
        setVesselAccountUserId(null);
        setIsApprovedCaptain(false);
        return;
      }

      // Only check for captains
      if (userProfile?.role !== 'captain') {
        setVesselAccountUserId(null);
        setIsApprovedCaptain(false);
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
          setIsApprovedCaptain(false);
          return;
        }

        // User is an approved captain
        setIsApprovedCaptain(true);

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
        setIsApprovedCaptain(false);
      }
    };

    checkCaptaincyAndFindVesselAccount();
  }, [currentVessel?.id, user?.id, userProfile?.role, supabase]);

  // Reset view mode to 'personal' if user is no longer an approved captain
  useEffect(() => {
    if (!isApprovedCaptain && captainViewMode === 'vessel') {
      setCaptainViewMode('personal');
    }
  }, [isApprovedCaptain, captainViewMode]);

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

          // For captains: check view mode to determine which logs to fetch
      let userIdToFetch: string | undefined = user.id;
      
      if (userProfile?.role === 'captain' && captainViewMode === 'vessel') {
        // Captain wants to see vessel logs - check if they have approved captaincy
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
          } else {
            // No approved captaincy - fall back to personal logs
            userIdToFetch = user.id;
          }
        } catch (e) {
              console.error('[CALENDAR PAGE] Error checking captaincy for vessel:', vesselId, e);
              // On error, fall back to personal logs
              userIdToFetch = user.id;
            }
      } else {
        // Personal view mode or not a captain - always fetch personal logs
        userIdToFetch = user.id;
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
  }, [user?.id, vessels, vesselAssignments, userProfile?.role, captainViewMode, supabase]);

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

  // Map date -> vessel for the log displayed on that date (so tooltip shows correct vessel for past logs)
  const vesselForDisplayByDate = useMemo(() => {
    const out = new Map<string, Vessel | null>();
    if (!vessels?.length) return out;
    const logsByDate = new Map<string, StateLog[]>();
    stateLogs.forEach(log => {
      if (!logsByDate.has(log.date)) logsByDate.set(log.date, []);
      logsByDate.get(log.date)!.push(log);
    });
    logsByDate.forEach((logs, dateStr) => {
      let chosenLog: StateLog;
      if (logs.length === 1) {
        chosenLog = logs[0];
      } else {
        const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
        const { vessel } = findVesselForDate(dateObj);
        const correctLog = vessel ? logs.find(log => log.vesselId === vessel.id) : null;
        chosenLog = correctLog ?? logs[0];
      }
      const vessel = vessels.find(v => v.id === chosenLog.vesselId) ?? null;
      out.set(dateStr, vessel);
    });
    return out;
  }, [stateLogs, vessels, findVesselForDate]);

  // Calculate standby periods to identify standby dates
  // Extract part of active passage dates from state logs
  const partOfActivePassageDates = useMemo(() => {
    const dates = new Set<string>();
    if (stateLogs && stateLogs.length > 0) {
      stateLogs.forEach(log => {
        if (log.isPartOfActivePassage) {
          dates.add(log.date);
        }
      });
    }
    return dates;
  }, [stateLogs]);

  const { standbyPeriods } = useMemo(() => {
    if (!stateLogs || stateLogs.length === 0) {
      return { standbyPeriods: [] };
    }
    // Pass watchDates to exclude them from standby calculation
    const result = calculateStandbyDays(stateLogs, watchDates, partOfActivePassageDates);
    return { standbyPeriods: result.standbyPeriods };
  }, [stateLogs, watchDates, partOfActivePassageDates]);

  // Create a Set of dates that are counted as standby (for visual differentiation)
  // Exclude watch dates and part of active passage dates (these count as "at sea", not standby)
  const standbyDatesSet = useMemo(() => {
    const dates = new Set<string>();
    console.log('[CALENDAR] Building standby dates set from periods:', standbyPeriods.length);
    standbyPeriods.forEach((period, idx) => {
      // Only include dates that are actually counted (within the allowed limit)
      // period.startDate is already a Date object from calculateStandbyDays
      const startDate = period.startDate instanceof Date 
        ? period.startDate 
        : new Date(period.startDate);
      const periodEndDate = period.endDate instanceof Date
        ? period.endDate
        : new Date(period.endDate);
      const countedDays = period.countedDays;
      const periodDays = period.days;
      
      console.log(`[CALENDAR] Period ${idx + 1}: ${format(startDate, 'yyyy-MM-dd')} to ${format(periodEndDate, 'yyyy-MM-dd')}, period.days=${periodDays}, countedDays=${countedDays}, precedingVoyageDays=${period.precedingVoyageDays}`);
      
      if (countedDays > periodDays) {
        console.warn(`[CALENDAR] WARNING: countedDays (${countedDays}) > period.days (${periodDays}) for period ${idx + 1}`);
      }
      
      // Iterate through all days in the period, but only count non-watch, non-passage days
      let currentDate = startDate;
      let counted = 0;
      const maxCounted = countedDays;
      const periodDates: string[] = [];
      
      while (currentDate <= periodEndDate && counted < maxCounted) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const hasWatch = watchDates.has(dateStr);
        const isPartOfActivePassage = partOfActivePassageDates.has(dateStr);
        
        // Only add dates that are not watch days and not part of active passage
        if (!hasWatch && !isPartOfActivePassage) {
          dates.add(dateStr);
          periodDates.push(dateStr);
          counted++;
        }
        
        currentDate = addDays(currentDate, 1);
      }
      console.log(`[CALENDAR] Period ${idx + 1} counted dates: ${periodDates.join(', ')}`);
    });
    console.log(`[CALENDAR] Total standby dates in set: ${dates.size}`);
    return dates;
  }, [standbyPeriods, watchDates, partOfActivePassageDates]);

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

    // Normalize the input date to start of day for comparison
    const dateObj = startOfDay(date);

    // For vessel accounts, use the current vessel directly (no assignment check needed)
    if (userProfile?.role === 'vessel') {
      // Get the current vessel for this vessel account
      const vessel = currentVessel;
      
      if (!vessel) {
        return {
          valid: false,
          reason: 'No active vessel found. Please set an active vessel first.',
        };
      }

      // Check if user has a start_date set - this is the official start date for the vessel account
      let userStartDate: Date | null = null;
      if (userProfile?.startDate) {
        try {
          // Parse the start_date string (format: YYYY-MM-DD) and normalize to start of day
          userStartDate = startOfDay(parse(userProfile.startDate, 'yyyy-MM-dd', new Date()));
        } catch (e) {
          console.error('Error parsing start_date:', userProfile.startDate, e);
        }
      }
      
      // Use the official start_date as the earliest allowed date (priority over vessel creation date)
      let earliestAllowedDate: Date | null = userStartDate;
      
      // Fallback to vessel created_at date only if start_date is not set
      if (!earliestAllowedDate) {
        const vesselData = vessels?.find(v => v.id === vessel.id);
        if (vesselData && (vesselData as any).created_at) {
          earliestAllowedDate = startOfDay(new Date((vesselData as any).created_at));
        }
      }

      // Validate: date must be on or after the earliest allowed date
      // Use isBefore to check if date is BEFORE the earliest allowed date (invalid)
      // If date is equal to or after earliestAllowedDate, isBefore returns false (valid)
      if (earliestAllowedDate && isBefore(dateObj, earliestAllowedDate)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(earliestAllowedDate, 'MMM d, yyyy')}${userStartDate ? ' (your official start date)' : ' (vessel launch date)'}.`,
          vessel,
        };
      }

      // Check if date is in the future
      const today = startOfDay(new Date());
      if (isAfter(dateObj, today)) {
        return {
          valid: false,
          reason: 'You cannot change states for future dates.',
          vessel,
        };
      }

      // No end date restriction for vessel accounts - they can edit any date from start_date to present
      return { valid: true, vessel };
    }

    // For crew/captain accounts, check vessel assignments
    // Find which vessel this date belongs to
    const { vessel, assignment } = findVesselForDate(date);

    if (!vessel || !assignment) {
      return {
        valid: false,
        reason: 'This date is not within any of your vessel assignment periods.',
      };
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
    
    // For approved captains viewing vessel account logs (not their own), prevent editing
    // Only restrict editing when viewing vessel logs, not personal logs
    if (isCaptain && captainViewMode === 'vessel' && vesselAccountUserId) {
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
      // Check if this date is part of active passage
      setIsPartOfActivePassageInDialog(partOfActivePassageDates.has(dateKey));
      // Check if this date has a watch log (officers only)
      setIsWatchInDialog(isOfficer && watchDates.has(dateKey));
      // Load existing notes for this date
      const existingLog = stateLogs.find(log => log.date === dateKey);
      setNotesInDialog(existingLog?.notes || '');
      setDateRange(undefined);
      setMultiSelectedDates(new Set());
      setIsDialogOpen(true);
    } else if (selectionMode === 'multi') {
      // Multi selection: toggle this date
      const dateKey = format(date, 'yyyy-MM-dd');
      const today = startOfDay(new Date());
      const dayStart = startOfDay(date);
      if (isAfter(dayStart, today)) {
        toast({
          title: 'Future Date',
          description: 'You cannot select future dates.',
          variant: 'destructive',
        });
        return;
      }
      const validation = isDateValidForStateChange(date);
      if (!validation.valid) {
        toast({
          title: 'Invalid Date',
          description: validation.reason || 'You cannot select this date.',
          variant: 'destructive',
        });
        return;
      }
      setMultiSelectedDates(prev => {
        const next = new Set(prev);
        if (next.has(dateKey)) next.delete(dateKey);
        else next.add(dateKey);
        return next;
      });
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
        setMultiSelectedDates(new Set());
        setIsPartOfActivePassageInDialog(false); // Reset for range selection
        setIsWatchInDialog(false); // Reset for range selection (watch only applies to single dates)
        setNotesInDialog(''); // Reset notes for range selection
        setIsDialogOpen(true);
      }
    }
  };

  const openMultiSelectDialog = () => {
    if (multiSelectedDates.size === 0) return;
    setSelectedDate(null);
    setDateRange(undefined);
    setSelectedState(null);
    setIsPartOfActivePassageInDialog(false);
    setIsWatchInDialog(false);
    setNotesInDialog('');
    setIsDialogOpen(true);
  };

  const handleStateChange = async (state: DailyStatus | null) => {
    if (!user?.id) return;

    // If state is null, remove the state instead of setting it
    if (state === null) {
      await handleRemoveState();
      return;
    }

    setIsSaving(true);

    try {
      // Group logs by vessel
      const logsByVessel = new Map<string, Array<{ date: string; state: DailyStatus; is_part_of_active_passage?: boolean; notes?: string }>>();
      
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
          logsByVessel.get(vesselId)!.push({ date: dateKey, state, is_part_of_active_passage: isPartOfActivePassageInDialog, notes: notesInDialog.trim() || undefined });
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
      } else if (selectionMode === 'multi' && multiSelectedDates.size > 0) {
        // Multi selection update
        const today = startOfDay(new Date());
        const sortedDates = Array.from(multiSelectedDates).sort();
        for (const dateKey of sortedDates) {
          const day = parse(dateKey, 'yyyy-MM-dd', new Date());
          const dayStart = startOfDay(day);
          if (isAfter(dayStart, today)) continue;
          const validation = isDateValidForStateChange(day);
          if (!validation.valid || !validation.vessel) continue;
          const vesselId = validation.vessel.id;
          if (!logsByVessel.has(vesselId)) logsByVessel.set(vesselId, []);
          logsByVessel.get(vesselId)!.push({ date: dateKey, state, is_part_of_active_passage: isPartOfActivePassageInDialog, notes: notesInDialog.trim() || undefined });
        }
        if (logsByVessel.size === 0) {
          toast({
            title: 'Invalid Selection',
            description: 'No valid dates in the selection.',
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
        logsByVessel.set(validation.vessel.id, [{ date: dateKey, state, is_part_of_active_passage: isPartOfActivePassageInDialog, notes: notesInDialog.trim() || undefined }]);
      } else {
        setIsSaving(false);
        return;
      }

      // For captains viewing vessel logs (vessel view mode), they should not be able to edit
      if (isCaptain && captainViewMode === 'vessel') {
        toast({
          title: 'Cannot Edit',
          description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }
      
      // Handle watch logs for officers (only for single date, only when state is at-anchor)
      if (isOfficer && selectedDate && !dateRange) {
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        const validation = isDateValidForStateChange(selectedDate);
        if (validation.vessel) {
          const vesselId = validation.vessel.id;
          const dateStart = new Date(dateKey);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(dateKey);
          dateEnd.setHours(23, 59, 59, 999);
          
          if (isWatchInDialog && state === 'at-anchor') {
            // Create watch log if not exists
            if (!watchDates.has(dateKey)) {
              try {
                const { error: watchError } = await supabase
                  .from('watch_logs')
                  .insert({
                    user_id: user.id,
                    vessel_id: vesselId,
                    watch_start: dateStart.toISOString(),
                    watch_end: dateEnd.toISOString(),
                    watch_type: 'bridge', // Using 'bridge' for navigation watch
                  });

                if (watchError) {
                  console.error(`Error creating watch log for ${dateKey}:`, watchError);
                } else {
                  // Update watch dates set
                  setWatchDates(prev => new Set(prev).add(dateKey));
                }
              } catch (watchError) {
                console.error('Error creating watch log:', watchError);
              }
            }
          } else {
            // Remove watch log if exists
            if (watchDates.has(dateKey)) {
              try {
                const { error: watchError } = await supabase
                  .from('watch_logs')
                  .delete()
                  .eq('user_id', user.id)
                  .eq('vessel_id', vesselId)
                  .gte('watch_start', dateStart.toISOString())
                  .lte('watch_start', dateEnd.toISOString());

                if (watchError) {
                  console.error(`Error removing watch log for ${dateKey}:`, watchError);
                } else {
                  // Update watch dates set
                  setWatchDates(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(dateKey);
                    return newSet;
                  });
                }
              } catch (watchError) {
                console.error('Error removing watch log:', watchError);
              }
            }
          }
        }
      }
      
      // If state is changing away from "at-anchor", remove watch logs for affected dates (for range updates)
      if (state !== 'at-anchor' && dateRange) {
        const datesToCheck: string[] = [];
        for (const logs of logsByVessel.values()) {
          datesToCheck.push(...logs.map(log => log.date));
        }
        const datesWithWatch = datesToCheck.filter(date => watchDates.has(date));
        
        if (datesWithWatch.length > 0) {
          try {
            // Delete watch logs for all affected dates
            for (const dateStr of datesWithWatch) {
              const validation = isDateValidForStateChange(parse(dateStr, 'yyyy-MM-dd', new Date()));
              if (!validation.vessel) continue;
              
              const dateStart = new Date(dateStr);
              dateStart.setHours(0, 0, 0, 0);
              const dateEnd = new Date(dateStr);
              dateEnd.setHours(23, 59, 59, 999);
              
              const { error: watchError } = await supabase
                .from('watch_logs')
                .delete()
                .eq('user_id', user.id)
                .eq('vessel_id', validation.vessel.id)
                .gte('watch_start', dateStart.toISOString())
                .lte('watch_start', dateEnd.toISOString());

              if (watchError) {
                console.error(`Error removing watch log for ${dateStr}:`, watchError);
              }
            }
            
            // Update watch dates set
            setWatchDates(prev => {
              const newSet = new Set(prev);
              datesWithWatch.forEach(date => newSet.delete(date));
              return newSet;
            });
          } catch (watchError) {
            console.error('Error removing watch logs:', watchError);
          }
        }
      }
      
      // Update logs for each vessel
      for (const [vesselId, logs] of logsByVessel.entries()) {
        await updateStateLogsBatch(supabase, user.id, vesselId, logs);
      }

      // When setting to Underway: ensure a passage exists for this range so it shows in Passage Logbook
      let passageCreated = false;
      if (state === 'underway' && user.id) {
        try {
          const existingPassages = await getPassageLogs(supabase, user.id);
          for (const [vesselId, logs] of logsByVessel.entries()) {
            if (logs.length === 0) continue;
            const dates = logs.map((l) => l.date).sort();
            const rangeStart = startOfDay(parse(dates[0], 'yyyy-MM-dd', new Date()));
            const rangeEnd = endOfDay(parse(dates[dates.length - 1], 'yyyy-MM-dd', new Date()));
            const overlaps = existingPassages.some((p) => {
              if (p.vessel_id !== vesselId) return false;
              const pStart = new Date(p.start_time);
              const pEnd = new Date(p.end_time);
              return pStart <= rangeEnd && pEnd >= rangeStart;
            });
            if (!overlaps) {
              await createPassageLog(supabase, {
                crewId: user.id,
                vesselId,
                startTime: rangeStart,
                endTime: rangeEnd,
                departurePort: 'To be confirmed',
                arrivalPort: 'To be confirmed',
                source: 'calendar',
              });
              passageCreated = true;
            }
          }
        } catch (passageErr) {
          console.error('Error creating passage from calendar:', passageErr);
        }
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
      setMultiSelectedDates(new Set());
      setIsPartOfActivePassageInDialog(false);
      setIsWatchInDialog(false);
      setNotesInDialog('');
      
      const stateLabel = vesselStates.find(s => s.value === state)?.label || state;
      
      if (dateRange?.from && dateRange?.to) {
        let totalDays = 0;
        for (const vesselLogs of logsByVessel.values()) totalDays += vesselLogs.length;
        toast({
          title: 'States Updated',
          description: passageCreated
            ? `${totalDays} day${totalDays > 1 ? 's' : ''} updated to ${stateLabel}. A passage was added to the Passage Log Book—you can add ports and details there.`
            : `${totalDays} day${totalDays > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) updated to ${stateLabel}.`,
        });
      } else if (selectionMode === 'multi' && multiSelectedDates.size > 0) {
        let totalDays = 0;
        for (const vesselLogs of logsByVessel.values()) totalDays += vesselLogs.length;
        toast({
          title: 'States Updated',
          description: `${totalDays} day${totalDays > 1 ? 's' : ''} updated to ${stateLabel}.`,
        });
      } else {
        toast({
          title: 'State Updated',
          description: passageCreated
            ? `${format(selectedDate!, 'MMM d, yyyy')} updated to ${stateLabel}. A passage was added to the Passage Log Book—you can add ports and details there.`
            : `${format(selectedDate!, 'MMM d, yyyy')} has been updated to ${stateLabel}.`,
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

  const handleRemoveState = async () => {
    if (!user?.id) return;

    setIsSaving(true);

    try {
      // Group dates by vessel
      const datesByVessel = new Map<string, string[]>();
      
      if (dateRange?.from && dateRange?.to) {
        const today = startOfDay(new Date());
        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        for (const day of interval) {
          const dayStart = startOfDay(day);
          if (isAfter(dayStart, today)) continue;
          const validation = isDateValidForStateChange(day);
          if (!validation.valid || !validation.vessel) continue;
          const dateKey = format(day, 'yyyy-MM-dd');
          const vesselId = validation.vessel.id;
          if (!datesByVessel.has(vesselId)) datesByVessel.set(vesselId, []);
          datesByVessel.get(vesselId)!.push(dateKey);
        }
        if (datesByVessel.size === 0) {
          toast({
            title: 'Invalid Range',
            description: 'No valid dates in the selected range. Dates may be outside your vessel assignment periods or in the future.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else if (selectionMode === 'multi' && multiSelectedDates.size > 0) {
        const today = startOfDay(new Date());
        for (const dateKey of multiSelectedDates) {
          const day = parse(dateKey, 'yyyy-MM-dd', new Date());
          if (isAfter(day, today)) continue;
          const validation = isDateValidForStateChange(day);
          if (!validation.valid || !validation.vessel) continue;
          const vesselId = validation.vessel.id;
          if (!datesByVessel.has(vesselId)) datesByVessel.set(vesselId, []);
          datesByVessel.get(vesselId)!.push(dateKey);
        }
        if (datesByVessel.size === 0) {
          toast({
            title: 'Invalid Selection',
            description: 'No valid dates in the selection.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else if (selectedDate) {
        // Single date removal - validate one more time before deleting
        const validation = isDateValidForStateChange(selectedDate);
        if (!validation.valid || !validation.vessel) {
          toast({
            title: 'Invalid Date',
            description: validation.reason || 'You cannot remove the state for this date.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        datesByVessel.set(validation.vessel.id, [dateKey]);
      } else {
        setIsSaving(false);
        return;
      }

      // For captains viewing vessel logs (vessel view mode), they should not be able to edit
      if (isCaptain && captainViewMode === 'vessel') {
        toast({
          title: 'Cannot Edit',
          description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Remove watch logs for affected dates (if any)
      const datesToCheck: string[] = [];
      for (const dates of datesByVessel.values()) {
        datesToCheck.push(...dates);
      }
      const datesWithWatch = datesToCheck.filter(date => watchDates.has(date));
      
      if (datesWithWatch.length > 0) {
        try {
          // Delete watch logs for all affected dates
          for (const dateStr of datesWithWatch) {
            const validation = isDateValidForStateChange(parse(dateStr, 'yyyy-MM-dd', new Date()));
            if (!validation.vessel) continue;
            
            const dateStart = new Date(dateStr);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(dateStr);
            dateEnd.setHours(23, 59, 59, 999);
            
            const { error: watchError } = await supabase
              .from('watch_logs')
              .delete()
              .eq('user_id', user.id)
              .eq('vessel_id', validation.vessel.id)
              .gte('watch_start', dateStart.toISOString())
              .lte('watch_start', dateEnd.toISOString());

            if (watchError) {
              console.error(`Error removing watch log for ${dateStr}:`, watchError);
            }
          }
          
          // Update watch dates set
          setWatchDates(prev => {
            const newSet = new Set(prev);
            datesWithWatch.forEach(date => newSet.delete(date));
            return newSet;
          });
        } catch (watchError) {
          console.error('Error removing watch logs:', watchError);
        }
      }
      
      // Delete state logs for each vessel
      for (const [vesselId, dates] of datesByVessel.entries()) {
        await deleteStateLogsForDates(supabase, user.id, vesselId, dates);
      }
      
      // Refresh all state logs
      const allLogs: StateLog[] = [];
      for (const vesselId of datesByVessel.keys()) {
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
      setMultiSelectedDates(new Set());
      setIsPartOfActivePassageInDialog(false);
      setIsWatchInDialog(false);
      setNotesInDialog('');
      
      if (dateRange?.from && dateRange?.to) {
        let totalDays = 0;
        for (const dates of datesByVessel.values()) totalDays += dates.length;
        toast({
          title: 'States Removed',
          description: `${totalDays} day${totalDays > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) state${totalDays > 1 ? 's' : ''} removed.`,
        });
      } else if (selectionMode === 'multi' && multiSelectedDates.size > 0) {
        let totalDays = 0;
        for (const dates of datesByVessel.values()) totalDays += dates.length;
        toast({
          title: 'States Removed',
          description: `${totalDays} day${totalDays > 1 ? 's' : ''} removed.`,
        });
      } else {
        toast({
          title: 'State Removed',
          description: `${format(selectedDate!, 'MMM d, yyyy')} state has been removed.`,
        });
      }
    } catch (error) {
      console.error('Error removing state:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove state.',
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

    // Count part-of-passage days in this month (for vessel account summary)
    let monthPartOfPassageCount = 0;
    partOfActivePassageDates.forEach(dateStr => {
      if (dateStr >= monthStartStr && dateStr <= monthEndStr) monthPartOfPassageCount++;
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
                const displayVesselForDate = vesselForDisplayByDate.get(dateKey);
                const logsForDate = stateLogs.filter(log => log.date === dateKey);
                const existingLog =
                  logsForDate.length === 0
                    ? undefined
                    : logsForDate.length === 1
                      ? logsForDate[0]
                      : displayVesselForDate
                        ? logsForDate.find(log => log.vesselId === displayVesselForDate.id) ?? logsForDate[0]
                        : logsForDate[0];
                const notes = existingLog?.notes;
                const isCurrentDay = isToday(day);
                const isCurrentMonth = isSameMonth(day, month);
                
                // Check if date is in the future
                const today = startOfDay(new Date());
                const dayStart = startOfDay(day);
                const isFuture = isAfter(dayStart, today);
                
                // Check if this date is within a vessel assignment range but has no state logged
                const { vessel: dateVessel, assignment: dateAssignment } = findVesselForDate(day);
                const isInAssignmentRange = !!dateAssignment && !isFuture;
                const hasNoState = !stateInfo;
                const isAssignableDate = isInAssignmentRange && hasNoState;
                
                // Check if this date is a standby date (in-port or at-anchor state)
                const isStandbyState = standbyStateDatesSet.has(dateKey);
                const isPartOfActivePassage = partOfActivePassageDates.has(dateKey);
                const hasWatch = watchDates.has(dateKey);
                const isCountedStandby = standbyDatesSet.has(dateKey) && !isPartOfActivePassage && !hasWatch;
                
                // Check if date is in selected range
                let isInRange = false;
                let isRangeStart = false;
                let isRangeEnd = false;
                let isRangeStartOnly = false; // When only start date is selected (no end date yet)
                if (dateRange?.from && dateRange?.to) {
                  const dayStartForRange = startOfDay(day);
                  const rangeStart = startOfDay(dateRange.from);
                  const rangeEnd = endOfDay(dateRange.to);
                  
                  isInRange = isWithinInterval(dayStartForRange, { start: rangeStart, end: rangeEnd });
                  isRangeStart = format(dayStartForRange, 'yyyy-MM-dd') === format(rangeStart, 'yyyy-MM-dd');
                  isRangeEnd = format(dayStartForRange, 'yyyy-MM-dd') === format(rangeEnd, 'yyyy-MM-dd');
                } else if (dateRange?.from && !dateRange?.to) {
                  // Only start is selected - show visual indication
                  isRangeStartOnly = format(day, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd');
                  isRangeStart = isRangeStartOnly;
                }
                const isInMultiSelect = selectionMode === 'multi' && multiSelectedDates.has(dateKey);

                // Standby dates use purple border outline (same as current page)

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
                        {hasWatch && (
                          <div className="flex items-center gap-2 text-black dark:text-white">
                            <Clock className="h-3.5 w-3.5" />
                            <span>On Watch (Counts as At Sea)</span>
                          </div>
                        )}
                        {isPartOfActivePassage && !hasWatch && (
                          <div className="flex items-center gap-2 text-blue-800">
                            <Ship className="h-3.5 w-3.5" />
                            <span>Part of Active Passage (Counts as At Sea)</span>
                          </div>
                        )}
                        {isCountedStandby && !hasWatch && (
                          <div className="flex items-center gap-2 text-purple-600">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Counted as Standby</span>
                          </div>
                        )}
                        {notes && (
                          <div className="text-muted-foreground text-xs pt-1 border-t border-border/50">
                            <div className="font-medium mb-1">Notes:</div>
                            <div className="whitespace-pre-wrap">{notes}</div>
                          </div>
                        )}
                        {displayVesselForDate && (
                          <div className="text-muted-foreground text-xs pt-1 border-t border-border/50">
                            Vessel: {displayVesselForDate.name}
                          </div>
                        )}
                      </>
                    ) : isAssignableDate ? (
                      <div className="text-muted-foreground">
                        No state logged - within vessel assignment range
                        {dateVessel && (
                          <div className="text-xs mt-1">Vessel: {dateVessel.name}</div>
                        )}
                      </div>
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
                      // When only start date is selected (no end date yet) - show prominent blue border (highest priority for selection)
                      isRangeStartOnly && "!border-2 !border-blue-600 !border-solid ring-2 ring-blue-500/50 ring-offset-1",
                      // Multi-selected dates - same blue styling as range
                      isInMultiSelect && !isPartOfActivePassage && !isCountedStandby && !hasWatch && !isAssignableDate && "border-2 border-blue-600 border-solid ring-2 ring-blue-500/30 ring-offset-1",
                      // Selected range styling - use a distinct color (blue) and solid border to differentiate from assignment outline
                      isInRange && !isPartOfActivePassage && !isCountedStandby && !hasWatch && !isAssignableDate && !isRangeStartOnly && "border-2 border-blue-500 border-solid",
                      // Range start/end dates when both are selected
                      (isRangeStart || isRangeEnd) && !isRangeStartOnly && !isPartOfActivePassage && !isCountedStandby && !hasWatch && !isAssignableDate && "border-2 border-blue-600 border-solid ring-2 ring-blue-500/30 ring-offset-1",
                      isCurrentDay && !isInRange && !isPartOfActivePassage && !isCountedStandby && !hasWatch && !isAssignableDate && !isRangeStartOnly && !isInMultiSelect && "ring-2 ring-primary ring-offset-2",
                      // Watch outline (yellow) - takes priority unless range start only
                      hasWatch && !isRangeStartOnly && !isInMultiSelect && "border-[3px] border-yellow-400",
                      // Part of active passage outline (blue) - unless range start only
                      isPartOfActivePassage && !hasWatch && !isRangeStartOnly && !isInMultiSelect && "border-[3px] border-blue-600",
                      // Standby outline (purple) - only if not watch or part of active passage
                      isCountedStandby && !hasWatch && !isPartOfActivePassage && !isRangeStartOnly && !isInMultiSelect && "border-[3px] border-purple-600",
                      // Assignable date outline (dashed border) - dates within assignment range but no state logged
                      isAssignableDate && !hasWatch && !isPartOfActivePassage && !isCountedStandby && !isInRange && !isRangeStartOnly && !isInMultiSelect && "border-2 border-dashed border-muted-foreground/40",
                      stateInfo 
                        ? "text-white" 
                        : isAssignableDate
                          ? "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                    style={
                      // Always show the primary state color, with outlines for secondary indicators
                      stateInfo 
                        ? { 
                            backgroundColor: stateInfo.color,
                            // Ensure blue border shows even when date has a state
                            ...(isRangeStartOnly ? { border: '2px solid hsl(217 91% 50%)', borderColor: 'hsl(217 91% 50%)' } : {})
                          } 
                        : isInRange 
                          ? { backgroundColor: 'hsl(var(--primary) / 0.15)' } 
                          : isInMultiSelect
                            ? { backgroundColor: 'hsl(217 91% 60% / 0.2)', border: '2px solid hsl(217 91% 50%)', borderColor: 'hsl(217 91% 50%)' }
                          : isRangeStartOnly
                            ? { backgroundColor: 'hsl(217 91% 60% / 0.2)', border: '2px solid hsl(217 91% 50%)', borderColor: 'hsl(217 91% 50%)' } // Blue tint and border for start date only
                            : isAssignableDate
                              ? { backgroundColor: 'hsl(var(--muted) / 0.3)' }
                              : undefined
                    }
                  >
                    <div className="flex flex-col items-center justify-center h-full relative">
                      <span className="relative z-10 text-center">{format(day, 'd')}</span>
                      {/* State icon centered for all dates */}
                      {stateInfo && (
                        <stateInfo.icon className="h-2 w-2 mt-0.5 opacity-90 relative z-10" />
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
          
          {/* Month Summary Section — vessel: no On Leave, show Part of passage instead */}
          <Separator className="mt-6 mb-4" />
          <div className="grid grid-cols-3 gap-3 text-sm">
            {(isVesselAccount ? vesselStates.filter(s => s.value !== 'on-leave') : vesselStates).map((state) => {
              const count = monthStateCounts[state.value] || 0;
              const StateIcon = state.icon;
              return (
                <div 
                  key={state.value} 
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                >
                  <StateIcon className="h-4 w-4" style={{ color: state.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-muted-foreground truncate">{state.label}</div>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
            {isVesselAccount && (
              <div 
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
              >
                <Ship className="h-4 w-4" style={{ color: 'hsl(var(--chart-blue))' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-muted-foreground truncate">Part of passage</div>
                </div>
                <span className="font-medium">{monthPartOfPassageCount}</span>
              </div>
            )}
            <div 
              className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
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
                View and manage your vessel states throughout the year. Use single date, date range, or multi-select to choose dates, then change their state.
              </p>
          </div>
          {/* Captain View Mode Toggle - Only show for approved captains */}
          {isApprovedCaptain && (
            <div className="flex items-center gap-2 rounded-lg border bg-card p-1">
              <Button
                variant={captainViewMode === 'personal' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setCaptainViewMode('personal')}
                className={cn(
                  "rounded-md",
                  captainViewMode === 'personal' && "bg-primary text-primary-foreground"
                )}
              >
                <User className="h-4 w-4 mr-2" />
                My Sea Time
              </Button>
              <Button
                variant={captainViewMode === 'vessel' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setCaptainViewMode('vessel')}
                className={cn(
                  "rounded-md",
                  captainViewMode === 'vessel' && "bg-primary text-primary-foreground"
                )}
              >
                <Ship className="h-4 w-4 mr-2" />
                Vessel Sea Time
              </Button>
            </div>
          )}
        </div>
        <Separator />
      </div>

      {/* Sticky toolbar: year nav + selection mode — full-width bar so content doesn’t show behind */}
      <div
        className="sticky -top-4 z-20 -mx-8 px-8 pt-4 pb-4 border-b border-border bg-content-background shadow-[0_1px_3px_0_hsl(var(--border))]"
        style={{ marginBottom: '-1px' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Year navigation */}
          <div className="flex items-center justify-between sm:justify-start gap-6 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear - 1)}
              className="rounded-xl shrink-0 h-10 w-10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-center sm:text-left min-w-0 flex-1 sm:flex-initial justify-center">
              <h2 className="text-2xl font-bold tabular-nums tracking-tight">{selectedYear}</h2>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear + 1)}
              disabled={isCurrentYear}
              className="rounded-xl shrink-0 h-10 w-10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Selection mode */}
          <div className="flex flex-col gap-2 shrink-0">
            <p className="text-sm font-medium text-foreground">Selection mode</p>
            <div className="flex gap-2">
              <Button
                variant={selectionMode === 'single' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectionMode('single');
                  setDateRange(undefined);
                  setSelectedDate(null);
                  setMultiSelectedDates(new Set());
                }}
                className="rounded-xl"
              >
                <MousePointer2 className="mr-2 h-4 w-4" />
                Single date
              </Button>
              <Button
                variant={selectionMode === 'range' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectionMode('range');
                  setSelectedDate(null);
                  setDateRange(undefined);
                  setMultiSelectedDates(new Set());
                }}
                className="rounded-xl"
              >
                <BoxSelect className="mr-2 h-4 w-4" />
                Date range
              </Button>
              <Button
                variant={selectionMode === 'multi' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectionMode('multi');
                  setSelectedDate(null);
                  setDateRange(undefined);
                }}
                className="rounded-xl"
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                Multi
              </Button>
            </div>
            {selectionMode === 'range' && (
              <p className="text-xs text-muted-foreground">
                {dateRange?.from && !dateRange?.to
                  ? `Range started: ${format(dateRange.from, 'MMM d, yyyy')}. Click another date to complete.`
                  : 'Click a date to start the range, then click another to complete it.'}
              </p>
            )}
            {selectionMode === 'multi' && (
              <p className="text-xs text-muted-foreground">
                {multiSelectedDates.size > 0
                  ? `${multiSelectedDates.size} date${multiSelectedDates.size > 1 ? 's' : ''} selected. Click "Change state" to apply.`
                  : 'Click dates to select multiple (non-contiguous). Then click "Change state" to apply.'}
              </p>
            )}
            {selectionMode === 'multi' && multiSelectedDates.size > 0 && (
              <Button size="sm" onClick={openMultiSelectDialog} className="rounded-xl mt-1">
                Change state ({multiSelectedDates.size})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle className="text-sm font-medium">State Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {vesselStates
              .filter(state => !isVesselAccount || state.value !== 'on-leave')
              .map((state) => {
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
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {/* Part of Active Passage - shown for all users */}
                <div className="flex items-center gap-2">
                  <div 
                    className="h-8 w-8 rounded border-[3px] border-blue-600 bg-transparent"
                  />
                  <span>Part of Active Passage (blue outline)</span>
                </div>
                {!isVesselAccount && (
                  <>
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-8 w-8 rounded border-[3px] border-yellow-400 bg-transparent"
                      />
                      <span>On Watch (yellow outline)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-8 w-8 rounded border-[3px] border-purple-600 bg-transparent"
                      />
                      <span>Counted as Standby (purple outline)</span>
                    </div>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isVesselAccount 
                  ? 'Dates marked as part of active passage count as "at sea" and are shown with a blue outline border. The primary state color remains visible.'
                  : 'Dates marked as watch (officers only) are shown with a yellow outline border. Dates marked as part of active passage count as "at sea" and are shown with a blue outline border. Dates counted as standby are shown with a purple outline border. The primary state color remains visible.'}
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
          if (selectionMode === 'range') {
            setDateRange(undefined);
          } else if (selectionMode === 'multi') {
            setMultiSelectedDates(new Set());
          } else {
            setSelectedDate(null);
          }
          setIsPartOfActivePassageInDialog(false);
          setIsWatchInDialog(false);
          setNotesInDialog('');
        }
      }}>
        <DialogContent className="rounded-xl max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dateRange?.from && dateRange?.to
                ? `Change State for ${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                : selectionMode === 'multi' && multiSelectedDates.size > 0
                ? `Change State for ${multiSelectedDates.size} date${multiSelectedDates.size > 1 ? 's' : ''}`
                : selectedDate
                ? `Change State for ${format(selectedDate, 'MMMM d, yyyy')}`
                : 'Change State'}
            </DialogTitle>
            {dateRange?.from && dateRange?.to && (
              <p className="text-sm text-muted-foreground mt-1">
                {eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length} day{eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length > 1 ? 's' : ''} selected
              </p>
            )}
            {selectionMode === 'multi' && multiSelectedDates.size > 0 && !dateRange?.to && (
              <p className="text-sm text-muted-foreground mt-1">
                {multiSelectedDates.size} day{multiSelectedDates.size > 1 ? 's' : ''} selected
              </p>
            )}
          </DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-2 gap-3">
              {vesselStates
                .filter(state => !isVesselAccount || state.value !== 'on-leave')
                .map((state) => {
                const StateIcon = state.icon;
                const isSelected = selectedState === state.value;
                return (
                  <Button
                    key={state.value}
                    variant="outline"
                    onClick={() => {
                      setSelectedState(state.value);
                      // Disable watch checkbox if state is not at-anchor
                      if (state.value !== 'at-anchor' && isWatchInDialog) {
                        setIsWatchInDialog(false);
                      }
                      // Reset part of active passage if state is underway or in-yard
                      if ((state.value === 'underway' || state.value === 'in-yard') && isPartOfActivePassageInDialog) {
                        setIsPartOfActivePassageInDialog(false);
                      }
                    }}
                    disabled={isSaving}
                    className={cn(
                      "h-auto py-4 px-4 flex flex-col items-center gap-3 rounded-xl transition-all relative border-2",
                      isSelected 
                        ? "shadow-md scale-[1.02]" 
                        : "hover:scale-[1.01]"
                    )}
                    style={{
                      backgroundColor: isSelected 
                        ? `hsl(var(--${getStateColorVar(state.value)}) / 0.15)` 
                        : `hsl(var(--${getStateColorVar(state.value)}) / 0.08)`,
                      borderColor: isSelected 
                        ? state.color 
                        : `hsl(var(--${getStateColorVar(state.value)}) / 0.3)`,
                    }}
                  >
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: state.color }}
                    >
                      <StateIcon className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-semibold text-sm">{state.label}</span>
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: state.color }}></div>
                      </div>
                    )}
                  </Button>
                );
              })}
              {/* No State / Remove State tile */}
              {(() => {
                // Check if there are states to remove
                let hasStates = false;
                if (dateRange?.from && dateRange?.to) {
                  const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
                  hasStates = interval.some(day => stateLogMap.has(format(day, 'yyyy-MM-dd')));
                } else if (selectionMode === 'multi' && multiSelectedDates.size > 0) {
                  hasStates = Array.from(multiSelectedDates).some(dateKey => stateLogMap.has(dateKey));
                } else if (selectedDate) {
                  hasStates = stateLogMap.has(format(selectedDate, 'yyyy-MM-dd'));
                }
                
                if (!hasStates) return null;
                
                return (
                  <Button
                    variant="outline"
                    onClick={handleRemoveState}
                    disabled={isSaving}
                    className={cn(
                      "h-auto py-4 px-4 flex flex-col items-center gap-3 rounded-xl transition-all relative border-2 hover:scale-[1.01]"
                    )}
                    style={{
                      backgroundColor: 'hsl(var(--destructive) / 0.08)',
                      borderColor: 'hsl(var(--destructive) / 0.3)',
                    }}
                  >
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center shadow-sm bg-destructive"
                    >
                      <XCircle className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-semibold text-sm">Remove State</span>
                  </Button>
                );
              })()}
            </div>
          </div>
          <div className="border-t pt-4 px-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedState !== 'underway' && selectedState !== 'in-yard' && (
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <Checkbox
                    id="part-of-active-passage-calendar"
                    checked={isPartOfActivePassageInDialog}
                    onCheckedChange={(checked) => setIsPartOfActivePassageInDialog(checked === true)}
                    disabled={isSaving}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="part-of-active-passage-calendar"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex flex-col gap-1.5 flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <Ship className="h-4 w-4 text-blue-600" />
                      <span>Part of Active Passage</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Counts as At Sea</span>
                  </Label>
                </div>
              )}
              {isOfficer && selectedDate && !dateRange && (
                <div className={cn(
                  "flex items-start space-x-3 p-3 rounded-lg border transition-colors",
                  selectedState === 'at-anchor' 
                    ? "border-border hover:bg-accent/50" 
                    : "border-border/50 bg-muted/30 opacity-60"
                )}>
                  <Checkbox
                    id="watch-log-calendar"
                    checked={isWatchInDialog}
                    onCheckedChange={(checked) => setIsWatchInDialog(checked === true)}
                    disabled={isSaving || selectedState !== 'at-anchor'}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="watch-log-calendar"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex flex-col gap-1.5 flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-black dark:text-white" />
                      <span>Record Day as Watch</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {selectedState === 'at-anchor' 
                        ? "Only available when At Anchor" 
                        : "Requires At Anchor state"}
                    </span>
                  </Label>
                </div>
              )}
            </div>
          </div>
          {selectedDate && !dateRange && (() => {
            const dateKey = format(selectedDate, 'yyyy-MM-dd');
            const isPartOfActivePassage = partOfActivePassageDates.has(dateKey);
            const hasWatch = watchDates.has(dateKey);
            const isCountedStandby = standbyDatesSet.has(dateKey) && !isPartOfActivePassage && !hasWatch;
            
            if (isCountedStandby) {
              return (
                <div className="border-t pt-4 px-1">
                  <div className="flex items-start space-x-3 p-3 rounded-lg border border-purple-600/30 bg-purple-600/10">
                    <Clock className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-purple-700 dark:text-purple-400">
                        Counted as Standby
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-500 mt-1">
                        This date is counted as standby time and will be included in your standby calculations.
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}
          <div className="border-t pt-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="notes-calendar" className="text-sm font-medium">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes-calendar"
                placeholder="Add any notes or reminders for this date..."
                value={notesInDialog}
                onChange={(e) => setNotesInDialog(e.target.value)}
                disabled={isSaving}
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">
                Add any additional information or reminders you want to remember for this date.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                if (selectionMode === 'range') {
                  setDateRange(undefined);
                } else if (selectionMode === 'multi') {
                  setMultiSelectedDates(new Set());
                } else {
                  setSelectedDate(null);
                }
                setIsPartOfActivePassageInDialog(false);
                setIsWatchInDialog(false);
                setNotesInDialog('');
                setSelectedState(null);
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

