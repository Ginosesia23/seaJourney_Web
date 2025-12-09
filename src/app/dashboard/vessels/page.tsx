
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, Loader2, Ship, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';

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
import { createVessel, getVesselStateLogs } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import type { Vessel, StateLog, UserProfile } from '@/lib/types';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { cn } from '@/lib/utils';

const vesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.enum(vesselTypeValues, {
    required_error: 'Please select a vessel type.',
  }),
  officialNumber: z.string().optional(),
});
type VesselFormValues = z.infer<typeof vesselSchema>;


export default function VesselsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [vesselStateLogs, setVesselStateLogs] = useState<Map<string, StateLog[]>>(new Map());
  const [expandedVesselId, setExpandedVesselId] = useState<string | null>(null);

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
    
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      subscriptionTier: (userProfileRaw as any).subscription_tier || userProfileRaw.subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || userProfileRaw.subscriptionStatus || 'inactive',
    } as UserProfile;
  }, [userProfileRaw]);

  // Count vessels user has logged time on (based on vessels that have logs)
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

  // Fetch stateLogs for each vessel and filter to only show vessels user has logged time on
  useEffect(() => {
    if (allVessels && user?.id) {
      const fetchLogs = async () => {
      const newLogs = new Map<string, StateLog[]>();
        await Promise.all(allVessels.map(async (vessel) => {
          const logs = await getVesselStateLogs(supabase, vessel.id, user.id);
          // Only add to map if user has logged time on this vessel
          if (logs && logs.length > 0) {
          newLogs.set(vessel.id, logs);
          }
        }));
        setVesselStateLogs(newLogs);
      };
      fetchLogs();
    }
  }, [allVessels, user?.id, supabase]);

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


  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">My Vessels</h1>
            <p className="text-muted-foreground">
              Vessels you have logged time on. Add a new vessel to start tracking your service.
            </p>
                </div>
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
                                            <FormControl><Input placeholder="e.g., M/Y Odyssey" {...field} /></FormControl>
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
                                            <FormControl><Input placeholder="e.g., IMO 1234567" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter className="pt-4">
                                    <DialogClose asChild>
                                        <Button type="button" variant="ghost">Cancel</Button>
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
        <Separator />
      </div>

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
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : vessels && vessels.length > 0 ? (
                        vessels.map((vessel) => {
                            const isCurrent = currentUserProfile?.activeVesselId === vessel.id;
                            
                                const logs = vesselStateLogs.get(vessel.id) || [];
                                const totalDays = logs.length;
                                const isExpanded = expandedVesselId === vessel.id;
                                const vesselRaw = allVessels?.find(v => v.id === vessel.id);
                                const vesselData = vesselRaw as any; // Access raw DB fields

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
                                        </TableRow>
                                        {isExpanded && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="bg-background/40 p-0">
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
                            )
                        })
                        ) : (
                        <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                            No vessels found.
                            </TableCell>
                        </TableRow>
                        )}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

    