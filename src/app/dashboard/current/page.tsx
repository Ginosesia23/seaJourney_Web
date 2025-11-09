
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, eachDayOfInterval, fromUnixTime, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { CalendarIcon, MapPin, Briefcase, Info, PlusCircle, Loader2, Ship, BookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUser, useFirestore, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, addDoc, doc, setDoc, Timestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const currentStatusSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  position: z.string().min(2, 'Position is required.'),
  startDate: z.date({ required_error: 'A start date is required.' }),
  vesselState: z.enum(['underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard']),
});

type CurrentStatusFormValues = z.infer<typeof currentStatusSchema>;

type DailyStatus = 'underway' | 'at-anchor' | 'in-port' | 'on-leave' | 'in-yard';
interface CurrentStatus {
    id: string;
    vesselId: string;
    position: string;
    startDate: Timestamp;
    dailyStates: Record<string, DailyStatus>;
    notes?: string;
}

const addVesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.string().min(2, 'Vessel type is required.'),
  officialNumber: z.string().optional(),
});
type AddVesselFormValues = z.infer<typeof addVesselSchema>;

type Vessel = {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
  ownerId: string;
};

const vesselStates: { value: DailyStatus; label: string, color: string }[] = [
    { value: 'underway', label: 'Underway', color: 'bg-blue-500' },
    { value: 'at-anchor', label: 'At Anchor', color: 'bg-orange-500' },
    { value: 'in-port', label: 'In Port', color: 'bg-green-500' },
    { value: 'on-leave', label: 'On Leave', color: 'bg-gray-500' },
    { value: 'in-yard', label: 'In Yard / Maintenance', color: 'bg-red-500' },
];

