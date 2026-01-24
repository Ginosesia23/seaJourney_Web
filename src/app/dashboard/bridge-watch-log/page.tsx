'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInHours, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { PlusCircle, Loader2, Ship, Clock, Edit, Trash2, Moon, Sun, Eye, AlertTriangle, Navigation, CheckCircle2, CalendarDays, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { useToast } from '@/hooks/use-toast';
import { 
  getBridgeWatchLogs, 
  createBridgeWatchLog, 
  updateBridgeWatchLog, 
  deleteBridgeWatchLog,
  getPassageLogs
} from '@/supabase/database/queries';
import type { Vessel, UserProfile, BridgeWatchLog, PassageLog } from '@/lib/types';
import { cn } from '@/lib/utils';

const bridgeWatchSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  passageId: z.string().optional(),
  startTime: z.date({ required_error: 'Watch start time is required.' }),
  endTime: z.date({ required_error: 'Watch end time is required.' }),
  state: z.string().min(1, 'State is required.'),
  role: z.string().min(1, 'Role is required.'),
  isNightWatch: z.boolean(),
  soloWatch: z.boolean(),
  supervisedByName: z.string().optional(),
  area: z.string().optional(),
  trafficDensity: z.string().optional(),
  visibility: z.string().optional(),
  weatherSummary: z.string().optional(),
  incidents: z.string().optional(),
  equipmentUsed: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  return data.endTime >= data.startTime;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

type BridgeWatchFormValues = z.infer<typeof bridgeWatchSchema>;

const watchStates = [
  { value: 'underway', label: 'Underway' },
  { value: 'anchor', label: 'At Anchor' },
  { value: 'port', label: 'In Port' },
  { value: 'yard', label: 'In Yard' },
];

const watchRoles = [
  { value: 'OOW', label: 'OOW (Officer of the Watch)' },
  { value: 'co-watch', label: 'Co-Watch' },
  { value: 'lookout', label: 'Lookout' },
  { value: 'helmsman', label: 'Helmsman' },
];

const trafficDensityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// Helper to determine if watch is a night watch (6 PM - 6 AM)
const isNightWatchTime = (startTime: Date, endTime: Date): boolean => {
  const startHour = startTime.getHours();
  const endHour = endTime.getHours();
  
  // Check if any part of the watch falls between 18:00 (6 PM) and 06:00 (6 AM)
  if (startHour >= 18 || startHour < 6 || endHour >= 18 || endHour < 6) {
    return true;
  }
  
  // Check if watch spans midnight
  if (startHour >= 18 && endHour < 6) {
    return true;
  }
  
  return false;
};

