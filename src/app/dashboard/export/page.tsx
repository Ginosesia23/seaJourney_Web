'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, Calendar as CalendarIcon, Ship, Loader2, FileText, FileSpreadsheet, FileJson, FileDown, Sparkles, Settings2, Database, Clock, TrendingUp } from 'lucide-react';
import { format, differenceInDays, startOfYear, endOfYear, getYear, parse, startOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useRouter } from 'next/navigation';
import { generateSeaTimeTestimonial } from '@/lib/pdf-generator';
import { generateSeaTimeReportData as fetchSeaTimeReportData, generateMasterDocReportData } from '@/app/actions';
import { exportToCSV, exportToExcelXML, exportToJSON, exportMasterDocExcel } from '@/lib/export-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselAssignments } from '@/supabase/database/queries';
import { useCrewVesselFeatureBoost } from '@/contexts/crew-vessel-feature-boost-context';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import type { Vessel, UserProfile, VesselAssignment } from '@/lib/types';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Lock } from 'lucide-react';

const exportSchema = z.object({
  exportFormat: z.enum(['csv', 'excel', 'json', 'pdf', 'master']),
  filterType: z.enum(['vessel', 'date_range']),
  vesselId: z.string().optional(),
  dateRange: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
  }).optional(),
}).refine(data => {
    if (data.exportFormat === 'master') {
      // Vessel is required for Master Doc (vessel managers may use active vessel in submit)
      return true;
    }
    if (data.filterType === 'vessel') {
        return !!data.vesselId;
    }
    if (data.filterType === 'date_range') {
        return !!data.dateRange?.from && !!data.dateRange?.to;
    }
    return false;
}, {
    message: "Please provide a value for the selected filter type.",
    path: ['filterType'],
});

type ExportFormValues = z.infer<typeof exportSchema>;

const formatOptions = [
  {
    value: 'csv' as const,
    label: 'CSV',
    description: 'Comma-separated values, compatible with Excel and Google Sheets',
    icon: FileText,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  },
  {
    value: 'excel' as const,
    label: 'Excel',
    description: 'Native Excel format (.xlsx) with formatting and multiple sheets',
    icon: FileSpreadsheet,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
  },
  {
    value: 'json' as const,
    label: 'JSON',
    description: 'Raw data structure for developers and data processing',
    icon: FileJson,
    color: 'text-[#7629BB] dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
  },
  {
    value: 'pdf' as const,
    label: 'PDF',
    description: 'Professional document format, ready for printing or sharing',
    icon: FileDown,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  },
  {
    value: 'master' as const,
    label: 'Master Doc',
    description: 'Full SeaJourney Excel: vessel details, every daily state, and all passages from vessel start to today',
    icon: Database,
    color: 'text-sky-700 dark:text-sky-300',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800',
  },
];

