'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, startOfDay, isAfter, parse, eachDayOfInterval, isWithinInterval, subMonths, addDays, differenceInDays } from 'date-fns';
import { LifeBuoy, Loader2, PlusCircle, Mail, Calendar, CalendarIcon, Ship, Clock, CheckCircle2, XCircle, FileText, Download, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselStateLogs, getVesselAssignments } from '@/supabase/database/queries';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { generateTestimonialPDF } from '@/lib/pdf-generator';
import { generateTestimonialCode } from '@/lib/testimonial-code';
import type { Vessel, UserProfile, Testimonial, TestimonialStatus, VesselAssignment } from '@/lib/types';
import type { StateLog } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const testimonialSchema = z.object({
  vessel_id: z.string().min(1, 'Please select a vessel.'),
  start_date: z.date({ required_error: 'A start date is required.' }),
  end_date: z.date({ required_error: 'An end date is required.' }),
  captain_email: z.string().email('Please enter a valid email address.').optional(),
  captain_name: z.string().optional(),
  official_body: z.string().optional(),
  official_reference: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  if (data.end_date && data.end_date < data.start_date) {
    return false;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["end_date"],
}).refine((data) => {
  const today = startOfDay(new Date());
  const startDate = startOfDay(data.start_date);
  const endDate = startOfDay(data.end_date);
  
  if (isAfter(startDate, today) || isAfter(endDate, today)) {
    return false;
  }
  return true;
}, {
  message: "Dates cannot be in the future",
  path: ["end_date"],
});

type TestimonialFormValues = z.infer<typeof testimonialSchema>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://www.seajourney.co.uk';

// Helper function to create or get a secure signoff token
async function createOrGetSignoffToken(
  supabase: SupabaseClient,
  testimonialId: string,
  captainEmail: string
): Promise<string> {
  // 1. Try to reuse a valid token if it exists
  const { data: existing, error: existingError } = await supabase
    .from('testimonials')
    .select('signoff_token, signoff_token_expires_at, signoff_target_email')
    .eq('id', testimonialId)
    .maybeSingle();

  if (existingError) {
    console.error('Error checking existing token:', existingError);
    throw existingError;
  }

  const now = new Date();

  if (
    existing?.signoff_token &&
    existing.signoff_token_expires_at &&
    existing.signoff_target_email === captainEmail &&
    new Date(existing.signoff_token_expires_at) > now
  ) {
    return existing.signoff_token as string;
  }

  // 2. Otherwise, create a new one
  const token = crypto.randomUUID(); // browser-safe in Next.js

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

  const { error: updateError } = await supabase
    .from('testimonials')
    .update({
      signoff_token: token,
      signoff_token_expires_at: expiresAt.toISOString(),
      signoff_target_email: captainEmail,
    })
    .eq('id', testimonialId);

  if (updateError) {
    console.error('Error creating signoff token:', updateError);
    throw updateError;
  }

  return token;
}

// Helper function to request captain signoff
async function requestCaptainSignoff(
  supabase: SupabaseClient,
  testimonial: Testimonial & { vessel_name?: string },
  toast: (props: { title: string; description: string; variant?: 'default' | 'destructive' }) => void
): Promise<void> {
  if (!testimonial.captain_email) {
    throw new Error('Captain email is required');
  }

  const captainEmail = testimonial.captain_email;
  const captainName = testimonial.captain_name || 'Captain';
  const vesselName = testimonial.vessel_name ?? 'Your Vessel';

  // 1. Ensure token is in DB
  const token = await createOrGetSignoffToken(
    supabase,
    testimonial.id,
    captainEmail
  );

  // 2. Build the link used in the email
  const signoffLink = `${APP_URL}/testimonials/signoff?token=${encodeURIComponent(
    token
  )}&email=${encodeURIComponent(captainEmail)}`;

  // 3. Call Edge Function
  const { data, error } = await supabase.functions.invoke('send-signoff-request', {
    body: {
      captainEmail,
      captainName,
      vesselName,
      signoffLink,
      pdfUrl: testimonial.pdf_url || null,
    },
  });

  if (error) {
    console.error('Error sending email:', error);
    
    // Try to get more details from the response
    if (error.context instanceof Response) {
      try {
        const errorText = await error.context.clone().text();
        console.error('Edge Function error response body:', errorText);
        try {
          const errorJson = JSON.parse(errorText);
          console.error('Edge Function error details:', errorJson);
        } catch {
          // Not JSON, that's fine
        }
      } catch (e) {
        console.error('Could not read error response body:', e);
      }
    }
    
    const statusCode = error.context?.status || error.status;
    const errorMessage = error.message || 'Unknown error';
    const isNetworkError = errorMessage?.includes('Failed to fetch') || 
                          errorMessage?.includes('Failed to send a request');
    
    let errorDescription = '';
    if (isNetworkError) {
      errorDescription = `Email function appears to be unavailable. Please verify the Edge Function 'send-signoff-request' is deployed in Supabase.`;
    } else if (statusCode === 400) {
      errorDescription = `The email request was invalid (Status: ${statusCode}). Please check the console for details and contact the captain manually.`;
    } else {
      errorDescription = statusCode 
        ? `Email failed (Status: ${statusCode}): ${errorMessage}. Please contact the captain manually.`
        : errorMessage 
          ? `Email failed: ${errorMessage}. Please contact the captain manually.`
          : `There was an error sending the email. Please contact the captain manually.`;
    }
    
    toast({
      title: 'Request Created',
      description: errorDescription,
      variant: statusCode === 400 ? 'destructive' : 'default',
    });
    
    return;
  }

  // 4. Optionally update status to pending_captain
  await supabase
    .from('testimonials')
    .update({ status: 'pending_captain' })
    .eq('id', testimonial.id);

  // 5. Show success toast
  toast({
    title: 'Request Sent',
    description: `Testimonial request has been sent to ${captainEmail}. You will be notified when the captain responds.`,
  });
}

// Helper function to calculate day counts from state logs for a date range
function calculateDayCounts(stateLogs: StateLog[], startDate: string, endDate: string) {
  const start = parse(startDate, 'yyyy-MM-dd', new Date());
  const end = parse(endDate, 'yyyy-MM-dd', new Date());
  const dateRange = eachDayOfInterval({ start, end });
  
  // Filter logs to the date range
  const rangeLogs = stateLogs.filter(log => {
    const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
    return isWithinInterval(logDate, { start, end });
  });
  
  // Calculate individual day counts
  const atSeaDays = rangeLogs.filter(log => log.state === 'underway').length;
  const yardDays = rangeLogs.filter(log => log.state === 'in-yard').length;
  const leaveDays = rangeLogs.filter(log => log.state === 'on-leave').length;
  
  // Calculate standby days using the standby calculation function
  const { totalStandbyDays } = calculateStandbyDays(rangeLogs);
  const standbyDays = totalStandbyDays;
  
  // Calculate total days as the sum to satisfy the database constraint
  // The constraint likely requires: total_days = at_sea_days + standby_days + yard_days + leave_days
  const totalDays = atSeaDays + standbyDays + yardDays + leaveDays;
  
  return {
    total_days: totalDays,
    at_sea_days: atSeaDays,
    standby_days: standbyDays,
    yard_days: yardDays,
    leave_days: leaveDays,
  };
}

export default function TestimonialsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isLoadingTestimonials, setIsLoadingTestimonials] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedVesselLogs, setSelectedVesselLogs] = useState<StateLog[]>([]);
  const [testimonialToDelete, setTestimonialToDelete] = useState<Testimonial | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

    const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const form = useForm<TestimonialFormValues>({
    resolver: zodResolver(testimonialSchema),
    defaultValues: {
      vessel_id: '',
      captain_email: '',
      captain_name: '',
      official_body: '',
      official_reference: '',
      notes: '',
    },
  });

  // Watch vessel_id and date range to calculate day counts
  const watchedVesselId = form.watch('vessel_id');
  const watchedStartDate = form.watch('start_date');
  const watchedEndDate = form.watch('end_date');

  // Fetch user profile
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      id: userProfileRaw.id,
      email: (userProfileRaw as any).email || '',
      username: (userProfileRaw as any).username || '',
      activeVesselId: (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId || undefined,
      firstName: (userProfileRaw as any).first_name || (userProfileRaw as any).firstName,
      lastName: (userProfileRaw as any).last_name || (userProfileRaw as any).lastName,
    } as UserProfile;
  }, [userProfileRaw]);

  // Query all vessels
  const { data: allVessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  // Filter vessels to only show ones the user has logged time on
  const [vesselStateLogs, setVesselStateLogs] = useState<Map<string, StateLog[]>>(new Map());

  useEffect(() => {
    if (allVessels && user?.id) {
      const fetchLogs = async () => {
        const newLogs = new Map<string, StateLog[]>();
        await Promise.all(allVessels.map(async (vessel) => {
          const logs = await getVesselStateLogs(supabase, vessel.id, user.id);
          if (logs && logs.length > 0) {
            newLogs.set(vessel.id, logs);
          }
        }));
        setVesselStateLogs(newLogs);
      };
      fetchLogs();
    }
  }, [allVessels, user?.id, supabase]);

  const vessels = useMemo(() => {
    if (!allVessels) return [];
    return allVessels.filter(vessel => {
      const logs = vesselStateLogs.get(vessel.id) || [];
      return logs.length > 0;
    });
  }, [allVessels, vesselStateLogs]);

  // Fetch vessel assignments and state logs for selected vessel
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
  
  useEffect(() => {
    if (watchedVesselId && user?.id) {
      const fetchData = async () => {
        const [logs, assignments] = await Promise.all([
          getVesselStateLogs(supabase, watchedVesselId, user.id),
          getVesselAssignments(supabase, user.id)
        ]);
        setSelectedVesselLogs(logs);
        
        // Filter assignments for this vessel
        const vesselAssignments = assignments.filter(a => a.vesselId === watchedVesselId);
        setVesselAssignments(vesselAssignments);
      };
      fetchData();
    } else {
      setSelectedVesselLogs([]);
      setVesselAssignments([]);
    }
  }, [watchedVesselId, user?.id, supabase]);

  // Calculate date range options based on vessel assignments and state logs
  const dateRangeOptions = useMemo(() => {
    // Only require vessel and logs - assignments are optional
    if (!watchedVesselId || selectedVesselLogs.length === 0) {
      return [];
    }

    const today = startOfDay(new Date());
    const options: Array<{ label: string; startDate: Date; endDate: Date }> = [];

    // Option 1: Period between last two leave periods (or before last leave if only one)
    // Find all unique leave dates (group consecutive leave days)
    const allLeaveDates = selectedVesselLogs
      .filter(log => log.state === 'on-leave')
      .map(log => parse(log.date, 'yyyy-MM-dd', new Date()))
      .sort((a, b) => a.getTime() - b.getTime());

    // Group consecutive leave dates into periods
    const leavePeriods: Array<{ start: Date; end: Date }> = [];
    if (allLeaveDates.length > 0) {
      let currentPeriodStart = allLeaveDates[0];
      let currentPeriodEnd = allLeaveDates[0];
      
      for (let i = 1; i < allLeaveDates.length; i++) {
        const daysDiff = differenceInDays(allLeaveDates[i], currentPeriodEnd);
        if (daysDiff <= 1) {
          // Consecutive or same day - extend current period
          currentPeriodEnd = allLeaveDates[i];
        } else {
          // Gap found - save current period and start new one
          leavePeriods.push({ start: currentPeriodStart, end: currentPeriodEnd });
          currentPeriodStart = allLeaveDates[i];
          currentPeriodEnd = allLeaveDates[i];
        }
      }
      // Add the last period
      leavePeriods.push({ start: currentPeriodStart, end: currentPeriodEnd });
    }

    if (leavePeriods.length >= 2) {
      // We have at least 2 leave periods - find onboard period between the last two
      const lastLeavePeriod = leavePeriods[leavePeriods.length - 1];
      const previousLeavePeriod = leavePeriods[leavePeriods.length - 2];
      
      // Find logged dates between the two leave periods (onboard period)
      const onboardDatesBetweenLeaves = selectedVesselLogs
        .filter(log => {
          const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
          return logDate > previousLeavePeriod.end && logDate < lastLeavePeriod.start && log.state !== 'on-leave';
        })
        .map(log => parse(log.date, 'yyyy-MM-dd', new Date()))
        .sort((a, b) => a.getTime() - b.getTime());

      if (onboardDatesBetweenLeaves.length > 0) {
        const periodStart = onboardDatesBetweenLeaves[0];
        const periodEnd = onboardDatesBetweenLeaves[onboardDatesBetweenLeaves.length - 1];
        
        options.push({
          label: 'Between Last Two Leaves',
          startDate: periodStart,
          endDate: periodEnd,
        });
      }
    } else if (leavePeriods.length === 1) {
      // Only one leave period - find period before it
      const lastLeavePeriod = leavePeriods[0];
      
      // Find logged dates before the last leave
      const onboardDatesBeforeLeave = selectedVesselLogs
        .filter(log => {
          const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
          return logDate < lastLeavePeriod.start && log.state !== 'on-leave';
        })
        .map(log => parse(log.date, 'yyyy-MM-dd', new Date()))
        .sort((a, b) => a.getTime() - b.getTime());

      if (onboardDatesBeforeLeave.length > 0) {
        const periodStart = onboardDatesBeforeLeave[0];
        const periodEnd = onboardDatesBeforeLeave[onboardDatesBeforeLeave.length - 1];
        
        options.push({
          label: 'Before Last Leave',
          startDate: periodStart,
          endDate: periodEnd,
        });
      }
    }

    // Option 2: Fixed time period options (Last 2, 3, 4 months)
    const twoMonthsAgo = subMonths(today, 2);
    const threeMonthsAgo = subMonths(today, 3);
    const fourMonthsAgo = subMonths(today, 4);

    // Check if we have logs in each period
    const hasLogsLast2Months = selectedVesselLogs.some(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      return logDate >= twoMonthsAgo;
    });

    const hasLogsLast3Months = selectedVesselLogs.some(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      return logDate >= threeMonthsAgo;
    });

    const hasLogsLast4Months = selectedVesselLogs.some(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      return logDate >= fourMonthsAgo;
    });

    if (hasLogsLast2Months) {
      options.push({
        label: 'Last 2 Months',
        startDate: twoMonthsAgo,
        endDate: today,
      });
    }

    if (hasLogsLast3Months) {
      options.push({
        label: 'Last 3 Months',
        startDate: threeMonthsAgo,
        endDate: today,
      });
    }

    if (hasLogsLast4Months) {
      options.push({
        label: 'Last 4 Months',
        startDate: fourMonthsAgo,
        endDate: today,
      });
    }

    // Option 3: Last onboard period (from vessel assignment)
    // Find the most recent assignment for this vessel
    const sortedAssignments = [...vesselAssignments].sort((a, b) => {
      const aStart = parse(a.startDate, 'yyyy-MM-dd', new Date());
      const bStart = parse(b.startDate, 'yyyy-MM-dd', new Date());
      return bStart.getTime() - aStart.getTime();
    });

    if (sortedAssignments.length > 0) {
      const latestAssignment = sortedAssignments[0];
      const assignmentStart = parse(latestAssignment.startDate, 'yyyy-MM-dd', new Date());
      const assignmentEnd = latestAssignment.endDate 
        ? parse(latestAssignment.endDate, 'yyyy-MM-dd', new Date())
        : today;

      // Check if this assignment has logged days
      const assignmentLogs = selectedVesselLogs.filter(log => {
        const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
        return logDate >= assignmentStart && logDate <= assignmentEnd;
      });

      if (assignmentLogs.length > 0) {
        // Find the actual range of logged days within this assignment
        const loggedDates = assignmentLogs
          .map(log => parse(log.date, 'yyyy-MM-dd', new Date()))
          .sort((a, b) => a.getTime() - b.getTime());
        
        const firstLoggedDate = loggedDates[0];
        const lastLoggedDate = loggedDates[loggedDates.length - 1];

        options.push({
          label: 'Last Onboard Period',
          startDate: firstLoggedDate,
          endDate: lastLoggedDate > today ? today : lastLoggedDate,
        });
      }

      // Option 3: Find period between "on-leave" states (most recent onboard period before leave)
      const leaveLogsWithDates = selectedVesselLogs
        .filter(log => log.state === 'on-leave')
        .map(log => ({
          logDate: parse(log.date, 'yyyy-MM-dd', new Date()),
          state: log.state
        }))
        .sort((a, b) => b.logDate.getTime() - a.logDate.getTime());

      if (leaveLogsWithDates.length > 0) {
        // Find the last leave period
        const lastLeaveDate = leaveLogsWithDates[0].logDate;
        
        // Find the last logged date before leave
        const logsBeforeLeave = selectedVesselLogs
          .filter(log => {
            const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
            return logDate < lastLeaveDate && log.state !== 'on-leave';
          })
          .map(log => parse(log.date, 'yyyy-MM-dd', new Date()))
          .sort((a, b) => a.getTime() - b.getTime());

        if (logsBeforeLeave.length > 0) {
          const lastOnboardBeforeLeave = logsBeforeLeave[logsBeforeLeave.length - 1];
          // Go back to find the start of this onboard period (first non-leave date in sequence)
          let periodStart = lastOnboardBeforeLeave;
          for (let i = logsBeforeLeave.length - 2; i >= 0; i--) {
            const daysDiff = differenceInDays(logsBeforeLeave[i + 1], logsBeforeLeave[i]);
            if (daysDiff <= 1) {
              periodStart = logsBeforeLeave[i];
            } else {
              break;
            }
          }

          options.push({
            label: 'Before Last Leave',
            startDate: periodStart,
            endDate: addDays(lastLeaveDate, -1),
          });
        }
      }
    }

    return options;
  }, [watchedVesselId, vesselAssignments, selectedVesselLogs]);

  // Function to apply a date range option
  const applyDateRangeOption = (option: { startDate: Date; endDate: Date }) => {
    form.setValue('start_date', startOfDay(option.startDate));
    form.setValue('end_date', startOfDay(option.endDate));
  };

  // Calculate and display day counts preview
  const dayCountsPreview = useMemo(() => {
    if (!watchedStartDate || !watchedEndDate || selectedVesselLogs.length === 0) {
      return null;
    }

    const startDateStr = format(watchedStartDate, 'yyyy-MM-dd');
    const endDateStr = format(watchedEndDate, 'yyyy-MM-dd');
    
    return calculateDayCounts(selectedVesselLogs, startDateStr, endDateStr);
  }, [watchedStartDate, watchedEndDate, selectedVesselLogs]);

  // Fetch testimonials
  useEffect(() => {
    if (!user?.id) return;

    setIsLoadingTestimonials(true);
    const fetchTestimonials = async () => {
      try {
        const { data, error } = await supabase
          .from('testimonials')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching testimonials:', error);
          setTestimonials([]);
        } else {
          setTestimonials((data || []) as Testimonial[]);
        }
      } catch (error) {
        console.error('Error fetching testimonials:', error);
        setTestimonials([]);
      } finally {
        setIsLoadingTestimonials(false);
      }
    };

    fetchTestimonials();
  }, [user?.id, supabase]);

  const handleSubmit = async (data: TestimonialFormValues) => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      const startDateStr = format(data.start_date, 'yyyy-MM-dd');
      const endDateStr = format(data.end_date, 'yyyy-MM-dd');

      // Calculate day counts
      const dayCounts = calculateDayCounts(selectedVesselLogs, startDateStr, endDateStr);

      // Validate that total_days equals the sum (required by database constraint)
      const calculatedTotal = dayCounts.at_sea_days + dayCounts.standby_days + dayCounts.yard_days + dayCounts.leave_days;
      if (dayCounts.total_days !== calculatedTotal) {
        console.warn('Day counts mismatch, adjusting total_days:', {
          original: dayCounts.total_days,
          calculated: calculatedTotal,
          dayCounts,
        });
        dayCounts.total_days = calculatedTotal;
      }

      // Determine initial status: if captain_email is provided, status is 'pending_captain', otherwise 'draft'
      const initialStatus: TestimonialStatus = data.captain_email ? 'pending_captain' : 'draft';

      // Generate unique testimonial code (with retry logic in case of collision)
      let testimonialCode = generateTestimonialCode();
      let testimonialData;
      let insertError;
      let retries = 0;
      const maxRetries = 5;

      // Try to create testimonial, regenerating code if there's a unique constraint violation
      while (retries < maxRetries) {
        const result = await supabase
          .from('testimonials')
          .insert({
            user_id: user.id,
            vessel_id: data.vessel_id,
            start_date: startDateStr,
            end_date: endDateStr,
            total_days: dayCounts.total_days,
            at_sea_days: dayCounts.at_sea_days,
            standby_days: dayCounts.standby_days,
            yard_days: dayCounts.yard_days,
            leave_days: dayCounts.leave_days,
            status: initialStatus,
            captain_email: data.captain_email || null,
            captain_name: data.captain_name || null,
            official_body: data.official_body || null,
            official_reference: data.official_reference || null,
            notes: data.notes || null,
            testimonial_code: testimonialCode,
          })
          .select()
          .single();

        insertError = result.error;
        
        // Check if error is a unique constraint violation on testimonial_code
        if (insertError && insertError.code === '23505' && insertError.message?.includes('testimonial_code')) {
          // Code collision - generate a new one and retry
          testimonialCode = generateTestimonialCode();
          retries++;
          continue;
        }
        
        // If no error or different error, break out of loop
        testimonialData = result.data;
        break;
      }

      if (insertError) {
        throw insertError;
      }

      // Send email to captain if captain_email is provided
      if (data.captain_email && initialStatus === 'pending_captain') {
        const vesselName = vessels.find(v => v.id === data.vessel_id)?.name || 'Unknown Vessel';
        
        await requestCaptainSignoff(
          supabase,
          {
            ...testimonialData,
            vessel_name: vesselName,
          },
          toast
        );
      } else {
        toast({
          title: 'Testimonial Created',
          description: 'Testimonial has been saved as draft. You can edit it later or send it to a captain.',
        });
      }


      form.reset();
      setIsDialogOpen(false);
      
      // Refresh testimonials list
      const { data: updatedData } = await supabase
        .from('testimonials')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (updatedData) {
        setTestimonials(updatedData as Testimonial[]);
      }
    } catch (error: any) {
      console.error('Error creating testimonial:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create testimonial. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTestimonials = useMemo(() => {
    if (activeTab === 'all') return testimonials;
    if (activeTab === 'pending') {
      // Show both pending_captain and pending_official when 'pending' is selected
      return testimonials.filter(t => t.status === 'pending_captain' || t.status === 'pending_official');
    }
    return testimonials.filter(t => t.status === activeTab);
  }, [testimonials, activeTab]);

  const getVesselName = (vesselId: string) => {
    return vessels.find(v => v.id === vesselId)?.name || 'Unknown Vessel';
  };

  const getVesselDetails = (vesselId: string) => {
    return vessels.find(v => v.id === vesselId);
  };

  const handleGeneratePDF = async (testimonial: Testimonial) => {
    if (!userProfile) {
      toast({
        title: 'Error',
        description: 'User profile not loaded.',
        variant: 'destructive',
      });
      return;
    }

    const vessel = getVesselDetails(testimonial.vessel_id);
    if (!vessel) {
      toast({
        title: 'Error',
        description: 'Vessel details not found.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await generateTestimonialPDF({
      testimonial: {
        id: testimonial.id,
        start_date: testimonial.start_date,
        end_date: testimonial.end_date,
        total_days: testimonial.total_days,
        at_sea_days: testimonial.at_sea_days,
        standby_days: testimonial.standby_days,
        yard_days: testimonial.yard_days,
        leave_days: testimonial.leave_days,
        captain_name: testimonial.captain_name,
        captain_email: testimonial.captain_email,
        official_body: testimonial.official_body,
        official_reference: testimonial.official_reference,
        notes: testimonial.notes,
        testimonial_code: testimonial.testimonial_code,
        status: testimonial.status,
        signoff_used_at: testimonial.signoff_used_at,
        created_at: testimonial.created_at,
        updated_at: testimonial.updated_at,
      },
      userProfile: {
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        username: userProfile.username,
        email: userProfile.email || '',
      },
      vessel: {
        name: vessel.name,
        type: vessel.type || null,
        officialNumber: vessel.officialNumber || null,
      },
    });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTestimonial = async (testimonial: Testimonial) => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to delete testimonials.',
        variant: 'destructive',
      });
      return;
    }

    setIsDeleting(true);
    try {
      console.log('Attempting to delete testimonial:', testimonial.id);
      console.log('Current user ID:', user.id);
      
      // Delete the testimonial - RLS will automatically check user_id
      // Using .select() to get confirmation of what was deleted
      const { data: deletedData, error: deleteError } = await supabase
        .from('testimonials')
        .delete()
        .eq('id', testimonial.id)
        .select();

      console.log('Delete response:', { deletedData, deleteError });

      if (deleteError) {
        console.error('Delete error details:', {
          code: deleteError.code,
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint,
        });
        throw deleteError;
      }

      // Check if anything was actually deleted
      if (!deletedData || deletedData.length === 0) {
        throw new Error('No testimonial was deleted. It may not exist or you may not have permission.');
      }

      console.log('Successfully deleted testimonial:', deletedData);

      // Remove from local state immediately for better UX
      setTestimonials((prev) => prev.filter((t) => t.id !== testimonial.id));

      toast({
        title: 'Testimonial Deleted',
        description: 'The testimonial has been successfully deleted.',
      });

      // Refresh testimonials list to ensure consistency
      const { data: updatedData, error: refreshError } = await supabase
        .from('testimonials')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (refreshError) {
        console.error('Refresh error (non-critical):', refreshError);
      } else if (updatedData) {
        setTestimonials(updatedData as Testimonial[]);
      }

      setTestimonialToDelete(null);
    } catch (error: any) {
      console.error('Error deleting testimonial:', error);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      
      let errorMessage = 'Failed to delete testimonial. Please try again.';
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.code === 'PGRST116') {
        errorMessage = 'No rows were deleted. You may not have permission to delete this testimonial.';
      } else if (error?.code === '42501') {
        errorMessage = 'Permission denied. You do not have permission to delete this testimonial.';
      } else if (error?.code) {
        errorMessage = `Delete failed: ${error.code}. ${error.message || 'Please check the console for details.'}`;
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: TestimonialStatus) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"><FileText className="mr-1 h-3 w-3" />Draft</Badge>;
      case 'pending_captain':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"><Clock className="mr-1 h-3 w-3" />Pending Captain</Badge>;
      case 'pending_official':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"><Clock className="mr-1 h-3 w-3" />Pending Official</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
    }
  };

  const isLoading = isLoadingProfile || isLoadingVessels || isLoadingTestimonials;

    return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Testimonials</h1>
            <p className="text-muted-foreground">
              Request testimonials from vessel captains and view your testimonial requests.
            </p>
                </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl">
                <PlusCircle className="mr-2 h-4 w-4" />
                Request Testimonial
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Request Testimonial</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="vessel_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vessel</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={vessels.map(vessel => ({
                              value: vessel.id,
                              label: vessel.name,
                            }))}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder="Select a vessel..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Quick Date Range Options */}
                  {watchedVesselId && (
                    <div className="space-y-2">
                      <FormLabel>Quick Select Date Range</FormLabel>
                      {dateRangeOptions && dateRangeOptions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {dateRangeOptions.map((option, index) => (
                            <Button
                              key={index}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-2 hover:border-primary transition-all"
                              onClick={() => applyDateRangeOption(option)}
                            >
                              {option.label}
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({format(option.startDate, 'MMM d')} - {format(option.endDate, 'MMM d, yyyy')})
                              </span>
                            </Button>
                          ))}
                        </div>
                      ) : selectedVesselLogs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Loading vessel data...
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No date range options available. Ensure you have logged time on this vessel.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="start_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Start Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full rounded-xl justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => isAfter(date, startOfDay(new Date()))}
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
                      name="end_date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>End Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full rounded-xl justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => isAfter(date, startOfDay(new Date())) || (form.watch('start_date') && date < form.watch('start_date'))}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
            </div>

                  {/* Day Counts Preview */}
                  {dayCountsPreview && (
                    <div className="p-4 bg-muted/50 rounded-xl border">
                      <div className="text-sm font-medium mb-2">Service Summary</div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                        <div>
                          <div className="text-muted-foreground">Total Days</div>
                          <div className="font-semibold">{dayCountsPreview.total_days}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">At Sea</div>
                          <div className="font-semibold">{dayCountsPreview.at_sea_days}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Standby</div>
                          <div className="font-semibold">{dayCountsPreview.standby_days}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Yard</div>
                          <div className="font-semibold">{dayCountsPreview.yard_days}</div>
                </div>
                                        <div>
                          <div className="text-muted-foreground">Leave</div>
                          <div className="font-semibold">{dayCountsPreview.leave_days}</div>
                        </div>
                                        </div>
                                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="captain_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Captain Email (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="captain@vessel.com"
                            className="rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          If provided, the captain will receive an email to sign off on this testimonial.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="captain_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Captain Name (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Captain's full name"
                            className="rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="official_body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Official Body (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., MCA, USCG"
                            className="rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="official_reference"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Official Reference (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Reference number"
                            className="rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Additional notes"
                            className="rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      className="rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-xl"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          {form.watch('captain_email') ? 'Send Request' : 'Save as Draft'}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
        <Separator />
      </div>

      {/* Testimonials Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
      ) : (
        <Card className="rounded-xl border">
          <CardHeader>
            <CardTitle>Testimonial Requests</CardTitle>
                            </CardHeader>
                            <CardContent>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-5 mb-6 rounded-xl">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="draft">Draft</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
              <TabsContent value={activeTab} className="mt-0">
                {filteredTestimonials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 ">
                    <LifeBuoy className="h-12 w-12 text-muted-foreground mb-4 " />
                    <h3 className="text-lg font-semibold mb-2">No Testimonials</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                      {activeTab === 'all' 
                        ? "You haven't created any testimonials yet. Click \"Request Testimonial\" to get started."
                        : `You don't have any ${activeTab} testimonials.`}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Captain</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>PDF</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTestimonials.map((testimonial) => (
                        <TableRow key={testimonial.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {getVesselName(testimonial.vessel_id)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(testimonial.start_date), 'MMM d, yyyy')} - {format(new Date(testimonial.end_date), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{testimonial.total_days} total</div>
                              <div className="text-muted-foreground text-xs">
                                {testimonial.at_sea_days} at sea, {testimonial.standby_days} standby
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {testimonial.captain_email ? (
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  {testimonial.captain_name && (
                                    <div className="font-medium text-sm">{testimonial.captain_name}</div>
                                  )}
                                  <div className="text-sm text-muted-foreground">{testimonial.captain_email}</div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(testimonial.status)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(testimonial.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            {testimonial.pdf_url ? (
                              <a 
                                href={testimonial.pdf_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm"
                              >
                                View PDF
                              </a>
                            ) : testimonial.status === 'approved' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleGeneratePDF(testimonial)}
                                className="rounded-xl"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Generate PDF
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTestimonialToDelete(testimonial)}
                              className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
                            </CardContent>
                        </Card>
            )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!testimonialToDelete} onOpenChange={(open) => !open && setTestimonialToDelete(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Testimonial?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this testimonial? This action cannot be undone.
              {testimonialToDelete && (
                <>
                  <br />
                  <br />
                  <span className="font-medium">
                    {getVesselName(testimonialToDelete.vessel_id)} - {format(new Date(testimonialToDelete.start_date), 'MMM d, yyyy')} to {format(new Date(testimonialToDelete.end_date), 'MMM d, yyyy')}
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => testimonialToDelete && handleDeleteTestimonial(testimonialToDelete)}
              disabled={isDeleting}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
