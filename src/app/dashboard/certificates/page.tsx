'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, parse, isAfter, isBefore, isPast, isFuture } from 'date-fns';
import { PlusCircle, Loader2, Award, AlertTriangle, CheckCircle2, XCircle, Edit, Trash2, Calendar, FileText, Bell } from 'lucide-react';
import Link from 'next/link';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Certificate } from '@/lib/types';
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

const certificateSchema = z.object({
  certificateName: z.string().min(1, 'Certificate name is required.'),
  certificateType: z.string().min(1, 'Certificate type is required.'),
  certificateNumber: z.string().optional(),
  issuingAuthority: z.string().optional(),
  issueDate: z.date({ required_error: 'Issue date is required.' }),
  expiryDate: z.date().optional().nullable(),
  renewalRequired: z.boolean().default(true),
  renewalNoticeDays: z.number().min(1, 'Renewal notice days must be at least 1').default(90),
  notes: z.string().optional(),
}).refine((data) => {
  if (data.expiryDate) {
    return data.expiryDate >= data.issueDate;
  }
  return true;
}, {
  message: "Expiry date must be after or equal to issue date",
  path: ["expiryDate"],
});

type CertificateFormValues = z.infer<typeof certificateSchema>;

// Common certificate types for quick selection
const commonCertificateTypes = [
  'STCW',
  'Medical',
  'MCA',
  'USCG',
  'Transport Canada',
  'Other',
];

// Common certificate names
const commonCertificateNames = [
  'STCW Basic Safety Training',
  'STCW Security Awareness',
  'STCW Proficiency in Survival Craft',
  'STCW Advanced Fire Fighting',
  'Medical Certificate',
  'Watch Rating Certificate',
  'Officer of the Watch (OOW)',
  'Chief Mate',
  'Master',
  'GMDSS',
  'ECDIS',
  'Other',
];

