'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, differenceInHours, startOfDay, endOfDay, parse, isValid, setHours, setMinutes, isSameDay } from 'date-fns';
import { Loader2, Ship, Clock, Navigation, CalendarDays, PlusCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselAssignments } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Vessel, UserProfile, VesselAssignment } from '@/lib/types';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';

interface WatchLog {
  id: string;
  user_id: string;
  vessel_id: string;
  watch_start: string;
  watch_end?: string | null;
  hours?: number | null;
  created_at?: string;
}

const pastWatchSchema = z.object({
  method: z.enum(['hours', 'time_range'], { required_error: 'Please select a logging method.' }),
  vesselId: z.string().min(1, 'Please select a vessel.'),
  // For hours method
  date: z.date().optional(),
  hours: z.number().optional(),
  // For time range method
  startDateTime: z.date().optional(),
  endDateTime: z.date().optional(),
}).refine((data) => {
  if (data.method === 'hours') {
    return data.date !== undefined && data.hours !== undefined && data.hours > 0 && data.hours <= 24;
  } else {
    return data.startDateTime !== undefined && data.endDateTime !== undefined && 
           data.endDateTime > data.startDateTime;
  }
}, {
  message: 'Please complete all required fields.',
  path: ['method'],
});

type PastWatchFormValues = z.infer<typeof pastWatchSchema>;