export default function ExportPage() {
    const { user } = useUser();
    const { supabase } = useSupabase();
    const router = useRouter();
    const [isGenerating, setIsGenerating] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState<string>('');
    const [selectedFormat, setSelectedFormat] = useState<'csv' | 'excel' | 'json' | 'pdf' | 'master'>('csv');
    const [previewStats, setPreviewStats] = useState<{
        recordCount: number;
        dateRange: { earliest: string | null; latest: string | null };
        vesselCount: number;
        isLoading: boolean;
    }>({
        recordCount: 0,
        dateRange: { earliest: null, latest: null },
        vesselCount: 0,
        isLoading: false,
    });

    // Fetch user profile to check subscription
    const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
    const { boost: vesselBoost } = useCrewVesselFeatureBoost();
    const { isEnabled: isFeatureEnabled, isLoading: isFlagsLoading } = useFeatureFlags();
    
    const userProfile = useMemo(() => {
        if (!userProfileRaw) return null;
        const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
        const subscriptionTier = (userProfileRaw as any).subscription_tier || userProfileRaw.subscriptionTier || 'free';
        const subscriptionStatus = (userProfileRaw as any).subscription_status || userProfileRaw.subscriptionStatus || 'inactive';
        const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
        const startDate = (userProfileRaw as any).start_date ?? userProfileRaw.startDate ?? null;
        return {
            ...userProfileRaw,
            role: role,
            subscriptionTier: subscriptionTier,
            subscriptionStatus: subscriptionStatus,
            activeVesselId: activeVesselId || undefined,
            startDate: startDate ?? undefined,
        } as UserProfile;
    }, [userProfileRaw]);

    const hasAccess = isFeatureEnabled('export_reports');

    // Redirect when feature flag tier access denies this account
    useEffect(() => {
        if (!isLoadingProfile && !isFlagsLoading && userProfile && !hasAccess) {
            router.push('/dashboard');
        }
    }, [isLoadingProfile, isFlagsLoading, userProfile, hasAccess, router]);

    // Determine if user is a vessel manager
    const isVesselManager = useMemo(() => {
        return userProfile?.role?.toLowerCase() === 'vessel';
    }, [userProfile]);

    const form = useForm<ExportFormValues>({
        resolver: zodResolver(exportSchema),
        defaultValues: {
            exportFormat: 'csv',
            filterType: isVesselManager ? 'date_range' : 'vessel',
            vesselId: undefined,
            dateRange: { from: undefined, to: undefined }
        },
        mode: 'onChange' // Enable validation on change
    });
    
    // Ensure filterType is always set to 'date_range' for vessel managers
    useEffect(() => {
        if (isVesselManager) {
            form.setValue('filterType', 'date_range', { shouldValidate: false });
        }
    }, [isVesselManager, form]);
    
    // Debug: Log form state changes
    useEffect(() => {
        const subscription = form.watch((value, { name, type }) => {
            console.log('[EXPORT PAGE] Form field changed:', { name, type, value: value[name as keyof typeof value] });
        });
        return () => subscription.unsubscribe();
    }, [form]);
    
    // Debug: Log form errors
    useEffect(() => {
        const errors = form.formState.errors;
        if (Object.keys(errors).length > 0) {
            console.log('[EXPORT PAGE] Form validation errors:', errors);
        }
    }, [form.formState.errors]);

    const filterType = form.watch('filterType');
    const watchedVesselId = form.watch('vesselId');
    const watchedDateRange = form.watch('dateRange');

    // Query all vessels (vessels are shared, not owned by users)
    const { data: allVessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
        'vessels',
        { orderBy: 'created_at', ascending: false }
    );

    // Fetch vessel assignments to filter vessels
    const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
    const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

    useEffect(() => {
        if (!user?.id || !supabase) return;
        
        const fetchAssignments = async () => {
            setIsLoadingAssignments(true);
            try {
                const assignments = await getVesselAssignments(supabase, user.id);
                setVesselAssignments(assignments);
            } catch (error) {
                console.error('Error fetching vessel assignments:', error);
                setVesselAssignments([]);
            } finally {
                setIsLoadingAssignments(false);
            }
        };

        fetchAssignments();
    }, [user?.id, supabase]);

    // Filter vessels to only show vessels the user is assigned to
    const vessels = useMemo(() => {
        if (!allVessels || !vesselAssignments.length) return [];
        
        const assignedVesselIds = new Set(vesselAssignments.map(a => a.vesselId));
        return allVessels.filter(v => assignedVesselIds.has(v.id));
    }, [allVessels, vesselAssignments]);

    // Get the current vessel for vessel managers
    const currentVessel = useMemo(() => {
        if (!isVesselManager || !userProfile?.activeVesselId || !allVessels) return null;
        return allVessels.find(v => v.id === userProfile.activeVesselId) || null;
    }, [isVesselManager, userProfile?.activeVesselId, allVessels]);

    const vesselManagerNeedsVessel = isVesselManager && !currentVessel;

    // Clear any stale date range when there is no linked vessel
    useEffect(() => {
        if (!vesselManagerNeedsVessel) return;
        form.setValue('dateRange', { from: undefined, to: undefined }, { shouldValidate: false });
    }, [vesselManagerNeedsVessel, form]);

    // Calculate available years for quick selection
    // For vessel managers: from vessel start date to current year (only when a vessel is linked)
    // For crew: from earliest assignment to current year
    const availableYears = useMemo(() => {
        if (isVesselManager && !currentVessel) {
            return [];
        }

        const currentYear = getYear(new Date());
        const years: number[] = [];
        
        let startYear = currentYear;
        
        if (isVesselManager && currentVessel) {
            // Get vessel start date (never depend on state logs — use profile or vessel record only)
            let vesselStartDate: Date | null = null;
            const startDateStr = userProfile?.startDate || (currentVessel as any).start_date;
            if (startDateStr) {
                try {
                    vesselStartDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
                } catch (e) {
                    console.error('Error parsing vessel start date:', e);
                }
            }
            if (!vesselStartDate && (currentVessel as any).created_at) {
                vesselStartDate = new Date((currentVessel as any).created_at);
            }
            if (vesselStartDate) {
                startYear = getYear(vesselStartDate);
            }
        } else if (!isVesselManager && vesselAssignments.length > 0) {
            // For crew members, use earliest assignment start date
            const startDates = vesselAssignments.map(a => {
                try {
                    return parse(a.startDate, 'yyyy-MM-dd', new Date());
                } catch {
                    return null;
                }
            }).filter(Boolean) as Date[];
            
            if (startDates.length > 0) {
                const earliestDate = startDates.reduce((earliest, date) => 
                    date < earliest ? date : earliest
                );
                startYear = getYear(earliestDate);
            }
        }
        
        // Generate years from start year to current year
        for (let year = startYear; year <= currentYear; year++) {
            years.push(year);
        }
        
        return years;
    }, [isVesselManager, currentVessel, userProfile?.startDate, vesselAssignments]);

    // Helper function to set year range
    const setYearRange = (year: number) => {
        if (isVesselManager && !currentVessel) return;
        const yearStart = startOfYear(new Date(year, 0, 1));
        const yearEnd = endOfYear(new Date(year, 0, 1));
        form.setValue('dateRange', { from: yearStart, to: yearEnd });
    };

    // Helper function to set "All" date range (from vessel start date to today; does not depend on state logs)
    const setAllDateRange = () => {
        if (isVesselManager && !currentVessel) {
            form.setValue('dateRange', { from: undefined, to: undefined });
            return;
        }

        let startDate: Date | null = null;
        
        if (isVesselManager && currentVessel) {
            // Vessel start date: profile start_date or vessel.start_date, then vessel created_at (even if no state logged)
            const startDateStr = userProfile?.startDate || (currentVessel as any).start_date;
            if (startDateStr) {
                try {
                    startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
                } catch (e) {
                    console.error('Error parsing vessel start date:', e);
                }
            }
            if (!startDate && (currentVessel as any).created_at) {
                startDate = new Date((currentVessel as any).created_at);
            }
        } else if (!isVesselManager && vesselAssignments.length > 0) {
            // For crew members, use earliest assignment start date
            const startDates = vesselAssignments.map(a => {
                try {
                    return parse(a.startDate, 'yyyy-MM-dd', new Date());
                } catch {
                    return null;
                }
            }).filter(Boolean) as Date[];
            
            if (startDates.length > 0) {
                startDate = startDates.reduce((earliest, date) => 
                    date < earliest ? date : earliest
                );
            }
        }
        
        if (!startDate) {
            form.setValue('dateRange', { from: undefined, to: undefined });
            return;
        }

        const allEndDate = new Date(); // Today
        form.setValue('dateRange', { from: startDate, to: allEndDate });
    };

    // Fetch preview statistics based on selected filters
    useEffect(() => {
        if (!user?.id || !supabase) {
            setPreviewStats({ recordCount: 0, dateRange: { earliest: null, latest: null }, vesselCount: 0, isLoading: false });
            return;
        }

        const fetchPreviewStats = async () => {
            setPreviewStats(prev => ({ ...prev, isLoading: true }));
            try {
                let logsQuery = supabase
                    .from('daily_state_logs')
                    .select('date, vessel_id')
                    .eq('user_id', user.id);

                // For vessel managers, always filter by date range (and their active vessel if needed)
                if (isVesselManager) {
                    if (!userProfile?.activeVesselId) {
                        setPreviewStats({ recordCount: 0, dateRange: { earliest: null, latest: null }, vesselCount: 0, isLoading: false });
                        return;
                    }
                    // Vessel managers should only see logs for their active vessel
                    logsQuery = logsQuery.eq('vessel_id', userProfile.activeVesselId);
                    if (watchedDateRange?.from && watchedDateRange?.to) {
                        const startDateStr = watchedDateRange.from.toISOString().split('T')[0];
                        const endDateStr = watchedDateRange.to.toISOString().split('T')[0];
                        logsQuery = logsQuery.gte('date', startDateStr).lte('date', endDateStr);
                    }
                } else {
                    // For non-vessel managers, use the selected filter type
                    if (filterType === 'vessel' && watchedVesselId) {
                        logsQuery = logsQuery.eq('vessel_id', watchedVesselId);
                    } else if (filterType === 'date_range' && watchedDateRange?.from && watchedDateRange?.to) {
                        const startDateStr = watchedDateRange.from.toISOString().split('T')[0];
                        const endDateStr = watchedDateRange.to.toISOString().split('T')[0];
                        logsQuery = logsQuery.gte('date', startDateStr).lte('date', endDateStr);
                    }
                }

                const { data: logs, error } = await logsQuery.order('date', { ascending: true });

                if (error) {
                    console.error('Error fetching preview stats:', error);
                    setPreviewStats({ recordCount: 0, dateRange: { earliest: null, latest: null }, vesselCount: 0, isLoading: false });
                    return;
                }

                const recordCount = logs?.length || 0;
                const dates = logs?.map(log => log.date).filter(Boolean) || [];
                const uniqueVessels = new Set(logs?.map(log => log.vessel_id).filter(Boolean) || []);

                setPreviewStats({
                    recordCount,
                    dateRange: {
                        earliest: dates.length > 0 ? dates[0] : null,
                        latest: dates.length > 0 ? dates[dates.length - 1] : null,
                    },
                    vesselCount: uniqueVessels.size,
                    isLoading: false,
                });
            } catch (error) {
                console.error('Error fetching preview stats:', error);
                setPreviewStats({ recordCount: 0, dateRange: { earliest: null, latest: null }, vesselCount: 0, isLoading: false });
            }
        };

        // Only fetch if we have valid filters
        // For vessel managers, require a linked vessel + date range
        // For others, check based on filter type
        const hasValidFilters = isVesselManager
            ? Boolean(userProfile?.activeVesselId && watchedDateRange?.from && watchedDateRange?.to)
            : ((filterType === 'vessel' && watchedVesselId) || (filterType === 'date_range' && watchedDateRange?.from && watchedDateRange?.to));
        
        if (hasValidFilters) {
            fetchPreviewStats();
        } else {
            setPreviewStats({ recordCount: 0, dateRange: { earliest: null, latest: null }, vesselCount: 0, isLoading: false });
        }
    }, [user?.id, supabase, filterType, watchedVesselId, watchedDateRange, isVesselManager, userProfile?.activeVesselId]);

    const onSubmit = async (data: ExportFormValues) => {
        console.log('[EXPORT PAGE] Form submitted with data:', data);
        console.log('[EXPORT PAGE] Form validation state:', {
            filterType: data.filterType,
            vesselId: data.vesselId,
            dateRange: data.dateRange,
            exportFormat: data.exportFormat
        });
        
        if (!user) {
            toast({ title: 'Error', description: 'You must be logged in to export data.', variant: 'destructive' });
            return;
        }

        if (isVesselManager && !currentVessel) {
            toast({
                title: 'No vessel linked',
                description: 'Link a vessel on your profile before exporting sea time.',
                variant: 'destructive',
            });
            return;
        }

        setIsGenerating(true);
        setExportProgress(0);
        setExportStatus('Preparing export...');
        
        try {
            console.log('[EXPORT PAGE] Starting export with params:', {
                userId: user.id,
                filterType: data.filterType,
                vesselId: data.vesselId,
                dateRange: data.dateRange,
                exportFormat: data.exportFormat
            });

            // Simulate progress: Fetching data (0-60%)
            setExportProgress(20);
            setExportStatus(
              data.exportFormat === 'master'
                ? 'Building Master Document…'
                : 'Fetching sea time data...',
            );

            let reportData;
            if (data.exportFormat === 'master') {
              const masterVesselId =
                data.vesselId ||
                (isVesselManager ? userProfile?.activeVesselId : undefined) ||
                currentVessel?.id;
              if (!masterVesselId) {
                throw new Error('Select a vessel for the Master Document.');
              }
              reportData = await generateMasterDocReportData(user.id, masterVesselId);
            } else {
              reportData = await fetchSeaTimeReportData(
                user.id,
                data.filterType,
                data.vesselId,
                data.dateRange as { from: Date; to: Date } | undefined,
              );
            }

            console.log('[EXPORT PAGE] Report data received:', {
                serviceRecordsCount: reportData.serviceRecords?.length || 0,
                stateLogsCount: reportData.stateLogs?.length || 0,
                watchDatesCount: reportData.watchDates?.length || 0,
                passageLogsCount: reportData.passageLogs?.length || 0,
                totalDays: reportData.totalDays,
                totalSeaDays: reportData.totalSeaDays,
                totalStandbyDays: reportData.totalStandbyDays
            });

            // Simulate progress: Processing data (60-90%)
            setExportProgress(60);
            setExportStatus(`Generating ${data.exportFormat.toUpperCase()} file...`);
            
            switch (data.exportFormat) {
                case 'csv':
                    exportToCSV(reportData);
                    setExportProgress(100);
                    setExportStatus('Export complete!');
                    toast({ title: 'Success', description: 'Sea time data exported to CSV.' });
                    break;
                case 'excel':
                    try {
                        await exportToExcelXML(reportData);
                        setExportProgress(100);
                        setExportStatus('Export complete!');
                        toast({ title: 'Success', description: 'Sea time data exported to Excel.' });
                    } catch (excelError: any) {
                        console.error('[EXPORT PAGE] Excel export error:', excelError);
                        throw new Error(`Excel export failed: ${excelError.message || 'Unknown error'}`);
                    }
                    break;
                case 'master':
                    try {
                        await exportMasterDocExcel(reportData);
                        setExportProgress(100);
                        setExportStatus('Export complete!');
                        toast({
                          title: 'Master Document ready',
                          description: 'Full vessel Excel exported (states + passages).',
                        });
                    } catch (masterError: any) {
                        console.error('[EXPORT PAGE] Master Doc export error:', masterError);
                        throw new Error(`Master Doc export failed: ${masterError.message || 'Unknown error'}`);
                    }
                    break;
                case 'json':
                    exportToJSON(reportData);
                    setExportProgress(100);
                    setExportStatus('Export complete!');
                    toast({ title: 'Success', description: 'Sea time data exported to JSON.' });
                    break;
                case 'pdf':
                    try {
                        generateSeaTimeTestimonial(reportData);
                        setExportProgress(100);
                        setExportStatus('Export complete!');
                        toast({ title: 'Success', description: 'Sea time report generated as PDF.' });
                    } catch (pdfError: any) {
                        console.error('[EXPORT PAGE] PDF export error:', pdfError);
                        throw new Error(`PDF export failed: ${pdfError.message || 'Unknown error'}`);
                    }
                    break;
                default:
                    toast({ title: 'Error', description: 'Unknown export format.', variant: 'destructive' });
            }

            // Reset progress after a short delay
            setTimeout(() => {
                setExportProgress(0);
                setExportStatus('');
            }, 1500);

        } catch (error: any) {
            console.error("[EXPORT PAGE] Failed to export data:", error);
            setExportProgress(0);
            setExportStatus('');
            toast({ 
                title: 'Error', 
                description: error.message || 'Failed to export data. Please check the console for details.', 
                variant: 'destructive' 
            });
        } finally {
            setIsGenerating(false);
        }
    }

    // Get selected vessel name for preview
    const selectedVessel = useMemo(() => {
        if (!watchedVesselId || !vessels) return null;
        return vessels.find(v => v.id === watchedVesselId);
    }, [watchedVesselId, vessels]);

    // Show loading state
    if (isLoadingProfile) {
        return (
            <div className="flex flex-col gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                            <Download className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Export Sea Time</h1>
                            <p className="text-muted-foreground">Export your sea service records in various formats</p>
                        </div>
                    </div>
                </div>
                <Separator />
                <Card>
                    <CardContent className="py-8">
                        <div className="flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
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
                <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                    <Download className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Export Sea Time</h1>
                    <p className="text-muted-foreground">Export your sea service records in various formats</p>
                </div>
            </div>
        </div>

        <Separator />

        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Format Selection */}
                <Card className="border-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Select Export Format
                        </CardTitle>
                        <CardDescription>Choose the format that best suits your needs</CardDescription>
            </CardHeader>
            <CardContent>
                        <FormField
                            control={form.control}
                            name="exportFormat"
                            render={({ field }) => (
                                <FormItem>
                                        <FormControl>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {formatOptions.map((format) => {
                                                const Icon = format.icon;
                                                const isSelected = field.value === format.value;
                                                return (
                                                    <div
                                                        key={format.value}
                                                        onClick={() => {
                                                            field.onChange(format.value);
                                                            setSelectedFormat(format.value);
                                                            if (format.value === 'master' && !isVesselManager) {
                                                              form.setValue('filterType', 'vessel');
                                                            }
                                                        }}
                                                        className={cn(
                                                            "relative p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md",
                                                            isSelected
                                                                ? `${format.bgColor} border-primary shadow-sm`
                                                                : "border-border hover:border-primary/50 bg-card"
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className={cn(
                                                                "h-10 w-10 rounded-lg flex items-center justify-center",
                                                                isSelected ? format.bgColor : "bg-muted"
                                                            )}>
                                                                <Icon className={cn(
                                                                    "h-5 w-5",
                                                                    isSelected ? format.color : "text-muted-foreground"
                                                                )} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-semibold text-sm">{format.label}</h3>
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    {format.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                </div>
                                                );
                                            })}
                                                </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                {/* Filter Options */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings2 className="h-5 w-5 text-primary" />
                            Filter Options
                        </CardTitle>
                        <CardDescription>Choose how to filter your sea time data</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {!isVesselManager && selectedFormat !== 'master' && (
                            <FormField
                                control={form.control}
                                name="filterType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Filter By</FormLabel>
                                        <Select onValueChange={(value) => {
                                            field.onChange(value);
                                            form.setValue('vesselId', undefined);
                                            form.setValue('dateRange', { from: undefined, to: undefined });
                                        }} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="rounded-lg">
                                                    <SelectValue placeholder="Select a filter method..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="vessel">
                                                     <div className="flex items-center gap-2">
                                                        <Ship className="h-4 w-4" />
                                                        <span>By Vessel</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="date_range">
                                                    <div className="flex items-center gap-2">
                                                        <CalendarIcon className="h-4 w-4" />
                                                        <span>By Date Range</span>
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        
                        {isVesselManager && selectedFormat === 'master' && (
                            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                              <div className="font-medium">Master Document period</div>
                              <p className="mt-1 text-muted-foreground text-xs">
                                {currentVessel ? (
                                  <>
                                    Exports from this vessel&apos;s start date through today, including every daily state and all passage logbook entries for{' '}
                                    <span className="font-medium text-foreground">{currentVessel.name}</span>.
                                  </>
                                ) : (
                                  <>No vessel is linked to this account. Link a vessel on Profile before exporting.</>
                                )}
                              </p>
                            </div>
                        )}

                        {vesselManagerNeedsVessel && (
                            <Alert>
                                <Ship className="h-4 w-4" />
                                <AlertTitle>No vessel linked</AlertTitle>
                                <AlertDescription>
                                    This vessel account is not managing a vessel, so there is no export date range.
                                    Claim or create a vessel on your Profile page first.
                                </AlertDescription>
                            </Alert>
                        )}

                        {isVesselManager && selectedFormat !== 'master' && !vesselManagerNeedsVessel && (
                            <>
                                {/* Hidden FormField to ensure filterType is registered for vessel managers */}
                                <FormField
                                    control={form.control}
                                    name="filterType"
                                    render={({ field }) => (
                                        <FormItem className="hidden">
                                            <FormControl>
                                                <input type="hidden" {...field} value="date_range" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <div className="space-y-2">
                                    <FormLabel>Filter By</FormLabel>
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">Date Range (Vessel managers can only filter by date range)</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {((filterType === 'vessel' && !isVesselManager) ||
                          (selectedFormat === 'master' && !isVesselManager)) && (
                            <FormField
                                control={form.control}
                                name="vesselId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Select Vessel</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                 <SelectTrigger className="rounded-lg">
                                                    <SelectValue placeholder={(isLoadingVessels || isLoadingAssignments) ? 'Loading vessels...' : vessels?.length === 0 ? 'No vessels available' : 'Choose a vessel'} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {vessels?.length === 0 && !isLoadingVessels && !isLoadingAssignments ? (
                                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                        No vessels assigned to your account
                                                    </div>
                                                ) : (
                                                    vessels?.map(vessel => (
                                                        <SelectItem key={vessel.id} value={vessel.id}>
                                                            <div className="flex items-center gap-2">
                                                                <Ship className="h-4 w-4 text-muted-foreground" />
                                                                <span>{vessel.name}</span>
                                                                {vessel.type && (
                                                                    <Badge variant="outline" className="ml-auto text-xs">
                                                                        {vessel.type}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                        {selectedFormat === 'master' && (
                                          <FormDescription>
                                            Master Doc covers vessel start → today (states + passages). Date range is set automatically.
                                          </FormDescription>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {((filterType === 'date_range' || isVesselManager) && selectedFormat !== 'master' && !vesselManagerNeedsVessel) && (
                            <>
                                {/* Quick Year Selection */}
                                {availableYears.length > 0 && (
                                    <div className="space-y-2">
                                        <FormLabel>Quick Select</FormLabel>
                                        <div className="flex flex-wrap gap-2">
                                            {/* "All" button */}
                                            {(() => {
                                                // Check if current selection is "All" (not matching any specific year)
                                                const from = watchedDateRange?.from;
                                                const to = watchedDateRange?.to;
                                                const isAllSelected = from && to &&
                                                    availableYears.every(year => {
                                                        const yearStart = format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
                                                        const yearEnd = format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
                                                        const rangeStart = format(from, 'yyyy-MM-dd');
                                                        const rangeEnd = format(to, 'yyyy-MM-dd');
                                                        return !(rangeStart === yearStart && rangeEnd === yearEnd);
                                                    });
                                                
                                                return (
                                                    <Button
                                                        type="button"
                                                        variant={isAllSelected ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => setAllDateRange()}
                                                        className={cn(
                                                            "rounded-lg",
                                                            isAllSelected && "bg-primary text-primary-foreground"
                                                        )}
                                                    >
                                                        All
                                                    </Button>
                                                );
                                            })()}
                                            
                                            {/* Year buttons */}
                                            {availableYears.map(year => {
                                                const isSelected = watchedDateRange?.from && watchedDateRange?.to &&
                                                    getYear(watchedDateRange.from) === year &&
                                                    getYear(watchedDateRange.to) === year &&
                                                    format(watchedDateRange.from, 'yyyy-MM-dd') === format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd') &&
                                                    format(watchedDateRange.to, 'yyyy-MM-dd') === format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
                                                
                                                return (
                                                    <Button
                                                        key={year}
                                                        type="button"
                                                        variant={isSelected ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => setYearRange(year)}
                                                        className={cn(
                                                            "rounded-lg",
                                                            isSelected && "bg-primary text-primary-foreground"
                                                        )}
                                                    >
                                                        {year}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                
                                <Controller
                                    control={form.control}
                                    name="dateRange"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Date Range</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            id="date"
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-full justify-start text-left font-normal rounded-lg",
                                                                !field.value?.from && "text-muted-foreground"
                                                            )}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {field.value?.from ? (
                                                                field.value.to ? (
                                                                    <>
                                                                        {format(field.value.from, "LLL dd, y")} -{" "}
                                                                        {format(field.value.to, "LLL dd, y")}
                                                                    </>
                                                                ) : (
                                                                    format(field.value.from, "LLL dd, y")
                                                                )
                                                            ) : (
                                                                <span>Pick a date range</span>
                                                            )}
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar
                                                        initialFocus
                                                        mode="range"
                                                        defaultMonth={field.value?.from}
                                                        selected={{ from: field.value?.from!, to: field.value?.to }}
                                                        onSelect={(range) => field.onChange(range)}
                                                        numberOfMonths={2}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Export Summary Preview */}
                {((!isVesselManager && watchedVesselId) || (currentVessel && watchedDateRange?.from && watchedDateRange?.to) || (!isVesselManager && watchedDateRange?.from && watchedDateRange?.to)) && (
                    <Card className="bg-muted/50 border-primary/20">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Database className="h-4 w-4 text-primary" />
                                Export Summary
                            </CardTitle>
                            <CardDescription>Preview of what will be exported</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {previewStats.isLoading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-5 w-full" />
                                    <Skeleton className="h-5 w-full" />
                                    <Skeleton className="h-5 w-full" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            Format:
                                        </span>
                                        <Badge variant="secondary" className="font-medium">
                                            {formatOptions.find(f => f.value === selectedFormat)?.label}
                                        </Badge>
                                    </div>

                                    {filterType === 'vessel' && !isVesselManager && selectedVessel && (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                    <Ship className="h-4 w-4" />
                                                    Vessel:
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">{selectedVessel.name}</span>
                                                    {selectedVessel.type && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {selectedVessel.type}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {previewStats.recordCount > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                        <TrendingUp className="h-4 w-4" />
                                                        Service Records:
                                                    </span>
                                                    <span className="text-sm font-medium">{previewStats.recordCount} days logged</span>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {(filterType === 'date_range' || isVesselManager) && watchedDateRange?.from && watchedDateRange?.to && (
                                        <>
                                            {(() => {
                                                const today = startOfDay(new Date());
                                                const effectiveTo = watchedDateRange.to > today ? today : watchedDateRange.to;
                                                const effectiveFrom = watchedDateRange.from;
                                                const daysInRange = differenceInDays(effectiveTo, effectiveFrom) + 1;
                                                return (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                                <CalendarIcon className="h-4 w-4" />
                                                                Date Range:
                                                            </span>
                                                            <span className="text-sm font-medium">
                                                                {format(effectiveFrom, "MMM dd, yyyy")} - {format(effectiveTo, "MMM dd, yyyy")}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                                <Clock className="h-4 w-4" />
                                                                Duration:
                                                            </span>
                                                            <span className="text-sm font-medium">
                                                                {daysInRange} days
                                                            </span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                            {previewStats.recordCount > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                        <TrendingUp className="h-4 w-4" />
                                                        Service Records:
                                                    </span>
                                                    <span className="text-sm font-medium">{previewStats.recordCount} days logged</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    
                                    {isVesselManager && userProfile?.activeVesselId && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                <Ship className="h-4 w-4" />
                                                Vessel:
                                            </span>
                                            <span className="text-sm font-medium">
                                                {vessels.find(v => v.id === userProfile.activeVesselId)?.name || 'Your Vessel'}
                                            </span>
                                        </div>
                                    )}

                                    {previewStats.vesselCount > 0 && (filterType === 'date_range' || isVesselManager) && !isVesselManager && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                <Ship className="h-4 w-4" />
                                                Vessels:
                                            </span>
                                            <span className="text-sm font-medium">{previewStats.vesselCount} vessel{previewStats.vesselCount !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}

                                    {previewStats.recordCount === 0 && (
                                        <div className="pt-2 border-t">
                                            <p className="text-xs text-muted-foreground text-center">
                                                No records found matching the selected filters
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Export Progress Bar */}
                {isGenerating && (
                    <Card className="border-primary/20">
                        <CardContent className="pt-6">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground font-medium">{exportStatus || 'Exporting...'}</span>
                                    <span className="text-muted-foreground font-medium">{exportProgress}%</span>
                                </div>
                                <Progress value={exportProgress} className="h-2" />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Form Validation Errors */}
                {Object.keys(form.formState.errors).length > 0 && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Please fix the following errors:</AlertTitle>
                        <AlertDescription className="mt-2">
                            <ul className="list-disc list-inside space-y-1">
                                {form.formState.errors.filterType && (
                                    <li>{form.formState.errors.filterType.message}</li>
                                )}
                                {form.formState.errors.vesselId && (
                                    <li>{form.formState.errors.vesselId.message}</li>
                                )}
                                {form.formState.errors.dateRange && (
                                    <li>{form.formState.errors.dateRange.message}</li>
                                )}
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}

                {/* Export Button */}
                <div className="flex items-center gap-4">
                    <Button 
                        type="submit" 
                        disabled={isGenerating || vesselManagerNeedsVessel} 
                        size="lg"
                        className="w-full rounded-xl h-12 text-base font-semibold"
                        onClick={(e) => {
                            console.log('[EXPORT PAGE] Export button clicked');
                            console.log('[EXPORT PAGE] Current form values:', form.getValues());
                            console.log('[EXPORT PAGE] Form errors:', form.formState.errors);
                            console.log('[EXPORT PAGE] Form isValid:', form.formState.isValid);
                            
                            // Trigger validation
                            form.trigger().then((isValid) => {
                                console.log('[EXPORT PAGE] Validation result:', isValid);
                                if (!isValid) {
                                    console.log('[EXPORT PAGE] Form is invalid, preventing submission');
                                    toast({
                                        title: 'Validation Error',
                                        description: 'Please complete all required fields. Check the form for details.',
                                        variant: 'destructive'
                                    });
                                }
                            });
                        }}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-5 w-5" />
                                Export Sea Time Data
                            </>
                        )}
                    </Button>
                </div>
                    </form>
                </Form>
    </div>
  );
}
