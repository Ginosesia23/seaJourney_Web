
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useSupabase } from '@/supabase';
import { useCollection } from '@/supabase/database';
import { getVesselSeaService, getVesselStateLogs, updateUserProfile, deleteVesselStateLogs, createVessel, updateStateLogsBatch } from '@/supabase/database/queries';
import { History, Loader2, Search, LayoutGrid, List, PlayCircle, Ship, Trash2, PlusCircle, CalendarIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, eachDayOfInterval, startOfDay, endOfDay, parse } from 'date-fns';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { VesselSummaryCard, VesselSummarySkeleton } from '@/components/dashboard/vessel-summary-card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
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
import type { Vessel, SeaServiceRecord, StateLog, UserProfile, DailyStatus } from '@/lib/types';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { isCurrentService } from '@/lib/types';
import { useDoc } from '@/supabase/database';

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

const addVesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.enum(vesselTypeValues, {
    required_error: 'Please select a vessel type.',
  }),
  officialNumber: z.string().optional(),
});

type AddVesselFormValues = z.infer<typeof addVesselSchema>;

const vesselStates: { value: DailyStatus; label: string; color: string }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))' },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))' },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))' },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))' },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))' },
];

export default function HistoryPage() {
  const router = useRouter();
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [layout, setLayout] = useState<'card' | 'table'>('card');
  const [resumingVesselId, setResumingVesselId] = useState<string | null>(null);
  const [vesselToDelete, setVesselToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddPastVesselDialogOpen, setIsAddPastVesselDialogOpen] = useState(false);
  const [isAddVesselDialogOpen, setIsAddVesselDialogOpen] = useState(false);
  const [isSavingPastVessel, setIsSavingPastVessel] = useState(false);
  const [isSavingVessel, setIsSavingVessel] = useState(false);

  const [allSeaService, setAllSeaService] = useState<SeaServiceRecord[]>([]);
  const [allStateLogs, setAllStateLogs] = useState<Map<string, StateLog[]>>(new Map());

  // Fetch user profile to get activeVesselId
  const { data: userProfileRaw } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      activeVesselId: (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId,
    } as UserProfile;
  }, [userProfileRaw]);

  // Query all vessels (vessels are shared, not owned by users)
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  useEffect(() => {
    if (vessels && user?.id) {
      const fetchServiceAndLogs = async () => {
        const serviceRecords: SeaServiceRecord[] = [];
        const logsMap = new Map<string, StateLog[]>();

        await Promise.all(vessels.map(async (vessel) => {
          const [seaService, stateLogs] = await Promise.all([
            getVesselSeaService(supabase, user.id, vessel.id),
            getVesselStateLogs(supabase, vessel.id, user.id)
          ]);
          
          serviceRecords.push(...seaService);
          logsMap.set(vessel.id, stateLogs);
        }));

        setAllSeaService(serviceRecords);
        setAllStateLogs(logsMap);
      };
      fetchServiceAndLogs();
    }
  }, [vessels, user?.id, supabase]);

  const isLoading = isLoadingVessels || (vessels && vessels.length > 0 && (allSeaService.length === 0 && allStateLogs.size === 0 && vessels.length > 0));

  const vesselSummaries = useMemo(() => {
    if (!vessels) return [];

    // Only show vessels that the user has actually logged time on (has state logs)
    return vessels
      .filter(vessel => {
        const vesselLogs = allStateLogs.get(vessel.id) || [];
        return vesselLogs.length > 0; // Only include vessels with logged days
      })
      .map(vessel => {
      const vesselServices = allSeaService.filter(s => s.vesselId === vessel.id);
      const vesselLogs = allStateLogs.get(vessel.id) || [];
      
      const totalDays = vesselLogs.length;

      const dayCountByState = vesselLogs.reduce((acc, log) => {
          acc[log.state] = (acc[log.state] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

        // Check if this vessel is the current active vessel
        const isCurrent = vessel.id === userProfile?.activeVesselId;

      return {
        ...vessel,
        totalDays,
        tripCount: vesselServices.length,
        dayCountByState,
        isCurrent
      };
      })
      .sort((a, b) => {
        // Sort current vessel first, then by total days (descending)
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        return b.totalDays - a.totalDays;
      });
  }, [vessels, allSeaService, allStateLogs, userProfile]);

  const filteredVessels = useMemo(() => {
    if (!searchTerm) return vesselSummaries;
    return vesselSummaries.filter(vessel => 
      vessel.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [vesselSummaries, searchTerm]);

  // Check if user can resume a vessel (only if no active vessel)
  const canResumeVessel = !userProfile?.activeVesselId;

  // Handler to resume a past vessel
  const handleResumeVessel = useCallback(async (vesselId: string) => {
    if (!user?.id) return;
    
    // Double-check that there's no active vessel
    if (userProfile?.activeVesselId) {
      toast({
        title: 'Cannot Resume',
        description: 'You already have an active vessel. Please end the current service first.',
        variant: 'destructive',
      });
      return;
    }

    setResumingVesselId(vesselId);

    try {
      await updateUserProfile(supabase, user.id, {
        activeVesselId: vesselId,
      });

      toast({
        title: 'Vessel Resumed',
        description: 'The vessel has been set as your active vessel. Redirecting to current page...',
      });

      // Redirect to current page to show the active vessel
      // The data will update automatically via realtime subscriptions
      setTimeout(() => {
        router.push('/dashboard/current');
      }, 500);
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
  }, [user?.id, userProfile?.activeVesselId, supabase, toast, router]);

  // Handler to delete vessel data
  const handleDeleteVessel = useCallback(async (vesselId: string, vesselName: string) => {
    if (!user?.id) return;
    
    setIsDeleting(true);
    try {
      // Delete all state logs for this user and vessel
      await deleteVesselStateLogs(supabase, user.id, vesselId);
      
      // If this is the active vessel, clear the activeVesselId
      if (userProfile?.activeVesselId === vesselId) {
        await updateUserProfile(supabase, user.id, {
          activeVesselId: null,
        });
      }

      toast({
        title: 'Vessel Data Deleted',
        description: `All data for "${vesselName}" has been permanently deleted.`,
      });

      // Refresh the data by refetching
      if (vessels && vessels.length > 0) {
        const serviceRecords: SeaServiceRecord[] = [];
        const logsMap = new Map<string, StateLog[]>();

        await Promise.all(vessels.map(async (vessel) => {
          const [seaService, stateLogs] = await Promise.all([
            getVesselSeaService(supabase, user.id, vessel.id),
            getVesselStateLogs(supabase, vessel.id, user.id)
          ]);
          
          serviceRecords.push(...seaService);
          logsMap.set(vessel.id, stateLogs);
        }));

        setAllSeaService(serviceRecords);
        setAllStateLogs(logsMap);
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
  }, [user?.id, userProfile?.activeVesselId, supabase, toast, vessels]);

  // Form setup for adding past vessel
  const pastVesselForm = useForm<PastVesselFormValues>({
    resolver: zodResolver(pastVesselSchema),
    defaultValues: { 
      vesselId: '', 
      startDate: undefined, 
      endDate: undefined, 
      initialState: 'underway' 
    },
  });

  const addVesselForm = useForm<AddVesselFormValues>({
    resolver: zodResolver(addVesselSchema),
    defaultValues: { name: '', type: undefined, officialNumber: '' },
  });

  // Handler to add past vessel
  const handleAddPastVessel = useCallback(async (data: PastVesselFormValues) => {
    if (!user?.id || !vessels) return;

    setIsSavingPastVessel(true);

    try {
      const startDate = startOfDay(data.startDate);
      const endDate = endOfDay(data.endDate);

      // Check for overlapping dates with other vessels
      const newDateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const newDatesSet = new Set(newDateRange.map(d => format(d, 'yyyy-MM-dd')));
      
      // Check each vessel for overlaps
      for (const vessel of vessels) {
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
      if (vessels && vessels.length > 0) {
        const serviceRecords: SeaServiceRecord[] = [];
        const logsMap = new Map<string, StateLog[]>();

        await Promise.all(vessels.map(async (vessel) => {
          const [seaService, stateLogs] = await Promise.all([
            getVesselSeaService(supabase, user.id, vessel.id),
            getVesselStateLogs(supabase, vessel.id, user.id)
          ]);
          
          serviceRecords.push(...seaService);
          logsMap.set(vessel.id, stateLogs);
        }));

        setAllSeaService(serviceRecords);
        setAllStateLogs(logsMap);
      }

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
  }, [user?.id, vessels, supabase, toast, pastVesselForm]);

  // Handler to add new vessel
  const handleAddVessel = useCallback(async (data: AddVesselFormValues) => {
    if (!user?.id) return;
    
    setIsSavingVessel(true);
    try {
      const newVessel = await createVessel(supabase, {
        name: data.name,
        type: data.type,
        officialNumber: data.officialNumber || undefined,
      });

      toast({
        title: 'Vessel Created',
        description: `"${newVessel.name}" has been added to the vessel database.`,
      });

      // Reset form and close dialog
      addVesselForm.reset();
      setIsAddVesselDialogOpen(false);
      
      // Automatically select the newly created vessel in the past vessel form
      pastVesselForm.setValue('vesselId', newVessel.id);
      
      // Refresh vessels will happen automatically via realtime subscription
    } catch (error: any) {
      console.error('Error creating vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create vessel. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingVessel(false);
    }
  }, [user?.id, supabase, toast, addVesselForm, pastVesselForm]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Vessel History</h1>
            <p className="text-muted-foreground">
              A list of all vessels you have logged time on, with your current active vessel highlighted.
            </p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
            <Dialog open={isAddPastVesselDialogOpen} onOpenChange={setIsAddPastVesselDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-xl">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Past Vessel
                </Button>
              </DialogTrigger>
            </Dialog>
            <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Filter vessels..."
                className="pl-8 rounded-xl"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              <Button variant={layout === 'card' ? 'secondary': 'ghost'} size="icon" onClick={() => setLayout('card')} className="h-8 w-8 rounded-xl">
                    <LayoutGrid className="h-4 w-4"/>
                </Button>
              <Button variant={layout === 'table' ? 'secondary': 'ghost'} size="icon" onClick={() => setLayout('table')} className="h-8 w-8 rounded-xl">
                    <List className="h-4 w-4"/>
                </Button>
            </div>
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
             <Card className="rounded-xl border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vessel</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Total Days</TableHead>
                            <TableHead>Trips</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </Card>
        )
      ) : filteredVessels.length > 0 ? (
        layout === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVessels.map(vessel => (
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
            <Card className="rounded-xl border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vessel</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Total Days</TableHead>
                            <TableHead>Trips</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredVessels.map(vessel => (
                            <TableRow key={vessel.id} className="hover:bg-muted/50 transition-colors">
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <Ship className="h-4 w-4 text-muted-foreground" />
                                        {vessel.name}
                                    </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {vesselTypes.find(t => t.value === vessel.type)?.label || vessel.type}
                                </TableCell>
                                <TableCell className="font-semibold">{vessel.totalDays}</TableCell>
                                <TableCell>{vessel.tripCount}</TableCell>
                                <TableCell>
                                    {vessel.isCurrent ? (
                                        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Current</Badge>
                                    ) : (
                                        <Badge variant="outline">Past</Badge>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {!vessel.isCurrent && canResumeVessel && (
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
                        ))}
                    </TableBody>
                </Table>
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
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <History className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle>Add Past Vessel</DialogTitle>
            </div>
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
                        <div className="flex gap-2">
                          <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingVessels}>
                            <FormControl>
                              <SelectTrigger className="rounded-lg">
                                <SelectValue placeholder={isLoadingVessels ? "Loading vessels..." : "Select vessel"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {vessels?.map(vessel => (
                                <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Dialog open={isAddVesselDialogOpen} onOpenChange={setIsAddVesselDialogOpen}>
                            <DialogTrigger asChild>
                              <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-lg">
                                <PlusCircle className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px] rounded-xl">
                              <DialogHeader>
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Ship className="h-5 w-5 text-primary" />
                                  </div>
                                  <DialogTitle>Add a New Vessel</DialogTitle>
                                </div>
                              </DialogHeader>
                              <Form {...addVesselForm}>
                                <form onSubmit={addVesselForm.handleSubmit(handleAddVessel)} className="space-y-4">
                                  <FormField 
                                    control={addVesselForm.control} 
                                    name="name" 
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Vessel Name</FormLabel>
                                        <FormControl>
                                          <Input placeholder="e.g., M/Y Odyssey" {...field} className="rounded-lg" />
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
                                          <Select onValueChange={field.onChange} value={field.value}>
                                            <SelectTrigger className="rounded-lg">
                                              <SelectValue placeholder="Select a vessel type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {vesselTypes.map(type => (
                                                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
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
                                          <Input placeholder="e.g., IMO 1234567" {...field} className="rounded-lg" />
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
              {vesselToDelete && userProfile?.activeVesselId === vesselToDelete.id && (
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