export default function BridgeWatchLogPage() {
  const [watches, setWatches] = useState<WatchLog[]>([]);
  const [isLoadingWatches, setIsLoadingWatches] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingState, setIsCheckingState] = useState(false);
  const [vesselStateError, setVesselStateError] = useState<string | null>(null);
  const [atAnchorDates, setAtAnchorDates] = useState<Set<string>>(new Set());
  const [isLoadingAtAnchorDates, setIsLoadingAtAnchorDates] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [watchToDelete, setWatchToDelete] = useState<WatchLog | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    return {
      ...userProfileRaw,
      role: role,
      subscriptionTier: subscriptionTier,
      subscriptionStatus: subscriptionStatus,
    } as UserProfile;
  }, [userProfileRaw]);

  // Fetch vessel assignments
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setVesselAssignments([]);
      return;
    }

    const fetchAssignments = async () => {
      try {
        setIsLoadingAssignments(true);
        const assignments = await getVesselAssignments(supabase, user.id);
        setVesselAssignments(assignments);
      } catch (error) {
        console.error('Error fetching vessel assignments:', error);
        setVesselAssignments([]);
      } finally {
        setIsLoadingAssignments(false);
      }
    };

    fetchAssignments();
  }, [user?.id, supabase]);

  // Query vessels and filter to only assigned ones
  const { data: allVessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  const vessels = useMemo(() => {
    if (!allVessels || !vesselAssignments.length) return [];
    const assignedVesselIds = new Set(vesselAssignments.map(a => a.vesselId));
    return allVessels.filter(v => assignedVesselIds.has(v.id));
  }, [allVessels, vesselAssignments]);

  // Check if user is an officer
  const isOfficer = useMemo(() => {
    if (!userProfile) return false;
    const position = ((userProfile as any).position || userProfile.position || '').toLowerCase();
    const role = ((userProfile as any).role || userProfile.role || '').toLowerCase();
    
    const officerPositions = [
      'captain', 'master', 'chief officer', 'first officer', 'first mate', 
      'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
      'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
    ];
    
    return role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
  }, [userProfile]);

  // Premium / Pro entitlement (includes cancel-at-period-end until current_period_end)
  const hasAccess = useMemo(() => {
    if (!userProfile || !userProfileRaw) return false;
    const role = (userProfile as any)?.role || userProfile?.role || 'crew';
    const subscriptionTier = (
      (userProfile as any)?.subscription_tier ||
      userProfile?.subscriptionTier ||
      'free'
    )
      .toString()
      .toLowerCase();

    if (role === 'vessel') return true;

    const tierOk = subscriptionTier === 'premium' || subscriptionTier === 'pro';
    return tierOk && hasActiveSubscription(userProfileRaw);
  }, [userProfile, userProfileRaw]);

  const form = useForm<PastWatchFormValues>({
    resolver: zodResolver(pastWatchSchema),
    defaultValues: {
      method: 'hours',
      vesselId: '',
      date: new Date(),
      hours: 4,
      startDateTime: undefined,
      endDateTime: undefined,
    },
  });

  // Watch for date and vessel changes to check vessel state
  const watchedMethod = form.watch('method');
  const watchedDate = form.watch('date');
  const watchedStartDateTime = form.watch('startDateTime');
  const watchedEndDateTime = form.watch('endDateTime');
  const watchedVesselId = form.watch('vesselId');

  // Fetch watch logs from watch_logs table
  useEffect(() => {
    if (!user?.id) {
      setIsLoadingWatches(false);
      return;
    }

    const loadWatches = async () => {
      try {
        setIsLoadingWatches(true);
        const { data, error } = await supabase
          .from('watch_logs')
          .select('id, user_id, vessel_id, watch_start, watch_end, hours, created_at')
          .eq('user_id', user.id)
          .order('watch_start', { ascending: false });

        if (error) throw error;

        setWatches((data || []) as WatchLog[]);
      } catch (error: any) {
        console.error('Error loading watch logs:', error);
        toast({
          title: 'Error',
          description: 'Failed to load watch logs. Please refresh the page.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingWatches(false);
      }
    };

    loadWatches();
  }, [user?.id, supabase, toast]);

  // Fetch all "at anchor" dates for the selected vessel
  useEffect(() => {
    const fetchAtAnchorDates = async () => {
      if (!watchedVesselId) {
        setAtAnchorDates(new Set());
        return;
      }

      setIsLoadingAtAnchorDates(true);

      try {
        // Fetch all state logs for this vessel that are "at-anchor"
        const { data: stateLogs, error } = await supabase
          .from('daily_state_logs')
          .select('date')
          .eq('vessel_id', watchedVesselId)
          .eq('state', 'at-anchor');

        if (error) {
          console.error('Error fetching at anchor dates:', error);
          setAtAnchorDates(new Set());
          return;
        }

        // Create a set of date strings
        const dates = new Set<string>();
        if (stateLogs) {
          stateLogs.forEach(log => {
            dates.add(log.date);
          });
        }
        setAtAnchorDates(dates);
      } catch (error: any) {
        console.error('Error fetching at anchor dates:', error);
        setAtAnchorDates(new Set());
      } finally {
        setIsLoadingAtAnchorDates(false);
      }
    };

    fetchAtAnchorDates();
  }, [watchedVesselId, supabase]);

  // Check vessel state when date or vessel changes
  useEffect(() => {
    const checkVesselState = async () => {
      if (!watchedVesselId || !user?.id) {
        setVesselStateError(null);
        return;
      }

      // Only check for hours method (single date)
      if (watchedMethod === 'time_range') {
        // For time range, check both start and end dates
        if (!watchedStartDateTime) {
          setVesselStateError(null);
          return;
        }
        
        setIsCheckingState(true);
        setVesselStateError(null);

        try {
          const startDateStr = format(watchedStartDateTime, 'yyyy-MM-dd');
          const endDateStr = watchedEndDateTime ? format(watchedEndDateTime, 'yyyy-MM-dd') : null;
          
          // Check if start date is at anchor
          if (!atAnchorDates.has(startDateStr)) {
            setVesselStateError(`The vessel was not at anchor on ${startDateStr}. Watches can only be logged when the vessel is at anchor.`);
          } else if (endDateStr && endDateStr !== startDateStr && !atAnchorDates.has(endDateStr)) {
            setVesselStateError(`The vessel was not at anchor on ${endDateStr}. Watches can only be logged when the vessel is at anchor.`);
          } else {
            setVesselStateError(null);
          }
        } catch (error: any) {
          console.error('Error checking vessel state:', error);
          setVesselStateError('Unable to verify vessel state. Please try again.');
        } finally {
          setIsCheckingState(false);
        }
      } else {
        // Hours method - check single date
        if (!watchedDate) {
          setVesselStateError(null);
          return;
        }

        setIsCheckingState(true);
        setVesselStateError(null);

        try {
          const dateStr = format(watchedDate, 'yyyy-MM-dd');

          // Check if this date is in the at-anchor dates set
          if (!atAnchorDates.has(dateStr)) {
            setVesselStateError(`The vessel was not at anchor on ${dateStr}. Watches can only be logged when the vessel is at anchor.`);
          } else {
            setVesselStateError(null);
          }
        } catch (error: any) {
          console.error('Error checking vessel state:', error);
          setVesselStateError('Unable to verify vessel state. Please try again.');
        } finally {
          setIsCheckingState(false);
        }
      }
    };

    checkVesselState();
  }, [watchedDate, watchedStartDateTime, watchedMethod, watchedVesselId, user?.id, atAnchorDates, form]);

  // Check if user is a vessel account
  const isVesselAccount = useMemo(() => {
    if (!userProfile) return false;
    const role = (userProfile as any)?.role || userProfile?.role || 'crew';
    return role === 'vessel';
  }, [userProfile]);

  // Redirect non-officers, non-premium users, or vessel accounts to dashboard
  useEffect(() => {
    if (!isLoadingProfile && userProfile && (isVesselAccount || !isOfficer || !hasAccess)) {
      router.push('/dashboard');
    }
  }, [isLoadingProfile, userProfile, isVesselAccount, isOfficer, hasAccess, router]);

  const getVesselName = (vesselId: string) => {
    return vessels?.find(v => v.id === vesselId)?.name || 'Unknown Vessel';
  };

  const formatDuration = (hours?: number | null) => {
    if (hours === null || hours === undefined) return '—';
    const roundedHours = Math.floor(hours);
    if (roundedHours < 24) {
      return `${roundedHours}h`;
    }
    const days = Math.floor(roundedHours / 24);
    const remainingHours = roundedHours % 24;
    return `${days}d ${remainingHours}h`;
  };

  // Calculate summary statistics using the watch hours rule:
  // - Days with 4+ hours = 1 day (excess hours don't count)
  // - Days with <4 hours can be combined to reach 4 hours = 1 day
  const summaryStats = useMemo(() => {
    if (watches.length === 0) {
      return {
        totalDays: 0,
        totalWatches: 0,
        totalHours: 0,
      };
    }

    const totalWatches = watches.length;
    let fullDays = 0; // Days with 4+ hours
    let partialHours = 0; // Hours from days with <4 hours

    watches.forEach((watch) => {
      const hours = watch.hours || 0;
      if (hours >= 4) {
        // 4+ hours = 1 day, excess hours don't count
        fullDays += 1;
      } else {
        // <4 hours go into the partial pool
        partialHours += hours;
      }
    });

    // Combine partial hours: every 4 hours = 1 day
    const partialDays = Math.floor(partialHours / 4);
    const totalDays = fullDays + partialDays;
    const totalHours = watches.reduce((sum, w) => sum + (w.hours || 0), 0);

    return {
      totalDays,
      totalWatches,
      totalHours,
    };
  }, [watches]);

  const isLoading = isLoadingProfile || isLoadingVessels || isLoadingAssignments;

  const handleDeleteWatch = async () => {
    if (!watchToDelete || !user?.id) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('watch_logs')
        .delete()
        .eq('id', watchToDelete.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Watch Deleted',
        description: 'The watch log has been successfully deleted.',
      });

      // Reload watches
      const { data: watchData, error: fetchError } = await supabase
        .from('watch_logs')
        .select('id, user_id, vessel_id, watch_start, watch_end, hours, created_at')
        .eq('user_id', user.id)
        .order('watch_start', { ascending: false });

      if (!fetchError && watchData) {
        setWatches(watchData as WatchLog[]);
      }

      setDeleteDialogOpen(false);
      setWatchToDelete(null);
    } catch (error: any) {
      console.error('Error deleting watch:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete watch. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const onSubmit = async (data: PastWatchFormValues) => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to log a watch.',
        variant: 'destructive',
      });
      return;
    }

    console.log('[BRIDGE WATCH LOG] Form submitted with data:', data);
    console.log('[BRIDGE WATCH LOG] Form validation errors:', form.formState.errors);
    console.log('[BRIDGE WATCH LOG] Form is valid:', form.formState.isValid);

    // Validate required fields based on method
    if (data.method === 'hours') {
      if (!data.date) {
        toast({
          title: 'Validation Error',
          description: 'Please select a date.',
          variant: 'destructive',
        });
        return;
      }
      if (data.hours === undefined || data.hours === null || data.hours === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please enter hours (must be greater than 0).',
          variant: 'destructive',
        });
        return;
      }
      if (data.hours <= 0 || data.hours > 24) {
        toast({
          title: 'Validation Error',
          description: 'Hours must be between 0.1 and 24.',
          variant: 'destructive',
        });
        return;
      }
    } else {
      if (!data.startDateTime) {
        toast({
          title: 'Validation Error',
          description: 'Please select start date and time.',
          variant: 'destructive',
        });
        return;
      }
      if (!data.endDateTime) {
        toast({
          title: 'Validation Error',
          description: 'Please select end date and time.',
          variant: 'destructive',
        });
        return;
      }
      if (data.endDateTime <= data.startDateTime) {
        toast({
          title: 'Validation Error',
          description: 'End time must be after start time.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (vesselStateError) {
      toast({
        title: 'Invalid Date',
        description: vesselStateError,
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      let watchStart: Date;
      let watchEnd: Date;
      let hours: number;

      if (data.method === 'hours') {
        // Hours method: use date + hours
        if (!data.date || data.hours === undefined || data.hours === null) {
          throw new Error('Date and hours are required for hours method.');
        }
        
        watchStart = startOfDay(data.date);
        watchEnd = new Date(watchStart);
        watchEnd.setHours(watchEnd.getHours() + Math.floor(data.hours));
        watchEnd.setMinutes(watchEnd.getMinutes() + Math.round((data.hours % 1) * 60));
        hours = data.hours;
      } else {
        // Time range method: use start and end datetime
        if (!data.startDateTime || !data.endDateTime) {
          throw new Error('Start and end date/time are required for time range method.');
        }
        
        watchStart = data.startDateTime;
        watchEnd = data.endDateTime;
        
        // Calculate hours from time difference
        const diffMs = watchEnd.getTime() - watchStart.getTime();
        hours = diffMs / (1000 * 60 * 60); // Convert to hours
        
        if (hours <= 0 || hours > 24) {
          throw new Error('Watch duration must be between 0 and 24 hours.');
        }
      }

      const { error } = await supabase
        .from('watch_logs')
        .insert({
          user_id: user.id,
          vessel_id: data.vesselId,
          watch_start: watchStart.toISOString(),
          watch_end: watchEnd.toISOString(),
          watch_type: 'bridge',
          hours: hours,
        });

      if (error) throw error;

      const successMessage = data.method === 'hours'
        ? `Successfully logged ${hours.toFixed(1)} hours of watch for ${format(watchStart, 'MMM d, yyyy')}.`
        : `Successfully logged watch from ${format(watchStart, 'MMM d, yyyy HH:mm')} to ${format(watchEnd, 'MMM d, yyyy HH:mm')} (${hours.toFixed(1)} hours).`;

      toast({
        title: 'Watch Logged',
        description: successMessage,
      });

      // Reload watches
      const { data: watchData, error: fetchError } = await supabase
        .from('watch_logs')
        .select('id, user_id, vessel_id, watch_start, watch_end, hours, created_at')
        .eq('user_id', user.id)
        .order('watch_start', { ascending: false });

      if (!fetchError && watchData) {
        setWatches(watchData as WatchLog[]);
      }

      setIsFormOpen(false);
      form.reset({
        method: 'hours',
        vesselId: '',
        date: new Date(),
        hours: 4,
        startDateTime: undefined,
        endDateTime: undefined,
      });
      setVesselStateError(null);
    } catch (error: any) {
      console.error('Error logging watch:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to log watch. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Show loading while checking premium access or redirecting
  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show loading while redirecting non-officers or non-premium users
  if (userProfile && (!isOfficer || !hasAccess)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isLoading || isLoadingWatches) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bridge Watch Log</h1>
          <p className="text-muted-foreground mt-1">
            View all your logged watch days
          </p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            form.reset({
              method: 'hours',
              vesselId: '',
              date: new Date(),
              hours: 4,
              startDateTime: undefined,
              endDateTime: undefined,
            });
            setVesselStateError(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="h-4 w-4 mr-2" />
              Log Past Watch
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Log Past Watch</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                console.log('[BRIDGE WATCH LOG] Form validation failed:', errors);
                toast({
                  title: 'Validation Error',
                  description: 'Please check all required fields are filled correctly.',
                  variant: 'destructive',
                });
              })} className="space-y-4">
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logging Method</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="hours" id="hours" />
                            <Label htmlFor="hours" className="font-normal cursor-pointer">
                              Hours Logged
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="time_range" id="time_range" />
                            <Label htmlFor="time_range" className="font-normal cursor-pointer">
                              Time Range
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        Choose how you want to log the watch
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vesselId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a vessel" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {vessels?.map((vessel) => (
                            <SelectItem key={vessel.id} value={vessel.id}>
                              {vessel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedMethod === 'hours' ? (
                  <>
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarDays className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              if (date > new Date()) return true;
                              if (!watchedVesselId || atAnchorDates.size === 0) return false;
                              const dateStr = format(startOfDay(date), 'yyyy-MM-dd');
                              return !atAnchorDates.has(dateStr);
                            }}
                            modifiers={{
                              atAnchor: watchedVesselId ? Array.from(atAnchorDates)
                                .map(dateStr => {
                                  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
                                  return isValid(parsed) ? startOfDay(parsed) : null;
                                })
                                .filter((date): date is Date => date !== null) : [],
                            }}
                            modifiersClassNames={{
                              atAnchor: 'bg-green-500 text-white rounded-md font-semibold hover:bg-green-600',
                            }}
                            modifiersStyles={{
                              atAnchor: {
                                backgroundColor: 'rgb(34, 197, 94)',
                                color: 'white',
                                fontWeight: 600,
                              },
                            }}
                            initialFocus
                          />
                          {watchedVesselId && (
                            <div className="p-3 border-t text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded border-2 border-green-500 bg-green-100 dark:bg-green-900/30"></div>
                                <span>At Anchor (can log watch)</span>
                              </div>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                    <FormField
                      control={form.control}
                      name="hours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hours</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="24"
                              placeholder="4.0"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormDescription>
                            Enter the number of hours logged on watch for this date
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="startDateTime"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Start Date & Time</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP p")
                                  ) : (
                                    <span>Pick start date and time</span>
                                  )}
                                  <CalendarDays className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  if (date) {
                                    const newDate = field.value 
                                      ? setHours(setMinutes(date, new Date(field.value).getMinutes()), new Date(field.value).getHours())
                                      : date;
                                    field.onChange(newDate);
                                  }
                                }}
                                disabled={(date) => {
                                  if (date > new Date()) return true;
                                  if (!watchedVesselId || atAnchorDates.size === 0) return false;
                                  const dateStr = format(startOfDay(date), 'yyyy-MM-dd');
                                  return !atAnchorDates.has(dateStr);
                                }}
                                modifiers={{
                                  atAnchor: watchedVesselId ? Array.from(atAnchorDates)
                                    .map(dateStr => {
                                      const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
                                      return isValid(parsed) ? startOfDay(parsed) : null;
                                    })
                                    .filter((date): date is Date => date !== null) : [],
                                }}
                                modifiersClassNames={{
                                  atAnchor: 'bg-green-500 text-white rounded-md font-semibold hover:bg-green-600',
                                }}
                                modifiersStyles={{
                                  atAnchor: {
                                    backgroundColor: 'rgb(34, 197, 94)',
                                    color: 'white',
                                    fontWeight: 600,
                                  },
                                }}
                                initialFocus
                              />
                              {watchedVesselId && (
                                <div className="p-3 border-t text-xs text-muted-foreground">
                                  <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded border-2 border-green-500 bg-green-100 dark:bg-green-900/30"></div>
                                    <span>At Anchor (can log watch)</span>
                                  </div>
                                </div>
                              )}
                              <div className="p-3 border-t space-y-2">
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs">Time</Label>
                                  <Input
                                    type="time"
                                    value={field.value ? format(field.value, 'HH:mm') : ''}
                                    onChange={(e) => {
                                      const [hours, minutes] = e.target.value.split(':').map(Number);
                                      if (field.value && !isNaN(hours) && !isNaN(minutes)) {
                                        field.onChange(setHours(setMinutes(field.value, minutes), hours));
                                      } else if (!field.value) {
                                        const now = new Date();
                                        field.onChange(setHours(setMinutes(now, minutes), hours));
                                      }
                                    }}
                                    className="w-full"
                                  />
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endDateTime"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>End Date & Time</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP p")
                                  ) : (
                                    <span>Pick end date and time</span>
                                  )}
                                  <CalendarDays className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  if (date) {
                                    const newDate = field.value 
                                      ? setHours(setMinutes(date, new Date(field.value).getMinutes()), new Date(field.value).getHours())
                                      : date;
                                    field.onChange(newDate);
                                  }
                                }}
                                disabled={(date) => {
                                  if (date > new Date()) return true;
                                  if (!watchedVesselId || atAnchorDates.size === 0) return false;
                                  const dateStr = format(startOfDay(date), 'yyyy-MM-dd');
                                  return !atAnchorDates.has(dateStr);
                                }}
                                modifiers={{
                                  atAnchor: watchedVesselId ? Array.from(atAnchorDates)
                                    .map(dateStr => {
                                      const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
                                      return isValid(parsed) ? startOfDay(parsed) : null;
                                    })
                                    .filter((date): date is Date => date !== null) : [],
                                }}
                                modifiersClassNames={{
                                  atAnchor: 'bg-green-500 text-white rounded-md font-semibold hover:bg-green-600',
                                }}
                                modifiersStyles={{
                                  atAnchor: {
                                    backgroundColor: 'rgb(34, 197, 94)',
                                    color: 'white',
                                    fontWeight: 600,
                                  },
                                }}
                                initialFocus
                              />
                              {watchedVesselId && (
                                <div className="p-3 border-t text-xs text-muted-foreground">
                                  <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded border-2 border-green-500 bg-green-100 dark:bg-green-900/30"></div>
                                    <span>At Anchor (can log watch)</span>
                                  </div>
                                </div>
                              )}
                              <div className="p-3 border-t space-y-2">
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs">Time</Label>
                                  <Input
                                    type="time"
                                    value={field.value ? format(field.value, 'HH:mm') : ''}
                                    onChange={(e) => {
                                      const [hours, minutes] = e.target.value.split(':').map(Number);
                                      if (field.value && !isNaN(hours) && !isNaN(minutes)) {
                                        field.onChange(setHours(setMinutes(field.value, minutes), hours));
                                      } else if (!field.value) {
                                        const now = new Date();
                                        field.onChange(setHours(setMinutes(now, minutes), hours));
                                      }
                                    }}
                                    className="w-full"
                                  />
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <FormDescription>
                            End time must be after start time
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {isCheckingState && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertDescription>
                      Checking vessel state for selected date...
                    </AlertDescription>
                  </Alert>
                )}

                {vesselStateError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {vesselStateError}
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsFormOpen(false);
                      form.reset();
                      setVesselStateError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving || !!vesselStateError || isCheckingState}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Log Watch'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      {watches.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Watch Days</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalDays}</div>
              <p className="text-xs text-muted-foreground">Days on Watch (calculated)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalHours.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">Hours Logged</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Watches</CardTitle>
              <Navigation className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalWatches}</div>
              <p className="text-xs text-muted-foreground">Watches Logged</p>
            </CardContent>
          </Card>
        </div>
      )}

      {watches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Navigation className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No watch logs yet</h3>
            <p className="text-muted-foreground mb-4">
              Watch logs will appear here when you log watches on the Current page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Watch History</CardTitle>
            <CardDescription>
              {watches.length} {watches.length === 1 ? 'watch' : 'watches'} recorded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watches.map((watch) => {
                  const duration = formatDuration(watch.hours);
                  const watchDate = format(new Date(watch.watch_start), 'MMM d, yyyy');
                  
                  return (
                    <TableRow key={watch.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          {watchDate}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-muted-foreground" />
                          {getVesselName(watch.vessel_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {duration !== '—' ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {duration}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setWatchToDelete(watch);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Watch Log?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span className="block">
                Are you sure you want to delete this watch log? This action cannot be undone.
                {watchToDelete && (
                  <span className="mt-2 block text-sm">
                    <span className="block">Date: {format(new Date(watchToDelete.watch_start), 'MMM d, yyyy')}</span>
                    <span className="block">Vessel: {getVesselName(watchToDelete.vessel_id)}</span>
                    {watchToDelete.hours && <span className="block">Hours: {watchToDelete.hours}</span>}
                  </span>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWatch}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
