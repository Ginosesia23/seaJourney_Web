
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, eachDayOfInterval, isSameDay, startOfDay, endOfDay, parse, isWithinInterval } from 'date-fns';
import { CalendarIcon, MapPin, Briefcase, Info, PlusCircle, Loader2, Ship, BookText, Clock, Waves, Anchor, Building, CalendarDays, History, Edit } from 'lucide-react';
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
  getVesselStateLogs 
} from '@/supabase/database/queries';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import StateBreakdownChart from '@/components/dashboard/state-breakdown-chart';
import type { UserProfile, Vessel, SeaServiceRecord, StateLog, DailyStatus } from '@/lib/types';
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
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAddVesselDialogOpen, setIsAddVesselDialogOpen] = useState(false);
  const [isSavingVessel, setIsSavingVessel] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [month, setMonth] = useState<Date>(new Date());

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

  useEffect(() => {
    if(dateRange?.from && dateRange?.to) {
        setIsStatusDialogOpen(true);
    }
  }, [dateRange]);

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
      // 1. Update user profile to set active vessel (only if no end date, meaning it's still active)
      const isActiveService = !data.endDate;
      if (isActiveService) {
        await updateUserProfile(supabase, user.id, {
          activeVesselId: data.vesselId,
        });
      }

      // 2. Create state logs for all dates from start to end
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


  const handleEndTrip = async () => {
    if (!currentVessel || !user?.id) return;
    
    try {
      // Update user profile to clear active vessel
      await updateUserProfile(supabase, user.id, {
        activeVesselId: null,
      });

      toast({ title: 'Service Ended', description: 'Your active service has been cleared.' });
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
                            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
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
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
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
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
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
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
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
                                                "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
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
            
            {/* Monthly Log - Redesigned */}
            <Card className="rounded-xl border shadow-sm">
                    <CardHeader>
                    <div className="flex items-center justify-between">
                            <div>
                            <CardTitle className="text-xl">Monthly Calendar</CardTitle>
                            <CardDescription className="mt-1">
                                View and update your vessel status for {currentVessel.name}. Select dates to update multiple days.
                            </CardDescription>
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                    <p>Click a day to start a range, click another to finish.<br/>Future dates are disabled.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </CardHeader>
                    <CardContent>
                    <div className="space-y-6">
                        {/* State Legend */}
                        <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/30 rounded-lg border">
                            <span className="text-sm font-medium text-muted-foreground">Status Legend:</span>
                            {vesselStates.map((state) => {
                                const StateIcon = state.icon;
                                return (
                                    <div key={state.value} className="flex items-center gap-2">
                                        <div 
                                            className="h-3 w-3 rounded-full" 
                                            style={{ backgroundColor: state.color }}
                                        />
                                        <span className="text-sm font-medium flex items-center gap-1">
                                            <StateIcon className="h-3 w-3" />
                                            {state.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Calendar */}
                        <div className="flex justify-center">
                        <Dialog open={isStatusDialogOpen} onOpenChange={(open) => {
                            if (!open) setDateRange(undefined);
                            setIsStatusDialogOpen(open);
                        }}>
                            <Calendar
                                mode="range"
                                selected={dateRange}
                                onSelect={setDateRange}
                                month={month}
                                onMonthChange={setMonth}
                                    className="p-0 w-full max-w-fit"
                                classNames={{
                                        months: "flex flex-col",
                                        month: "space-y-4",
                                        caption: "flex justify-center pt-1 relative items-center mb-4",
                                        caption_label: "text-base font-semibold",
                                        nav: "space-x-1 flex items-center",
                                        nav_button: cn(
                                            buttonVariants({ variant: "outline" }),
                                            "h-8 w-8 rounded-lg opacity-70 hover:opacity-100"
                                        ),
                                        nav_button_previous: "absolute left-1",
                                        nav_button_next: "absolute right-1",
                                        table: "w-full border-collapse space-y-1",
                                        head_row: "flex mb-2",
                                        head_cell: "text-muted-foreground rounded-lg w-12 font-semibold text-xs uppercase tracking-wider",
                                        row: "flex w-full mt-1",
                                        cell: "h-12 w-12 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                                        day: "h-12 w-12 p-0 font-medium rounded-lg transition-all hover:bg-accent",
                                        day_range_start: "bg-primary text-primary-foreground rounded-l-lg",
                                        day_range_end: "bg-primary text-primary-foreground rounded-r-lg",
                                        day_selected: "bg-primary/20 text-primary-foreground hover:bg-primary/30",
                                        day_today: "bg-accent/50 font-bold",
                                        day_disabled: "text-muted-foreground opacity-40 cursor-not-allowed",
                                        day_outside: "text-muted-foreground opacity-40",
                                        day_range_middle: "bg-primary/10",
                                }}
                                disabled={[{ after: endOfDay(new Date()) }]}
                                components={{
                                DayContent: ({ date }) => {
                                    const dateKey = format(date, 'yyyy-MM-dd');
                                            const log = stateLogs?.find(l => l.date === dateKey);
                                    const stateInfo = log ? vesselStates.find(s => s.value === log.state) : null;
                                    const isDateValid = date <= endOfDay(new Date());
                                            const isToday = isSameDay(date, new Date());

                                    return (
                                    <TooltipProvider>
                                        <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="relative h-full w-full flex items-center justify-center">
                                                                {stateInfo && isDateValid && (
                                                                    <div 
                                                                        className="absolute inset-1 rounded-lg opacity-90"
                                                                        style={{ backgroundColor: stateInfo.color }}
                                                                    />
                                                                )}
                                                                <span 
                                                                    className={cn(
                                                                        "relative z-10 font-semibold transition-all",
                                                                        stateInfo && isDateValid ? 'text-white drop-shadow-sm' : 'text-foreground',
                                                                        isToday && !stateInfo && 'text-primary font-bold'
                                                                    )}
                                                                >
                                                                    {format(date, 'd')}
                                                                </span>
                                            </div>
                                        </TooltipTrigger>
                                                        {stateInfo && (
                                                            <TooltipContent>
                                                                <p className="font-medium">{format(date, 'PPP')}: {stateInfo.label}</p>
                                                            </TooltipContent>
                                                        )}
                                        </Tooltip>
                                    </TooltipProvider>
                                    );
                                },
                                }}
                            />
                                <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>
                                        {dateRange?.from && dateRange.to ? 
                                                `Update Status: ${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                                                : dateRange?.from ?
                                                `Select end date for range starting ${format(dateRange.from, 'MMM d')}`
                                                : 'Select Date Range'}
                                    </DialogTitle>
                                </DialogHeader>
                                    <div className="grid grid-cols-1 gap-3 py-4">
                                {vesselStates.map((state) => {
                                            const StateIcon = state.icon;
                                    return (
                                                <Button 
                                                    key={state.value} 
                                                    variant="outline" 
                                                    className="justify-start gap-3 h-auto py-3 rounded-lg hover:bg-accent/50 transition-colors" 
                                                    onClick={() => handleRangeStateChange(state.value)}
                                                >
                                                    <div 
                                                        className="h-4 w-4 rounded-full shrink-0" 
                                                        style={{ backgroundColor: state.color }}
                                                    />
                                                    <StateIcon className="h-4 w-4 shrink-0" />
                                                    <span className="font-medium">{state.label}</span>
                                     </Button>
                                            );
                                        })}
                                </div>
                            </DialogContent>
                        </Dialog>
                        </div>
                    </div>
                    </CardContent>
                </Card>
            
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
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
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
                        <Button onClick={handleSaveNotes} disabled={isSavingNotes} className="rounded-lg">
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
