
'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MoreHorizontal, PlusCircle, Loader2, Ship } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUser, useFirestore, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, addDoc, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';


const vesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.string().min(2, 'Vessel type is required.'),
  officialNumber: z.string().optional(),
});
type VesselFormValues = z.infer<typeof vesselSchema>;

type Vessel = {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
  ownerId: string;
};

type DailyStatus = 'at-sea' | 'standby' | 'in-port';
interface CurrentStatus {
    id: string;
    vesselId: string;
    position: string;
    startDate: Timestamp;
    dailyStates: Record<string, DailyStatus>;
}

export default function VesselsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);

  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<VesselFormValues>({
    resolver: zodResolver(vesselSchema),
    defaultValues: {
      name: '',
      type: '',
      officialNumber: '',
    },
  });

  const vesselsCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, 'users', user.uid, 'vessels');
  }, [firestore, user?.uid]);

  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(vesselsCollectionRef);

  const currentStatusCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, 'users', user.uid, 'currentStatus');
  }, [firestore, user?.uid]);

  const { data: currentStatusData, isLoading: isLoadingStatus } = useCollection<CurrentStatus>(currentStatusCollectionRef);
  const currentStatus = useMemo(() => currentStatusData?.[0] || null, [currentStatusData]);

  const isLoading = isLoadingVessels || isLoadingStatus;

  const handleEdit = (vessel: Vessel) => {
    setEditingVessel(vessel);
    form.reset({
        name: vessel.name,
        type: vessel.type,
        officialNumber: vessel.officialNumber || '',
    });
    setIsFormOpen(true);
  }

  const handleDelete = (vesselId: string) => {
    if (!vesselsCollectionRef) return;
    const docRef = doc(vesselsCollectionRef, vesselId);
    
    deleteDoc(docRef).then(() => {
        toast({ title: 'Vessel Deleted', description: 'The vessel has been removed from your list.' });
    }).catch((serverError) => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    })
  }
  
  const handleOpenChange = (open: boolean) => {
    if(!open) {
        setEditingVessel(null);
        form.reset({ name: '', type: '', officialNumber: ''});
    }
    setIsFormOpen(open);
  }

  async function onSubmit(data: VesselFormValues) {
    if (!vesselsCollectionRef || !user?.uid) return;
    setIsSaving(true);
    
    try {
        if (editingVessel) {
            // Update existing vessel
            const docRef = doc(vesselsCollectionRef, editingVessel.id);
            await setDoc(docRef, { ...data, ownerId: user.uid }, { merge: true });
            toast({ title: 'Vessel Updated', description: `${data.name} has been updated.` });
        } else {
            // Add new vessel
            const newVessel = { ...data, ownerId: user.uid };
            await addDoc(vesselsCollectionRef, newVessel);
            toast({ title: 'Vessel Added', description: `${data.name} has been added to your fleet.` });
        }
        form.reset();
        handleOpenChange(false);
    } catch (serverError: any) {
        console.error("Failed to save vessel:", serverError);
        const permissionError = new FirestorePermissionError({
            path: editingVessel ? doc(vesselsCollectionRef, editingVessel.id).path : vesselsCollectionRef.path,
            operation: editingVessel ? 'update' : 'create',
            requestResourceData: { ...data, ownerId: user.uid },
          });
        errorEmitter.emit('permission-error', permissionError);
    } finally {
        setIsSaving(false);
    }
  }


  return (
    <div className="w-full max-w-7xl mx-auto">
        <Card className="rounded-xl shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <Ship className="h-6 w-6" />
                        <CardTitle>Your Vessels</CardTitle>
                    </div>
                    <CardDescription>Manage the vessels you have worked on.</CardDescription>
                </div>
                <Dialog open={isFormOpen} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild>
                        <Button>
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
                                    <Button type="submit" disabled={isSaving}>
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
                        <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : vessels && vessels.length > 0 ? (
                        vessels.map((vessel) => (
                            <TableRow key={vessel.id}>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <span>{vessel.name}</span>
                                        {currentStatus && currentStatus.vesselId === vessel.id && (
                                            <Badge variant="secondary">Current</Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>{vessel.type}</TableCell>
                                <TableCell>{vessel.officialNumber || 'N/A'}</TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
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
                        ))
                        ) : (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
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
