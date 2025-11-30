
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, eachDayOfInterval, fromUnixTime, isSameDay, startOfDay, endOfDay, parse } from 'date-fns';
import { CalendarIcon, MapPin, Briefcase, Info, PlusCircle, Loader2, Ship, BookText, Clock, Waves, Anchor, Building } from 'lucide-react';
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
import { useUser, useFirestore, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError, useDoc } from '@/firebase';
import { collection, addDoc, doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import StateBreakdownChart from '@/components/dashboard/state-breakdown-chart';
import type { UserProfile, Vessel, SeaServiceRecord, StateLog, DailyStatus } from '@/lib/types';

const startServiceSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  position: z.string().min(2, 'Position is required.'),
  startDate: z.date({ required_error: 'A start date is required.' }),
  initialState: z.enum(['underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard']),
});

type StartServiceFormValues = z.infer<typeof startServiceSchema>;

const addVesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.string().min(2, 'Vessel type is required.'),
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
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [month, setMonth] = useState<Date>(new Date());

  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user?.uid]);
  const { data: userProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(userProfileRef);
  
  const vesselsCollectionRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'vessels') : null, [firestore, user?.uid]);
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(vesselsCollectionRef);

  const currentVessel = useMemo(() => vessels?.find(v => v.id === userProfile?.activeVesselId), [vessels, userProfile]);

  const currentServiceRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid || !currentVessel || !userProfile?.activeSeaServiceId) return null;
    return doc(firestore, 'users', user.uid, 'vessels', currentVessel.id, 'seaService', userProfile.activeSeaServiceId);
  }, [firestore, user?.uid, currentVessel, userProfile?.activeSeaServiceId]);

  const { data: currentService, isLoading: isLoadingService } = useDoc<SeaServiceRecord>(currentServiceRef);

  const stateLogsRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid || !currentVessel) return null;
    return collection(firestore, 'users', user.uid, 'vessels', currentVessel.id, 'stateLogs');
  }, [firestore, user?.uid, currentVessel]);

  const { data: stateLogs, isLoading: isLoadingLogs } = useCollection<StateLog>(stateLogsRef);
  
  const startServiceForm = useForm<StartServiceFormValues>({
    resolver: zodResolver(startServiceSchema),
    defaultValues: { vesselId: '', position: '', startDate: undefined, initialState: 'underway' },
  });

  const addVesselForm = useForm<AddVesselFormValues>({
    resolver: zodResolver(addVesselSchema),
    defaultValues: { name: '', type: '', officialNumber: '' },
  });

   useEffect(() => {
    if (currentService) {
      setNotes(currentService.notes || '');

      const startDate = fromUnixTime(currentService.startDate.seconds);
      const today = endOfDay(new Date());
      if (startDate > today) return;

      const allDates = eachDayOfInterval({ start: startOfDay(startDate), end: today });
      const existingLogsMap = new Map(stateLogs?.map(log => [log.id, log.state]));
      let lastKnownState: DailyStatus | null = null;
      const batch = writeBatch(firestore);
      let needsUpdate = false;

      // Find the last known state up to the first missing date
      for (const date of allDates) {
        const dateKey = format(date, 'yyyy-MM-dd');
        if (existingLogsMap.has(dateKey)) {
          lastKnownState = existingLogsMap.get(dateKey) as DailyStatus;
        } else {
            break; // Stop when we find the first gap
        }
      }
      
      // Backfill from the first gap
      allDates.forEach(date => {
        const dateKey = format(date, 'yyyy-MM-dd');
        if (!existingLogsMap.has(dateKey) && lastKnownState) {
          const logRef = doc(stateLogsRef!, dateKey);
          batch.set(logRef, { date: dateKey, state: lastKnownState });
          needsUpdate = true;
        } else if (existingLogsMap.has(dateKey)) {
            lastKnownState = existingLogsMap.get(dateKey) as DailyStatus;
        }
      });

      if (needsUpdate) {
        batch.commit().catch(e => console.error("Error backfilling state logs:", e));
      }
    }
  }, [currentService, stateLogs, firestore, user?.uid]);

  useEffect(() => {
    if(dateRange?.from && dateRange?.to) {
        setIsStatusDialogOpen(true);
    }
  }, [dateRange]);

  async function onStartServiceSubmit(data: StartServiceFormValues) {
    if (!firestore || !user) return;
    
    const today = new Date();
    if(data.startDate > today) {
        toast({title: "Invalid Date", description: "Start date cannot be in the future.", variant: "destructive"});
        return;
    }

    const batch = writeBatch(firestore);
    
    // 1. Create SeaServiceRecord
    const seaServiceColRef = collection(firestore, 'users', user.uid, 'vessels', data.vesselId, 'seaService');
    const newServiceRef = doc(seaServiceColRef);
    const newServiceData: Omit<SeaServiceRecord, 'id'> = {
        vesselId: data.vesselId,
        position: data.position,
        startDate: Timestamp.fromDate(data.startDate),
        isCurrent: true,
        notes: '',
    };
    batch.set(newServiceRef, newServiceData);

    // 2. Update user profile
    batch.update(userProfileRef!, { activeVesselId: data.vesselId, activeSeaServiceId: newServiceRef.id });

    // 3. Create initial state logs
    const logsColRef = collection(firestore, 'users', user.uid, 'vessels', data.vesselId, 'stateLogs');
    const interval = eachDayOfInterval({ start: data.startDate, end: today });
    interval.forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const logRef = doc(logsColRef, dateKey);
        batch.set(logRef, { date: dateKey, state: data.initialState });
    });
    
    await batch.commit();
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

  const handleRangeStateChange = async (state: DailyStatus) => {
    if (!stateLogsRef || !dateRange?.from || !dateRange?.to) return;
    
    const batch = writeBatch(firestore);
    const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });

    interval.forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const docRef = doc(stateLogsRef, dateKey);
        batch.set(docRef, { date: dateKey, state: state });
    });
    
    await batch.commit();
    setIsStatusDialogOpen(false);
    setDateRange(undefined);
  }

  const handleTodayStateChange = async (state: DailyStatus) => {
    if (!stateLogsRef) return;
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const docRef = doc(stateLogsRef, todayKey);
    await setDoc(docRef, { date: todayKey, state: state });
  };

  const handleSaveNotes = async () => {
    if (!currentServiceRef) return;
    setIsSavingNotes(true);
    setDoc(currentServiceRef, { notes }, { merge: true })
        .then(() => toast({ title: 'Notes Saved', description: 'Your trip notes have been updated.' }))
        .catch((e) => console.error("Error saving notes", e))
        .finally(() => setIsSavingNotes(false));
  };


  const handleEndTrip = async () => {
    if (!currentServiceRef || !userProfileRef) return;
    
    const batch = writeBatch(firestore);
    
    // 1. Update SeaServiceRecord
    batch.update(currentServiceRef, { isCurrent: false, endDate: Timestamp.now() });

    // 2. Update user profile
    batch.update(userProfileRef, { activeVesselId: null, activeSeaServiceId: null });

    await batch.commit();
  }
  
  const startDate = currentService ? fromUnixTime(currentService.startDate.seconds) : null;
  
  const { totalDaysByState, atSeaDays, standbyDays } = useMemo(() => {
    if (!stateLogs) return { totalDaysByState: [], atSeaDays: 0, standbyDays: 0 };
    
    let atSea = 0;
    let standby = 0;
    const stateCounts = stateLogs.reduce((acc, log) => {
        acc[log.state] = (acc[log.state] || 0) + 1;
        if (log.state === 'underway') atSea++;
        if (log.state === 'in-port' || log.state === 'at-anchor') standby++;
        return acc;
    }, {} as Record<DailyStatus, number>);

    const chartData = vesselStates.map(stateInfo => ({
        name: stateInfo.label,
        days: stateCounts[stateInfo.value] || 0,
        fill: stateInfo.color,
    })).filter(item => item.days > 0);

    return { totalDaysByState: chartData, atSeaDays: atSea, standbyDays: standby };
  }, [stateLogs]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayStatusValue = stateLogs?.find(log => log.id === todayKey)?.state;

  if (isLoadingProfile || isLoadingVessels) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    )
  }
  
  const isDisplayingStatus = currentService && currentVessel && startDate;

  return (
    <div className="w-full max-w-7xl mx-auto">
       <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <MapPin className="h-6 w-6" />
            <CardTitle>Current Status</CardTitle>
          </div>
          {isDisplayingStatus && (
            <Button onClick={handleEndTrip} variant="destructive" className="rounded-full">End Current Service</Button>
          )}
        </div>
      {isDisplayingStatus ? (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
                <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Vessel</CardTitle>
                        <Ship className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{currentVessel.name}</div>
                        <p className="text-xs text-muted-foreground">{currentVessel.type}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Position & Start Date</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{currentService.position}</div>
                         <p className="text-xs text-muted-foreground">Since {format(startDate, 'PPP')}</p>
                    </CardContent>
                </Card>
                 <Card className="rounded-xl bg-primary/10 border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">At Sea</CardTitle>
                         <Waves className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-4xl font-bold text-primary">{atSeaDays}</p>
                        <p className="text-xs text-muted-foreground">days</p>
                    </CardContent>
                </Card>
                 <Card className="rounded-xl bg-primary/10 border-primary/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Standby</CardTitle>
                        <Anchor className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-4xl font-bold text-primary">{standbyDays}</p>
                        <p className="text-xs text-muted-foreground">days</p>
                    </CardContent>
                </Card>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                    <CardHeader>
                        <CardTitle>Today's Log</CardTitle>
                        <CardDescription>{format(new Date(), 'PPP')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {isLoadingLogs ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /> : vesselStates.map(state => {
                            const isActive = todayStatusValue === state.value;
                            return (
                                <button
                                    key={state.value}
                                    onClick={() => handleTodayStateChange(state.value)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                                        isActive 
                                            ? 'bg-primary/10 text-primary ring-2 ring-primary'
                                            : 'hover:bg-muted/50'
                                    )}
                                >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: isActive ? state.color : 'hsl(var(--muted))' }}>
                                        <state.icon className={cn("h-4 w-4", isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
                                    </span>
                                    <span className={cn("font-medium", isActive ? 'text-primary' : 'text-foreground')}>{state.label}</span>
                                    <span className={cn("ml-auto h-4 w-4 rounded-full border-2", isActive ? 'bg-primary border-primary' : 'border-muted-foreground/50')}></span>
                                </button>
                            );
                        })}
                    </CardContent>
                </Card>
                 <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Monthly Log</CardTitle>
                                <CardDescription>Click and drag to select a date range.</CardDescription>
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Click a day to start a range, and click another to finish. <br/>Future dates are disabled.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </CardHeader>
                    <CardContent>
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
                                className="p-0"
                                classNames={{
                                    day_range_start: "day-range-start",
                                    day_range_end: "day-range-end",
                                    day_selected: 'bg-primary/20 text-primary-foreground hover:bg-primary/30 rounded-full',
                                    day_today: 'bg-accent text-accent-foreground rounded-full',
                                    day_disabled: 'text-muted-foreground opacity-50',
                                    day_outside: 'text-muted-foreground opacity-50',
                                    cell: "w-10 h-10 text-sm p-0 relative focus-within:relative focus-within:z-20",
                                    day: "h-10 w-10 p-0 font-normal rounded-full",
                                }}
                                disabled={[{ before: startOfDay(startDate) }, { after: endOfDay(new Date()) }]}
                                components={{
                                DayContent: ({ date }) => {
                                    const dateKey = format(date, 'yyyy-MM-dd');
                                    const log = stateLogs?.find(l => l.id === dateKey);
                                    const stateInfo = log ? vesselStates.find(s => s.value === log.state) : null;
                                    const isDateInRange = startDate && date >= startOfDay(startDate) && date <= endOfDay(new Date());

                                    if (!isDateInRange || !stateInfo) {
                                        return <div className="relative h-full w-full flex items-center justify-center">{format(date, 'd')}</div>;
                                    }
                                    
                                    const colorClass = stateInfo.color.replace('hsl(var(--chart-', '').replace('))', '');
                                    const calendarStateColorMap: Record<string, string> = { 'blue': 'bg-blue-500', 'orange': 'bg-orange-500', 'green': 'bg-green-500', 'gray': 'bg-gray-500', 'red': 'bg-red-500' }

                                    return (
                                    <TooltipProvider>
                                        <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="relative h-full w-full flex items-center justify-center">
                                                <div className={cn('absolute inset-1.5 rounded-full', calendarStateColorMap[colorClass])}></div>
                                                <span className={cn("relative z-10 font-medium", log ? 'text-white' : 'text-foreground')} style={{textShadow: log ? '0 1px 2px rgba(0,0,0,0.5)' : 'none'}}>{format(date, 'd')}</span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent><p>{stateInfo.label}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    );
                                },
                                }}
                            />
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>
                                        {dateRange?.from && dateRange.to ? 
                                            `Update status for ${format(dateRange.from, 'PPP')} - ${format(dateRange.to, 'PPP')}`
                                            : 'Select a date range'}
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="flex flex-col gap-4 py-4">
                                {vesselStates.map((state) => {
                                    const colorClass = state.color.replace('hsl(var(--chart-', '').replace('))', '');
                                    const calendarStateColorMap: Record<string, string> = { 'blue': 'bg-blue-500', 'orange': 'bg-orange-500', 'green': 'bg-green-500', 'gray': 'bg-gray-500', 'red': 'bg-red-500' };
                                    return (
                                     <Button key={state.value} variant="outline" className="justify-start gap-3 rounded-lg" onClick={() => handleRangeStateChange(state.value)}>
                                        <span className={cn('h-3 w-3 rounded-full', calendarStateColorMap[colorClass])}></span>
                                        {state.label}
                                     </Button>
                                )})}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                    <CardHeader><CardTitle>Day Breakdown</CardTitle></CardHeader>
                    <CardContent><StateBreakdownChart data={totalDaysByState} /></CardContent>
                </Card>
                    
                <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                    <CardHeader className="flex flex-row items-center gap-3"><BookText className="h-5 w-5" /><CardTitle>Trip Notes</CardTitle></CardHeader>
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
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg max-w-lg mx-auto">
          <CardHeader>
            <CardTitle>Start a New Sea Service</CardTitle>
            <CardDescription>Log the vessel you are currently working on to start tracking your sea time.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...startServiceForm}>
              <form onSubmit={startServiceForm.handleSubmit(onStartServiceSubmit)} className="space-y-6">
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
                            <DialogTrigger asChild><Button variant="outline" size="icon" className="shrink-0 rounded-full"><PlusCircle className="h-4 w-4" /></Button></DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>Add a New Vessel</DialogTitle></DialogHeader>
                                <Form {...addVesselForm}>
                                    <form onSubmit={addVesselForm.handleSubmit(onAddVesselSubmit)} className="space-y-4 py-4">
                                        <FormField control={addVesselForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Vessel Name</FormLabel><FormControl><Input placeholder="e.g., M/Y Odyssey" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={addVesselForm.control} name="type" render={({ field }) => (<FormItem><FormLabel>Vessel Type</FormLabel><FormControl><Input placeholder="e.g., Motor Yacht" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={addVesselForm.control} name="officialNumber" render={({ field }) => (<FormItem><FormLabel>Official Number (Optional)</FormLabel><FormControl><Input placeholder="e.g., IMO 1234567" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <DialogFooter className="pt-4">
                                            <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                                            <Button type="submit" disabled={isSavingVessel} className="rounded-lg">{isSavingVessel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Vessel</Button>
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
                <FormField control={startServiceForm.control} name="position" render={({ field }) => (<FormItem><FormLabel>Your Position/Role</FormLabel><FormControl><Input placeholder="e.g., Deckhand, 2nd Engineer" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={startServiceForm.control} name="startDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Start Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal rounded-lg",!field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) =>date > new Date() || date < new Date("1990-01-01")} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                <FormField control={startServiceForm.control} name="initialState" render={({ field }) => (<FormItem className="space-y-3"><FormLabel>Initial Vessel State</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">{vesselStates.map((state) => (<FormItem key={state.value} className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value={state.value} /></FormControl><FormLabel className="font-normal">{state.label}</FormLabel></FormItem>))}</RadioGroup></FormControl><FormMessage /></FormItem>)} />
                <Button type="submit" className="rounded-lg">Start Tracking</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
