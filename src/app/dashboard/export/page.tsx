
'use client';

import { useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, Calendar as CalendarIcon, Ship, Loader2, FileText, LifeBuoy } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { generateSeaTimeTestimonial } from '@/lib/pdf-generator';
import { generateSeaTimeReportData as fetchSeaTimeReportData } from '@/app/actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import type { Vessel } from '@/lib/types';


const exportSchema = z.object({
  exportType: z.enum(['seatime_report', 'testimonial']),
  filterType: z.enum(['vessel', 'date_range']),
  vesselId: z.string().optional(),
  dateRange: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
  }).optional(),
}).refine(data => {
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

export default function ExportPage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const [isGenerating, setIsGenerating] = useState(false);

    const form = useForm<ExportFormValues>({
        resolver: zodResolver(exportSchema),
        defaultValues: {
            exportType: 'seatime_report',
            filterType: 'vessel',
            vesselId: undefined,
            dateRange: { from: undefined, to: undefined }
        }
    });

    const filterType = form.watch('filterType');

    const vesselsCollectionRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return collection(firestore, 'users', user.uid, 'vessels');
    }, [user, firestore]);

    const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(vesselsCollectionRef);

    const onSubmit = async (data: ExportFormValues) => {
        if (!user) {
            toast({ title: 'Error', description: 'You must be logged in to generate a report.', variant: 'destructive' });
            return;
        }

        setIsGenerating(true);
        try {
            const reportData = await fetchSeaTimeReportData(
                user.uid,
                data.filterType,
                data.vesselId,
                data.dateRange as { from: Date; to: Date } | undefined
            );
            
            if (data.exportType === 'seatime_report') {
                generateSeaTimeTestimonial(reportData);
            } else {
                // Future logic for other doc types
                toast({ title: 'Not implemented', description: 'Testimonial exports are not yet available.' });
            }

        } catch (error: any) {
            console.error("Failed to generate report:", error);
            toast({ title: 'Error', description: error.message || 'Failed to generate PDF.', variant: 'destructive' });
        } finally {
            setIsGenerating(false);
        }
    }

  return (
    <div className="w-full max-w-2xl mx-auto">
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Download className="h-6 w-6" />
                    <CardTitle>Export Documents</CardTitle>
                </div>
                <CardDescription>Generate professional PDFs of your sea time or testimonials.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <FormField
                            control={form.control}
                            name="exportType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Document Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="rounded-lg">
                                                <SelectValue placeholder="Select a document type to export..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="seatime_report">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4" />
                                                    <span>Sea Time Testimonial</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="testimonial" disabled>
                                                <div className="flex items-center gap-2">
                                                    <LifeBuoy className="h-4 w-4" />
                                                    <span>Reference Letter</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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

                        {filterType === 'vessel' && (
                            <FormField
                                control={form.control}
                                name="vesselId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Vessel</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                 <SelectTrigger className="rounded-lg">
                                                    <SelectValue placeholder={isLoadingVessels ? 'Loading vessels...' : 'Select a vessel'} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {vessels?.map(vessel => (
                                                    <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {filterType === 'date_range' && (
                           <Controller
                                control={form.control}
                                name="dateRange"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Date range</FormLabel>
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
                        )}

                        <Button type="submit" disabled={isGenerating} className="w-full rounded-lg">
                            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Generate PDF
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    </div>
  );
}
