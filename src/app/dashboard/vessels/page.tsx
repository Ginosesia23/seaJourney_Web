'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, Loader2, Ship, ChevronDown, Search, LayoutGrid, List, PlayCircle, Trash2, CalendarIcon, ShieldCheck } from 'lucide-react';
import { format, eachDayOfInterval, startOfDay, endOfDay, parse } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { createVessel, getVesselStateLogs, getVesselSeaService, updateUserProfile, deleteVesselStateLogs, updateStateLogsBatch } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import type { Vessel, StateLog, UserProfile, SeaServiceRecord, DailyStatus } from '@/lib/types';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { cn } from '@/lib/utils';
import { VesselSummaryCard, VesselSummarySkeleton } from '@/components/dashboard/vessel-summary-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const vesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.enum(vesselTypeValues, {
    required_error: 'Please select a vessel type.',
  }),
  officialNumber: z.string().optional(),
});
type VesselFormValues = z.infer<typeof vesselSchema>;

const pastVesselSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  startDate: z.date({ required_error: 'A start date is required.' }),
  endDate: z.date({ required_error: 'An end date is required.' }),
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

type PastVesselFormValues = z.infer<typeof pastVesselSchema>;

const vesselStates: { value: DailyStatus; label: string; color: string }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))' },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))' },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))' },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))' },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))' },
];