export default function CertificatesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoadingCertificates, setIsLoadingCertificates] = useState(true);
  const [deleteCertificateId, setDeleteCertificateId] = useState<string | null>(null);
  const [issueDateCalendarOpen, setIssueDateCalendarOpen] = useState(false);
  const [expiryDateCalendarOpen, setExpiryDateCalendarOpen] = useState(false);

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

  // Check if user has premium access
  const hasPremiumAccess = useMemo(() => {
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
    if (!isLoadingProfile && userProfile && !hasPremiumAccess) {
      router.push('/dashboard');
    }
  }, [isLoadingProfile, userProfile, hasPremiumAccess, router]);

  const form = useForm<CertificateFormValues>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      certificateName: '',
      certificateType: '',
      certificateNumber: '',
      issuingAuthority: '',
      issueDate: undefined,
      expiryDate: null,
      renewalRequired: true,
      renewalNoticeDays: 90,
      notes: '',
    },
  });

  // Fetch certificates - only if user has premium access
  useEffect(() => {
    if (!user?.id || !hasPremiumAccess) {
      setIsLoadingCertificates(false);
      return;
    }

    const fetchCertificates = async () => {
      setIsLoadingCertificates(true);
      try {
        const { data, error } = await supabase
          .from('certificates')
          .select('*')
          .eq('user_id', user.id)
          .order('expiry_date', { ascending: true, nullsLast: true });

        if (error) {
          console.error('[CERTIFICATES] Error fetching certificates:', error);
          toast({
            title: 'Error',
            description: 'Failed to load certificates.',
            variant: 'destructive',
          });
          setCertificates([]);
        } else {
          // Transform data from snake_case to camelCase
          const transformedCertificates: Certificate[] = (data || []).map((cert: any) => ({
            id: cert.id,
            userId: cert.user_id,
            certificateName: cert.certificate_name,
            certificateType: cert.certificate_type,
            certificateNumber: cert.certificate_number || null,
            issuingAuthority: cert.issuing_authority || null,
            issueDate: cert.issue_date,
            expiryDate: cert.expiry_date || null,
            renewalRequired: cert.renewal_required ?? true,
            renewalNoticeDays: cert.renewal_notice_days ?? 90,
            notes: cert.notes || null,
            documentUrl: cert.document_url || null,
            createdAt: cert.created_at,
            updatedAt: cert.updated_at,
          }));
        setCertificates(transformedCertificates);
      }
    } catch (error) {
      console.error('[CERTIFICATES] Exception fetching certificates:', error);
      setCertificates([]);
    } finally {
      setIsLoadingCertificates(false);
    }
  };

  fetchCertificates();
  }, [user?.id, hasPremiumAccess, supabase, toast]);

  const handleOpenForm = (certificate?: Certificate) => {
    if (certificate) {
      setEditingCertificate(certificate);
      form.reset({
        certificateName: certificate.certificateName,
        certificateType: certificate.certificateType,
        certificateNumber: certificate.certificateNumber || '',
        issuingAuthority: certificate.issuingAuthority || '',
        issueDate: parse(certificate.issueDate, 'yyyy-MM-dd', new Date()),
        expiryDate: certificate.expiryDate ? parse(certificate.expiryDate, 'yyyy-MM-dd', new Date()) : null,
        renewalRequired: certificate.renewalRequired,
        renewalNoticeDays: certificate.renewalNoticeDays,
        notes: certificate.notes || '',
      });
    } else {
      setEditingCertificate(null);
      form.reset({
        certificateName: '',
        certificateType: '',
        certificateNumber: '',
        issuingAuthority: '',
        issueDate: undefined,
        expiryDate: null,
        renewalRequired: true,
        renewalNoticeDays: 90,
        notes: '',
      });
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingCertificate(null);
    form.reset();
  };

  const handleSubmit = async (data: CertificateFormValues) => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      const certificateData = {
        user_id: user.id,
        certificate_name: data.certificateName,
        certificate_type: data.certificateType,
        certificate_number: data.certificateNumber || null,
        issuing_authority: data.issuingAuthority || null,
        issue_date: format(data.issueDate, 'yyyy-MM-dd'),
        expiry_date: data.expiryDate ? format(data.expiryDate, 'yyyy-MM-dd') : null,
        renewal_required: data.renewalRequired,
        renewal_notice_days: data.renewalNoticeDays,
        notes: data.notes || null,
      };

      if (editingCertificate) {
        // Update existing certificate
        const { error } = await supabase
          .from('certificates')
          .update(certificateData)
          .eq('id', editingCertificate.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Certificate updated successfully.',
        });
      } else {
        // Create new certificate
        const { error } = await supabase
          .from('certificates')
          .insert(certificateData);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Certificate added successfully.',
        });
      }

      handleCloseForm();
      
      // Refresh certificates list
      const { data: updatedData, error: fetchError } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', user.id)
        .order('expiry_date', { ascending: true, nullsLast: true });

      if (!fetchError && updatedData) {
        const transformedCertificates: Certificate[] = updatedData.map((cert: any) => ({
          id: cert.id,
          userId: cert.user_id,
          certificateName: cert.certificate_name,
          certificateType: cert.certificate_type,
          certificateNumber: cert.certificate_number || null,
          issuingAuthority: cert.issuing_authority || null,
          issueDate: cert.issue_date,
          expiryDate: cert.expiry_date || null,
          renewalRequired: cert.renewal_required ?? true,
          renewalNoticeDays: cert.renewal_notice_days ?? 90,
          notes: cert.notes || null,
          documentUrl: cert.document_url || null,
          createdAt: cert.created_at,
          updatedAt: cert.updated_at,
        }));
        setCertificates(transformedCertificates);
      }
    } catch (error: any) {
      console.error('[CERTIFICATES] Error saving certificate:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save certificate.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCertificateId || !user?.id) return;

    try {
      const { error } = await supabase
        .from('certificates')
        .delete()
        .eq('id', deleteCertificateId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Certificate deleted successfully.',
      });

      setCertificates(certificates.filter(c => c.id !== deleteCertificateId));
      setDeleteCertificateId(null);
    } catch (error: any) {
      console.error('[CERTIFICATES] Error deleting certificate:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete certificate.',
        variant: 'destructive',
      });
    }
  };

  // Calculate certificate status
  const getCertificateStatus = (certificate: Certificate) => {
    if (!certificate.expiryDate) {
      return { status: 'no-expiry', label: 'No Expiry', color: 'bg-gray-500' };
    }

    const expiryDate = parse(certificate.expiryDate, 'yyyy-MM-dd', new Date());
    const daysUntilExpiry = differenceInDays(expiryDate, new Date());

    if (daysUntilExpiry < 0) {
      return { status: 'expired', label: 'Expired', color: 'bg-red-500' };
    } else if (daysUntilExpiry <= certificate.renewalNoticeDays) {
      return { status: 'expiring-soon', label: 'Expiring Soon', color: 'bg-orange-500' };
    } else {
      return { status: 'valid', label: 'Valid', color: 'bg-green-500' };
    }
  };

  // Show loading while checking premium access or redirecting
  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show loading while redirecting non-premium users
  if (userProfile && !hasPremiumAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Certificate Tracking</h1>
          <p className="text-muted-foreground mt-1">
            Track your maritime certificates and get expiration alerts
          </p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenForm()} className="rounded-xl">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Certificate
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCertificate ? 'Edit Certificate' : 'Add New Certificate'}
              </DialogTitle>
              <DialogDescription>
                {editingCertificate 
                  ? 'Update your certificate information below.'
                  : 'Add a new certificate to track its expiration and renewal dates.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="certificateName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Certificate Name *</FormLabel>
                      <FormControl>
                        <Select 
                          onValueChange={(value) => {
                            if (value === 'other') {
                              // If "Other" is selected, don't set value yet
                              return;
                            }
                            field.onChange(value);
                          }} 
                          value={commonCertificateNames.includes(field.value || '') ? field.value : undefined}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Select certificate name" />
                          </SelectTrigger>
                          <SelectContent>
                            {commonCertificateNames.map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                            <SelectItem value="other">Other (enter manually)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      {(!field.value || !commonCertificateNames.includes(field.value)) && (
                        <Input
                          {...field}
                          placeholder="Enter certificate name"
                          className="rounded-xl mt-2"
                          value={field.value || ''}
                        />
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="certificateType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Certificate Type *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Select certificate type" />
                          </SelectTrigger>
                          <SelectContent>
                            {commonCertificateTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="certificateNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certificate Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., CERT-12345" {...field} className="rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="issuingAuthority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Issuing Authority</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., MCA, USCG" {...field} className="rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="issueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Issue Date *</FormLabel>
                        <Popover open={issueDateCalendarOpen} onOpenChange={setIssueDateCalendarOpen}>
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
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date);
                                setIssueDateCalendarOpen(false);
                              }}
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
                    name="expiryDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Expiry Date</FormLabel>
                        <Popover open={expiryDateCalendarOpen} onOpenChange={setExpiryDateCalendarOpen}>
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
                                  <span>Pick a date (optional)</span>
                                )}
                                <Calendar className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={(date) => {
                                field.onChange(date);
                                setExpiryDateCalendarOpen(false);
                              }}
                              disabled={(date) => {
                                const issueDate = form.watch('issueDate');
                                return issueDate ? date < issueDate : false;
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="renewalRequired"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Renewal Required</FormLabel>
                          <FormDescription>
                            Check if this certificate requires renewal
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="renewalNoticeDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Renewal Notice (Days)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            placeholder="90"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 90)}
                            className="rounded-xl"
                          />
                        </FormControl>
                        <FormDescription>
                          Days before expiry to send renewal notice
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes about this certificate..."
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
                    onClick={handleCloseForm}
                    disabled={isSaving}
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
                        {editingCertificate ? 'Update' : 'Add'} Certificate
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoadingCertificates ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : certificates.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Certificates</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Start tracking your certificates by adding your first one.
            </p>
            <Button onClick={() => handleOpenForm()} className="rounded-xl">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Your First Certificate
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Your Certificates</CardTitle>
            <CardDescription>
              Track expiration dates and renewal requirements for all your certificates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((certificate) => {
                  const status = getCertificateStatus(certificate);
                  const daysUntilExpiry = certificate.expiryDate
                    ? differenceInDays(parse(certificate.expiryDate, 'yyyy-MM-dd', new Date()), new Date())
                    : null;

                  return (
                    <TableRow key={certificate.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{certificate.certificateName}</div>
                          {certificate.certificateNumber && (
                            <div className="text-xs text-muted-foreground">
                              #{certificate.certificateNumber}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-lg">
                          {certificate.certificateType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(parse(certificate.issueDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {certificate.expiryDate ? (
                          <div>
                            <div>{format(parse(certificate.expiryDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}</div>
                            {daysUntilExpiry !== null && (
                              <div className={cn(
                                "text-xs",
                                daysUntilExpiry < 0 && "text-red-500",
                                daysUntilExpiry > 0 && daysUntilExpiry <= certificate.renewalNoticeDays && "text-orange-500",
                                daysUntilExpiry > certificate.renewalNoticeDays && "text-muted-foreground"
                              )}>
                                {daysUntilExpiry < 0 
                                  ? `${Math.abs(daysUntilExpiry)} days ago`
                                  : `${daysUntilExpiry} days left`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No expiry</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("rounded-lg", status.color)}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenForm(certificate)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteCertificateId(certificate.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteCertificateId} onOpenChange={(open) => !open && setDeleteCertificateId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Certificate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this certificate? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
