'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Info, Edit, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parse, getYear, getMonth, getDate, setYear, setMonth, setDate, isValid } from 'date-fns';
import { cn } from '@/lib/utils';

const mcaApplicationSchema = z.object({
  title: z.string().optional(),
  dateOfBirth: z.date().optional().nullable(),
  sex: z.enum(['male', 'female']).optional().nullable(),
  placeOfBirth: z.string().optional(),
  countryOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  telephone: z.string().optional(),
  mobile: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  addressDistrict: z.string().optional(),
  addressTownCity: z.string().optional(),
  addressCountyState: z.string().optional(),
  addressPostCode: z.string().optional(),
  addressCountry: z.string().optional(),
  dischargeBookNumber: z.string().optional(),
});

type MCAApplicationFormValues = z.infer<typeof mcaApplicationSchema>;

/** Shape used when vessel is editing a crew member’s details (same as profile “Crew details”) */
export interface MCAFormProfile {
  title?: string;
  dateOfBirth?: Date | null;
  sex?: 'male' | 'female' | null;
  placeOfBirth?: string;
  countryOfBirth?: string;
  nationality?: string;
  telephone?: string;
  mobile?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressDistrict?: string;
  addressTownCity?: string;
  addressCountyState?: string;
  addressPostCode?: string;
  addressCountry?: string;
  dischargeBookNumber?: string;
}

function MCASkeleton() {
  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader>
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-4 border-t">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

const TITLE_OPTIONS = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr'] as const;
const SEX_OPTIONS = ['male', 'female'] as const;

const MCA_DRAFT_KEY_PREFIX = 'crew-mca-draft-';

function getMCADraftKey(targetUserId: string) {
  return `${MCA_DRAFT_KEY_PREFIX}${targetUserId}`;
}

function serializeMCADraft(values: MCAApplicationFormValues): Record<string, unknown> {
  return {
    ...values,
    dateOfBirth: values.dateOfBirth ? (values.dateOfBirth instanceof Date ? values.dateOfBirth.toISOString() : values.dateOfBirth) : null,
  };
}

function deserializeMCADraft(raw: Record<string, unknown>): MCAApplicationFormValues | null {
  if (!raw || typeof raw !== 'object') return null;
  const dateOfBirthRaw = raw.dateOfBirth;
  let dateOfBirth: Date | null = null;
  if (dateOfBirthRaw) {
    if (dateOfBirthRaw instanceof Date) dateOfBirth = dateOfBirthRaw;
    else if (typeof dateOfBirthRaw === 'string') {
      const d = new Date(dateOfBirthRaw);
      dateOfBirth = isValid(d) ? d : null;
    }
  }
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    dateOfBirth,
    sex: raw.sex === 'male' || raw.sex === 'female' ? raw.sex : null,
    placeOfBirth: typeof raw.placeOfBirth === 'string' ? raw.placeOfBirth : '',
    countryOfBirth: typeof raw.countryOfBirth === 'string' ? raw.countryOfBirth : '',
    nationality: typeof raw.nationality === 'string' ? raw.nationality : '',
    telephone: typeof raw.telephone === 'string' ? raw.telephone : '',
    mobile: typeof raw.mobile === 'string' ? raw.mobile : '',
    addressLine1: typeof raw.addressLine1 === 'string' ? raw.addressLine1 : '',
    addressLine2: typeof raw.addressLine2 === 'string' ? raw.addressLine2 : '',
    addressDistrict: typeof raw.addressDistrict === 'string' ? raw.addressDistrict : '',
    addressTownCity: typeof raw.addressTownCity === 'string' ? raw.addressTownCity : '',
    addressCountyState: typeof raw.addressCountyState === 'string' ? raw.addressCountyState : '',
    addressPostCode: typeof raw.addressPostCode === 'string' ? raw.addressPostCode : '',
    addressCountry: typeof raw.addressCountry === 'string' ? raw.addressCountry : '',
    dischargeBookNumber: typeof raw.dischargeBookNumber === 'string' ? raw.dischargeBookNumber : '',
  };
}