export default function BridgeWatchLogPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingWatch, setEditingWatch] = useState<BridgeWatchLog | null>(null);
  const [watches, setWatches] = useState<BridgeWatchLog[]>([]);
  const [passages, setPassages] = useState<PassageLog[]>([]);
  const [isLoadingWatches, setIsLoadingWatches] = useState(true);

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

  // Query vessels
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  // Fetch passages for linking
  useEffect(() => {
    if (!user?.id) return;

    const loadPassages = async () => {
      try {
        const data = await getPassageLogs(supabase, user.id);
        // Only show active/in-progress or recent passages (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const filteredPassages = data.filter(p => {
          const endDate = new Date(p.end_time);
          return endDate >= thirtyDaysAgo;
        });
        
        setPassages(filteredPassages);
      } catch (error) {
        console.error('Error loading passages:', error);
      }
    };

    loadPassages();
  }, [user?.id, supabase]);

  // Fetch watch logs from database
  useEffect(() => {
    if (!user?.id) {
      setIsLoadingWatches(false);
      return;
    }

    const loadWatches = async () => {
      try {
        setIsLoadingWatches(true);
        const data = await getBridgeWatchLogs(supabase, user.id);
        setWatches(data);
      } catch (error: any) {
        console.error('Error loading bridge watch logs:', error);
        toast({
          title: 'Error',
          description: 'Failed to load bridge watch logs. Please refresh the page.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingWatches(false);
      }
    };

    loadWatches();
  }, [user?.id, supabase, toast]);

  const form = useForm<BridgeWatchFormValues>({
    resolver: zodResolver(bridgeWatchSchema),
    defaultValues: {
      vesselId: '',
      passageId: undefined,
      startTime: new Date(),
      endTime: new Date(),
      state: '',
      role: '',
      isNightWatch: false,
      soloWatch: false,
      supervisedByName: '',
      area: '',
      trafficDensity: undefined,
      visibility: '',
      weatherSummary: '',
      incidents: '',
      equipmentUsed: '',
      notes: '',
    },
  });

  // Auto-detect night watch when times change
  const watchedStartTime = form.watch('startTime');
  const watchedEndTime = form.watch('endTime');

  useEffect(() => {
    if (watchedStartTime && watchedEndTime && watchedStartTime instanceof Date && watchedEndTime instanceof Date) {
      const isNight = isNightWatchTime(watchedStartTime, watchedEndTime);
      form.setValue('isNightWatch', isNight);
    }
  }, [watchedStartTime, watchedEndTime, form]);

  // Check if user has access (premium/pro for crew, any active tier for vessels)
  const hasAccess = useMemo(() => {
    if (!userProfile) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    const status = (userProfile as any).subscription_status || userProfile.subscriptionStatus || 'inactive';
    const role = (userProfile as any).role || userProfile.role || 'crew';
    
    // Vessel accounts: allow all active vessel tiers
    if (role === 'vessel') {
      const tierLower = tier.toLowerCase();
      return (tierLower.startsWith('vessel_') || tierLower === 'vessel_lite' || tierLower === 'vessel_basic' || tierLower === 'vessel_pro' || tierLower === 'vessel_fleet') && status === 'active';
    }
    
    // Crew accounts: premium or pro only
    return (tier === 'premium' || tier === 'pro') && status === 'active';
  }, [userProfile]);

  // Redirect non-premium users to dashboard
  useEffect(() => {
    if (!isLoadingProfile && userProfile && !hasAccess) {
      router.push('/dashboard');
    }
  }, [isLoadingProfile, userProfile, hasAccess, router]);

  const onSubmit = async (data: BridgeWatchFormValues) => {
    if (!user?.id || !hasAccess) {
      const role = (userProfile as any)?.role || userProfile?.role || 'crew';
      const message = role === 'vessel' 
        ? 'Bridge Watch Log requires an active vessel subscription.'
        : 'Bridge Watch Log is available for Premium and Pro subscribers.';
      toast({
        title: 'Subscription Required',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      if (editingWatch) {
        await updateBridgeWatchLog(supabase, editingWatch.id, {
          vesselId: data.vesselId,
          passageId: data.passageId || null,
          startTime: data.startTime,
          endTime: data.endTime,
          state: data.state,
          role: data.role,
          isNightWatch: data.isNightWatch,
          soloWatch: data.soloWatch,
          supervisedByName: data.supervisedByName || undefined,
          area: data.area || undefined,
          trafficDensity: data.trafficDensity || undefined,
          visibility: data.visibility || undefined,
          weatherSummary: data.weatherSummary || undefined,
          incidents: data.incidents || undefined,
          equipmentUsed: data.equipmentUsed || undefined,
          notes: data.notes || undefined,
        });

        toast({
          title: 'Watch Log Updated',
          description: 'Your bridge watch log has been updated successfully.',
        });
      } else {
        await createBridgeWatchLog(supabase, {
          crewId: user.id,
          vesselId: data.vesselId,
          passageId: data.passageId || null,
          startTime: data.startTime,
          endTime: data.endTime,
          state: data.state,
          role: data.role,
          isNightWatch: data.isNightWatch,
          soloWatch: data.soloWatch,
          supervisedByName: data.supervisedByName || undefined,
          area: data.area || undefined,
          trafficDensity: data.trafficDensity || undefined,
          visibility: data.visibility || undefined,
          weatherSummary: data.weatherSummary || undefined,
          incidents: data.incidents || undefined,
          equipmentUsed: data.equipmentUsed || undefined,
          notes: data.notes || undefined,
        });

        toast({
          title: 'Watch Log Added',
          description: 'Your bridge watch has been logged successfully.',
        });
      }

      // Reload watches
      const updatedWatches = await getBridgeWatchLogs(supabase, user.id);
      setWatches(updatedWatches);

      setIsFormOpen(false);
      setEditingWatch(null);
      form.reset();
    } catch (error: any) {
      console.error('Error saving bridge watch log:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save bridge watch log. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (watch: BridgeWatchLog) => {
    setEditingWatch(watch);
    form.reset({
      vesselId: watch.vessel_id,
      passageId: watch.passage_id || undefined,
      startTime: new Date(watch.start_time),
      endTime: new Date(watch.end_time),
      state: watch.state,
      role: watch.role,
      isNightWatch: watch.is_night_watch,
      soloWatch: watch.solo_watch,
      supervisedByName: watch.supervised_by_name || '',
      area: watch.area || '',
      trafficDensity: watch.traffic_density || undefined,
      visibility: watch.visibility || '',
      weatherSummary: watch.weather_summary || '',
      incidents: watch.incidents || '',
      equipmentUsed: watch.equipment_used || '',
      notes: watch.notes || '',
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (watchId: string) => {
    if (!confirm('Are you sure you want to delete this bridge watch log?')) return;

    try {
      await deleteBridgeWatchLog(supabase, watchId);
      setWatches(watches.filter(w => w.id !== watchId));
      toast({
        title: 'Watch Log Deleted',
        description: 'The bridge watch log has been removed.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete bridge watch log. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getVesselName = (vesselId: string) => {
    return vessels?.find(v => v.id === vesselId)?.name || 'Unknown Vessel';
  };

  const getPassageDescription = (passageId?: string | null) => {
    if (!passageId) return null;
    const passage = passages.find(p => p.id === passageId);
    if (!passage) return null;
    return `${passage.departure_port} → ${passage.arrival_port}`;
  };

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const hours = differenceInHours(end, start);
    return `${hours}h`;
  };

  const calculateDurationHours = (startTime: string, endTime: string): number => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return differenceInHours(end, start);
  };

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    if (watches.length === 0) {
      return {
        totalHours: 0,
        totalWatches: 0,
        longestWatch: null as BridgeWatchLog | null,
        longestDuration: '',
        longestDurationHours: 0,
        nightWatches: 0,
        soloWatches: 0,
        averageDuration: 0,
      };
    }

    const totalHours = watches.reduce((sum, w) => 
      sum + calculateDurationHours(w.start_time, w.end_time), 0
    );
    const totalWatches = watches.length;
    
    // Find longest watch
    const longestWatch = watches.reduce((longest, w) => {
      const currentDuration = calculateDurationHours(w.start_time, w.end_time);
      const longestDuration = longest 
        ? calculateDurationHours(longest.start_time, longest.end_time)
        : 0;
      return currentDuration > longestDuration ? w : longest;
    }, null as BridgeWatchLog | null);

    const longestDurationHours = longestWatch 
      ? calculateDurationHours(longestWatch.start_time, longestWatch.end_time)
      : 0;

    const longestDuration = longestWatch 
      ? calculateDuration(longestWatch.start_time, longestWatch.end_time)
      : '0h';

    const nightWatches = watches.filter(w => w.is_night_watch).length;
    const soloWatches = watches.filter(w => w.solo_watch).length;
    const averageDuration = totalHours / totalWatches;

    return {
      totalHours,
      totalWatches,
      longestWatch,
      longestDuration,
      longestDurationHours,
      nightWatches,
      soloWatches,
      averageDuration,
    };
  }, [watches]);

  const isLoading = isLoadingProfile || isLoadingVessels;

  // Show loading while checking premium access or redirecting
  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show loading while redirecting non-premium users
  if (userProfile && !hasAccess) {
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
            Record your bridge watch duties and navigation experience
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {watches.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Watch Hours</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalHours.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">Hours on Watch</p>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Night Watches</CardTitle>
              <Moon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.nightWatches}</div>
              <p className="text-xs text-muted-foreground">
                {summaryStats.totalWatches > 0 
                  ? `${Math.round((summaryStats.nightWatches / summaryStats.totalWatches) * 100)}% of total`
                  : '0% of total'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-end mb-6">
        <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingWatch(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild className="rounded-xl">
            <Button>
              <PlusCircle className="h-4 w-4 mr-2" />
              Log Watch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingWatch ? 'Edit Bridge Watch' : 'Log New Bridge Watch'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="vesselId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={vessels?.map(v => ({ value: v.id, label: v.name })) || []}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Select a vessel"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="passageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linked Passage (Optional)</FormLabel>
                      <FormDescription>
                        Link this watch to an active passage
                      </FormDescription>
                      <Select 
                        onValueChange={(value) => field.onChange(value === 'none' ? undefined : value)} 
                        value={field.value || 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="No passage linked" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No passage linked</SelectItem>
                          {passages.map((passage) => (
                            <SelectItem key={passage.id} value={passage.id}>
                              {passage.departure_port} → {passage.arrival_port} ({format(new Date(passage.start_time), 'MMM d, yyyy')})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Watch Start</FormLabel>
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
                                  <span>Pick start time</span>
                                )}
                                <Clock className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
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
                        <FormLabel>Watch End</FormLabel>
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
                                  <span>Pick end time</span>
                                )}
                                <Clock className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const startDate = form.getValues('startTime');
                                return startDate && date < startDate;
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {watchStates.map((state) => (
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

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {watchRoles.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
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
                    name="isNightWatch"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Night Watch</FormLabel>
                          <FormDescription>
                            Auto-detected based on watch times
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="soloWatch"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Solo Watch</FormLabel>
                          <FormDescription>
                            Alone on watch
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="supervisedByName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supervised By (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Captain/Chief Officer name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="area"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Area (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. West Med, Caribbean" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="trafficDensity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Traffic Density</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === 'none' ? undefined : value)} 
                          value={field.value || 'none'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select density" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Not specified</SelectItem>
                            {trafficDensityOptions.map((density) => (
                              <SelectItem key={density.value} value={density.value}>
                                {density.label}
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
                    name="visibility"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Visibility (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Good, Poor, Foggy" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="weatherSummary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weather Summary (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Brief weather description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="equipmentUsed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Used (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Radar, ECDIS, ARPA, Paper Charts" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="incidents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Incidents (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Near misses, drills, or other notable incidents..."
                          {...field}
                          rows={2}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional comments or observations..."
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
                    className="rounded-xl"
                    variant="outline"
                    onClick={() => {
                      setIsFormOpen(false);
                      setEditingWatch(null);
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
                      editingWatch ? 'Update Watch Log' : 'Log Watch'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {watches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Navigation className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No bridge watch logs yet</h3>
            <p className="text-muted-foreground mb-4">
              Start recording your bridge watch duties by logging your first watch.
            </p>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Log First Watch
            </Button>
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
                  <TableHead>Vessel</TableHead>
                  <TableHead>Watch Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>State / Role</TableHead>
                  <TableHead>Passage</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watches.map((watch) => {
                  const duration = calculateDuration(watch.start_time, watch.end_time);
                  const passageDesc = getPassageDescription(watch.passage_id);
                  
                  return (
                    <TableRow key={watch.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-muted-foreground" />
                          {getVesselName(watch.vessel_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{format(new Date(watch.start_time), 'MMM d, yyyy HH:mm')}</div>
                          <div className="text-muted-foreground">
                            {format(new Date(watch.end_time), 'MMM d, yyyy HH:mm')}
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
                          <div className="font-medium capitalize">{watch.state}</div>
                          <div className="text-muted-foreground">{watch.role}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {passageDesc ? (
                          <span className="text-sm">{passageDesc}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {watch.is_night_watch && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">
                              <Moon className="h-3 w-3 mr-1" />
                              Night
                            </Badge>
                          )}
                          {watch.solo_watch && (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/30">
                              Solo
                            </Badge>
                          )}
                          {watch.incidents && (
                            <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Incident
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(watch)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(watch.id)}
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
