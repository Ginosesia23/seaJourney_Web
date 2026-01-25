'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { updateUserProfile } from '@/supabase/database/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Info, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parse } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
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
});

type MCAApplicationFormValues = z.infer<typeof mcaApplicationSchema>;

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

export function MCAApplicationDetailsCard() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading } = useDoc('users', user?.id);

  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const dateOfBirthRaw = (userProfileRaw as any).date_of_birth || (userProfileRaw as any).dateOfBirth;
    const dateOfBirth = dateOfBirthRaw ? parse(dateOfBirthRaw, 'yyyy-MM-dd', new Date()) : null;
    
    return {
      ...userProfileRaw,
      title: (userProfileRaw as any).title || '',
      dateOfBirth: dateOfBirth,
      sex: (userProfileRaw as any).sex || (userProfileRaw as any).gender || null,
      placeOfBirth: (userProfileRaw as any).place_of_birth || (userProfileRaw as any).placeOfBirth || '',
      countryOfBirth: (userProfileRaw as any).country_of_birth || (userProfileRaw as any).countryOfBirth || '',
      nationality: (userProfileRaw as any).nationality || '',
      telephone: (userProfileRaw as any).telephone || '',
      mobile: (userProfileRaw as any).mobile || '',
      addressLine1: (userProfileRaw as any).address_line1 || (userProfileRaw as any).addressLine1 || '',
      addressLine2: (userProfileRaw as any).address_line2 || (userProfileRaw as any).addressLine2 || '',
      addressDistrict: (userProfileRaw as any).address_district || (userProfileRaw as any).addressDistrict || '',
      addressTownCity: (userProfileRaw as any).address_town_city || (userProfileRaw as any).addressTownCity || '',
      addressCountyState: (userProfileRaw as any).address_county_state || (userProfileRaw as any).addressCountyState || '',
      addressPostCode: (userProfileRaw as any).address_post_code || (userProfileRaw as any).addressPostCode || '',
      addressCountry: (userProfileRaw as any).address_country || (userProfileRaw as any).addressCountry || '',
    };
  }, [userProfileRaw]);

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
    },
  });

  // Update form values when userProfile loads or changes
  useEffect(() => {
    if (userProfile && !isLoading) {
      form.reset({
        title: userProfile.title || '',
        dateOfBirth: (userProfile as any).dateOfBirth || null,
        sex: (userProfile as any).sex || null,
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
      });
    }
  }, [userProfile, isLoading, form]);

  const onSubmit = async (data: MCAApplicationFormValues) => {
    if (!user?.id) return;
    setIsSaving(true);
    
    try {
      // Update user profile with MCA fields
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
        })
        .eq('id', user.id);

      if (error) {
        throw error;
      }
      
      toast({
        title: 'MCA Details Updated',
        description: 'Your MCA application details have been saved successfully.',
      });
    } catch (error: any) {
      console.error('Error updating MCA details:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update MCA details. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <MCASkeleton />;
  }

  return (
    <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <FileText className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-xl">MCA Application Details</CardTitle>
            <CardDescription className="mt-1">
              Save your details to auto-populate MCA Watch Rating Certificate applications
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Why save these details?
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                These details will be automatically filled in when you generate MCA Watch Rating Certificate applications, 
                saving you time and ensuring accuracy.
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
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
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
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date of Birth</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal rounded-xl",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <Calendar className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) => date > new Date()}
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
                  name="sex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === '' ? null : value)} 
                        value={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
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
                  )}
                />
                <FormField
                  control={form.control}
                  name="placeOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Place of Birth</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., London" {...field} className="rounded-xl" />
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
                        <Input placeholder="e.g., United Kingdom" {...field} className="rounded-xl" />
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
                        <Input placeholder="e.g., British" {...field} className="rounded-xl" />
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
                        <Input placeholder="+44 20 1234 5678" {...field} className="rounded-xl" />
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
                        <Input placeholder="+44 7700 900123" {...field} className="rounded-xl" />
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
                        <Input placeholder="Street address" {...field} className="rounded-xl" />
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
                        <Input placeholder="Apartment, suite, etc. (optional)" {...field} className="rounded-xl" />
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
                        <Input placeholder="District (optional)" {...field} className="rounded-xl" />
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
                        <Input placeholder="Town or city" {...field} className="rounded-xl" />
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
                        <Input placeholder="County or state (optional)" {...field} className="rounded-xl" />
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
                        <Input placeholder="Post code" {...field} className="rounded-xl" />
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
                        <Input placeholder="Country" {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                * Required fields for MCA applications
              </p>
              <Button type="submit" disabled={isSaving} variant="default" className="rounded-xl">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save MCA Details'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
