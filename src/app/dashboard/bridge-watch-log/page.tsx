'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, differenceInHours, startOfDay, endOfDay, parse, isValid } from 'date-fns';
import { Loader2, Ship, Clock, Navigation, CalendarDays, PlusCircle, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselAssignments } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Vessel, UserProfile, VesselAssignment } from '@/lib/types';

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
  date: z.date({ required_error: 'Please select a date.' }),
  vesselId: z.string().min(1, 'Please select a vessel.'),
  hours: z.number().min(0.1, 'Hours must be greater than 0').max(24, 'Hours cannot exceed 24'),
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

  // Check premium access
  const hasAccess = useMemo(() => {
    if (!userProfile) return false;
    const role = (userProfile as any)?.role || userProfile?.role || 'crew';
    const subscriptionTier = (userProfile as any)?.subscription_tier || userProfile?.subscriptionTier || 'free';
    const subscriptionStatus = (userProfile as any)?.subscription_status || userProfile?.subscriptionStatus || 'inactive';
    
    // Vessel accounts always have access
    if (role === 'vessel') return true;
    
    // Premium and Pro subscribers have access
    return subscriptionTier === 'premium' || subscriptionTier === 'pro';
  }, [userProfile]);

  const form = useForm<PastWatchFormValues>({
    resolver: zodResolver(pastWatchSchema),
    defaultValues: {
      date: new Date(),
      vesselId: '',
      hours: 4,
    },
  });

  // Watch for date and vessel changes to check vessel state
  const watchedDate = form.watch('date');
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
      if (!watchedDate || !watchedVesselId || !user?.id) {
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
    };

    checkVesselState();
  }, [watchedDate, watchedVesselId, user?.id, atAnchorDates]);

  // Redirect non-officers or non-premium users to dashboard
  useEffect(() => {
    if (!isLoadingProfile && userProfile && (!isOfficer || !hasAccess)) {
      router.push('/dashboard');
    }
  }, [isLoadingProfile, userProfile, isOfficer, hasAccess, router]);

  const getVesselName = (vesselId: string) => {
    return vessels?.find(v => v.id === vesselId)?.name || 'Unknown Vessel';
  };

  const formatDuration = (hours?: number | null) => {
    if (hours === null || hours === undefined) return '—';
    if (hours < 24) {
      return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
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

  const onSubmit = async (data: PastWatchFormValues) => {
    if (!user?.id) return;

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
      const dateStart = startOfDay(data.date);
      const dateEnd = endOfDay(data.date);
      
      // Calculate watch_end based on hours
      const watchEnd = new Date(dateStart);
      watchEnd.setHours(watchEnd.getHours() + Math.floor(data.hours));
      watchEnd.setMinutes(watchEnd.getMinutes() + Math.round((data.hours % 1) * 60));

      const { error } = await supabase
        .from('watch_logs')
        .insert({
          user_id: user.id,
          vessel_id: data.vesselId,
          watch_start: dateStart.toISOString(),
          watch_end: watchEnd.toISOString(),
          watch_type: 'bridge',
          hours: data.hours,
        });

      if (error) throw error;

      toast({
        title: 'Watch Logged',
        description: `Successfully logged ${data.hours} hours of watch for ${format(data.date, 'MMM d, yyyy')}.`,
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
      form.reset();
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
            form.reset();
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
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                            disabled={(date) => date > new Date()}
                            modifiers={{
                              atAnchor: watchedVesselId ? Array.from(atAnchorDates)
                                .map(dateStr => {
                                  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
                                  return isValid(parsed) ? parsed : null;
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
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the number of hours logged on watch for this date
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