export default function CurrentPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAddVesselDialogOpen, setIsAddVesselDialogOpen] = useState(false);
  const [isSavingVessel, setIsSavingVessel] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

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

  const statusForm = useForm<CurrentStatusFormValues>({
    resolver: zodResolver(currentStatusSchema),
    defaultValues: {
      vesselId: '',
      position: '',
      startDate: undefined,
      vesselState: 'underway',
    },
  });

  const addVesselForm = useForm<AddVesselFormValues>({
    resolver: zodResolver(addVesselSchema),
    defaultValues: {
      name: '',
      type: '',
      officialNumber: '',
    },
  });

  useEffect(() => {
    if (currentStatus) {
      statusForm.reset({
        vesselId: currentStatus.vesselId,
        position: currentStatus.position,
        startDate: fromUnixTime(currentStatus.startDate.seconds),
        vesselState: 'underway',
      });
      setNotes(currentStatus.notes || '');
    } else {
        statusForm.reset({
            vesselId: '',
            position: '',
            startDate: undefined,
            vesselState: 'underway',
        })
        setNotes('');
    }
  }, [currentStatus]);

  async function onStatusSubmit(data: CurrentStatusFormValues) {
    if (!currentStatusCollectionRef || !user) return;
    
    const today = new Date();
    if(data.startDate > today) {
        console.error("Start date cannot be in the future.");
        return;
    }

    if (currentStatusData && currentStatusData.length > 0) {
        for (const status of currentStatusData) {
            await deleteDoc(doc(currentStatusCollectionRef, status.id));
        }
    }
    
    const interval = eachDayOfInterval({ start: data.startDate, end: today });
    const dailyStates: Record<string, DailyStatus> = {};
    interval.forEach(day => {
        dailyStates[format(day, 'yyyy-MM-dd')] = data.vesselState;
    });

    const newStatus = {
      vesselId: data.vesselId,
      position: data.position,
      startDate: Timestamp.fromDate(data.startDate),
      dailyStates,
      notes: '',
    };
    
    addDoc(currentStatusCollectionRef, newStatus)
      .catch((serverError) => {
        const permissionError = new FirestorePermissionError({
          path: currentStatusCollectionRef.path,
          operation: 'create',
          requestResourceData: newStatus,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  }

  async function onAddVesselSubmit(data: AddVesselFormValues) {
    if (!vesselsCollectionRef || !user?.uid) return;
    setIsSavingVessel(true);

    const newVessel = { ...data, ownerId: user.uid };
    addDoc(vesselsCollectionRef, newVessel)
        .then(() => {
            addVesselForm.reset();
            setIsAddVesselDialogOpen(false);
        })
        .catch((serverError) => {
          const permissionError = new FirestorePermissionError({
            path: vesselsCollectionRef.path,
            operation: 'create',
            requestResourceData: newVessel,
          });
          errorEmitter.emit('permission-error', permissionError);
        }).finally(() => {
            setIsSavingVessel(false);
        });
  }

  const handleDayStateChange = (day: Date, state: DailyStatus) => {
    if (!currentStatus || !currentStatusCollectionRef) return;

    const dateKey = format(day, 'yyyy-MM-dd');
    const updatedStatus = {
        dailyStates: {
            ...currentStatus.dailyStates,
            [dateKey]: state
        }
    };
    
    const docRef = doc(currentStatusCollectionRef, currentStatus.id);
    setDoc(docRef, updatedStatus, { merge: true })
        .then(() => setIsStatusDialogOpen(false))
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: updatedStatus,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
  }

  const handleSaveNotes = async () => {
    if (!currentStatus || !currentStatusCollectionRef) return;
    setIsSavingNotes(true);
    const docRef = doc(currentStatusCollectionRef, currentStatus.id);
    setDoc(docRef, { notes }, { merge: true })
        .then(() => {
            toast({ title: 'Notes Saved', description: 'Your trip notes have been updated.' });
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: { notes },
            });
            errorEmitter.emit('permission-error', permissionError);
        })
        .finally(() => setIsSavingNotes(false));
  };


  const handleEndTrip = async () => {
    if (!currentStatus || !firestore || !user?.uid) return;
    
    const tripsCollectionRef = collection(firestore, 'users', user.uid, 'trips');
    const currentStatusDocRef = doc(currentStatusCollectionRef, currentStatus.id);

    const pastTripData = {
        ...currentStatus,
        endDate: Timestamp.now(),
    };
    delete (pastTripData as any).id; // Don't need to store the old doc id

    const batch = writeBatch(firestore);

    // 1. Create new trip in 'trips' collection
    const newTripRef = doc(tripsCollectionRef);
    batch.set(newTripRef, pastTripData);

    // 2. Delete the 'currentStatus' document
    batch.delete(currentStatusDocRef);

    try {
        await batch.commit();
    } catch (serverError) {
        console.error("Failed to end trip:", serverError);
        // Emitting a generic error as this is a multi-step operation
        const permissionError = new FirestorePermissionError({
            path: `/users/${user.uid}`,
            operation: 'write',
            requestResourceData: { 
                note: "Batch write to archive trip failed",
                tripData: pastTripData,
                currentStatusPath: currentStatusDocRef.path
            },
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  }
  
  const startDate = currentStatus ? fromUnixTime(currentStatus.startDate.seconds) : null;
  const selectedVessel = currentStatus ? vessels?.find(v => v.id === currentStatus.vesselId) : null;
  const daysOnboard = startDate ? differenceInDays(new Date(), startDate) + 1 : 0;
  
  const totalDaysByState = useMemo(() => {
    if (!currentStatus) return { 'underway': 0, 'at-anchor': 0, 'in-port': 0, 'on-leave': 0, 'in-yard': 0 };
    return Object.values(currentStatus.dailyStates).reduce((acc, state) => {
        acc[state] = (acc[state] || 0) + 1;
        return acc;
    }, {} as Record<DailyStatus, number>);
  }, [currentStatus]);

  const getRangeClass = (day: Date): string => {
    if (!currentStatus || !startDate) return '';
    
    const dateKey = format(day, 'yyyy-MM-dd');
    const state = currentStatus.dailyStates[dateKey];
    if (!state) return '';
  
    const prevDay = new Date(day.getTime() - 86400000);
    const nextDay = new Date(day.getTime() + 86400000);
    
    const prevDayKey = format(prevDay, 'yyyy-MM-dd');
    const nextDayKey = format(nextDay, 'yyyy-MM-dd');
    
    const prevState = currentStatus.dailyStates[prevDayKey];
    const nextState = currentStatus.dailyStates[nextDayKey];
  
    const isStartOfRange = prevState !== state || isSameDay(day, startDate);
    const isEndOfRange = nextState !== state || isSameDay(day, endOfDay(new Date()));
  
    if (isStartOfRange && isEndOfRange) return 'rounded-full';
    if (isStartOfRange) return 'rounded-l-full';
    if (isEndOfRange) return 'rounded-r-full';
    return 'rounded-none';
  };
  

  if (isLoadingStatus || isLoadingVessels) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    )
  }
  
  const isDisplayingStatus = currentStatus && selectedVessel && startDate;

  return (
    <div className="w-full max-w-7xl mx-auto">
       <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <MapPin className="h-6 w-6" />
            <CardTitle>Current Status</CardTitle>
          </div>
          {isDisplayingStatus && (
            <Button onClick={handleEndTrip} variant="destructive" className="rounded-full">End Current Trip</Button>
          )}
        </div>
      {isDisplayingStatus ? (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="rounded-xl shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Vessel</CardTitle>
                        <Ship className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{selectedVessel.name}</div>
                        <p className="text-xs text-muted-foreground">{selectedVessel.type}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Position</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{currentStatus.position}</div>
                         <p className="text-xs text-muted-foreground">&nbsp;</p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Start Date</CardTitle>
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{format(startDate, 'PPP')}</div>
                         <p className="text-xs text-muted-foreground">&nbsp;</p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl shadow-sm bg-primary/10 border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Time Onboard</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-4xl font-bold text-primary">{daysOnboard}</p>
                        <p className="text-xs text-muted-foreground">days</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <Card className="rounded-xl shadow-sm">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Monthly Log</CardTitle>
                                <CardDescription>Click a day to update its status.</CardDescription>
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>The calendar shows your status per day. <br/>Future dates are disabled.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                onDayClick={(day, modifiers) => {
                                    if(modifiers.disabled) return;
                                    if(startDate && day < startOfDay(startDate)) return;
                                    setSelectedDate(day);
                                    setIsStatusDialogOpen(true);
                                }}
                                month={selectedDate}
                                onMonthChange={setSelectedDate}
                                className="p-0"
                                classNames={{
                                    day_selected: 'bg-transparent text-foreground ring-2 ring-primary rounded-full',
                                    day_today: 'text-primary font-bold rounded-full',
                                    day_disabled: 'text-muted-foreground opacity-50',
                                    day_outside: 'text-muted-foreground opacity-50',
                                    cell: "w-10 h-10 text-sm p-0 relative [&:has([aria-selected])]:bg-transparent first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full focus-within:relative focus-within:z-20",
                                    day: "h-10 w-10 p-0 font-normal rounded-full",
                                }}
                                disabled={[{ before: startOfDay(startDate) }, { after: endOfDay(new Date()) }]}
                                components={{
                                DayContent: ({ date }) => {
                                    const dateKey = format(date, 'yyyy-MM-dd');
                                    const state = currentStatus.dailyStates[dateKey];
                                    const stateInfo = vesselStates.find(s => s.value === state);
                                    const isDateInRange = startDate && date >= startOfDay(startDate) && date <= endOfDay(new Date());

                                    if (!isDateInRange || !stateInfo) {
                                        return <div className="relative h-full w-full flex items-center justify-center">{format(date, 'd')}</div>;
                                    }
                                    
                                    const rangeClass = getRangeClass(date);
                                    
                                    return (
                                    <TooltipProvider>
                                        <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="relative h-full w-full flex items-center justify-center">
                                                <div className={cn('absolute inset-y-2 inset-x-0', stateInfo.color, rangeClass)}></div>
                                                <span className={cn("relative z-10 font-medium", state ? 'text-white' : 'text-foreground')} style={{textShadow: state ? '0 1px 2px rgba(0,0,0,0.5)' : 'none'}}>{format(date, 'd')}</span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{stateInfo.label}</p>
                                        </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    );
                                },
                                }}
                            />
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Update status for {selectedDate ? format(selectedDate, 'PPP') : ''}</DialogTitle>
                                </DialogHeader>
                                <div className="flex flex-col gap-4 py-4">
                                {vesselStates.map((state) => (
                                    <Button
                                    key={state.value}
                                    variant="outline"
                                    className="justify-start gap-3 rounded-lg"
                                    onClick={() => handleDayStateChange(selectedDate!, state.value)}
                                    >
                                    <span className={cn('h-3 w-3 rounded-full', state.color)}></span>
                                    {state.label}
                                    </Button>
                                ))}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
                <div className="space-y-8">
                    <Card className="rounded-xl shadow-sm">
                        <CardHeader>
                            <CardTitle>Day Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {vesselStates.map(state => (
                                <div key={state.value} className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className={cn('h-2.5 w-2.5 rounded-full', state.color)}></span>
                                        <span className="text-muted-foreground">{state.label}</span>
                                    </div>
                                    <span className="font-semibold">{totalDaysByState[state.value] || 0} days</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                    
                    <Card className="rounded-xl shadow-sm">
                        <CardHeader className="flex flex-row items-center gap-3">
                             <BookText className="h-5 w-5" />
                            <CardTitle>Trip Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                           <Textarea 
                                placeholder="Add notes about your trip..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="min-h-[100px]"
                           />
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
        </div>
      ) : (
        <Card className="rounded-xl shadow-sm max-w-lg mx-auto">
          <CardHeader>
            <CardTitle>Set Your Current Vessel</CardTitle>
            <CardDescription>Log the vessel you are currently working on to start tracking your sea time.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...statusForm}>
              <form onSubmit={statusForm.handleSubmit(onStatusSubmit)} className="space-y-6">
                <FormField
                  control={statusForm.control}
                  name="vesselId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel</FormLabel>
                      <div className="flex gap-2">
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingVessels}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingVessels ? "Loading vessels..." : "Select the vessel you're on"} />
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
                                <Button variant="outline" size="icon" className="shrink-0 rounded-full">
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add a New Vessel</DialogTitle>
                                </DialogHeader>
                                <Form {...addVesselForm}>
                                    <form onSubmit={addVesselForm.handleSubmit(onAddVesselSubmit)} className="space-y-4 py-4">
                                        <FormField
                                            control={addVesselForm.control}
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
                                            control={addVesselForm.control}
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
                                            control={addVesselForm.control}
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
                  control={statusForm.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Position/Role</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Deckhand, 2nd Engineer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={statusForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                       <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal rounded-lg",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
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
                              disabled={(date) =>
                                date > new Date() || date < new Date("1990-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={statusForm.control}
                  name="vesselState"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Initial Vessel State</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          {vesselStates.map((state) => (
                             <FormItem key={state.value} className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value={state.value} />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {state.label}
                                </FormLabel>
                              </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="rounded-lg">Start Tracking</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