function transformRawToMCAProfile(raw: any): MCAFormProfile | null {
  if (!raw) return null;
  const dateOfBirthRaw = raw.date_of_birth || raw.dateOfBirth;
  const dateOfBirth = dateOfBirthRaw ? parse(dateOfBirthRaw, 'yyyy-MM-dd', new Date()) : null;
  const rawSex = (raw.sex || raw.gender || '').toString().toLowerCase().trim();
  const sex = SEX_OPTIONS.includes(rawSex as any) ? (rawSex as 'male' | 'female') : null;
  const rawTitle = (raw.title || '').toString().trim();
  const titleMatch = TITLE_OPTIONS.find(t => t.toLowerCase() === rawTitle.toLowerCase());
  const title = titleMatch ? titleMatch : (rawTitle || '');
  return {
    title,
    dateOfBirth,
    sex,
    placeOfBirth: raw.place_of_birth || raw.placeOfBirth || '',
    countryOfBirth: raw.country_of_birth || raw.countryOfBirth || '',
    nationality: raw.nationality || '',
    telephone: raw.telephone || '',
    mobile: raw.mobile || '',
    addressLine1: raw.address_line1 || raw.addressLine1 || '',
    addressLine2: raw.address_line2 || raw.addressLine2 || '',
    addressDistrict: raw.address_district || raw.addressDistrict || '',
    addressTownCity: raw.address_town_city || raw.addressTownCity || '',
    addressCountyState: raw.address_county_state || raw.addressCountyState || '',
    addressPostCode: raw.address_post_code || raw.addressPostCode || '',
    addressCountry: raw.address_country || raw.addressCountry || '',
    dischargeBookNumber: raw.discharge_book_number || raw.dischargeBookNumber || '',
  };
}

export interface MCAApplicationDetailsCardProps {
  /** When set, vessel is editing this crew member’s details; form submits via API */
  targetUserId?: string;
  /** Pre-loaded profile for the crew member (optional; can use initialProfileRaw instead) */
  initialProfile?: MCAFormProfile | null;
  /** Raw profile row (snake_case); used when targetUserId is set and initialProfile not provided */
  initialProfileRaw?: any;
  /** Called after successful save when editing a crew member; receives updated profile from API */
  onSaved?: (updatedProfile?: any) => void;
}

