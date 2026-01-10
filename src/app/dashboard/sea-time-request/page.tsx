'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isBefore, isAfter, startOfDay, parse, isValid } from 'date-fns';
import { CalendarIcon, Loader2, Ship, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useUser, useSupabase } from '@/supabase';
import { useCollection } from '@/supabase/database';
import { getVesselAssignments } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import type { Vessel, SeaTimeRequest, VesselAssignment } from '@/lib/types';

const requestSeaTimeSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  startDate: z.date({ required_error: 'Start date is required.' }),
  endDate: z.date({ required_error: 'End date is required.' }),
}).refine((data) => {
  if (data.endDate < data.startDate) {
    return false;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

type RequestSeaTimeFormValues = z.infer<typeof requestSeaTimeSchema>;

export default function SeaTimeRequestPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);

  const form = useForm<RequestSeaTimeFormValues>({
    resolver: zodResolver(requestSeaTimeSchema),
    defaultValues: {
      vesselId: '',
    },
  });

  const selectedVesselId = form.watch('vesselId');

  // Get assignment date range for selected vessel
  const assignmentDateRange = useMemo(() => {
    if (!selectedVesselId || !vesselAssignments.length) return null;
    
    const assignment = vesselAssignments.find(a => a.vesselId === selectedVesselId);
    if (!assignment) return null;

    const startDate = new Date(assignment.startDate);
    const endDate = assignment.endDate ? new Date(assignment.endDate) : new Date(); // Use today if no end date
    
    return { startDate, endDate };
  }, [selectedVesselId, vesselAssignments]);

  // Reset date range when vessel changes
  useEffect(() => {
    if (selectedVesselId) {
      setDateRange(undefined);
      form.setValue('startDate', undefined as any);
      form.setValue('endDate', undefined as any);
    }
  }, [selectedVesselId, form]);

  // Fetch user's vessel assignments
  useEffect(() => {
    if (!user?.id) return;

    async function fetchAssignments() {
      try {
        setIsLoadingAssignments(true);
        const assignments = await getVesselAssignments(supabase, user.id);
        setVesselAssignments(assignments);
      } catch (error) {
        console.error('[SEA TIME REQUEST] Error fetching assignments:', error);
        toast({
          title: 'Error',
          description: 'Failed to load vessel assignments',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingAssignments(false);
      }
    }

    fetchAssignments();
  }, [user?.id, supabase, toast]);

  // Fetch vessels for the assignments
  const { data: vesselsData } = useCollection<Vessel>('vessels', {
    enabled: vesselAssignments.length > 0,
  });

  // Get unique vessels from assignments
  const availableVessels = useMemo(() => {
    if (!vesselsData || !vesselAssignments.length) return [];
    
    const vesselIds = new Set(vesselAssignments.map(a => a.vesselId));
    return vesselsData.filter(v => vesselIds.has(v.id));
  }, [vesselsData, vesselAssignments]);

  // Fetch existing requests
  const { data: requestsData } = useCollection<SeaTimeRequest>(
    'sea_time_requests',
    {
      filter: 'crew_user_id',
      filterValue: user?.id,
      orderBy: 'created_at',
      ascending: false,
    }
  );

  const onSubmit = async (values: RequestSeaTimeFormValues) => {
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/sea-time-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewUserId: user.id,
          vesselId: values.vesselId,
          startDate: format(values.startDate, 'yyyy-MM-dd'),
          endDate: format(values.endDate, 'yyyy-MM-dd'),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create request');
      }

      toast({
        title: 'Request submitted',
        description: 'Your sea time request has been submitted and is pending approval.',
      });

      form.reset({
        vesselId: '',
        startDate: undefined,
        endDate: undefined,
      });
      setDateRange(undefined);
      // Data will update automatically via realtime subscription
    } catch (error: any) {
      console.error('[SEA TIME REQUEST] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit request',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
    }
  };

  const getVesselName = (vesselId: string) => {
    return availableVessels.find(v => v.id === vesselId)?.name || vesselId;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Request Sea Time</h1>
        <p className="text-muted-foreground mt-2">
          Request to copy vessel sea time logs for a date range. Once approved by the vessel manager, 
          the vessel's state logs will be automatically added to your sea time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Request</CardTitle>
          <CardDescription>
            Select a vessel you're assigned to and choose a date range to request sea time logs.
          </CardDescription>
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingAssignments || availableVessels.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingAssignments ? "Loading vessels..." : "Select a vessel"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableVessels.map((vessel) => (
                          <SelectItem key={vessel.id} value={vessel.id}>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4" />
                              {vessel.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Only vessels you're currently assigned to are available.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date Range</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !dateRange && "text-muted-foreground"
                            )}
                          >
                            {dateRange?.from ? (
                              dateRange.to ? (
                                <>
                                  {format(dateRange.from, "LLL dd, y")} -{" "}
                                  {format(dateRange.to, "LLL dd, y")}
                                </>
                              ) : (
                                format(dateRange.from, "LLL dd, y")
                              )
                            ) : (
                              <span>Pick a date range</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from || assignmentDateRange?.startDate}
                          selected={dateRange}
                          onSelect={(range) => {
                            setDateRange(range);
                            if (range?.from) {
                              field.onChange(range.from);
                              form.setValue('startDate', range.from);
                            }
                            if (range?.to) {
                              form.setValue('endDate', range.to);
                            }
                          }}
                          numberOfMonths={2}
                          disabled={(date) => {
                            if (!assignmentDateRange) return true;
                            const dateStart = startOfDay(date);
                            const assignmentStart = startOfDay(assignmentDateRange.startDate);
                            const assignmentEnd = startOfDay(assignmentDateRange.endDate);
                            return isBefore(dateStart, assignmentStart) || isAfter(dateStart, assignmentEnd);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      {assignmentDateRange 
                        ? `Select dates within your assignment period: ${format(assignmentDateRange.startDate, 'MMM d, yyyy')}${assignmentDateRange.endDate ? ` - ${format(assignmentDateRange.endDate, 'MMM d, yyyy')}` : ' onwards'}`
                        : 'Please select a vessel first to see available date range.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl>
                      <input 
                        type="hidden" 
                        value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            field.onChange(new Date(e.target.value));
                          } else {
                            field.onChange(undefined);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isSubmitting || availableVessels.length === 0}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Request'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {requestsData && requestsData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Requests</CardTitle>
            <CardDescription>
              View the status of your sea time requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsData.map((request: any) => {
                  const vesselId = request.vessel_id || request.vesselId;
                  const startDateStr = request.start_date || request.startDate;
                  const endDateStr = request.end_date || request.endDate;
                  const status = request.status;
                  const createdAt = request.created_at || request.createdAt;
                  
                  return (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        {getVesselName(vesselId)}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (!startDateStr || !endDateStr) return '—';
                          
                          const startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
                          const endDate = parse(endDateStr, 'yyyy-MM-dd', new Date());
                          if (isValid(startDate) && isValid(endDate)) {
                            return `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
                          }
                          return `${startDateStr} - ${endDateStr}`;
                        })()}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(status)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {createdAt ? (() => {
                          const date = new Date(createdAt);
                          return isValid(date) ? format(date, 'MMM d, yyyy') : '—';
                        })() : '—'}
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

