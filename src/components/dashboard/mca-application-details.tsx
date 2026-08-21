'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import {
  Dialog,
} from '@/components/ui/dialog';
import { SeaDialogContent, SeaDialogHeader, SeaDialogBody, SeaDialogFooter } from '@/components/ui/sea-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit, Save, FileCheck, Plus, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parse, getYear, getMonth, getDate, setYear, setMonth, setDate, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

/** Fields required for vessel-generated PDFs / applications. */
const PDF_REQUIRED_LABELS = [
  'Date of birth',
  'Nationality',
  'Address line 1',
  'Town / city',
  'Post code',
  'Country',
] as const;

type FactRow = { label: string; value: string };

function buildOfficialDetailsSummary(profile: MCAFormProfile | null): {
  personal: FactRow[];
  contact: FactRow[];
  addressLines: string[];
  filledRequired: number;
  missingRequired: string[];
  hasAny: boolean;
} {
  if (!profile) {
    return {
      personal: [],
      contact: [],
      addressLines: [],
      filledRequired: 0,
      missingRequired: [...PDF_REQUIRED_LABELS],
      hasAny: false,
    };
  }

  const personalAll: FactRow[] = [
    { label: 'Title', value: (profile.title || '').trim() },
    {
      label: 'Date of birth',
      value:
        profile.dateOfBirth && isValid(profile.dateOfBirth)
          ? format(profile.dateOfBirth, 'd MMM yyyy')
          : '',
    },
    {
      label: 'Gender',
      value: profile.sex === 'male' ? 'Male' : profile.sex === 'female' ? 'Female' : '',
    },
    { label: 'Place of birth', value: (profile.placeOfBirth || '').trim() },
    { label: 'Country of birth', value: (profile.countryOfBirth || '').trim() },
    { label: 'Nationality', value: (profile.nationality || '').trim() },
  ];
  const contactAll: FactRow[] = [
    { label: 'Telephone', value: (profile.telephone || '').trim() },
    { label: 'Mobile', value: (profile.mobile || '').trim() },
    { label: 'Discharge book', value: (profile.dischargeBookNumber || '').trim() },
  ];
  const addressParts = [
    profile.addressLine1,
    profile.addressLine2,
    profile.addressDistrict,
    [profile.addressTownCity, profile.addressCountyState].filter(Boolean).join(', '),
    profile.addressPostCode,
    profile.addressCountry,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean);

  const requiredChecks: { label: (typeof PDF_REQUIRED_LABELS)[number]; ok: boolean }[] = [
    {
      label: 'Date of birth',
      ok: !!(profile.dateOfBirth && isValid(profile.dateOfBirth)),
    },
    { label: 'Nationality', ok: !!(profile.nationality || '').trim() },
    { label: 'Address line 1', ok: !!(profile.addressLine1 || '').trim() },
    { label: 'Town / city', ok: !!(profile.addressTownCity || '').trim() },
    { label: 'Post code', ok: !!(profile.addressPostCode || '').trim() },
    { label: 'Country', ok: !!(profile.addressCountry || '').trim() },
  ];
  const missingRequired = requiredChecks.filter((c) => !c.ok).map((c) => c.label);
  const personal = personalAll.filter((f) => f.value);
  const contact = contactAll.filter((f) => f.value);

  return {
    personal,
    contact,
    addressLines: addressParts,
    filledRequired: requiredChecks.length - missingRequired.length,
    missingRequired,
    hasAny: personal.length > 0 || contact.length > 0 || addressParts.length > 0,
  };
}

