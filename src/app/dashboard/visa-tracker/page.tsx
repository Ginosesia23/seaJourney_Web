'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, parse, startOfDay, isAfter, isBefore, isPast, isFuture, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getYear, getMonth } from 'date-fns';
import { calculateVisaCompliance, checkDateCompliance, visaRulePresets, detectVisaRules } from '@/lib/visa-compliance';
import { PlusCircle, Loader2, Calendar, Globe, AlertTriangle, CheckCircle2, XCircle, Edit, Trash2, Clock, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, VisaTracker, VisaEntry } from '@/lib/types';
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

const visaSchema = z.object({
  areaName: z.string().min(1, 'Area name is required.'),
  issueDate: z.date({ required_error: 'Issue date is required.' }),
  expireDate: z.date({ required_error: 'Expire date is required.' }),
  ruleType: z.enum(['fixed', 'rolling']).default('fixed'),
  daysAllowed: z.number().min(1, 'Days allowed must be at least 1').optional(),
  periodDays: z.number().min(1, 'Period days must be at least 1').optional(),
  notes: z.string().optional(),
}).refine((data) => {
  return data.expireDate >= data.issueDate;
}, {
  message: "Expire date must be after or equal to issue date",
  path: ["expireDate"],
}).refine((data) => {
  if (data.ruleType === 'rolling') {
    return data.periodDays !== undefined && data.periodDays > 0;
  }
  return true;
}, {
  message: "Period days is required for rolling rules",
  path: ["periodDays"],
});

type VisaFormValues = z.infer<typeof visaSchema>;

// Common visa areas for quick selection
const commonAreas = [
  'Schengen Area',
  'United States',
  'United Kingdom',
  'Australia',
  'New Zealand',
  'Canada',
  'Japan',
  'Singapore',
  'Hong Kong',
  'United Arab Emirates',
  'Bahamas',
  'Caribbean',
  'Mediterranean',
  'Other',
];

