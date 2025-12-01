
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MoreHorizontal, PlusCircle, Loader2, Ship, Building } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUser, useSupabase } from '@/supabase';
import { useCollection } from '@/supabase/database';
import { createVessel, getVesselStateLogs } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import type { Vessel, StateLog, UserProfile } from '@/lib/types';

const vesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.string().min(2, 'Vessel type is required.'),
  officialNumber: z.string().optional(),
});
type VesselFormValues = z.infer<typeof vesselSchema>;

const vesselStates: { value: string; label: string }[] = [
    { value: 'underway', label: 'Underway' },
    { value: 'at-anchor', label: 'At Anchor' },
    { value: 'in-port', label: 'In Port' },
    { value: 'on-leave', label: 'On Leave' },
    { value: 'in-yard', label: 'In Yard / Maintenance' },
];

export default function VesselsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);
  const [vesselStateLogs, setVesselStateLogs] = useState<Map<string, StateLog[]>>(new Map());

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const form = useForm<VesselFormValues>({
    resolver: zodResolver(vesselSchema),
    defaultValues: {
      name: '',
      type: '',
      officialNumber: '',
    },
  });

  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    'vessels',
    { filter: 'owner_id', filterValue: user?.id, orderBy: 'created_at', ascending: false }
  );
  
  // Fetch stateLogs for each vessel
  useEffect(() => {
    if (vessels && user?.id) {
      const fetchLogs = async () => {
        const newLogs = new Map<string, StateLog[]>();
        await Promise.all(vessels.map(async (vessel) => {
          const logs = await getVesselStateLogs(supabase, vessel.id);
          newLogs.set(vessel.id, logs);
        }));
        setVesselStateLogs(newLogs);
      };
      fetchLogs();
    }
  }, [vessels, user?.id, supabase]);


  const { data: userProfiles, isLoading: isLoadingProfile } = useCollection<UserProfile>(
    'users',
    { filter: 'id', filterValue: user?.id }
  );
  const currentUserProfile = userProfiles?.[0];

  const isLoading = isLoadingVessels || isLoadingProfile;

  const handleEdit = (vessel: Vessel) => {
    setEditingVessel(vessel);
    form.reset({
        name: vessel.name,
        type: vessel.type,
        officialNumber: vessel.officialNumber || '',
    });
    setIsFormOpen(true);
  }

  const handleDelete = async (vesselId: string) => {
    if (!user?.id) return;
    
    const { error } = await supabase
      .from('vessels')
      .delete()
      .eq('id', vesselId)
      .eq('owner_id', user.id);
    
    if (error) {
      console.error('Failed to delete vessel:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to delete vessel. Please try again.',
        variant: 'destructive'
      });
    } else {
      toast({ title: 'Vessel Deleted', description: 'The vessel has been removed from your list.' });
    }
  }
  
  const handleOpenChange = (open: boolean) => {
    if(!open) {
        setEditingVessel(null);
        form.reset({ name: '', type: '', officialNumber: ''});
    }
    setIsFormOpen(open);
  }

  async function onSubmit(data: VesselFormValues) {
    if (!user?.id) return;
    setIsSaving(true);
    
    try {
        if (editingVessel) {
            const { error } = await supabase
              .from('vessels')
              .update({
                name: data.name,
                type: data.type,
                official_number: data.officialNumber || null,
              })
              .eq('id', editingVessel.id)
              .eq('owner_id', user.id);
            
            if (error) throw error;
            toast({ title: 'Vessel Updated', description: `${data.name} has been updated.` });
        } else {
            await createVessel(supabase, {
              ownerId: user.id,
              name: data.name,
              type: data.type,
              officialNumber: data.officialNumber,
            });
            toast({ title: 'Vessel Added', description: `${data.name} has been added to your fleet.` });
        }
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
    <div className="w-full max-w-7xl mx-auto">
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <Building className="h-6 w-6" />
                        <CardTitle>Your Vessels</CardTitle>
                    </div>
                    <CardDescription>Manage the vessels you have worked on.</CardDescription>
                </div>
                <Dialog open={isFormOpen} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild>
                        <Button className="rounded-lg">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Vessel
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingVessel ? 'Edit Vessel' : 'Add a New Vessel'}</DialogTitle>
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
                                            <FormControl><Input placeholder="e.g., Motor Yacht" {...field} /></FormControl>
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
                                    <Button type="submit" disabled={isSaving} className="rounded-lg">
                                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {editingVessel ? 'Save Changes' : 'Save Vessel'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Vessel Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Official Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : vessels && vessels.length > 0 ? (
                        vessels.map((vessel) => {
                            const isCurrent = currentUserProfile?.activeVesselId === vessel.id;
                            let currentDayStatusLabel = 'N/A';
                            if (isCurrent) {
                                const todayKey = format(new Date(), 'yyyy-MM-dd');
                                const logs = vesselStateLogs.get(vessel.id) || [];
                                const todayLog = logs.find(log => log.id === todayKey);
                                const stateInfo = todayLog ? vesselStates.find(s => s.value === todayLog.state) : null;
                                if (stateInfo) {
                                    currentDayStatusLabel = stateInfo.label;
                                }
                            }

                            return (
                                <TableRow key={vessel.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <span>{vessel.name}</span>
                                            {isCurrent && (
                                                <Badge variant="secondary">Current</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{vessel.type}</TableCell>
                                    <TableCell>{vessel.officialNumber || 'N/A'}</TableCell>
                                    <TableCell>
                                        {isCurrent ? (
                                            <Badge variant="outline">{currentDayStatusLabel}</Badge>
                                        ) : (
                                            <span className="text-muted-foreground">N/A</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 rounded-full">
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEdit(vessel)}>Edit</DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDelete(vessel.id)} className="text-destructive">Delete</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                        ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                            No vessels found.
                            </TableCell>
                        </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}

    