function FactColumn({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: FactRow[];
  emptyLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{emptyLabel || '—'}</p>
      ) : (
        <dl className="mt-1.5 space-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.label}</dt>
              <dd className="truncate text-sm font-medium leading-snug text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
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
  /** When true (crew mode), expand the official-details summary on mount. Default: collapsed. */
  defaultDetailsOpen?: boolean;
}

export function MCAApplicationDetailsCard(props?: MCAApplicationDetailsCardProps) {
  const {
    targetUserId,
    initialProfile,
    initialProfileRaw,
    onSaved,
    defaultDetailsOpen = false,
  } = props || {};
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
  /** Crew profile view: official details panel starts collapsed unless overridden. */
  const [detailsOpen, setDetailsOpen] = useState(defaultDetailsOpen);
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

  const summary = buildOfficialDetailsSummary(userProfile);

  const formFields = (
            <>
            {/* Personal Information Section */}
            <div className="space-y-3">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Personal</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                            <SelectTrigger disabled={!isEditing}>
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
                        <FormLabel>Date of Birth *</FormLabel>
                        <div className="grid grid-cols-3 gap-2">
                          <Select
                            value={selectedYear.toString()}
                            onValueChange={(value) => handleDateChange(parseInt(value), undefined, undefined)}
                            disabled={!isEditing}
                          >
                            <FormControl>
                              <SelectTrigger>
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
                              <SelectTrigger>
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
                              <SelectTrigger>
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
                          <p className="mt-1 text-xs text-muted-foreground">
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
                            <SelectTrigger disabled={!isEditing}>
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
                        <Input placeholder="e.g., London" {...field} disabled={!isEditing} />
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
                        <Input placeholder="e.g., United Kingdom" {...field} disabled={!isEditing} />
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
                      <FormLabel>Nationality *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., British" {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contact</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="telephone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telephone</FormLabel>
                      <FormControl>
                        <Input placeholder="+44 20 1234 5678" {...field} disabled={!isEditing} />
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
                        <Input placeholder="+44 7700 900123" {...field} disabled={!isEditing} />
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
                        <Input placeholder="e.g. R123456" {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Address</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="addressLine1"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Address Line 1 *</FormLabel>
                      <FormControl>
                        <Input placeholder="Street address" {...field} disabled={!isEditing} />
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
                        <Input placeholder="Apartment, suite, etc. (optional)" {...field} disabled={!isEditing} />
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
                        <Input placeholder="District (optional)" {...field} disabled={!isEditing} />
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
                        <Input placeholder="Town or city" {...field} disabled={!isEditing} />
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
                        <Input placeholder="County or state (optional)" {...field} disabled={!isEditing} />
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
                        <Input placeholder="Post code" {...field} disabled={!isEditing} />
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
                        <Input placeholder="Country" {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            </>
  );

  if (isCrewMode) {
    const complete = summary.missingRequired.length === 0;
    return (
      <>
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-4 py-3 sm:px-5">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring -mx-1 px-1 py-0.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                      <FileCheck className="h-3.5 w-3.5 shrink-0" />
                      Documents
                    </div>
                    <h3 className="mt-0.5 text-sm font-semibold tracking-tight">Official details</h3>
                    {!detailsOpen && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {complete
                          ? 'Ready for PDF generation — expand to review'
                          : summary.hasAny
                            ? `${summary.missingRequired.length} field${summary.missingRequired.length === 1 ? '' : 's'} still needed`
                            : 'Collapsed · add details when generating documents'}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                      detailsOpen && 'rotate-180',
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    'rounded-md font-mono text-[10px] uppercase tracking-wider',
                    complete
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-400',
                  )}
                >
                  {summary.filledRequired}/{PDF_REQUIRED_LABELS.length} PDF ready
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant={summary.hasAny ? 'outline' : 'default'}
                  className="rounded-lg"
                  onClick={() => setIsEditing(true)}
                >
                  {summary.hasAny ? (
                    <>
                      <Edit className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add details
                    </>
                  )}
                </Button>
              </div>
            </div>

            <CollapsibleContent>
              {!summary.hasAny ? (
                <div className="border-t px-4 py-4 sm:px-5">
                  <p className="text-sm text-muted-foreground">
                    No MCA / AMSA details on file yet. Add them once — they fill vessel-generated documents.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 border-t px-4 py-3 sm:grid-cols-3 sm:px-5">
                  <FactColumn title="Personal" rows={summary.personal} emptyLabel="Nothing set" />
                  <FactColumn title="Contact" rows={summary.contact} emptyLabel="Nothing set" />
                  <div className="min-w-0">
                    <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Address
                    </h4>
                    {summary.addressLines.length === 0 ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">Nothing set</p>
                    ) : (
                      <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">
                        {summary.addressLines.map((line, i) => (
                          <span key={`${line}-${i}`} className="block">
                            {line}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {summary.missingRequired.length > 0 && (
                <div className="border-t bg-amber-500/5 px-4 py-2.5 sm:px-5">
                  <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Still needed for PDFs:</span>{' '}
                    {summary.missingRequired.join(' · ')}
                  </p>
                </div>
              )}
            </CollapsibleContent>
          </section>
        </Collapsible>

        <Dialog
          open={isEditing}
          onOpenChange={(open) => {
            if (!open) handleCancelEdit();
            else setIsEditing(true);
          }}
        >
          <SeaDialogContent size="lg" className="flex max-h-[90vh] flex-col">
            <SeaDialogHeader
              icon={FileCheck}
              eyebrow="Official details"
              title="Edit crew details"
              description="Used for AMSA, MCA, Nav Watch, and other vessel-generated documents."
            />
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex min-h-0 flex-1 flex-col"
              >
                <SeaDialogBody className="space-y-4">
                  {formFields}
                </SeaDialogBody>
                <SeaDialogFooter>
                  <Button type="button" variant="outline" className="rounded-lg" onClick={handleCancelEdit} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" className="rounded-lg" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save details
                      </>
                    )}
                  </Button>
                </SeaDialogFooter>
              </form>
            </Form>
          </SeaDialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card className="rounded-xl border shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold tracking-tight">
              Official details
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              Used to fill PDFs and applications (DOB, address, discharge book).
            </CardDescription>
          </div>
          {!isEditing ? (
            <Button type="button" onClick={() => setIsEditing(true)} size="sm" className="rounded-lg shrink-0">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
          Save once — SeaJourney reuses these fields whenever you generate official documents.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {formFields}
            <div className="flex flex-col items-start justify-between gap-4 border-t pt-4 sm:flex-row sm:items-center">
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