export default function VisaTrackerPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingVisa, setEditingVisa] = useState<VisaTracker | null>(null);
  const [visas, setVisas] = useState<VisaTracker[]>([]);
  const [visaEntries, setVisaEntries] = useState<Map<string, VisaEntry[]>>(new Map()); // visaId -> entries
  const [isLoadingVisas, setIsLoadingVisas] = useState(true);
  const [deleteVisaId, setDeleteVisaId] = useState<string | null>(null);
  const [issueDateCalendarOpen, setIssueDateCalendarOpen] = useState(false);
  const [expireDateCalendarOpen, setExpireDateCalendarOpen] = useState(false);
  const [selectedVisaForLogging, setSelectedVisaForLogging] = useState<VisaTracker | null>(null);
  const [isLoggingDate, setIsLoggingDate] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [logDateCalendarOpen, setLogDateCalendarOpen] = useState(false);
  const [expandedVisas, setExpandedVisas] = useState<Set<string>>(new Set());
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0); // 0 = current month, -1 = previous month, etc.

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const router = useRouter();

  // Fetch user profile
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    const subscriptionTier = (userProfileRaw as any).subscription_tier || userProfileRaw.subscriptionTier || 'free';
    const subscriptionStatus = (userProfileRaw as any).subscription_status || userProfileRaw.subscriptionStatus || 'inactive';
    return {
      ...userProfileRaw,
      role: role,
      subscriptionTier: subscriptionTier,
      subscriptionStatus: subscriptionStatus,
    } as UserProfile;
  }, [userProfileRaw]);

  // Check if user has access (premium/pro for crew, any active tier for vessels)
  const hasAccess = useMemo(() => {
    if (!userProfile) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    const status = (userProfile as any).subscription_status || userProfile.subscriptionStatus || 'inactive';
    const role = (userProfile as any).role || userProfile.role || 'crew';
    
    // Vessel accounts: allow all active vessel tiers
    if (role === 'vessel') {
      const tierLower = tier.toLowerCase();
      return (tierLower.startsWith('vessel_') || tierLower === 'vessel_lite' || tierLower === 'vessel_basic' || tierLower === 'vessel_pro' || tierLower === 'vessel_fleet') && status === 'active';
    }
    
    // Crew accounts: premium or pro only
    return (tier === 'premium' || tier === 'pro') && status === 'active';
  }, [userProfile]);

  // Redirect non-premium users to dashboard
  useEffect(() => {
    if (!isLoadingProfile && userProfile && !hasAccess) {
      router.push('/dashboard');
    }
  }, [isLoadingProfile, userProfile, hasAccess, router]);

  const form = useForm<VisaFormValues>({
    resolver: zodResolver(visaSchema),
    defaultValues: {
      areaName: '',
      issueDate: undefined,
      expireDate: undefined,
      ruleType: 'fixed',
      daysAllowed: undefined,
      periodDays: undefined,
      notes: '',
    },
  });

  const selectedAreaName = form.watch('areaName');
  const selectedRuleType = form.watch('ruleType');

  // Auto-detect visa rules when area name changes
  useEffect(() => {
    if (selectedAreaName && !editingVisa) {
      const detectedRules = detectVisaRules(selectedAreaName);
      if (detectedRules) {
        form.setValue('ruleType', detectedRules.ruleType);
        if (detectedRules.daysAllowed) {
          form.setValue('daysAllowed', detectedRules.daysAllowed);
        }
        if (detectedRules.periodDays) {
          form.setValue('periodDays', detectedRules.periodDays);
        }
      }
    }
  }, [selectedAreaName, editingVisa, form]);

  // Fetch visas
  useEffect(() => {
    if (!user?.id) {
      setIsLoadingVisas(false);
      return;
    }

    const fetchVisas = async () => {
      setIsLoadingVisas(true);
      try {
        const { data, error } = await supabase
          .from('visa_tracker')
          .select('*')
          .eq('user_id', user.id)
          .order('expire_date', { ascending: true });

        if (error) {
          console.error('[VISA TRACKER] Error fetching visas:', error);
          toast({
            title: 'Error',
            description: 'Failed to load visa entries.',
            variant: 'destructive',
          });
          setVisas([]);
        } else {
          // Transform data from snake_case to camelCase
          const transformedVisas: VisaTracker[] = (data || []).map((visa: any) => ({
            id: visa.id,
            userId: visa.user_id,
            areaName: visa.area_name,
            issueDate: visa.issue_date,
            expireDate: visa.expire_date,
            totalDays: visa.total_days,
            ruleType: visa.rule_type || 'fixed',
            // For rolling rules, don't fall back to totalDays - use null if not set
            // For fixed rules, use totalDays as fallback
            daysAllowed: visa.days_allowed || (visa.rule_type === 'rolling' ? null : visa.total_days),
            periodDays: visa.period_days || undefined,
            notes: visa.notes || null,
            createdAt: visa.created_at,
            updatedAt: visa.updated_at,
          }));
          setVisas(transformedVisas);
        }
      } catch (error) {
        console.error('[VISA TRACKER] Exception fetching visas:', error);
        setVisas([]);
      } finally {
        setIsLoadingVisas(false);
      }
    };

    fetchVisas();
  }, [user?.id, supabase, toast]);

  // Fetch visa entries (logged dates) for all visas
  useEffect(() => {
    if (!user?.id || visas.length === 0) {
      setVisaEntries(new Map());
      return;
    }

    const fetchVisaEntries = async () => {
      try {
        const visaIds = visas.map(v => v.id);
        const { data, error } = await supabase
          .from('visa_entries')
          .select('*')
          .in('visa_id', visaIds)
          .order('entry_date', { ascending: false });

        if (error) {
          console.error('[VISA TRACKER] Error fetching visa entries:', error);
          return;
        }

        // Group entries by visa_id
        const entriesMap = new Map<string, VisaEntry[]>();
        (data || []).forEach((entry: any) => {
          const transformedEntry: VisaEntry = {
            id: entry.id,
            visaId: entry.visa_id,
            userId: entry.user_id,
            entryDate: entry.entry_date,
            createdAt: entry.created_at,
            updatedAt: entry.updated_at,
          };

          const existing = entriesMap.get(entry.visa_id) || [];
          entriesMap.set(entry.visa_id, [...existing, transformedEntry]);
        });

        setVisaEntries(entriesMap);
      } catch (error) {
        console.error('[VISA TRACKER] Exception fetching visa entries:', error);
      }
    };

    fetchVisaEntries();
  }, [user?.id, visas, supabase]);

  const handleOpenForm = (visa?: VisaTracker) => {
    if (visa) {
      setEditingVisa(visa);
      form.reset({
        areaName: visa.areaName,
        issueDate: parse(visa.issueDate, 'yyyy-MM-dd', new Date()),
        expireDate: parse(visa.expireDate, 'yyyy-MM-dd', new Date()),
        ruleType: visa.ruleType || 'fixed',
        daysAllowed: visa.daysAllowed || visa.totalDays,
        periodDays: visa.periodDays || undefined,
        notes: visa.notes || '',
      });
    } else {
      setEditingVisa(null);
      form.reset({
        areaName: '',
        issueDate: undefined,
        expireDate: undefined,
        ruleType: 'fixed',
        daysAllowed: undefined,
        periodDays: undefined,
        notes: '',
      });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingVisa(null);
    form.reset();
  };

  const onSubmit = async (data: VisaFormValues) => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      const issueDateStr = format(data.issueDate, 'yyyy-MM-dd');
      const expireDateStr = format(data.expireDate, 'yyyy-MM-dd');
      const totalDays = differenceInDays(data.expireDate, data.issueDate) + 1; // +1 to include both issue and expire dates
      const ruleType = data.ruleType || 'fixed';
      const daysAllowed = data.daysAllowed || null;
      const periodDays = data.periodDays || null;

      if (editingVisa) {
        // Update existing visa
        const { error } = await supabase
          .from('visa_tracker')
          .update({
            area_name: data.areaName,
            issue_date: issueDateStr,
            expire_date: expireDateStr,
            total_days: totalDays,
            rule_type: ruleType,
            days_allowed: daysAllowed,
            period_days: periodDays,
            notes: data.notes || null,
          })
          .eq('id', editingVisa.id);

        if (error) throw error;

        toast({
          title: 'Visa Updated',
          description: `Visa entry for ${data.areaName} has been updated successfully.`,
        });
      } else {
        // Create new visa
        const { error } = await supabase
          .from('visa_tracker')
          .insert({
            user_id: user.id,
            area_name: data.areaName,
            issue_date: issueDateStr,
            expire_date: expireDateStr,
            total_days: totalDays,
            rule_type: ruleType,
            days_allowed: daysAllowed,
            period_days: periodDays,
            notes: data.notes || null,
          });

        if (error) throw error;

        toast({
          title: 'Visa Added',
          description: `Visa entry for ${data.areaName} has been added successfully.`,
        });
      }

      handleCloseForm();
      
      // Refresh visas
      const { data: updatedData, error: fetchError } = await supabase
        .from('visa_tracker')
        .select('*')
        .eq('user_id', user.id)
        .order('expire_date', { ascending: true });

      if (!fetchError && updatedData) {
        const transformedVisas: VisaTracker[] = updatedData.map((visa: any) => ({
          id: visa.id,
          userId: visa.user_id,
          areaName: visa.area_name,
          issueDate: visa.issue_date,
          expireDate: visa.expire_date,
          totalDays: visa.total_days,
          ruleType: visa.rule_type || 'fixed',
          daysAllowed: visa.days_allowed || null,
          periodDays: visa.period_days || null,
          notes: visa.notes || null,
          createdAt: visa.created_at,
          updatedAt: visa.updated_at,
        }));
        setVisas(transformedVisas);
      }
    } catch (error: any) {
      console.error('[VISA TRACKER] Error saving visa:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save visa entry. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (visaId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('visa_tracker')
        .delete()
        .eq('id', visaId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Visa Deleted',
        description: 'Visa entry has been deleted successfully.',
      });

      setDeleteVisaId(null);
      
      // Refresh visas
      const { data: updatedData, error: fetchError } = await supabase
        .from('visa_tracker')
        .select('*')
        .eq('user_id', user.id)
        .order('expire_date', { ascending: true });

      if (!fetchError && updatedData) {
        const transformedVisas: VisaTracker[] = updatedData.map((visa: any) => ({
          id: visa.id,
          userId: visa.user_id,
          areaName: visa.area_name,
          issueDate: visa.issue_date,
          expireDate: visa.expire_date,
          totalDays: visa.total_days,
          ruleType: visa.rule_type || 'fixed',
          daysAllowed: visa.days_allowed || null,
          periodDays: visa.period_days || null,
          notes: visa.notes || null,
          createdAt: visa.created_at,
          updatedAt: visa.updated_at,
        }));
        setVisas(transformedVisas);
      }
    } catch (error: any) {
      console.error('[VISA TRACKER] Error deleting visa:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete visa entry. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle deleting a logged date
  const handleDeleteLoggedDate = async (visaId: string, entryId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('visa_entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Date Removed',
        description: 'Logged date has been removed successfully.',
      });

      // Refresh visa entries
      const { data: updatedEntries, error: fetchError } = await supabase
        .from('visa_entries')
        .select('*')
        .eq('visa_id', visaId)
        .order('entry_date', { ascending: false });

      if (!fetchError && updatedEntries) {
        const transformedEntries: VisaEntry[] = updatedEntries.map((entry: any) => ({
          id: entry.id,
          visaId: entry.visa_id,
          userId: entry.user_id,
          entryDate: entry.entry_date,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at,
        }));

        const newEntriesMap = new Map(visaEntries);
        newEntriesMap.set(visaId, transformedEntries);
        setVisaEntries(newEntriesMap);
      }
    } catch (error: any) {
      console.error('[VISA TRACKER] Error deleting logged date:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete logged date. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle logging dates when user was in the area
  const handleLogDates = async (visa: VisaTracker, dates: Date[]) => {
    if (!user?.id || dates.length === 0) return;

    setIsLoggingDate(true);
    try {
      const existingEntries = visaEntries.get(visa.id) || [];
      const existingDates = new Set(existingEntries.map(e => e.entryDate));
      
      const visaIssue = parse(visa.issueDate, 'yyyy-MM-dd', new Date());
      const visaExpire = parse(visa.expireDate, 'yyyy-MM-dd', new Date());

      // Filter out invalid dates and duplicates
      const validDates = dates.filter(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return !existingDates.has(dateStr) && 
               !isBefore(date, visaIssue) && 
               !isAfter(date, visaExpire);
      });

      if (validDates.length === 0) {
        toast({
          title: 'No Valid Dates',
          description: 'All selected dates are either already logged or outside the visa period.',
          variant: 'destructive',
        });
        setIsLoggingDate(false);
        return;
      }

      // Insert all valid dates
      const entriesToInsert = validDates.map(date => ({
        visa_id: visa.id,
        user_id: user.id,
        entry_date: format(date, 'yyyy-MM-dd'),
      }));

      const { error } = await supabase
        .from('visa_entries')
        .insert(entriesToInsert);

      if (error) throw error;

      toast({
        title: 'Dates Logged',
        description: `Successfully logged ${validDates.length} date${validDates.length > 1 ? 's' : ''} for ${visa.areaName}.`,
      });

      setSelectedDates([]);
      setSelectedVisaForLogging(null);
      setLogDateCalendarOpen(false);

      // Refresh visa entries
      const { data: updatedEntries, error: fetchError } = await supabase
        .from('visa_entries')
        .select('*')
        .eq('visa_id', visa.id)
        .order('entry_date', { ascending: false });

      if (!fetchError && updatedEntries) {
        const transformedEntries: VisaEntry[] = updatedEntries.map((entry: any) => ({
          id: entry.id,
          visaId: entry.visa_id,
          userId: entry.user_id,
          entryDate: entry.entry_date,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at,
        }));

        const newEntriesMap = new Map(visaEntries);
        newEntriesMap.set(visa.id, transformedEntries);
        setVisaEntries(newEntriesMap);
      }
    } catch (error: any) {
      console.error('[VISA TRACKER] Error logging dates:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to log dates. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoggingDate(false);
    }
  };

  // Calculate days remaining and compliance for each visa
  const visasWithStatus = useMemo(() => {
    const today = startOfDay(new Date());
    
    return visas.map(visa => {
      const expireDate = parse(visa.expireDate, 'yyyy-MM-dd', new Date());
      const entries = visaEntries.get(visa.id) || [];
      
      // Auto-detect rules if not set
      let visaWithRules = { ...visa };
      if (!visa.ruleType || !visa.daysAllowed) {
        const detectedRules = detectVisaRules(visa.areaName);
        if (detectedRules) {
          visaWithRules = {
            ...visa,
            ruleType: visa.ruleType || detectedRules.ruleType,
            daysAllowed: visa.daysAllowed || detectedRules.daysAllowed,
            periodDays: visa.periodDays || detectedRules.periodDays,
          };
        }
      }
      
      const compliance = calculateVisaCompliance(visaWithRules, entries);
      const isExpired = isPast(expireDate);
      const isExpiringSoon = !isExpired && compliance.daysRemaining <= 30 && compliance.daysRemaining >= 0;
      const isActive = !isExpired && compliance.daysRemaining > 30;
      
      return {
        ...visaWithRules,
        daysUsed: compliance.daysUsed,
        daysRemaining: compliance.daysRemaining,
        isExpired,
        isExpiringSoon,
        isActive,
        entries,
        compliance,
      };
    });
  }, [visas, visaEntries]);

  const activeVisas = visasWithStatus.filter(v => v.isActive);
  const expiringSoonVisas = visasWithStatus.filter(v => v.isExpiringSoon);
  const expiredVisas = visasWithStatus.filter(v => v.isExpired);

  if (isLoadingProfile || isLoadingVisas) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </div>
        <Card className="rounded-xl">
          <CardContent className="p-6">
            <div className="h-64 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading while checking premium access or redirecting
  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show loading while redirecting non-premium users
  if (userProfile && !hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Visa Tracker</h1>
            <p className="text-muted-foreground">
              Track your visa days and expiration dates for different areas
            </p>
          </div>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenForm()} className="rounded-xl">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Visa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] rounded-xl">
              <DialogHeader>
                <DialogTitle>{editingVisa ? 'Edit Visa Entry' : 'Add Visa Entry'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="areaName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Area/Region</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Input
                              placeholder="e.g., Schengen Area, USA, Australia"
                              {...field}
                              className="rounded-xl"
                              list="common-areas"
                            />
                            <datalist id="common-areas">
                              {commonAreas.map(area => (
                                <option key={area} value={area} />
                              ))}
                            </datalist>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Enter the area or region for this visa
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="issueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Issue Date</FormLabel>
                          <Popover open={issueDateCalendarOpen} onOpenChange={setIssueDateCalendarOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal rounded-xl",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <Calendar className="mr-2 h-4 w-4" />
                                  {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  field.onChange(date);
                                  setIssueDateCalendarOpen(false);
                                }}
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
                      name="expireDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expire Date</FormLabel>
                          <Popover open={expireDateCalendarOpen} onOpenChange={setExpireDateCalendarOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal rounded-xl",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <Calendar className="mr-2 h-4 w-4" />
                                  {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  field.onChange(date);
                                  setExpireDateCalendarOpen(false);
                                }}
                                disabled={(date) => {
                                  const issueDate = form.watch('issueDate');
                                  return issueDate ? isBefore(date, issueDate) : false;
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

                  {form.watch('issueDate') && form.watch('expireDate') && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Total days:</span>
                        <span className="font-semibold">
                          {differenceInDays(form.watch('expireDate'), form.watch('issueDate')) + 1} days
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Auto-detected rules info */}
                  {selectedAreaName && detectVisaRules(selectedAreaName) && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-semibold text-blue-900 dark:text-blue-100">Visa rules auto-detected:</span>
                          <div className="mt-1 text-blue-700 dark:text-blue-300">
                            {detectVisaRules(selectedAreaName)?.ruleType === 'rolling' ? (
                              <span>{detectVisaRules(selectedAreaName)?.daysAllowed} days allowed in any {detectVisaRules(selectedAreaName)?.periodDays}-day period</span>
                            ) : (
                              <span>{detectVisaRules(selectedAreaName)?.daysAllowed} days allowed</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hidden fields for rule configuration (auto-populated) */}
                  <FormField
                    control={form.control}
                    name="ruleType"
                    render={({ field }) => (
                      <input type="hidden" {...field} />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="daysAllowed"
                    render={({ field }) => (
                      <input type="hidden" {...field} value={field.value || ''} />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="periodDays"
                    render={({ field }) => (
                      <input type="hidden" {...field} value={field.value || ''} />
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional notes about this visa..."
                            {...field}
                            className="rounded-xl"
                            rows={3}
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
                      onClick={handleCloseForm}
                      disabled={isSaving}
                      className="rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving} className="rounded-xl">
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        editingVisa ? 'Update Visa' : 'Add Visa'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      {(activeVisas.length > 0 || expiringSoonVisas.length > 0 || expiredVisas.length > 0) && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-xl border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Visas</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeVisas.length}</div>
              <p className="text-xs text-muted-foreground mt-1">More than 30 days remaining</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiringSoonVisas.length}</div>
              <p className="text-xs text-muted-foreground mt-1">30 days or less remaining</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{expiredVisas.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Past expiration date</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Visas Table */}
      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <CardTitle>Your Visas</CardTitle>
          <CardDescription>
            Track and manage your visa entries by area
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingVisas ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : visasWithStatus.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Globe className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Visa Entries</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Start tracking your visa days by adding your first visa entry.
              </p>
              <Button onClick={() => handleOpenForm()} className="rounded-xl">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Your First Visa
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area/Region</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Expire Date</TableHead>
                    <TableHead>Total Days</TableHead>
                    <TableHead>Days Used</TableHead>
                    <TableHead>Days Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visasWithStatus.map((visa) => {
                    const loggedDates = visa.entries || [];
                    const isExpanded = expandedVisas.has(visa.id);
                    
                    return (
                      <React.Fragment key={visa.id}>
                        <TableRow>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                {visa.areaName}
                              </div>
                            </TableCell>
                            <TableCell>
                              {format(parse(visa.issueDate, 'yyyy-MM-dd', new Date()), 'dd MMM, yyyy')}
                      </TableCell>
                      <TableCell>
                              {format(parse(visa.expireDate, 'yyyy-MM-dd', new Date()), 'dd MMM, yyyy')}
                            </TableCell>
                            <TableCell>
                              {visa.ruleType === 'rolling' && visa.daysAllowed ? (
                                <Badge variant="outline">
                                  {visa.daysAllowed} days / {visa.periodDays} days
                                </Badge>
                              ) : (
                                <Badge variant="outline">{visa.totalDays} days</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-muted-foreground">
                                {visa.daysUsed} {visa.daysUsed === 1 ? 'day' : 'days'}
                                {visa.ruleType === 'rolling' && visa.periodDays && (
                                  <span className="text-xs block text-muted-foreground mt-0.5">
                                    in last {visa.periodDays} days
                                  </span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell>
                              {visa.isExpired ? (
                                <span className="text-red-600 dark:text-red-400 font-medium">
                                  Expired
                                </span>
                              ) : (
                                <span className={cn(
                                  "font-medium",
                                  visa.isExpiringSoon ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                                )}>
                                  {visa.daysRemaining} {visa.daysRemaining === 1 ? 'day' : 'days'}
                                  {visa.ruleType === 'rolling' && visa.daysAllowed && (
                                    <span className="text-xs block opacity-75 mt-0.5">
                                      of {visa.daysAllowed} allowed
                                    </span>
                                  )}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {visa.isExpired ? (
                                <Badge variant="destructive">Expired</Badge>
                              ) : visa.isExpiringSoon ? (
                                <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400">
                                  Expiring Soon
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400">
                                  Active
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedVisaForLogging(visa);
                                    setSelectedDates([]);
                                    setCalendarMonthOffset(0); // Reset to current month
                                    setLogDateCalendarOpen(true);
                                  }}
                                  className="h-8 rounded-lg"
                                  disabled={visa.isExpired}
                                >
                                  <LogIn className="h-3 w-3 mr-1" />
                                  Log Dates
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenForm(visa)}
                                  className="h-8 w-8 rounded-lg"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteVisaId(visa.id)}
                                  className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                {loggedDates.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg"
                                    onClick={() => {
                                      const newExpanded = new Set(expandedVisas);
                                      if (isExpanded) {
                                        newExpanded.delete(visa.id);
                                      } else {
                                        newExpanded.add(visa.id);
                                      }
                                      setExpandedVisas(newExpanded);
                                    }}
                                  >
                                    <Calendar className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {loggedDates.length > 0 && isExpanded && (() => {
                            // Group dates by month and year for better organization
                            const groupedDates = loggedDates.reduce((acc, entry) => {
                              const date = parse(entry.entryDate, 'yyyy-MM-dd', new Date());
                              const monthYear = format(date, 'MMMM yyyy');
                              if (!acc[monthYear]) {
                                acc[monthYear] = [];
                              }
                              acc[monthYear].push({ ...entry, date });
                              return acc;
                            }, {} as Record<string, Array<{ id: string; entryDate: string; date: Date }>>);

                            // Sort months chronologically (newest first)
                            const sortedMonths = Object.keys(groupedDates).sort((a, b) => {
                              const dateA = parse(a, 'MMMM yyyy', new Date());
                              const dateB = parse(b, 'MMMM yyyy', new Date());
                              return dateB.getTime() - dateA.getTime();
                            });

                            return (
                              <TableRow>
                                <TableCell colSpan={8} className="bg-muted/20 p-0">
                                  <div className="p-6 space-y-6">
                                    <div className="flex items-center justify-between border-b pb-4">
                                      <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                          <Calendar className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-base">Logged Dates</h4>
                                          <p className="text-sm text-muted-foreground">
                                            {loggedDates.length} {loggedDates.length === 1 ? 'date logged' : 'dates logged'}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-6">
                                      {sortedMonths.map((monthYear) => {
                                        const monthDates = groupedDates[monthYear].sort((a, b) => 
                                          b.date.getTime() - a.date.getTime()
                                        );
                                        
                                        return (
                                          <div key={monthYear} className="space-y-3">
                                            <div className="flex items-center gap-3 pb-2 border-b-2 border-border">
                                              <h5 className="text-sm font-bold text-foreground">
                                                {monthYear}
                                              </h5>
                                              <Badge variant="secondary" className="text-xs font-medium">
                                                {monthDates.length} {monthDates.length === 1 ? 'date' : 'dates'}
                                              </Badge>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                              {monthDates.map((entry) => {
                                                const dayOfWeek = format(entry.date, 'EEE');
                                                const dayNumber = format(entry.date, 'd');
                                                const isToday = format(entry.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                                                
                                                return (
                                                  <div
                                                    key={entry.id}
                                                    className="group relative flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-all hover:shadow-sm"
                                                  >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                      <div className={cn(
                                                        "flex flex-col items-center justify-center min-w-[3rem] h-12 rounded-md",
                                                        isToday ? "bg-primary text-primary-foreground" : "bg-muted"
                                                      )}>
                                                        <span className="text-xs font-medium uppercase leading-tight">
                                                          {dayOfWeek}
                                                        </span>
                                                        <span className={cn(
                                                          "text-lg font-bold leading-tight",
                                                          isToday && "text-primary-foreground"
                                                        )}>
                                                          {dayNumber}
                                                        </span>
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium">
                                                          {format(entry.date, 'MMMM d, yyyy')}
                                                        </div>
                                                        {isToday && (
                                                          <div className="text-xs text-primary font-medium mt-0.5">
                                                            Today
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                                                      onClick={() => handleDeleteLoggedDate(visa.id, entry.id)}
                                                      title="Remove this date"
                                                    >
                                                      <XCircle className="h-4 w-4" />
                                                    </Button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })()}
                        </React.Fragment>
                      );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Date Dialog with Multi-Month Calendar */}
      <Dialog open={logDateCalendarOpen} onOpenChange={(open) => {
        setLogDateCalendarOpen(open);
        if (!open) {
          setCalendarMonthOffset(0); // Reset to current month when dialog closes
          setSelectedDates([]);
          setSelectedVisaForLogging(null);
        }
      }}>
        <DialogContent className="sm:max-w-[900px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Log Dates in {selectedVisaForLogging?.areaName}</DialogTitle>
            <DialogDescription>
              Select dates when you were in this area. Click dates to select/deselect. Valid period:{' '}
              {selectedVisaForLogging && format(parse(selectedVisaForLogging.issueDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')} -{' '}
              {selectedVisaForLogging && format(parse(selectedVisaForLogging.expireDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}.
            </DialogDescription>
          </DialogHeader>
          {selectedVisaForLogging && (() => {
            const visaIssue = parse(selectedVisaForLogging.issueDate, 'yyyy-MM-dd', new Date());
            const visaExpire = parse(selectedVisaForLogging.expireDate, 'yyyy-MM-dd', new Date());
            const entries = visaEntries.get(selectedVisaForLogging.id) || [];
            const loggedDates = new Set(entries.map(e => e.entryDate));
            
            // Get 3 months based on calendarMonthOffset
            // calendarMonthOffset: 0 = current month, positive = months ago, negative = months in future
            const today = new Date();
            const baseMonth = startOfMonth(subMonths(today, -calendarMonthOffset));
            const month1 = startOfMonth(subMonths(baseMonth, 2));
            const month2 = startOfMonth(subMonths(baseMonth, 1));
            const month3 = baseMonth;
            const months = [month1, month2, month3];

            const toggleDate = async (date: Date) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              
              // Don't allow selecting dates outside visa period
              if (isBefore(date, visaIssue) || isAfter(date, visaExpire)) {
                return;
              }

              // If date is already logged, allow removing it
              if (loggedDates.has(dateStr)) {
                // Find the entry to delete
                const entryToDelete = entries.find(e => e.entryDate === dateStr);
                if (entryToDelete) {
                  await handleDeleteLoggedDate(selectedVisaForLogging.id, entryToDelete.id);
                }
                return;
              }

              // Otherwise, toggle selection for new dates
              setSelectedDates(prev => {
                const existing = prev.find(d => format(d, 'yyyy-MM-dd') === dateStr);
                if (existing) {
                  return prev.filter(d => format(d, 'yyyy-MM-dd') !== dateStr);
                } else {
                  return [...prev, date];
                }
              });
            };

            const isDateSelected = (date: Date) => {
              return selectedDates.some(d => isSameDay(d, date));
            };

            const isDateLogged = (date: Date) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              return loggedDates.has(dateStr);
            };

            const isDateDisabled = (date: Date) => {
              return isBefore(date, visaIssue) || isAfter(date, visaExpire);
            };

            return (
              <div className="space-y-6">
                {/* Month Navigation */}
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMonthOffset(prev => prev - 1)}
                    className="rounded-lg"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous Months
                  </Button>
                  <div className="text-sm font-medium text-muted-foreground">
                    {format(month1, 'MMM yyyy')} - {format(month3, 'MMM yyyy')}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMonthOffset(prev => {
                      // Don't go beyond current month
                      const maxOffset = 0;
                      return Math.min(maxOffset, prev + 1);
                    })}
                    disabled={calendarMonthOffset >= 0}
                    className="rounded-lg"
                  >
                    Next Months
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>

                {/* 3-Month Calendar Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {months.map((monthStart, idx) => {
                    const monthEnd = endOfMonth(monthStart);
                    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
                    const monthName = format(monthStart, 'MMMM yyyy');
                    
                    return (
                      <div key={idx} className="space-y-2">
                        <h3 className="font-semibold text-sm">{monthName}</h3>
                        <div className="grid grid-cols-7 gap-1">
                          {/* Day headers */}
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-xs font-medium text-center text-muted-foreground p-1">
                              {day}
                            </div>
                          ))}
                          {/* Empty cells for days before month start */}
                          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                            <div key={`empty-${i}`} className="h-8" />
                          ))}
                          {/* Days */}
                          {days.map(day => {
                            const disabled = isDateDisabled(day);
                            const logged = isDateLogged(day);
                            const selected = isDateSelected(day);
                            
                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => !disabled && toggleDate(day)}
                                disabled={disabled}
                                className={cn(
                                  "h-8 w-8 rounded-md text-sm transition-colors",
                                  disabled && "opacity-30 cursor-not-allowed",
                                  logged && "bg-blue-500 text-white hover:bg-blue-600 cursor-pointer",
                                  selected && !logged && "bg-primary text-primary-foreground hover:bg-primary/90",
                                  !selected && !logged && !disabled && "hover:bg-accent hover:text-accent-foreground",
                                  !selected && !logged && !disabled && "border border-border"
                                )}
                                title={logged ? "Click to remove this logged date" : undefined}
                              >
                                {format(day, 'd')}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend and Info */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded bg-primary" />
                      <span>Selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded bg-blue-500" />
                      <span>Already Logged (click to remove)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded border border-border" />
                      <span>Available</span>
                    </div>
                  </div>
                  <div className="text-muted-foreground">
                    {selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setLogDateCalendarOpen(false);
                      setSelectedDates([]);
                      setSelectedVisaForLogging(null);
                      setCalendarMonthOffset(0); // Reset to current month
                    }}
                    disabled={isLoggingDate}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (selectedDates.length > 0 && selectedVisaForLogging) {
                        handleLogDates(selectedVisaForLogging, selectedDates);
                      }
                    }}
                    disabled={selectedDates.length === 0 || isLoggingDate}
                    className="rounded-xl"
                  >
                    {isLoggingDate ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging...
                      </>
                    ) : (
                      `Log ${selectedDates.length} Date${selectedDates.length !== 1 ? 's' : ''}`
                    )}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Notes Display */}
      {visasWithStatus.some(v => v.notes) && (
        <Card className="rounded-xl border shadow-sm">
          <CardHeader>
            <CardTitle>Visa Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {visasWithStatus
                .filter(v => v.notes)
                .map(visa => (
                  <div key={visa.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{visa.areaName}</span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{visa.notes}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteVisaId} onOpenChange={(open) => !open && setDeleteVisaId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Visa Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this visa entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVisaId && handleDelete(deleteVisaId)}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

