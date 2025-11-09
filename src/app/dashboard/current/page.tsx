
'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, eachDayOfInterval } from 'date-fns';
import { CalendarIcon, MapPin, Ship, Briefcase, Info, PlusCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { collection, addDoc, doc } from 'firebase/firestore';

const currentStatusSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  position: z.string().min(2, 'Position is required.'),
  startDate: z.date({ required_error: 'A start date is required.' }),
  vesselState: z.enum(['at-sea', 'standby', 'in-port']),
});

type CurrentStatusFormValues = z.infer<typeof currentStatusSchema>;

type DailyStatus = 'at-sea' | 'standby' | 'in-port';
interface CurrentStatus extends CurrentStatusFormValues {
    dailyStates: Record<string, DailyStatus>;
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
    { value: 'at-sea', label: 'At Sea', color: 'bg-primary' },
    { value: 'standby', label: 'On Standby', color: 'bg-yellow-500' },
    { value: 'in-port', label: 'In Port', color: 'bg-accent' },
]

export default function CurrentPage() {
  const [currentStatus, setCurrentStatus] = useState<CurrentStatus | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAddVesselDialogOpen, setIsAddVesselDialogOpen] = useState(false);
  const [isSavingVessel, setIsSavingVessel] = useState(false);

  const { user } = useUser();
  const firestore = useFirestore();

  const vesselsCollectionRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return collection(firestore, 'users', user.uid, 'vessels');
  }, [firestore, user?.uid]);

  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(vesselsCollectionRef);

  const statusForm = useForm<CurrentStatusFormValues>({
    resolver: zodResolver(currentStatusSchema),
    defaultValues: {
      vesselState: 'at-sea',
    },
  });

  const addVesselForm = useForm<AddVesselFormValues>({
    resolver: zodResolver(addVesselSchema),
  });

  function onStatusSubmit(data: CurrentStatusFormValues) {
    const today = new Date();
    const interval = eachDayOfInterval({ start: data.startDate, end: today });
    const dailyStates: Record<string, DailyStatus> = {};
    interval.forEach(day => {
        dailyStates[format(day, 'yyyy-MM-dd')] = data.vesselState;
    });

    setCurrentStatus({
        ...data,
        dailyStates
    });
    statusForm.reset();
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
    if (!currentStatus) return;

    const dateKey = format(day, 'yyyy-MM-dd');
    setCurrentStatus(prev => ({
        ...prev!,
        dailyStates: {
            ...prev!.dailyStates,
            [dateKey]: state
        }
    }));
    setIsStatusDialogOpen(false);
  }
  
  const selectedVessel = currentStatus ? vessels?.find(v => v.id === currentStatus.vesselId) : null;
  const daysOnboard = currentStatus ? differenceInDays(new Date(), currentStatus.startDate) + 1 : 0;
  
  const totalDaysByState = useMemo(() => {
    if (!currentStatus) return { 'at-sea': 0, standby: 0, 'in-port': 0 };
    return Object.values(currentStatus.dailyStates).reduce((acc, state) => {
        acc[state] = (acc[state] || 0) + 1;
        return acc;
    }, {} as Record<DailyStatus, number>);
  }, [currentStatus]);

  return (
    <div className="w-full max-w-7xl mx-auto">
       <div className="flex items-center gap-3 mb-8">
          <MapPin className="h-6 w-6" />
          <CardTitle>Current Status</CardTitle>
        </div>
      {currentStatus && selectedVessel ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2">
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
                                    setSelectedDate(day);
                                    setIsStatusDialogOpen(true);
                                }}
                                month={selectedDate}
                                onMonthChange={setSelectedDate}
                                className="p-0"
                                classNames={{
                                    day: 'h-12 w-12 rounded-lg relative',
                                    day_selected: 'bg-background text-foreground border border-primary',
                                }}
                                disabled={{ after: new Date() }}
                                components={{
                                DayContent: ({ date, ...props }) => {
                                    const dateKey = format(date, 'yyyy-MM-dd');
                                    const state = currentStatus.dailyStates[dateKey];
                                    const stateInfo = vesselStates.find(s => s.value === state);
                                    const isDateInRange = date >= currentStatus.startDate && date <= new Date();

                                    return (
                                    <div className="relative h-full w-full flex items-center justify-center">
                                        <span>{format(date, 'd')}</span>
                                        {isDateInRange && stateInfo && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className={cn('absolute bottom-1 h-2 w-2 rounded-full', stateInfo.color)} />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{stateInfo.label}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                        )}
                                    </div>
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
                                    className="justify-start gap-3"
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
            </div>
            <div className="space-y-8">
                <Card className="rounded-xl shadow-sm">
                    <CardHeader>
                        <CardTitle>Trip Summary</CardTitle>
                        <CardDescription>
                        You are currently on {selectedVessel.name}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                            <Briefcase className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm text-muted-foreground">Position</p>
                                <p className="font-semibold">{currentStatus.position}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm text-muted-foreground">Start Date</p>
                                <p className="font-semibold">{format(currentStatus.startDate, 'PPP')}</p>
                            </div>
                        </div>
                         <div className="text-center pt-2">
                            <p className="text-sm text-muted-foreground">Total time onboard</p>
                            <p className="text-4xl font-bold text-primary">{daysOnboard} days</p>
                        </div>
                    </CardContent>
                </Card>
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
                <div className="pt-2 flex justify-center">
                    <Button onClick={() => setCurrentStatus(null)}>End Current Trip</Button>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingVessels}>
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
                                <Button variant="outline" size="icon" className="shrink-0">
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
                                            <Button type="submit" disabled={isSavingVessel}>
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
                                  "w-full pl-3 text-left font-normal",
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

                <Button type="submit">Start Tracking</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

    