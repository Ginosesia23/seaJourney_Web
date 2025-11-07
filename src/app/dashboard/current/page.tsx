'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays } from 'date-fns';
import { CalendarIcon, MapPin, Ship, Briefcase, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const currentStatusSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  position: z.string().min(2, 'Position is required.'),
  startDate: z.date({ required_error: 'A start date is required.' }),
  vesselState: z.enum(['at-sea', 'standby', 'in-port']),
});

type CurrentStatusFormValues = z.infer<typeof currentStatusSchema>;

const sampleVessels = [
  { id: 'vessel-1', name: 'M/Y "Odyssey"' },
  { id: 'vessel-2', name: 'S/Y "Wanderer"' },
  { id: 'vessel-3', name: 'M/Y "Eclipse"' },
];

const vesselStates = [
    { value: 'at-sea', label: 'At Sea' },
    { value: 'standby', label: 'On Standby' },
    { value: 'in-port', label: 'In Port' },
]

export default function CurrentPage() {
  const [currentStatus, setCurrentStatus] = useState<CurrentStatusFormValues | null>(null);

  const form = useForm<CurrentStatusFormValues>({
    resolver: zodResolver(currentStatusSchema),
    defaultValues: {
      vesselState: 'at-sea',
    },
  });

  function onSubmit(data: CurrentStatusFormValues) {
    setCurrentStatus(data);
    form.reset();
  }
  
  const selectedVessel = currentStatus ? sampleVessels.find(v => v.id === currentStatus.vesselId) : null;
  const daysOnboard = currentStatus ? differenceInDays(new Date(), currentStatus.startDate) : 0;


  return (
    <div className="w-full max-w-4xl mx-auto">
       <div className="flex items-center gap-3 mb-8">
          <MapPin className="h-6 w-6" />
          <CardTitle>Current Status</CardTitle>
        </div>
      {currentStatus && selectedVessel ? (
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle>You are currently on {selectedVessel.name}</CardTitle>
            <CardDescription>
              Logged since {format(currentStatus.startDate, 'PPP')}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                    <div>
                        <p className="text-sm text-muted-foreground">Position</p>
                        <p className="font-semibold">{currentStatus.position}</p>
                    </div>
                </div>
                 <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                    <Workflow className="h-5 w-5 text-muted-foreground" />
                    <div>
                        <p className="text-sm text-muted-foreground">Vessel State</p>
                        <p className="font-semibold capitalize">{currentStatus.vesselState.replace('-', ' ')}</p>
                    </div>
                </div>
            </div>
            <div className="text-center pt-4">
                <p className="text-sm text-muted-foreground">Total time onboard</p>
                <p className="text-4xl font-bold text-primary">{daysOnboard} days</p>
            </div>
            <div className="pt-6 flex justify-center">
                <Button onClick={() => setCurrentStatus(null)}>End Current Trip</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle>Set Your Current Vessel</CardTitle>
            <CardDescription>Log the vessel you are currently working on to start tracking your sea time.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="vesselId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select the vessel you're on" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sampleVessels.map(vessel => (
                            <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
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
                  control={form.control}
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
                  control={form.control}
                  name="vesselState"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Vessel State</FormLabel>
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