export default function VesselsPage() {
  const router = useRouter();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [vesselStateLogs, setVesselStateLogs] = useState<Map<string, StateLog[]>>(new Map());
  const [allSeaService, setAllSeaService] = useState<SeaServiceRecord[]>([]);
  const [expandedVesselId, setExpandedVesselId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [layout, setLayout] = useState<'card' | 'table'>('table');
  const [resumingVesselId, setResumingVesselId] = useState<string | null>(null);
  const [vesselToDelete, setVesselToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddPastVesselDialogOpen, setIsAddPastVesselDialogOpen] = useState(false);
  const [isSavingPastVessel, setIsSavingPastVessel] = useState(false);
  const [requestingCaptaincyVesselId, setRequestingCaptaincyVesselId] = useState<string | null>(null);
  const [isRequestingCaptaincy, setIsRequestingCaptaincy] = useState(false);
  const [captaincyRequests, setCaptaincyRequests] = useState<Map<string, { id: string; status: string }>>(new Map());

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const form = useForm<VesselFormValues>({
    resolver: zodResolver(vesselSchema),
    defaultValues: {
      name: '',
      type: undefined,
      officialNumber: '',
    },
  });

  const pastVesselForm = useForm<PastVesselFormValues>({
    resolver: zodResolver(pastVesselSchema),
    defaultValues: { 
      vesselId: '', 
      startDate: undefined, 
      endDate: undefined, 
      initialState: 'underway' 
    },
  });

  // Query all vessels (vessels are shared, not owned by users)
  const { data: allVessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );
  
  // Fetch user profile to get activeVesselId
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const currentUserProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    const position = (userProfileRaw as any).position || (userProfileRaw as any).position || '';
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      position: position,
      role: role,
      subscriptionTier: (userProfileRaw as any).subscription_tier || userProfileRaw.subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || userProfileRaw.subscriptionStatus || 'inactive',
    } as UserProfile;
  }, [userProfileRaw]);

  // Check if user is a captain (has captain role, or position contains "captain", or role is "vessel"/"admin")
  const isCaptain = useMemo(() => {
    if (!currentUserProfile) return false;
    const position = currentUserProfile.position?.toLowerCase() || '';
    const role = currentUserProfile.role?.toLowerCase() || '';
    return role === 'captain' || position.includes('captain') || role === 'vessel' || role === 'admin';
  }, [currentUserProfile]);

  // Fetch state logs and sea service for each vessel
  useEffect(() => {
    if (allVessels && user?.id) {
      const fetchData = async () => {
      const newLogs = new Map<string, StateLog[]>();
        const serviceRecords: SeaServiceRecord[] = [];
        
        await Promise.all(allVessels.map(async (vessel) => {
          const [logs, seaService] = await Promise.all([
            getVesselStateLogs(supabase, vessel.id, user.id),
            getVesselSeaService(supabase, user.id, vessel.id)
          ]);
          
          if (logs && logs.length > 0) {
          newLogs.set(vessel.id, logs);
          }
          if (seaService && seaService.length > 0) {
            serviceRecords.push(...seaService);
          }
        }));
        
        setVesselStateLogs(newLogs);
        setAllSeaService(serviceRecords);
      };
      fetchData();
    }
  }, [allVessels, user?.id, supabase]);

  // Fetch captaincy requests for vessels (if user is captain)
  useEffect(() => {
    if (isCaptain && user?.id && allVessels) {
      const fetchCaptaincyRequests = async () => {
        const requestsMap = new Map<string, { id: string; status: string }>();
        // Fetch pending requests for vessels user has logged time on
        for (const vessel of allVessels) {
          if (vesselStateLogs.has(vessel.id)) {
            const { data } = await supabase
              .from('vessel_captaincy')
              .select('id, status')
              .eq('vessel_id', vessel.id)
              .eq('user_id', user.id)
              .eq('status', 'pending')
              .maybeSingle();
            
            if (data) {
              requestsMap.set(vessel.id, { id: data.id, status: data.status });
            }
          }
        }
        setCaptaincyRequests(requestsMap);
      };
      fetchCaptaincyRequests();
    }
  }, [isCaptain, user?.id, allVessels, vesselStateLogs, supabase]);

  // Filter vessels to only show ones the user has logged time on, and sort to show current vessel first
  const vessels = useMemo(() => {
    if (!allVessels) return [];
    const filtered = allVessels.filter(vessel => {
      const logs = vesselStateLogs.get(vessel.id) || [];
      return logs.length > 0; // Only show vessels with logged days
    });
    
    // Sort to show current/active vessel at the top
    return filtered.sort((a, b) => {
      const aIsCurrent = currentUserProfile?.activeVesselId === a.id;
      const bIsCurrent = currentUserProfile?.activeVesselId === b.id;
      
      // Current vessel should come first
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      
      // If both are current or both are not, maintain original order (most recent first based on created_at)
      return 0;
    });
  }, [allVessels, vesselStateLogs, currentUserProfile]);

  const filteredVessels = useMemo(() => {
    if (!searchTerm) return vessels;
    return vessels.filter(vessel => 
      vessel.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [vessels, searchTerm]);

  // Create vessel summaries for card view
  const vesselSummaries = useMemo(() => {
    return filteredVessels.map(vessel => {
      const vesselServices = allSeaService.filter(s => s.vesselId === vessel.id);
      const vesselLogs = vesselStateLogs.get(vessel.id) || [];
      
      const totalDays = vesselLogs.length;

      const dayCountByState = vesselLogs.reduce((acc, log) => {
        acc[log.state] = (acc[log.state] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const isCurrent = vessel.id === currentUserProfile?.activeVesselId;

      return {
        ...vessel,
        totalDays,
        tripCount: vesselServices.length,
        dayCountByState,
        isCurrent
      };
    });
  }, [filteredVessels, allSeaService, vesselStateLogs, currentUserProfile]);

  // Count vessels user has logged time on
  const vesselCount = useMemo(() => {
    return vesselStateLogs.size;
  }, [vesselStateLogs]);

  // Check vessel limit based on subscription tier
  const hasUnlimitedVessels = useMemo(() => {
    if (!currentUserProfile) return false;
    const tier = currentUserProfile.subscriptionTier?.toLowerCase() || 'free';
    const status = currentUserProfile.subscriptionStatus?.toLowerCase() || 'inactive';
    return (tier === 'premium' || tier === 'pro') && status === 'active';
  }, [currentUserProfile]);

  const vesselLimit = hasUnlimitedVessels ? Infinity : 3;
  const canAddVessel = hasUnlimitedVessels || vesselCount < vesselLimit;

  // Check if user can resume a vessel (only if no active vessel)
  const canResumeVessel = !currentUserProfile?.activeVesselId;

  const isLoading = isLoadingVessels || isLoadingProfile || (vessels && vesselStateLogs.size === 0 && vessels.length > 0);
  
  const handleOpenChange = (open: boolean) => {
    if(!open) {
        form.reset({ name: '', type: '', officialNumber: ''});
    }
    setIsFormOpen(open);
  }

  async function onSubmit(data: VesselFormValues) {
    if (!user?.id) return;

    // Check vessel limit for Standard tier
    if (!canAddVessel) {
      toast({
        title: 'Vessel Limit Reached',
        description: `Standard tier allows up to ${vesselLimit} vessels. Upgrade to Premium or Pro for unlimited vessels.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    
    try {
            await createVessel(supabase, {
              name: data.name,
              type: data.type,
              officialNumber: data.officialNumber,
            });
            toast({ title: 'Vessel Added', description: `${data.name} has been added.` });
        form.reset();
        handleOpenChange(false);
    } catch (serverError: any) {
        console.error("Failed to save vessel:", serverError);
        toast({
          title: 'Error',
          description: serverError.message || 'Failed to save vessel. Please try again.',
          variant: 'destructive',
          });
    } finally {
        setIsSaving(false);
    }
  }

  // Handler to resume a past vessel
  const handleResumeVessel = useCallback(async (vesselId: string) => {
    if (!user?.id || !currentUserProfile) return;
    
    setResumingVesselId(vesselId);
    try {
      await updateUserProfile(supabase, user.id, {
        activeVesselId: vesselId,
      });
      
      toast({
        title: 'Vessel Resumed',
        description: 'This vessel is now your active vessel. You can start logging new service.',
      });
      
      router.refresh();
    } catch (error: any) {
      console.error('Error resuming vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to resume vessel. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResumingVesselId(null);
    }
  }, [user?.id, currentUserProfile, supabase, toast, router]);

  // Handler to delete vessel data
  const handleDeleteVessel = useCallback(async (vesselId: string, vesselName: string) => {
    if (!user?.id) return;
    
    setIsDeleting(true);
    try {
      // Delete all state logs for this user and vessel
      await deleteVesselStateLogs(supabase, user.id, vesselId);
      
      // If this is the active vessel, clear the activeVesselId
      if (currentUserProfile?.activeVesselId === vesselId) {
        await updateUserProfile(supabase, user.id, {
          activeVesselId: null,
        });
      }

      toast({
        title: 'Vessel Data Deleted',
        description: `All data for "${vesselName}" has been permanently deleted.`,
      });

      // Refresh the data
      if (allVessels && vessels.length > 0) {
        const newLogs = new Map<string, StateLog[]>();
        const serviceRecords: SeaServiceRecord[] = [];
        
        await Promise.all(allVessels.map(async (vessel) => {
          const [logs, seaService] = await Promise.all([
            getVesselStateLogs(supabase, vessel.id, user.id),
            getVesselSeaService(supabase, user.id, vessel.id)
          ]);
          
          if (logs && logs.length > 0) {
            newLogs.set(vessel.id, logs);
          }
          if (seaService && seaService.length > 0) {
            serviceRecords.push(...seaService);
          }
        }));

        setVesselStateLogs(newLogs);
        setAllSeaService(serviceRecords);
      }
    } catch (error: any) {
      console.error('Error deleting vessel data:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete vessel data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setVesselToDelete(null);
    }
  }, [user?.id, currentUserProfile, supabase, toast, allVessels, vessels, vesselStateLogs]);

  // Handler to add past vessel
  const handleAddPastVessel = useCallback(async (data: PastVesselFormValues) => {
    if (!user?.id || !allVessels) return;

    setIsSavingPastVessel(true);

    try {
      const startDate = startOfDay(data.startDate);
      const endDate = endOfDay(data.endDate);

      // Check for overlapping dates with other vessels
      const newDateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const newDatesSet = new Set(newDateRange.map(d => format(d, 'yyyy-MM-dd')));
      
      // Check each vessel for overlaps
      for (const vessel of allVessels) {
        if (vessel.id === data.vesselId) continue; // Skip the vessel we're adding to
        
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
          setIsSavingPastVessel(false);
          return;
        }
      }

      // Create state logs for all dates from start to end
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const logs = dateRange.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        state: data.initialState,
      }));
      
      await updateStateLogsBatch(supabase, user.id, data.vesselId, logs);
      
      toast({ 
        title: 'Past Vessel Added', 
        description: `Successfully logged ${logs.length} day(s) from ${format(startDate, 'PPP')} to ${format(endDate, 'PPP')}.` 
      });
      
      // Refresh data
      const newLogs = new Map<string, StateLog[]>();
      const serviceRecords: SeaServiceRecord[] = [];
      
      await Promise.all(allVessels.map(async (vessel) => {
        const [logs, seaService] = await Promise.all([
          getVesselStateLogs(supabase, vessel.id, user.id),
          getVesselSeaService(supabase, user.id, vessel.id)
        ]);
        
        if (logs && logs.length > 0) {
          newLogs.set(vessel.id, logs);
        }
        if (seaService && seaService.length > 0) {
          serviceRecords.push(...seaService);
        }
      }));

      setVesselStateLogs(newLogs);
      setAllSeaService(serviceRecords);

      // Reset form and close dialog
      pastVesselForm.reset();
      setIsAddPastVesselDialogOpen(false);
    } catch (error: any) {
      console.error('Error adding past vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add past vessel. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingPastVessel(false);
    }
  }, [user?.id, allVessels, supabase, toast, pastVesselForm]);

  // Handler to request captaincy
  const handleRequestCaptaincy = useCallback(async (vesselId: string) => {
    if (!user?.id || !isCaptain) return;
    
    setRequestingCaptaincyVesselId(vesselId);
    setIsRequestingCaptaincy(true);
    
    try {
      const { data, error } = await supabase
        .from('vessel_captaincy')
        .insert({
          vessel_id: vesselId,
          user_id: user.id,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique violation
          toast({
            title: 'Request Already Exists',
            description: 'You have already submitted a captaincy request for this vessel.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Captaincy Request Submitted',
          description: 'Your request for vessel captaincy has been submitted and is pending approval.',
        });
        
        // Update local state
        setCaptaincyRequests(prev => {
          const newMap = new Map(prev);
          newMap.set(vesselId, { id: data.id, status: data.status });
          return newMap;
        });
      }
    } catch (error: any) {
      console.error('Error requesting captaincy:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit captaincy request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRequestingCaptaincy(false);
      setRequestingCaptaincyVesselId(null);
    }
  }, [user?.id, isCaptain, supabase, toast]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">My Vessels</h1>
            <p className="text-muted-foreground">
              Manage your vessels, view history, and track your service time.
            </p>
                </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={isAddPastVesselDialogOpen} onOpenChange={setIsAddPastVesselDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-xl">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  Add Past Vessel
                </Button>
              </DialogTrigger>
            </Dialog>
                <Dialog open={isFormOpen} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild>
              <Button className="rounded-xl">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Vessel
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                <DialogTitle>Add a New Vessel</DialogTitle>
                  <DialogDescription>
                    Add a vessel to start tracking your service time.
                    {!hasUnlimitedVessels && (
                      <span className="block mt-1 text-sm">
                        {vesselCount >= vesselLimit 
                          ? `You've reached the limit of ${vesselLimit} vessels for Standard tier. Upgrade to Premium or Pro for unlimited vessels.`
                          : `You can add ${vesselLimit - vesselCount} more vessel${vesselLimit - vesselCount === 1 ? '' : 's'}.`
                        }
                      </span>
                    )}
                  </DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Vessel Name</FormLabel>
                          <FormControl><Input placeholder="e.g., M/Y Odyssey" {...field} className="rounded-lg" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
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
                                    control={form.control}
                                    name="officialNumber"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Official Number (Optional)</FormLabel>
                          <FormControl><Input placeholder="e.g., IMO 1234567" {...field} className="rounded-lg" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter className="pt-4">
                                    <DialogClose asChild>
                        <Button type="button" variant="ghost" className="rounded-xl">Cancel</Button>
                                    </DialogClose>
                    <Button type="submit" disabled={isSaving} className="rounded-xl">
                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add Vessel
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Filter vessels..."
              className="pl-8 rounded-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <Button 
              variant={layout === 'table' ? 'secondary' : 'ghost'} 
              size="icon" 
              onClick={() => setLayout('table')} 
              className="h-8 w-8 rounded-xl"
            >
              <List className="h-4 w-4"/>
            </Button>
            <Button 
              variant={layout === 'card' ? 'secondary' : 'ghost'} 
              size="icon" 
              onClick={() => setLayout('card')} 
              className="h-8 w-8 rounded-xl"
            >
              <LayoutGrid className="h-4 w-4"/>
            </Button>
          </div>
        </div>
        <Separator />
      </div>

      {isLoading ? (
        layout === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => <VesselSummarySkeleton key={i} />)}
          </div>
        ) : (
          <Card className="rounded-xl border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Vessel Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Official Number</TableHead>
                      <TableHead>Total Days Logged</TableHead>
                      <TableHead>Status</TableHead>
                      {isCaptain && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )
      ) : filteredVessels.length > 0 ? (
        layout === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vesselSummaries.map(vessel => (
              <VesselSummaryCard 
                key={vessel.id} 
                vesselSummary={vessel}
                onResumeService={handleResumeVessel}
                showResumeButton={!vessel.isCurrent && canResumeVessel}
                isResuming={resumingVesselId === vessel.id}
                onDelete={(vesselId, vesselName) => setVesselToDelete({ id: vesselId, name: vesselName })}
                showDeleteButton={true}
              />
            ))}
          </div>
        ) : (
      <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
        <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Vessel Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Official Number</TableHead>
                                <TableHead>Total Days Logged</TableHead>
                        <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredVessels.map((vessel) => {
                            const isCurrent = currentUserProfile?.activeVesselId === vessel.id;
                                const logs = vesselStateLogs.get(vessel.id) || [];
                                const totalDays = logs.length;
                                const isExpanded = expandedVesselId === vessel.id;
                                const vesselRaw = allVessels?.find(v => v.id === vessel.id);
                      const vesselData = vesselRaw as any;
                      const hasPendingRequest = captaincyRequests.has(vessel.id);

                            return (
                                    <React.Fragment key={vessel.id}>
                                        <TableRow 
                                            className="hover:bg-muted/30 transition-colors cursor-pointer"
                                            onClick={() => setExpandedVesselId(isExpanded ? null : vessel.id)}
                                        >
                                            <TableCell className="w-[50px]">
                                                <ChevronDown 
                                                    className={cn(
                                                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                                                        isExpanded && "rotate-180"
                                                    )}
                                                />
                                            </TableCell>
                                    <TableCell className="font-medium">
                                                {vessel.name}
                                    </TableCell>
                                    <TableCell>
                                                <Badge variant="outline" className="font-normal">
                                        {vesselTypes.find(t => t.value === vessel.type)?.label || vessel.type}
                                                </Badge>
                                    </TableCell>
                                            <TableCell className="text-muted-foreground">{vessel.officialNumber || '—'}</TableCell>
                                            <TableCell className="font-medium">{totalDays}</TableCell>
                                    <TableCell>
                                        {isCurrent ? (
                                                    <Badge variant="default" className="bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400">
                                                        Active
                                                    </Badge>
                                        ) : (
                                                    <Badge variant="secondary" className="font-normal">
                                                        Past
                                                    </Badge>
                                        )}
                                    </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                {!isCurrent && canResumeVessel && (
                                  <Button
                                    onClick={() => handleResumeVessel(vessel.id)}
                                    disabled={resumingVesselId === vessel.id}
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg"
                                  >
                                    {resumingVesselId === vessel.id ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Resuming...
                                      </>
                                    ) : (
                                      <>
                                        <PlayCircle className="mr-2 h-4 w-4" />
                                        Resume
                                      </>
                                    )}
                                  </Button>
                                )}
                                {isCaptain && !hasPendingRequest && (
                                  <Button
                                    onClick={() => handleRequestCaptaincy(vessel.id)}
                                    disabled={isRequestingCaptaincy && requestingCaptaincyVesselId === vessel.id}
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg"
                                    title="Request captaincy for this vessel"
                                  >
                                    {isRequestingCaptaincy && requestingCaptaincyVesselId === vessel.id ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Requesting...
                                      </>
                                    ) : (
                                      <>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        Request Captaincy
                                      </>
                                    )}
                                  </Button>
                                )}
                                {isCaptain && hasPendingRequest && (
                                  <Badge variant="outline" className="text-xs">
                                    Request Pending
                                  </Badge>
                                )}
                                <Button
                                  onClick={() => setVesselToDelete({ id: vessel.id, name: vessel.name })}
                                  disabled={isDeleting}
                                  variant="destructive"
                                  size="sm"
                                  className="rounded-xl"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                                        </TableRow>
                                        {isExpanded && (
                                            <TableRow>
                              <TableCell colSpan={7} className="bg-background/40 p-0">
                                                    <div className="px-6 py-6">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                                            {/* Identification Section */}
                                                            <div className="space-y-4 pr-4 md:pr-6">
                                                                <h4 className="text-sm font-semibold text-foreground">Identification</h4>
                                                                <div className="space-y-3">
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">IMO Number</span>
                                                                        <span className="text-sm font-medium">{vessel.officialNumber || vesselData?.imo || '—'}</span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">MMSI</span>
                                                                        <span className="text-sm font-medium">{vesselData?.mmsi || '—'}</span>
                                                                    </div>
                                                                    {vesselData?.call_sign && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Call Sign</span>
                                                                            <span className="text-sm font-medium">{vesselData.call_sign}</span>
                                                                        </div>
                                                                    )}
                                                                    {vesselData?.flag && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Flag</span>
                                                                            <span className="text-sm font-medium">{vesselData.flag}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Dimensions Section */}
                                                            <div className="space-y-4 pl-0 md:pl-4 md:border-l border-border/50 pr-4 md:pr-6 lg:pr-8">
                                                                <h4 className="text-sm font-semibold text-foreground">Dimensions</h4>
                                                                <div className="space-y-3">
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Length</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselData?.length_m
                                                                                ? `${vesselData.length_m} m`
                                                                                : '—'}
                                                                        </span>
                                                                    </div>
                                                                    {vesselData?.beam && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Beam</span>
                                                                            <span className="text-sm font-medium">{vesselData.beam} m</span>
                                                                        </div>
                                                                    )}
                                                                    {vesselData?.draft && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Draft</span>
                                                                            <span className="text-sm font-medium">{vesselData.draft} m</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Gross Tonnage</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselData?.gross_tonnage || vesselData?.grossTonnage 
                                                                                ? `${vesselData?.gross_tonnage || vesselData?.grossTonnage} GT`
                                                                                : '—'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Vessel Information Section */}
                                                            <div className="space-y-4 pl-0 md:pl-4 md:border-l border-border/50">
                                                                <h4 className="text-sm font-semibold text-foreground">Information</h4>
                                                                <div className="space-y-3">
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Vessel Type</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselTypes.find(t => t.value === vessel.type)?.label || vessel.type}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Added to System</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselData?.created_at 
                                                                                ? format(new Date(vesselData.created_at), 'MMM d, yyyy')
                                                                                : '—'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                    </TableCell>
                                </TableRow>
                                        )}
                                    </React.Fragment>
                      );
                    })}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>
        )
      ) : (
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Ship className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Vessels Found</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {searchTerm 
                ? `No vessels match "${searchTerm}". Try adjusting your search.`
                : "You haven't logged any vessel time yet. Start by adding a vessel and logging your first service."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Past Vessel Dialog */}
      <Dialog open={isAddPastVesselDialogOpen} onOpenChange={setIsAddPastVesselDialogOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Add Past Vessel</DialogTitle>
            <DialogDescription>
              Add historical vessel service by selecting dates and initial state.
            </DialogDescription>
          </DialogHeader>
          <Form {...pastVesselForm}>
            <form onSubmit={pastVesselForm.handleSubmit(handleAddPastVessel)} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <FormField
                    control={pastVesselForm.control}
                    name="vesselId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vessel</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingVessels}>
                            <SelectTrigger className="rounded-lg">
                              <SelectValue placeholder={isLoadingVessels ? "Loading vessels..." : "Select vessel"} />
                            </SelectTrigger>
                            <SelectContent>
                              {allVessels?.map(vessel => (
                                <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pastVesselForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
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
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a start date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date > new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pastVesselForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
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
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick an end date</span>
                                )}
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
                                if (date > new Date()) return true;
                                const startDate = pastVesselForm.getValues('startDate');
                                return startDate ? date < startDate : false;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="space-y-6">
                  <FormField
                    control={pastVesselForm.control}
                    name="initialState"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Initial State</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col space-y-3"
                          >
                            {vesselStates.map((state) => (
                              <div key={state.value} className="flex items-center space-x-3 space-y-0">
                                <RadioGroupItem value={state.value} id={state.value} className="rounded-lg" />
                                <label
                                  htmlFor={state.value}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  {state.label}
                                </label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <DialogFooter className="pt-4 gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className="rounded-xl">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSavingPastVessel} className="rounded-lg">
                  {isSavingPastVessel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Past Vessel
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!vesselToDelete} onOpenChange={(open) => !open && setVesselToDelete(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vessel Data?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete all data for <strong>{vesselToDelete?.name}</strong>? This action cannot be undone and will remove all logged days and states for this vessel.
              {vesselToDelete && currentUserProfile?.activeVesselId === vesselToDelete.id && (
                <span className="block mt-2 text-destructive font-medium">
                  Warning: This is your currently active vessel. Deleting it will also clear your active vessel status.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => vesselToDelete && handleDeleteVessel(vesselToDelete.id, vesselToDelete.name)}
              disabled={isDeleting}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
    