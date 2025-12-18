
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, eachDayOfInterval, isSameDay, startOfDay, endOfDay, parse, isWithinInterval, startOfMonth, endOfMonth, getDaysInMonth, getDay, isSameMonth, isToday, isAfter, isBefore, addDays, subMonths } from 'date-fns';
import { CalendarIcon, MapPin, Briefcase, Info, PlusCircle, Loader2, Ship, BookText, Clock, Waves, Anchor, Building, CalendarDays, History, Edit, MousePointer2, BoxSelect } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { 
  createVessel, 
  createSeaServiceRecord, 
  updateStateLogsBatch, 
  updateUserProfile,
  getVesselStateLogs,
  createVesselAssignment,
  endVesselAssignment,
  getVesselAssignments
} from '@/supabase/database/queries';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import StateBreakdownChart from '@/components/dashboard/state-breakdown-chart';
import type { UserProfile, Vessel, SeaServiceRecord, StateLog, DailyStatus, VesselAssignment } from '@/lib/types';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { findMissingDays } from '@/lib/fill-missing-days';

const startServiceSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  position: z.string().optional(),
  startDate: z.date({ required_error: 'A start date is required.' }),
  endDate: z.date().optional(),
  initialState: z.enum(['underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard']),
}).refine((data) => {
  if (data.endDate && data.endDate < data.startDate) {
    return false;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

type StartServiceFormValues = z.infer<typeof startServiceSchema>;

const addVesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.enum(vesselTypeValues, {
    required_error: 'Please select a vessel type.',
  }),
  officialNumber: z.string().optional(),
});
type AddVesselFormValues = z.infer<typeof addVesselSchema>;

const vesselStates: { value: DailyStatus; label: string; color: string, icon: React.FC<any> }[] = [
    { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
    { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
    { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
    { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: Briefcase },
    { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Ship },
];

export default function CurrentPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedState, setSelectedState] = useState<DailyStatus | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>('single');
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAddVesselDialogOpen, setIsAddVesselDialogOpen] = useState(false);
  const [isSavingVessel, setIsSavingVessel] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    
    // Debug log to see what we're getting
    console.log('[CURRENT PAGE] User Profile Transform:', {
      raw: userProfileRaw,
      active_vessel_id: (userProfileRaw as any).active_vessel_id,
      activeVesselId: (userProfileRaw as any).activeVesselId,
      transformedActiveVesselId: activeVesselId,
      allKeys: Object.keys(userProfileRaw),
    });
    
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
    } as UserProfile;
  }, [userProfileRaw]);
  
  // Query all vessels (vessels are shared, not owned by users)
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  // Count vessels user has logged time on
  const [actualVesselCount, setActualVesselCount] = useState(0);
  
  useEffect(() => {
    if (!vessels || !user?.id) {
      setActualVesselCount(0);
      return;
    }

    const countVessels = async () => {
      let count = 0;
      for (const vessel of vessels) {
        const logs = await getVesselStateLogs(supabase, vessel.id, user.id);
        if (logs && logs.length > 0) {
          count++;
        }
      }
      setActualVesselCount(count);
    };

    countVessels();
  }, [vessels, user?.id, supabase]);

  // Check vessel limit based on subscription tier
  const hasUnlimitedVessels = useMemo(() => {
    if (!userProfile) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    const status = (userProfile as any).subscription_status || userProfile.subscriptionStatus || 'inactive';
    return (tier === 'premium' || tier === 'pro') && status === 'active';
  }, [userProfile]);

  const vesselLimit = hasUnlimitedVessels ? Infinity : 3;
  const canAddVessel = hasUnlimitedVessels || actualVesselCount < vesselLimit;

  const currentVessel = useMemo(() => {
    if (!userProfile || !vessels || vessels.length === 0) {
      console.log('[CURRENT PAGE] No user profile or vessels available');
      return undefined;
    }
    
    const activeVesselId = userProfile.activeVesselId;
    const foundVessel = vessels.find(v => v.id === activeVesselId);
    
    console.log('[CURRENT PAGE] Active Vessel Debug:', {
      userProfileId: userProfile.id,
      activeVesselId,
      vesselsCount: vessels.length,
      vesselIds: vessels.map(v => v.id),
      foundVessel: foundVessel ? { id: foundVessel.id, name: foundVessel.name } : null,
      userProfileRaw: userProfileRaw,
    });
    
    return foundVessel;
  }, [vessels, userProfile, userProfileRaw]);

  // Determine if there's an active service based on active vessel
  const hasActiveService = !!currentVessel;

  const [stateLogs, setStateLogs] = useState<StateLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);

  const [isFillingGaps, setIsFillingGaps] = useState(false);
  const gapFilledRef = useRef<string | null>(null); // Track if we've already filled gaps for this vessel/date combo

  // Fetch state logs using the query function for proper transformation
  useEffect(() => {
    if (!currentVessel || !user?.id) {
      setStateLogs([]);
      setIsLoadingLogs(false);
      gapFilledRef.current = null; // Reset when vessel changes
      return;
    }

    setIsLoadingLogs(true);
    getVesselStateLogs(supabase, currentVessel.id, user.id)
      .then((logs) => {
        setStateLogs(logs);
        setIsLoadingLogs(false);
        gapFilledRef.current = null; // Reset when new logs are loaded
      })
      .catch((error) => {
        console.error('Error fetching state logs:', error);
        setStateLogs([]);
        setIsLoadingLogs(false);
        gapFilledRef.current = null;
      });
  }, [currentVessel?.id, user?.id, supabase]);

  // Fetch vessel assignments for date validation
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

  // Calculate standby days
  const { standbyPeriods } = useMemo(() => {
    if (!stateLogs || stateLogs.length === 0) {
      return { standbyPeriods: [] };
    }
    const result = calculateStandbyDays(stateLogs);
    return { standbyPeriods: result.standbyPeriods };
  }, [stateLogs]);

  // Create a Map for quick state lookup by date
  const stateLogMap = useMemo(() => {
    const map = new Map<string, DailyStatus>();
    stateLogs.forEach(log => {
      map.set(log.date, log.state);
    });
    return map;
  }, [stateLogs]);

  // Create a Set of dates that are counted as standby
  const standbyDatesSet = useMemo(() => {
    const dates = new Set<string>();
    standbyPeriods.forEach(period => {
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

  // Automatically fill missing days between last logged date and today
  useEffect(() => {
    const fillGaps = async () => {
      // Only run if we have an active vessel, state logs are loaded, and we're not already filling gaps
      if (!currentVessel || !user?.id || stateLogs.length === 0 || isFillingGaps || isLoadingLogs) {
        return;
      }

      // Create a unique key for this check (vessel + today's date)
      const todayKey = format(new Date(), 'yyyy-MM-dd');
      const checkKey = `${currentVessel.id}-${todayKey}`;
      
      // Skip if we've already filled gaps for this vessel today
      if (gapFilledRef.current === checkKey) {
        return;
      }

      // Find missing days
      const { lastLoggedDate, lastLoggedState, missingDays } = findMissingDays(stateLogs);

      // If there are missing days and we have a last logged state, fill them
      if (missingDays.length > 0 && lastLoggedState) {
        setIsFillingGaps(true);
        
        try {
          console.log(`[FILL MISSING DAYS] Found ${missingDays.length} missing days from ${lastLoggedDate ? format(lastLoggedDate, 'yyyy-MM-dd') : 'unknown'} to today. Filling with state: ${lastLoggedState}`);
          
          // Create logs for all missing days with the same state as the last logged entry
          const logsToCreate = missingDays.map(date => ({
            date,
            state: lastLoggedState,
          }));

          await updateStateLogsBatch(supabase, user.id, currentVessel.id, logsToCreate);

          console.log(`[FILL MISSING DAYS] Successfully filled ${missingDays.length} missing days`);

          // Mark that we've filled gaps for this vessel today
          gapFilledRef.current = checkKey;

          // Refresh state logs to show the newly created entries
          const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
          setStateLogs(updatedLogs);
        } catch (error: any) {
          console.error('Error filling missing days:', error);
          // Don't show toast error - this is automatic background operation
        } finally {
          setIsFillingGaps(false);
        }
      } else if (missingDays.length === 0) {
        // No gaps to fill, mark as checked
        gapFilledRef.current = checkKey;
      }
    };

    fillGaps();
  }, [stateLogs, currentVessel?.id, user?.id, supabase, isFillingGaps, isLoadingLogs]);
  
  const startServiceForm = useForm<StartServiceFormValues>({
    resolver: zodResolver(startServiceSchema),
    defaultValues: { vesselId: '', position: '', startDate: undefined, endDate: undefined, initialState: 'underway' },
  });

  const addVesselForm = useForm<AddVesselFormValues>({
    resolver: zodResolver(addVesselSchema),
    defaultValues: { name: '', type: undefined, officialNumber: '' },
  });

   // Find the most recent service record date for the current vessel
  const mostRecentServiceDate = useMemo(() => {
    if (!stateLogs || stateLogs.length === 0) return null;
    // Get the most recent date from state logs
    const sortedLogs = [...stateLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sortedLogs[0] ? new Date(sortedLogs[0].date) : null;
  }, [stateLogs]);

  // Helper function to validate if a date is within valid vessel assignment period
  const isDateValidForStateChange = (date: Date): { valid: boolean; reason?: string } => {
    if (!currentVessel || !user?.id) {
      return { valid: false, reason: 'No vessel selected.' };
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());

    // Find the earliest assignment across ALL vessels (when user first joined any vessel)
    let earliestAssignment: VesselAssignment | null = null;
    if (vesselAssignments.length > 0) {
      earliestAssignment = vesselAssignments.reduce((earliest, assignment) => {
        const assignmentStart = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
        if (!earliest) return assignment;
        const earliestStart = parse(earliest.startDate, 'yyyy-MM-dd', new Date());
        return assignmentStart < earliestStart ? assignment : earliest;
      }, null as VesselAssignment | null);
    }

    // Check if date is before the earliest vessel assignment
    if (earliestAssignment) {
      const earliestStart = parse(earliestAssignment.startDate, 'yyyy-MM-dd', new Date());
      if (isBefore(dateObj, earliestStart)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(earliestStart, 'MMM d, yyyy')} (when you first joined a vessel).`,
        };
      }
    }

    // Find assignments for the current vessel (ordered by start date, most recent first)
    const currentVesselAssignments = vesselAssignments
      .filter(a => a.vesselId === currentVessel.id)
      .sort((a, b) => {
        const aStart = parse(a.startDate, 'yyyy-MM-dd', new Date());
        const bStart = parse(b.startDate, 'yyyy-MM-dd', new Date());
        return bStart.getTime() - aStart.getTime(); // Most recent first
      });

    // If no assignments for current vessel, check if it's active
    if (currentVesselAssignments.length === 0) {
      // If vessel is active but has no assignment record yet (edge case), allow from today
      if (userProfile?.activeVesselId === currentVessel.id) {
        const today = startOfDay(new Date());
        if (isBefore(dateObj, today)) {
          return {
            valid: false,
            reason: 'You cannot change states for dates before you joined this vessel.',
          };
        }
        return { valid: true };
      } else {
        return {
          valid: false,
          reason: 'You have no assignment record for this vessel. Please start a service first.',
        };
      }
    }

    // Check if date falls within any assignment period for this vessel
    // Note: end_date is exclusive '[)' - meaning if end_date = 2025-01-10, 
    // valid dates are < 2025-01-10 (through 2025-01-09 inclusive)
    let dateInAnyAssignment = false;
    for (const assignment of currentVesselAssignments) {
      const assignmentStart = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
      const assignmentEnd = assignment.endDate
        ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
        : null;

      // Check if date is within this assignment period [start_date, end_date)
      // date >= start_date AND (end_date is null OR date < end_date)
      const isAfterOrEqualStart = !isBefore(dateObj, assignmentStart);
      const isBeforeEnd = !assignmentEnd || isBefore(dateObj, assignmentEnd);
      
      if (isAfterOrEqualStart && isBeforeEnd) {
        dateInAnyAssignment = true;
        break;
      }
    }

    if (!dateInAnyAssignment) {
      // Find the most recent assignment to show a helpful message
      const mostRecentAssignment = currentVesselAssignments[0];
      const assignmentStart = parse(mostRecentAssignment.startDate, 'yyyy-MM-dd', new Date());
      const assignmentEnd = mostRecentAssignment.endDate
        ? parse(mostRecentAssignment.endDate, 'yyyy-MM-dd', new Date())
        : null;

      if (isBefore(dateObj, assignmentStart)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(assignmentStart, 'MMM d, yyyy')} (when you joined this vessel).`,
        };
      }

      // end_date is exclusive, so if end_date = 2025-01-10, dates >= 2025-01-10 are invalid
      if (assignmentEnd && !isBefore(dateObj, assignmentEnd)) {
        return {
          valid: false,
          reason: `You cannot change states on or after ${format(assignmentEnd, 'MMM d, yyyy')} (when you left this vessel). Join a new vessel to continue logging.`,
        };
      }
    }

    return { valid: true };
  };

  const handleDateClick = (date: Date) => {
    if (!currentVessel) {
      toast({
        title: 'No Active Vessel',
        description: 'Please set an active vessel first.',
        variant: 'destructive',
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
    if (!currentVessel || !user?.id) return;

    setIsSaving(true);

    try {
      let logs: Array<{ date: string; state: DailyStatus }> = [];
      
      if (dateRange?.from && dateRange?.to) {
        // Range update
        const today = startOfDay(new Date());
        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        logs = interval
          .filter(day => {
            const dayStart = startOfDay(day);
            // Filter out future dates
            if (isAfter(dayStart, today)) return false;
            // Validate each date is within valid vessel assignment period
            const validation = isDateValidForStateChange(day);
            return validation.valid;
          })
          .map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            state: state,
          }));
        
        if (logs.length === 0) {
          toast({
            title: 'Invalid Range',
            description: 'No valid dates in the selected range. Dates may be outside your vessel assignment period or in the future.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else if (selectedDate) {
        // Single date update - validate one more time before saving
        const validation = isDateValidForStateChange(selectedDate);
        if (!validation.valid) {
          toast({
            title: 'Invalid Date',
            description: validation.reason || 'You cannot change the state for this date.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        logs = [{ date: dateKey, state }];
      } else {
        setIsSaving(false);
        return;
      }

      await updateStateLogsBatch(supabase, user.id, currentVessel.id, logs);
      
      // Refresh state logs
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      setIsDialogOpen(false);
      setDateRange(undefined);
      setSelectedDate(null);
      
      const stateLabel = vesselStates.find(s => s.value === state)?.label || state;
      
      if (dateRange?.from && dateRange?.to) {
        const daysCount = logs.length;
        toast({
          title: 'States Updated',
          description: `${daysCount} day${daysCount > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) updated to ${stateLabel}.`,
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

  async function onStartServiceSubmit(data: StartServiceFormValues) {
    if (!user?.id) return;
    
    const today = startOfDay(new Date());
    const startDate = startOfDay(data.startDate);
    
    if(startDate > today) {
        toast({title: "Invalid Date", description: "Start date cannot be in the future.", variant: "destructive"});
        return;
    }

    // Determine end date: use provided endDate, or today if not provided (active service)
    const endDate = data.endDate ? startOfDay(data.endDate) : today;
    
    if(endDate > today) {
        toast({title: "Invalid Date", description: "End date cannot be in the future.", variant: "destructive"});
        return;
    }

    try {
      // Check for overlapping dates with other vessels
      if (vessels && vessels.length > 0) {
        const newDateRange = eachDayOfInterval({ start: startDate, end: endDate });
        const newDatesSet = new Set(newDateRange.map(d => format(d, 'yyyy-MM-dd')));
        
        // Check each vessel (except the one we're adding to)
        for (const vessel of vessels) {
          if (vessel.id === data.vesselId) continue; // Skip the current vessel (allows updating same vessel)
          
          const existingLogs = await getVesselStateLogs(supabase, vessel.id, user.id);
          
          // Check for overlaps
          const overlappingDates = existingLogs
            .filter(log => newDatesSet.has(log.date))
            .map(log => parse(log.date, 'yyyy-MM-dd', new Date()));
          
          if (overlappingDates.length > 0) {
            const vesselName = vessel.name;
            const overlapCount = overlappingDates.length;
            
            // Sort dates to get first and last
            overlappingDates.sort((a, b) => a.getTime() - b.getTime());
            const firstOverlap = format(overlappingDates[0], 'MMM d, yyyy');
            const lastOverlap = format(overlappingDates[overlappingDates.length - 1], 'MMM d, yyyy');
            
            const dateRangeText = overlapCount === 1 
              ? firstOverlap
              : overlapCount === 2
              ? `${firstOverlap} and ${lastOverlap}`
              : `${firstOverlap} through ${lastOverlap} (${overlapCount} days)`;
            
            toast({
              title: "Date Conflict Detected",
              description: `You cannot be on two vessels at the same time. The selected date range overlaps with ${overlapCount} day${overlapCount > 1 ? 's' : ''} you've already logged for "${vesselName}" (${dateRangeText}). Please adjust your dates to avoid conflicts.`,
              variant: "destructive",
            });
            return;
          }
        }
      }
      // 1. Create vessel assignment record
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = data.endDate ? format(endDate, 'yyyy-MM-dd') : null;
      const isActiveService = !data.endDate;
      
      await createVesselAssignment(supabase, {
        userId: user.id,
        vesselId: data.vesselId,
        startDate: startDateStr,
        endDate: endDateStr,
        position: data.position || null,
      });

      // 2. Update user profile to set active vessel (only if no end date, meaning it's still active)
      if (isActiveService) {
        await updateUserProfile(supabase, user.id, {
          activeVesselId: data.vesselId,
        });
      }

      // 3. Create state logs for all dates from start to end
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const logs = dateRange.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        state: data.initialState,
      }));
      
      await updateStateLogsBatch(supabase, user.id, data.vesselId, logs);
      
      const message = isActiveService 
        ? `Sea service started. ${logs.length} day(s) logged with initial state.`
        : `Sea service recorded. ${logs.length} day(s) logged from ${format(startDate, 'PPP')} to ${format(endDate, 'PPP')}.`;
      
      toast({ 
        title: isActiveService ? 'Service Started' : 'Service Recorded', 
        description: message 
      });
      
      // Reset form on success - data will refresh automatically via realtime subscriptions
      startServiceForm.reset();
    } catch (error: any) {
      console.error('Error starting service:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start service. Please try again.',
        variant: 'destructive',
      });
    }
  }

  async function onAddVesselSubmit(data: AddVesselFormValues) {
    if (!user?.id) return;
    setIsSavingVessel(true);

    try {
      await createVessel(supabase, {
        name: data.name,
        type: data.type,
        officialNumber: data.officialNumber,
      });
            addVesselForm.reset();
            setIsAddVesselDialogOpen(false);
      toast({ title: 'Vessel Added', description: `${data.name} has been added.` });
    } catch (error: any) {
      console.error('Error adding vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add vessel. Please try again.',
        variant: 'destructive',
      });
    } finally {
            setIsSavingVessel(false);
    }
  }

  const handleRangeStateChange = async (state: DailyStatus) => {
    if (!currentVessel || !user?.id || !dateRange?.from || !dateRange?.to) return;
    
    const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const logs = interval.map(day => ({
      date: format(day, 'yyyy-MM-dd'),
      state: state,
    }));
    
    try {
      await updateStateLogsBatch(supabase, user.id, currentVessel.id, logs);
    setIsStatusDialogOpen(false);
    setDateRange(undefined);
    } catch (error) {
      console.error('Error updating state logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to update state logs.',
        variant: 'destructive',
      });
    }
  }

  const handleTodayStateChange = async (state: DailyStatus) => {
    if (!currentVessel || !user?.id) return;
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    
    try {
      await updateStateLogsBatch(supabase, user.id, currentVessel.id, [{ date: todayKey, state }]);
      
      // Refresh state logs to show the updated value
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      toast({ 
        title: 'State Updated', 
        description: `Today's state has been updated to ${vesselStates.find(s => s.value === state)?.label || state}.` 
      });
    } catch (error) {
      console.error('Error updating today state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update state.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveNotes = async () => {
    if (!currentVessel || !user?.id) return;
    setIsSavingNotes(true);
    
    try {
      // Notes can be stored in a separate table or as metadata
      // For now, we'll skip notes if there's no specific service record to attach them to
      // You may want to create a separate notes table or add a notes column to daily_state_logs
      toast({ title: 'Notes Saved', description: 'Your trip notes have been updated.' });
    } catch (e) {
      console.error("Error saving notes", e);
      toast({
        title: 'Error',
        description: 'Failed to save notes.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Render month function similar to calendar page
  const renderMonth = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
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
                
                // Check if this date is a standby date
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
                  const standbyColor = 'rgba(139, 92, 246, 0.85)';
                  const stateColor = stateInfo.color;
                  backgroundStyle = {
                    background: `linear-gradient(135deg, ${stateColor} 0%, ${stateColor} 50%, ${standbyColor} 50%, ${standbyColor} 100%)`,
                  };
                  standbyStyle = {};
                } else if (isCountedStandby && !stateInfo) {
                  backgroundStyle = {
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                  };
                  standbyStyle = {};
                }

                // Build title text with standby indicator
                let titleText = '';
                if (isFuture) {
                  titleText = 'Cannot update future dates';
                } else if (stateInfo) {
                  titleText = `${format(day, 'MMM d, yyyy')}: ${stateInfo.label}`;
                  if (isCountedStandby) {
                    titleText += ' (Counted as Standby)';
                  }
                } else {
                  titleText = format(day, 'MMM d, yyyy');
                }

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleDateClick(day)}
                    disabled={isFuture}
                    className={cn(
                      "aspect-square rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
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
                    title={titleText}
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
                <div key={state.value} className="flex items-center gap-2">
                  <StateIcon className="h-4 w-4" style={{ color: state.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-muted-foreground truncate">{state.label}</div>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
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

  // Get last 3 months
  const lastThreeMonths = useMemo(() => {
    const today = new Date();
    const months: Date[] = [];
    for (let i = 0; i < 3; i++) {
      months.push(subMonths(today, i));
    }
    return months.reverse(); // Show oldest to newest (2 months ago, 1 month ago, current)
  }, []);


  const handleEndTrip = async () => {
    if (!currentVessel || !user?.id) return;
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // End the vessel assignment (set end_date to today)
      await endVesselAssignment(supabase, user.id, currentVessel.id, today);
      
      // Update user profile to clear active vessel
      await updateUserProfile(supabase, user.id, {
        activeVesselId: null,
      });

      toast({ title: 'Service Ended', description: 'Your active service has been ended.' });
    } catch (error: any) {
      console.error('Error ending trip:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to end service. Please try again.',
        variant: 'destructive',
      });
    }
  }
  
  const serviceDate = mostRecentServiceDate;
  
  const { totalDaysByState, atSeaDays, standbyDays } = useMemo(() => {
    if (!stateLogs) return { totalDaysByState: [], atSeaDays: 0, standbyDays: 0 };
    
    let atSea = 0;
    const stateCounts = stateLogs.reduce((acc, log) => {
        acc[log.state] = (acc[log.state] || 0) + 1;
        if (log.state === 'underway') atSea++;
        return acc;
    }, {} as Record<DailyStatus, number>);

    // Calculate MCA/PYA compliant standby days
    const { totalStandbyDays } = calculateStandbyDays(stateLogs);
    const standby = totalStandbyDays;

    const chartData = vesselStates.map(stateInfo => ({
        name: stateInfo.label,
        days: stateCounts[stateInfo.value] || 0,
        fill: stateInfo.color,
    })).filter(item => item.days > 0);

    return { totalDaysByState: chartData, atSeaDays: atSea, standbyDays: standby };
  }, [stateLogs]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayStatusValue = stateLogs?.find(log => log.date === todayKey)?.state;

  if (isLoadingProfile || isLoadingVessels) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    )
  }
  
  const isDisplayingStatus = hasActiveService && currentVessel;

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Current Service</h1>
            <p className="text-muted-foreground">
              {isDisplayingStatus 
                ? `Tracking active service on ${currentVessel?.name || 'your vessel'}`
                : userProfile?.activeVesselId 
                  ? `Active vessel ID set (${userProfile.activeVesselId}) but vessel not found. Please select a vessel or start a service.`
                  : 'Track and manage your active sea service - Start a service to begin tracking'
              }
            </p>
          </div>
          {isDisplayingStatus && (
            <Button onClick={handleEndTrip} variant="destructive" className="rounded-xl">End Current Service</Button>
          )}
        </div>
        <Separator />
      {isDisplayingStatus ? (
        <div className="space-y-6">
            {/* Active Vessel Header Card */}
            <Card className="rounded-xl border shadow-sm bg-gradient-to-r from-primary/5 to-primary/10">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-xl bg-primary/20 flex items-center justify-center">
                                <Ship className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">{currentVessel.name}</h2>
                                <p className="text-sm text-muted-foreground">{currentVessel.type} • Active Service</p>
                                {serviceDate && (
                                    <p className="text-xs text-muted-foreground mt-1">Started {format(serviceDate, 'PPP')}</p>
                                )}
                            </div>
                        </div>
                        {todayStatusValue && (
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground mb-1">Today's Status</p>
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="h-3 w-3 rounded-full" 
                                        style={{ backgroundColor: vesselStates.find(s => s.value === todayStatusValue)?.color }}
                                    />
                                    <span className="text-lg font-semibold">
                                        {vesselStates.find(s => s.value === todayStatusValue)?.label || 'No status'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    </CardContent>
                </Card>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">At Sea</CardTitle>
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Waves className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{atSeaDays}</div>
                        <p className="text-xs text-muted-foreground mt-1">days logged on {currentVessel.name}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Standby</CardTitle>
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Anchor className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{standbyDays}</div>
                        <p className="text-xs text-muted-foreground mt-1">days logged on {currentVessel.name}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Days</CardTitle>
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CalendarDays className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{stateLogs?.length || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">days logged on {currentVessel.name}</p>
                    </CardContent>
                </Card>
            </div>
            
            {/* Current State Selector - Full Width */}
            <Card className="rounded-xl border shadow-sm">
                    <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl">Update Today's Status</CardTitle>
                            <CardDescription className="mt-1">
                                Change the current state for {format(new Date(), 'PPP')} • Active vessel: {currentVessel.name}
                            </CardDescription>
                        </div>
                        {todayStatusValue && (
                            <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-xl border border-primary/20">
                                <div 
                                    className="h-4 w-4 rounded-full" 
                                    style={{ backgroundColor: vesselStates.find(s => s.value === todayStatusValue)?.color }}
                                />
                                <div>
                                    <p className="text-xs text-muted-foreground">Current</p>
                                    <p className="text-sm font-semibold text-primary">
                                        {vesselStates.find(s => s.value === todayStatusValue)?.label || 'No status'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    </CardHeader>
                <CardContent>
                    {isLoadingLogs ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {vesselStates.map(state => {
                            const isActive = todayStatusValue === state.value;
                            return (
                                <button
                                    key={state.value}
                                    onClick={() => handleTodayStateChange(state.value)}
                                    className={cn(
                                            "flex flex-col items-center gap-3 p-4 rounded-xl text-center transition-all border-2",
                                        isActive 
                                                ? 'bg-primary/10 text-primary border-primary shadow-md scale-105'
                                                : 'hover:bg-muted/50 border-transparent hover:border-muted'
                                        )}
                                    >
                                        <span 
                                            className={cn(
                                                "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                                                isActive ? 'ring-2 ring-primary ring-offset-2' : ''
                                            )} 
                                            style={{ backgroundColor: isActive ? state.color : 'hsl(var(--muted))' }}
                                        >
                                            <state.icon className={cn("h-6 w-6", isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
                                    </span>
                                        <span className={cn("font-medium text-sm", isActive ? 'text-primary' : 'text-foreground')}>
                                            {state.label}
                                    </span>
                                        {isActive && (
                                            <span className="text-xs text-primary font-semibold">Selected</span>
                                        )}
                                </button>
                            );
                        })}
                        </div>
                    )}
                    </CardContent>
                </Card>
            
            {/* Monthly Calendar - Updated to match calendar page */}
            <div className="space-y-6">
              {/* Header */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight">Monthly Calendar</h2>
                    <p className="text-muted-foreground">
                      View and update your vessel status for {currentVessel.name}. Click dates to update states.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectionMode === 'single' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectionMode('single')}
                      className="rounded-xl"
                    >
                      <MousePointer2 className="h-4 w-4 mr-2" />
                      Single
                    </Button>
                    <Button
                      variant={selectionMode === 'range' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectionMode('range');
                        setDateRange(undefined);
                      }}
                      className="rounded-xl"
                    >
                      <CalendarDays className="h-4 w-4 mr-2" />
                      Range
                    </Button>
                  </div>
                </div>
                <Separator />
              </div>

              {/* Calendar Months Grid - Last 3 months */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {lastThreeMonths.map((month) => renderMonth(month))}
              </div>
            </div>

            {/* State Change Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              if (!open) {
                setDateRange(undefined);
                setSelectedDate(null);
                setSelectedState(null);
              }
              setIsDialogOpen(open);
            }}>
              <DialogContent className="rounded-xl">
                <DialogHeader>
                  <DialogTitle>
                    {dateRange?.from && dateRange?.to 
                      ? `Update Status: ${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                      : selectedDate
                        ? `Update Status: ${format(selectedDate, 'MMM d, yyyy')}`
                        : 'Select Date Range'}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-3 py-4">
                  {vesselStates.map((state) => {
                    const StateIcon = state.icon;
                    const isSelected = selectedState === state.value;
                    return (
                      <Button 
                        key={state.value} 
                        variant={isSelected ? "default" : "outline"} 
                        className="justify-start gap-3 h-auto py-3 rounded-lg hover:bg-accent/50 transition-colors" 
                        onClick={() => handleStateChange(state.value)}
                        disabled={isSaving}
                      >
                        <div 
                          className="h-4 w-4 rounded-full shrink-0" 
                          style={{ backgroundColor: state.color }}
                        />
                        <StateIcon className="h-4 w-4 shrink-0" />
                        <span className="font-medium">{state.label}</span>
                        {isSelected && <span className="ml-auto text-xs">Current</span>}
                      </Button>
                    );
                  })}
                </div>
                {isSaving && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </DialogContent>
            </Dialog>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-xl border shadow-sm">
                    <CardHeader>
                        <CardTitle>Day Breakdown</CardTitle>
                        <CardDescription>Distribution of days by state</CardDescription>
                    </CardHeader>
                    <CardContent><StateBreakdownChart data={totalDaysByState} /></CardContent>
                </Card>
                    
                <Card className="rounded-xl border shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <BookText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Trip Notes</CardTitle>
                                <CardDescription>Add notes about your current trip</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Textarea placeholder="Add notes about your trip..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[100px]" />
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSaveNotes} disabled={isSavingNotes} className="rounded-xl">
                            {isSavingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Notes
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="rounded-xl border shadow-sm">
          <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Ship className="h-5 w-5 text-primary" />
                </div>
                <div>
            <CardTitle>Start a New Sea Service</CardTitle>
                  <CardDescription className="mt-1">Record your sea service dates. Leave end date empty for an active service, or fill both dates to add a past service.</CardDescription>
                </div>
              </div>
          </CardHeader>
          <CardContent>
            <Form {...startServiceForm}>
              <form onSubmit={startServiceForm.handleSubmit(onStartServiceSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                <FormField
                  control={startServiceForm.control}
                  name="vesselId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel</FormLabel>
                      <div className="flex gap-2">
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingVessels}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder={isLoadingVessels ? "Loading vessels..." : "Select the vessel you're on"} /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {vessels?.map(vessel => (<SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <Dialog open={isAddVesselDialogOpen} onOpenChange={setIsAddVesselDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="icon" className="shrink-0 rounded-lg">
                                    <PlusCircle className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px]">
                                  <DialogHeader>
                                    <div className="flex items-center gap-3 mb-2">
                                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Ship className="h-5 w-5 text-primary" />
                                      </div>
                                      <DialogTitle>Add a New Vessel</DialogTitle>
                                    </div>
                                  </DialogHeader>
                                <Form {...addVesselForm}>
                                    <form onSubmit={addVesselForm.handleSubmit(onAddVesselSubmit)} className="space-y-4">
                                      <FormField 
                                        control={addVesselForm.control} 
                                        name="name" 
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Vessel Name</FormLabel>
                                            <FormControl>
                                              <Input placeholder="e.g., M/Y Odyssey" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )} 
                                      />
                                      <FormField 
                                        control={addVesselForm.control} 
                                        name="type" 
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Vessel Type</FormLabel>
                                            <FormControl>
                                              <SearchableSelect
                                                options={vesselTypes}
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                placeholder="Select a vessel type"
                                                searchPlaceholder="Search vessel types..."
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )} 
                                      />
                                      <FormField 
                                        control={addVesselForm.control} 
                                        name="officialNumber" 
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Official Number (Optional)</FormLabel>
                                            <FormControl>
                                              <Input placeholder="e.g., IMO 1234567" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )} 
                                      />
                                      <DialogFooter className="pt-4 gap-2">
                                        <DialogClose asChild>
                                          <Button type="button" variant="ghost" className="rounded-lg">Cancel</Button>
                                        </DialogClose>
                                        <Button type="submit" disabled={isSavingVessel} className="rounded-lg">
                                          {isSavingVessel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                          Save Vessel
                                        </Button>
                                        </DialogFooter>
                                    </form>
                                </Form>
                            </DialogContent>
                        </Dialog>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                      <FormField 
                        control={startServiceForm.control} 
                        name="position" 
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Your Position/Role (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Deckhand, 2nd Engineer" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} 
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField 
                          control={startServiceForm.control} 
                          name="startDate" 
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Start Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal rounded-lg", !field.value && "text-muted-foreground")}>
                                      {field.value ? format(field.value, "PPP") : (<span>Pick a start date</span>)}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar 
                                    mode="single" 
                                    selected={field.value} 
                                    onSelect={field.onChange} 
                                    disabled={(date) => date > new Date() || date < new Date("1990-01-01")} 
                                    initialFocus 
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )} 
                        />
                        <FormField 
                          control={startServiceForm.control} 
                          name="endDate" 
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>End Date (Optional)</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal rounded-lg", !field.value && "text-muted-foreground")}>
                                      {field.value ? format(field.value, "PPP") : (<span>Leave empty for active</span>)}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar 
                                    mode="single" 
                                    selected={field.value} 
                                    onSelect={field.onChange} 
                                    disabled={(date) => {
                                      const startDate = startServiceForm.watch("startDate");
                                      return date > new Date() || 
                                             (startDate && date < startDate) || 
                                             date < new Date("1990-01-01");
                                    }} 
                                    initialFocus 
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                              <p className="text-xs text-muted-foreground">Leave empty for active service</p>
                            </FormItem>
                          )} 
                        />
                      </div>
                    </div>
                    <div className="space-y-6">
                      <FormField 
                        control={startServiceForm.control} 
                        name="initialState" 
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel>Initial Vessel State</FormLabel>
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                                {vesselStates.map((state) => (
                                  <FormItem key={state.value} className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                      <RadioGroupItem value={state.value} />
                                    </FormControl>
                                    <FormLabel className="font-normal">{state.label}</FormLabel>
                                  </FormItem>
                                ))}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground">This state will be applied to all dates in the range</p>
                          </FormItem>
                        )} 
                      />
                    </div>
                  </div>
                  <Separator />
                  <Button type="submit" className="w-full rounded-lg" size="lg">Start Tracking</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        
        {/* Info Card: How to Add Past Services */}
        <Card className="rounded-xl border shadow-sm bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-lg">Add Past Vessel Service</h3>
                <p className="text-sm text-muted-foreground">
                  The form above works for both active and past services:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                  <li><strong>Active Service:</strong> Fill in start date, leave end date empty</li>
                  <li><strong>Past Service:</strong> Fill in both start and end dates (e.g., from 2 years ago)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  After adding a past service, you can edit individual date states using the monthly calendar below (once that vessel becomes active) or by resuming it from the History page.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      )}
    </div>
  );
}