export function MCAApplicationDetailsCard(props?: MCAApplicationDetailsCardProps) {
  const { targetUserId, initialProfile, initialProfileRaw, onSaved } = props || {};
  const isCrewMode = Boolean(targetUserId);
  const { user } = useUser();
  const { supabase, session } = useSupabase();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading: isLoadingDoc } = useDoc('users', isCrewMode ? undefined : user?.id);

  const userProfile = useMemo(() => {
    if (isCrewMode) return initialProfile ?? transformRawToMCAProfile(initialProfileRaw) ?? null;
    return transformRawToMCAProfile(userProfileRaw);
  }, [isCrewMode, initialProfile, initialProfileRaw, userProfileRaw]);
  const isLoading = isCrewMode ? false : isLoadingDoc;

  const form = useForm<MCAApplicationFormValues>({
    resolver: zodResolver(mcaApplicationSchema),
    defaultValues: {
      title: '',
      dateOfBirth: null,
      sex: null,
      placeOfBirth: '',
      countryOfBirth: '',
      nationality: '',
      telephone: '',
      mobile: '',
      addressLine1: '',
      addressLine2: '',
      addressDistrict: '',
      addressTownCity: '',
      addressCountyState: '',
      addressPostCode: '',
      addressCountry: '',
      dischargeBookNumber: '',
    },
  });

  // Base values from server (userProfile)
  const serverValues = useMemo(() => {
    if (userProfile == null || isLoading) return null;
    return {
      title: userProfile.title || '',
      dateOfBirth: userProfile.dateOfBirth ?? null,
      sex: userProfile.sex ?? null,
      placeOfBirth: userProfile.placeOfBirth || '',
      countryOfBirth: userProfile.countryOfBirth || '',
      nationality: userProfile.nationality || '',
      telephone: userProfile.telephone || '',
      mobile: userProfile.mobile || '',
      addressLine1: userProfile.addressLine1 || '',
      addressLine2: userProfile.addressLine2 || '',
      addressDistrict: userProfile.addressDistrict || '',
      addressTownCity: userProfile.addressTownCity || '',
      addressCountyState: userProfile.addressCountyState || '',
      addressPostCode: userProfile.addressPostCode || '',
      addressCountry: userProfile.addressCountry || '',
      dischargeBookNumber: userProfile.dischargeBookNumber || '',
    };
  }, [userProfile, isLoading]);

  // Update form: when in crew mode, restore draft from sessionStorage if present; otherwise use server values
  useEffect(() => {
    if (serverValues === null) return;
    if (isCrewMode && targetUserId && typeof window !== 'undefined') {
      try {
        const key = getMCADraftKey(targetUserId);
        const stored = sessionStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, unknown>;
          const draft = deserializeMCADraft(parsed);
          if (draft) {
            form.reset(draft);
            return;
          }
        }
      } catch {
        // ignore invalid draft
      }
    }
    form.reset(serverValues);
  }, [serverValues, isCrewMode, targetUserId, form]);

  // Persist MCA form draft to sessionStorage when editing a crew member (debounced)
  const saveDraftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isCrewMode || !targetUserId || typeof window === 'undefined') return;
    const subscription = form.watch((values) => {
      if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = setTimeout(() => {
        try {
          const payload = serializeMCADraft(values as MCAApplicationFormValues);
          sessionStorage.setItem(getMCADraftKey(targetUserId), JSON.stringify(payload));
        } catch {
          // ignore
        }
        saveDraftTimeoutRef.current = null;
      }, 500);
    });
    return () => {
      if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
      subscription.unsubscribe();
    };
  }, [isCrewMode, targetUserId, form]);

  const clearDraft = useMemo(() => {
    if (!targetUserId || typeof window === 'undefined') return () => {};
    return () => {
      try {
        sessionStorage.removeItem(getMCADraftKey(targetUserId));
      } catch {
        // ignore
      }
    };
  }, [targetUserId]);

  const [isEditing, setIsEditing] = useState(false);
  const watchedTitle = form.watch('title');
  const watchedSex = form.watch('sex');

  const onSubmit = async (data: MCAApplicationFormValues) => {
    if (isCrewMode) {
      if (!targetUserId || !session?.access_token) return;
      setIsSaving(true);
      try {
        const res = await fetch('/api/crew-mca-details', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            crewUserId: targetUserId,
            title: data.title || null,
            dateOfBirth: data.dateOfBirth ? format(data.dateOfBirth, 'yyyy-MM-dd') : null,
            sex: data.sex || null,
            placeOfBirth: data.placeOfBirth || null,
            countryOfBirth: data.countryOfBirth || null,
            nationality: data.nationality || null,
            telephone: data.telephone || null,
            mobile: data.mobile || null,
            addressLine1: data.addressLine1 || null,
            addressLine2: data.addressLine2 || null,
            addressDistrict: data.addressDistrict || null,
            addressTownCity: data.addressTownCity || null,
            addressCountyState: data.addressCountyState || null,
            addressPostCode: data.addressPostCode || null,
            addressCountry: data.addressCountry || null,
            dischargeBookNumber: data.dischargeBookNumber || null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || json.details || 'Failed to update');
        }
        toast({
          title: 'Crew details saved',
          description: "This crew member’s details have been saved and will be used for generated documents.",
        });
        setIsEditing(false);
        clearDraft();
        onSaved?.(json.profile);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to update crew details. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!user?.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          title: data.title || null,
          date_of_birth: data.dateOfBirth ? format(data.dateOfBirth, 'yyyy-MM-dd') : null,
          sex: data.sex || null,
          place_of_birth: data.placeOfBirth || null,
          country_of_birth: data.countryOfBirth || null,
          nationality: data.nationality || null,
          telephone: data.telephone || null,
          mobile: data.mobile || null,
          address_line1: data.addressLine1 || null,
          address_line2: data.addressLine2 || null,
          address_district: data.addressDistrict || null,
          address_town_city: data.addressTownCity || null,
          address_county_state: data.addressCountyState || null,
          address_post_code: data.addressPostCode || null,
          address_country: data.addressCountry || null,
          discharge_book_number: data.dischargeBookNumber || null,
        })
        .eq('id', user.id);

      if (error) throw error;
      setIsEditing(false);
      toast({
        title: 'Crew details saved',
        description: 'Your details have been saved and will be used when generating PDFs and applications.',
      });
    } catch (error: any) {
      console.error('Error updating crew details:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update crew details. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (isCrewMode && targetUserId) clearDraft();
    if (userProfile) {
      form.reset({
        title: userProfile.title || '',
        dateOfBirth: userProfile.dateOfBirth ?? null,
        sex: userProfile.sex ?? null,
        placeOfBirth: userProfile.placeOfBirth || '',
        countryOfBirth: userProfile.countryOfBirth || '',
        nationality: userProfile.nationality || '',
        telephone: userProfile.telephone || '',
        mobile: userProfile.mobile || '',
        addressLine1: userProfile.addressLine1 || '',
        addressLine2: userProfile.addressLine2 || '',
        addressDistrict: userProfile.addressDistrict || '',
        addressTownCity: userProfile.addressTownCity || '',
        addressCountyState: userProfile.addressCountyState || '',
        addressPostCode: userProfile.addressPostCode || '',
        addressCountry: userProfile.addressCountry || '',
        dischargeBookNumber: userProfile.dischargeBookNumber || '',
      });
    }
  };

  if (isLoading) {
    return <MCASkeleton />;
  }

  return (
    <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <FileText className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-xl">
              {isCrewMode ? 'Crew member details' : 'Crew details'}
            </CardTitle>
            <CardDescription className="mt-1">
              {isCrewMode
                ? 'Add or edit this member’s details (e.g. date of birth, address). They are used for AMSA, MCA, Nav Watch, and other generated documents.'
                : 'Save your details once — we use them to fill PDFs and applications (including date of birth, address, and discharge book number).'}
            </CardDescription>
          </div>
          </div>
          {!isEditing ? (
            <Button type="button" onClick={() => setIsEditing(true)} variant="default" className="rounded-xl shrink-0">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {isCrewMode ? 'Why add these details?' : 'Why save these details?'}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {isCrewMode
                  ? 'These details feed vessel-generated PDFs and applications for this crew member (AMSA, MCA, Nav Watch, and similar).'
                  : 'These details are used whenever you generate official PDFs and applications from SeaJourney, so keeping them accurate saves time.'}
              </p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => {
                    const currentTitle = (watchedTitle ?? field.value ?? '') || '';
                    return (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <Select
                          key={`mca-title-${targetUserId || user?.id || 'own'}-${currentTitle || 'empty'}`}
                          onValueChange={field.onChange}
                          value={currentTitle}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-xl" disabled={!isEditing}>
                              <SelectValue placeholder="Select title" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Mr">Mr</SelectItem>
                            <SelectItem value="Mrs">Mrs</SelectItem>
                            <SelectItem value="Miss">Miss</SelectItem>
                            <SelectItem value="Ms">Ms</SelectItem>
                            <SelectItem value="Dr">Dr</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => {
                    const currentDate = field.value || new Date();
                    const selectedYear = getYear(currentDate);
                    const selectedMonth = getMonth(currentDate);
                    const selectedDay = getDate(currentDate);
                    
                    const currentYear = new Date().getFullYear();
                    const years = Array.from({ length: currentYear - 1899 }, (_, i) => currentYear - i);
                    const months = [
                      { value: 0, label: 'January' },
                      { value: 1, label: 'February' },
                      { value: 2, label: 'March' },
                      { value: 3, label: 'April' },
                      { value: 4, label: 'May' },
                      { value: 5, label: 'June' },
                      { value: 6, label: 'July' },
                      { value: 7, label: 'August' },
                      { value: 8, label: 'September' },
                      { value: 9, label: 'October' },
                      { value: 10, label: 'November' },
                      { value: 11, label: 'December' },
                    ];
                    
                    const getDaysInMonth = (year: number, month: number) => {
                      return new Date(year, month + 1, 0).getDate();
                    };
                    
                    const days = Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1);
                    
                    const handleDateChange = (year?: number, month?: number, day?: number) => {
                      const newYear = year !== undefined ? year : selectedYear;
                      const newMonth = month !== undefined ? month : selectedMonth;
                      const newDay = day !== undefined ? day : selectedDay;
                      
                      // Ensure day is valid for the selected month/year
                      const maxDay = getDaysInMonth(newYear, newMonth);
                      const finalDay = Math.min(newDay, maxDay);
                      
                      try {
                        const newDate = setDate(setMonth(setYear(new Date(), newYear), newMonth), finalDay);
                        if (isValid(newDate) && newDate <= new Date()) {
                          field.onChange(newDate);
                        }
                      } catch (error) {
                        console.error('Error setting date:', error);
                      }
                    };
                    
                    return (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date of Birth</FormLabel>
                        <div className="grid grid-cols-3 gap-2">
                          <Select
                            value={selectedYear.toString()}
                            onValueChange={(value) => handleDateChange(parseInt(value), undefined, undefined)}
                            disabled={!isEditing}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Year" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[200px]">
                              {years.map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <Select
                            value={selectedMonth.toString()}
                            onValueChange={(value) => handleDateChange(undefined, parseInt(value), undefined)}
                            disabled={!isEditing}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Month" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {months.map((month) => (
                                <SelectItem key={month.value} value={month.value.toString()}>
                                  {month.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <Select
                            value={selectedDay.toString()}
                            onValueChange={(value) => handleDateChange(undefined, undefined, parseInt(value))}
                            disabled={!isEditing}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Day" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[200px]">
                              {days.map((day) => (
                                <SelectItem key={day} value={day.toString()}>
                                  {day}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {field.value && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Selected: {format(field.value, "PPP")}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="sex"
                  render={({ field }) => {
                    const currentSex = watchedSex ?? field.value ?? '';
                    const sexValue = (currentSex === null || currentSex === undefined ? '' : String(currentSex)).toLowerCase();
                    const displaySex = sexValue === 'male' || sexValue === 'female' ? sexValue : '';
                    return (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <Select
                          key={`mca-sex-${targetUserId || user?.id || 'own'}-${displaySex || 'empty'}`}
                          onValueChange={(value) => field.onChange(value === '' ? null : value)}
                          value={displaySex}
                        >
                          <FormControl>
                            <SelectTrigger className="rounded-xl" disabled={!isEditing}>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="placeOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Place of Birth</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., London" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="countryOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country of Birth</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., United Kingdom" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nationality</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., British" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Contact Information Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-foreground">Contact Information</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="telephone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telephone</FormLabel>
                      <FormControl>
                        <Input placeholder="+44 20 1234 5678" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile</FormLabel>
                      <FormControl>
                        <Input placeholder="+44 7700 900123" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dischargeBookNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discharge book number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. R123456" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-foreground">Address</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="addressLine1"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Address Line 1</FormLabel>
                      <FormControl>
                        <Input placeholder="Street address" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressLine2"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Address Line 2</FormLabel>
                      <FormControl>
                        <Input placeholder="Apartment, suite, etc. (optional)" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressDistrict"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>District</FormLabel>
                      <FormControl>
                        <Input placeholder="District (optional)" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressTownCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Town/City *</FormLabel>
                      <FormControl>
                        <Input placeholder="Town or city" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressCountyState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>County/State</FormLabel>
                      <FormControl>
                        <Input placeholder="County or state (optional)" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressPostCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Post Code *</FormLabel>
                      <FormControl>
                        <Input placeholder="Post code" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressCountry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country *</FormLabel>
                      <FormControl>
                        <Input placeholder="Country" {...field} className="rounded-xl" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                * Required where marked (used for official applications and generated PDFs)
              </p>
              {isEditing ? (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving} variant="default" className="rounded-xl">
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save crew details
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
