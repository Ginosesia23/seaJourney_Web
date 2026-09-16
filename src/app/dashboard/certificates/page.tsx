'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, parse, addYears } from 'date-fns';
import {
  PlusCircle,
  Loader2,
  Edit,
  Trash2,
  Calendar,
  Upload,
  ScanSearch,
  FileText,
  X,
  ExternalLink,
  Target,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Certificate } from '@/lib/types';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import { useCrewVesselFeatureBoost } from '@/contexts/crew-vessel-feature-boost-context';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { cn } from '@/lib/utils';
import { bearerHeaders, downloadWithAuth } from '@/lib/applications/client';
import {
  CERTIFICATE_PRESET_CATEGORIES,
  type CertificatePreset,
} from '@/lib/certificates/presets';
import { useCertificateCatalog } from '@/hooks/use-certificate-catalog';
import { isCertificateStoragePath } from '@/lib/certificates/storage';
import { mapCertificateRow } from '@/lib/certificates/map';
import type { CareerCertificateGap } from '@/lib/applications/career-certificate-gaps';
import { certificateMatchesGap } from '@/lib/applications/career-certificate-gaps';
import { CareerCertificateGapsPanel } from '@/components/dashboard/career-certificate-gaps-panel';
import {
  CertificatesEmptyState,
  CertificatesLoadingState,
  CertificatesPageHeader,
  CertificatesSection,
  CertificatesStatTiles,
} from '@/components/dashboard/certificates-page-ui';
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

const certificateSchema = z
  .object({
    certificateName: z.string().min(1, 'Certificate name is required.'),
    certificateType: z.string().min(1, 'Certificate type is required.'),
    certificateNumber: z.string().optional(),
    issuingAuthority: z.string().optional(),
    issueDate: z.date({ required_error: 'Issue date is required.' }),
    expiryDate: z.date().optional().nullable(),
    renewalRequired: z.boolean().default(true),
    renewalNoticeDays: z
      .number()
      .min(1, 'Renewal notice days must be at least 1')
      .default(90),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.expiryDate) {
        return data.expiryDate >= data.issueDate;
      }
      return true;
    },
    {
      message: 'Expiry date must be after or equal to issue date',
      path: ['expiryDate'],
    },
  );

type CertificateFormValues = z.infer<typeof certificateSchema>;

const commonCertificateTypes = [
  'STCW',
  'Medical',
  'MCA',
  'USCG',
  'Radio',
  'Transport Canada',
  'Other',
];

function getCertificateStatus(certificate: Certificate) {
  if (!certificate.expiryDate) {
    return {
      status: 'no-expiry' as const,
      label: 'No Expiry',
      badgeClass: 'text-muted-foreground',
    };
  }

  const expiryDate = parse(certificate.expiryDate, 'yyyy-MM-dd', new Date());
  const daysUntilExpiry = differenceInDays(expiryDate, new Date());

  if (daysUntilExpiry < 0) {
    return {
      status: 'expired' as const,
      label: 'Expired',
      badgeClass: 'border-destructive/30 bg-destructive/10 text-destructive',
    };
  }
  if (daysUntilExpiry <= certificate.renewalNoticeDays) {
    return {
      status: 'expiring-soon' as const,
      label: 'Expiring Soon',
      badgeClass:
        'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    };
  }
  return {
    status: 'valid' as const,
    label: 'Valid',
    badgeClass:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  };
}

function parseYmd(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parse(value, 'yyyy-MM-dd', new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function CertificatesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formStep, setFormStep] = useState<'preset' | 'details'>('preset');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoadingCertificates, setIsLoadingCertificates] = useState(true);
  const [deleteCertificateId, setDeleteCertificateId] = useState<string | null>(null);
  const [issueDateCalendarOpen, setIssueDateCalendarOpen] = useState(false);
  const [expiryDateCalendarOpen, setExpiryDateCalendarOpen] = useState(false);
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [documentFileName, setDocumentFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [presetCategory, setPresetCategory] = useState<
    CertificatePreset['category'] | 'all'
  >('all');
  const [careerCertificateGaps, setCareerCertificateGaps] = useState<
    CareerCertificateGap[]
  >([]);
  const [careerNextMilestoneLabel, setCareerNextMilestoneLabel] = useState<
    string | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useUser();
  const { supabase, session } = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);

  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    'users',
    user?.id,
  );
  const { isEnabled: isFeatureEnabled, isLoading: isFlagsLoading } = useFeatureFlags();
  const {
    presets: certificatePresets,
    getById: getPresetById,
  } = useCertificateCatalog();

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    const subscriptionTier =
      (userProfileRaw as any).subscription_tier ||
      userProfileRaw.subscriptionTier ||
      'free';
    const subscriptionStatus =
      (userProfileRaw as any).subscription_status ||
      userProfileRaw.subscriptionStatus ||
      'inactive';
    return {
      ...userProfileRaw,
      role,
      subscriptionTier,
      subscriptionStatus,
    } as UserProfile;
  }, [userProfileRaw]);

  const hasPremiumAccess = isFeatureEnabled('certificates');
  const hasCareerProgressAccess = isFeatureEnabled('career_progress');

  useEffect(() => {
    if (!isLoadingProfile && !isFlagsLoading && userProfile && !hasPremiumAccess) {
      router.push('/dashboard');
    }
  }, [isLoadingProfile, isFlagsLoading, userProfile, hasPremiumAccess, router]);

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

  const selectedPreset = useMemo(
    () => certificatePresets.find((p) => p.id === selectedPresetId) || null,
    [certificatePresets, selectedPresetId],
  );

  const filteredPresets = useMemo(() => {
    if (presetCategory === 'all') return certificatePresets;
    return certificatePresets.filter((p) => p.category === presetCategory);
  }, [certificatePresets, presetCategory]);

  const certificateStats = useMemo(() => {
    let valid = 0;
    let expiring = 0;
    let expired = 0;
    for (const certificate of certificates) {
      const status = getCertificateStatus(certificate);
      if (status.status === 'expired') expired += 1;
      else if (status.status === 'expiring-soon') expiring += 1;
      else valid += 1;
    }
    return {
      total: certificates.length,
      valid,
      expiring,
      expired,
      gaps: careerCertificateGaps.length,
    };
  }, [certificates, careerCertificateGaps.length]);

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
          setCertificates((data || []).map((c) => mapCertificateRow(c)));
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

  const loadCareerCertificateGaps = React.useCallback(async () => {
    const token = session?.access_token;
    if (!token || !hasCareerProgressAccess) {
      setCareerCertificateGaps([]);
      setCareerNextMilestoneLabel(null);
      return;
    }
    try {
      const res = await fetch('/api/career/progress', {
        headers: bearerHeaders(token),
      });
      if (!res.ok) return;
      const json = await res.json();
      setCareerCertificateGaps(json.certificateGaps || []);
      setCareerNextMilestoneLabel(json.nextMilestone?.label ?? null);
    } catch {
      setCareerCertificateGaps([]);
      setCareerNextMilestoneLabel(null);
    }
  }, [session?.access_token, hasCareerProgressAccess]);

  useEffect(() => {
    void loadCareerCertificateGaps();
  }, [loadCareerCertificateGaps]);

  const applyPreset = (preset: CertificatePreset) => {
    setSelectedPresetId(preset.id);
    form.reset({
      certificateName: preset.id === 'other' ? '' : preset.name,
      certificateType: preset.type,
      certificateNumber: '',
      issuingAuthority: preset.issuingAuthority,
      issueDate: undefined,
      expiryDate: null,
      renewalRequired: preset.renewalRequired,
      renewalNoticeDays: preset.renewalNoticeDays,
      notes: '',
    });
    setDocumentPath(null);
    setDocumentFileName(null);
    setPendingFile(null);
    setFormStep('details');
  };

  // Deep-link from Apply: /dashboard/certificates?add=1&preset=stcw-bst
  useEffect(() => {
    if (!hasPremiumAccess || isLoadingProfile || deepLinkHandled.current) return;
    if (searchParams.get('add') !== '1') return;
    deepLinkHandled.current = true;

    const presetId = searchParams.get('preset');
    const preset = presetId ? getPresetById(presetId) : undefined;
    if (preset) {
      applyPreset(preset);
      setIsFormOpen(true);
    } else {
      const name = searchParams.get('name') || '';
      const type = searchParams.get('type') || '';
      setEditingCertificate(null);
      setSelectedPresetId(null);
      setFormStep('details');
      form.reset({
        certificateName: name,
        certificateType: type || 'Other',
        certificateNumber: '',
        issuingAuthority: '',
        issueDate: undefined,
        expiryDate: null,
        renewalRequired: true,
        renewalNoticeDays: 90,
        notes: '',
      });
      setDocumentPath(null);
      setDocumentFileName(null);
      setPendingFile(null);
      setIsFormOpen(true);
    }

    router.replace('/dashboard/certificates', { scroll: false });
  }, [
    hasPremiumAccess,
    isLoadingProfile,
    searchParams,
    router,
    form,
  ]);

  const handleOpenForm = (certificate?: Certificate) => {
    if (certificate) {
      setEditingCertificate(certificate);
      setFormStep('details');
      setSelectedPresetId(certificate.presetId || null);
      form.reset({
        certificateName: certificate.certificateName,
        certificateType: certificate.certificateType,
        certificateNumber: certificate.certificateNumber || '',
        issuingAuthority: certificate.issuingAuthority || '',
        issueDate: parse(certificate.issueDate, 'yyyy-MM-dd', new Date()),
        expiryDate: certificate.expiryDate
          ? parse(certificate.expiryDate, 'yyyy-MM-dd', new Date())
          : null,
        renewalRequired: certificate.renewalRequired,
        renewalNoticeDays: certificate.renewalNoticeDays,
        notes: certificate.notes || '',
      });
      setDocumentPath(certificate.documentUrl || null);
      setDocumentFileName(
        certificate.documentUrl
          ? certificate.documentUrl.split('/').pop() || 'certificate'
          : null,
      );
      setPendingFile(null);
    } else {
      setEditingCertificate(null);
      setFormStep('preset');
      setSelectedPresetId(null);
      setPresetCategory('all');
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
      setDocumentPath(null);
      setDocumentFileName(null);
      setPendingFile(null);
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingCertificate(null);
    setFormStep('preset');
    setSelectedPresetId(null);
    setDocumentPath(null);
    setDocumentFileName(null);
    setPendingFile(null);
    form.reset();
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (session?.access_token) return session.access_token;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const handleFilePicked = (file: File | null) => {
    if (!file) return;
    setPendingFile(file);
    setDocumentFileName(file.name);
  };

  const uploadPendingFile = async (): Promise<string | null> => {
    if (!pendingFile) return documentPath;
    const token = await getAccessToken();
    if (!token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in again to upload.',
        variant: 'destructive',
      });
      return null;
    }
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append('file', pendingFile);
      const res = await fetch('/api/certificates/upload', {
        method: 'POST',
        headers: bearerHeaders(token),
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Upload failed');
      }
      const path = (json as { path: string }).path;
      setDocumentPath(path);
      setPendingFile(null);
      return path;
    } finally {
      setIsUploading(false);
    }
  };

  const handleScanDates = async () => {
    const file = pendingFile;
    if (!file) {
      toast({
        title: 'Upload a copy first',
        description: 'Choose a PDF or photo of the certificate to scan.',
        variant: 'destructive',
      });
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in again to scan.',
        variant: 'destructive',
      });
      return;
    }

    setIsExtracting(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/certificates/extract', {
        method: 'POST',
        headers: bearerHeaders(token),
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Scan failed');
      }

      const extracted = (json as {
        extracted: {
          issueDate: string | null;
          expiryDate: string | null;
          certificateNumber: string | null;
          issuingAuthority: string | null;
          certificateName: string | null;
          confidence: string;
        };
      }).extracted;

      const issue = parseYmd(extracted.issueDate);
      const expiry = parseYmd(extracted.expiryDate);

      if (issue) form.setValue('issueDate', issue, { shouldValidate: true });
      if (expiry) form.setValue('expiryDate', expiry, { shouldValidate: true });
      if (extracted.certificateNumber) {
        form.setValue('certificateNumber', extracted.certificateNumber);
      }
      if (extracted.issuingAuthority && !form.getValues('issuingAuthority')) {
        form.setValue('issuingAuthority', extracted.issuingAuthority);
      }
      if (
        extracted.certificateName &&
        (!form.getValues('certificateName') || selectedPresetId === 'other')
      ) {
        form.setValue('certificateName', extracted.certificateName);
      }

      // Suggest expiry from typical validity when only issue date found
      if (issue && !expiry && selectedPreset?.typicalValidityYears) {
        form.setValue(
          'expiryDate',
          addYears(issue, selectedPreset.typicalValidityYears),
          { shouldValidate: true },
        );
      }

      const found =
        issue || expiry || extracted.certificateNumber || extracted.issuingAuthority;
      toast({
        title: found ? 'Dates extracted' : 'Nothing clear found',
        description: found
          ? `Review the fields below (confidence: ${extracted.confidence}). You can edit anything.`
          : 'Enter dates manually — the scan could not read clear dates from this file.',
      });
    } catch (error: any) {
      toast({
        title: 'Scan failed',
        description: error.message || 'Could not extract dates.',
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const suggestExpiryFromPreset = () => {
    const issue = form.getValues('issueDate');
    if (!issue || !selectedPreset?.typicalValidityYears) return;
    form.setValue('expiryDate', addYears(issue, selectedPreset.typicalValidityYears), {
      shouldValidate: true,
    });
  };

  const refreshList = async () => {
    if (!user?.id) return;
    const { data: updatedData, error: fetchError } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', user.id)
      .order('expiry_date', { ascending: true, nullsLast: true });

    if (!fetchError && updatedData) {
      setCertificates(updatedData.map((c) => mapCertRow(c)));
    }
  };

  const handleSubmit = async (data: CertificateFormValues) => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      let path = documentPath;
      if (pendingFile) {
        path = await uploadPendingFile();
        if (!path) {
          throw new Error('Failed to upload certificate copy');
        }
      }

      const certificateData = {
        user_id: user.id,
        certificate_name: data.certificateName,
        certificate_type: data.certificateType,
        preset_id:
          selectedPresetId && selectedPresetId !== 'other'
            ? selectedPresetId
            : null,
        certificate_number: data.certificateNumber || null,
        issuing_authority: data.issuingAuthority || null,
        issue_date: format(data.issueDate, 'yyyy-MM-dd'),
        expiry_date: data.expiryDate ? format(data.expiryDate, 'yyyy-MM-dd') : null,
        renewal_required: data.renewalRequired,
        renewal_notice_days: data.renewalNoticeDays,
        notes: data.notes || null,
        document_url: path || null,
      };

      if (editingCertificate) {
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
      await refreshList();
      await loadCareerCertificateGaps();
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

      setCertificates(certificates.filter((c) => c.id !== deleteCertificateId));
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

  const handleViewDocument = async (certificate: Certificate) => {
    if (!certificate.documentUrl) return;
    const url = certificate.documentUrl;
    if (!isCertificateStoragePath(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in again to view the file.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await downloadWithAuth(
        `/api/certificates/file?path=${encodeURIComponent(url)}`,
        token,
        certificate.certificateName || 'certificate',
      );
    } catch (e: any) {
      toast({
        title: 'Download failed',
        description: e.message || 'Could not open certificate copy.',
        variant: 'destructive',
      });
    }
  };

  if (isLoadingProfile) {
    return <CertificatesLoadingState />;
  }

  if (userProfile && !hasPremiumAccess) {
    return <CertificatesLoadingState />;
  }

  const addCertificateDialog = (
    <Dialog
      open={isFormOpen}
      onOpenChange={(open) => {
        if (!open) handleCloseForm();
        else setIsFormOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button onClick={() => handleOpenForm()} className="h-8 rounded-md text-xs">
          <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
          Add Certificate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-md">
        <DialogHeader>
          <DialogTitle>
            {editingCertificate
              ? 'Edit Certificate'
              : formStep === 'preset'
                ? 'Choose a certificate'
                : 'Certificate details'}
          </DialogTitle>
          <DialogDescription>
            {editingCertificate
              ? 'Update details, or replace the uploaded copy and re-scan dates.'
              : formStep === 'preset'
                ? 'Start from a common maritime certificate (STCW, EDH, ENG1, and more).'
                : 'Upload a copy if you have one, scan for dates, or enter them yourself.'}
          </DialogDescription>
        </DialogHeader>

        {!editingCertificate && formStep === 'preset' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={presetCategory === 'all' ? 'default' : 'outline'}
                className="h-7 rounded-md text-xs"
                onClick={() => setPresetCategory('all')}
              >
                All
              </Button>
              {CERTIFICATE_PRESET_CATEGORIES.map((cat) => (
                <Button
                  key={cat.id}
                  type="button"
                  size="sm"
                  variant={presetCategory === cat.id ? 'default' : 'outline'}
                  className="h-7 rounded-md text-xs"
                  onClick={() => setPresetCategory(cat.id)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
            <div className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {filteredPresets.map((preset) => {
                const presetGap = careerCertificateGaps.find(
                  (gap) => gap.presetId === preset.id,
                );
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'rounded-md border p-3 text-left transition-colors hover:bg-muted/60',
                      presetGap && 'border-amber-500/40 bg-amber-500/[0.04]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{preset.name}</div>
                      {presetGap ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 gap-0.5 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-900 dark:text-amber-100"
                        >
                          <Target className="h-3 w-3" />
                          Ticket
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {preset.description}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className="rounded-md text-[10px]">
                        {preset.type}
                      </Badge>
                      {preset.typicalValidityYears ? (
                        <Badge variant="secondary" className="rounded-md text-[10px]">
                          ~{preset.typicalValidityYears}y validity
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {!editingCertificate && (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-md text-xs"
                    onClick={() => setFormStep('preset')}
                  >
                    ← Change certificate type
                  </Button>
                  {selectedPreset && (
                    <Badge variant="outline" className="rounded-md">
                      {selectedPreset.name}
                    </Badge>
                  )}
                </div>
              )}

              <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Certificate copy</p>
                    <p className="text-xs text-muted-foreground">
                      PDF or photo — optional. Scan to fill issue and expiry dates.
                    </p>
                  </div>
                  {(documentPath || pendingFile) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setPendingFile(null);
                        setDocumentPath(null);
                        setDocumentFileName(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-md text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isExtracting}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {documentFileName || pendingFile ? 'Replace file' : 'Upload copy'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 rounded-md text-xs"
                    onClick={handleScanDates}
                    disabled={!pendingFile || isExtracting || isUploading}
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Scanning…
                      </>
                    ) : (
                      <>
                        <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
                        Scan for dates
                      </>
                    )}
                  </Button>
                </div>
                {(documentFileName || pendingFile) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {pendingFile?.name || documentFileName}
                      {pendingFile ? ' (will upload on save)' : ''}
                      {!pendingFile && documentPath ? ' (saved)' : ''}
                    </span>
                  </div>
                )}
                {!pendingFile && editingCertificate?.documentUrl && (
                  <p className="text-xs text-muted-foreground">
                    To scan dates again, choose a new file first.
                  </p>
                )}
              </div>

              <FormField
                control={form.control}
                name="certificateName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificate Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., STCW Basic Safety Training"
                        className="rounded-md"
                      />
                    </FormControl>
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
                        <SelectTrigger className="rounded-md">
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="certificateNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Certificate Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., CERT-12345"
                          {...field}
                          className="rounded-md"
                        />
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
                        <Input
                          placeholder="e.g., MCA, USCG"
                          {...field}
                          className="rounded-md"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Issue Date *</FormLabel>
                      <Popover
                        open={issueDateCalendarOpen}
                        onOpenChange={setIssueDateCalendarOpen}
                      >
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full rounded-md pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground',
                              )}
                            >
                              {field.value ? (
                                format(field.value, 'PPP')
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
                      <Popover
                        open={expiryDateCalendarOpen}
                        onOpenChange={setExpiryDateCalendarOpen}
                      >
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full rounded-md pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground',
                              )}
                            >
                              {field.value ? (
                                format(field.value, 'PPP')
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
                      {selectedPreset?.typicalValidityYears ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto justify-start p-0 text-xs"
                          onClick={suggestExpiryFromPreset}
                        >
                          Suggest expiry (+{selectedPreset.typicalValidityYears} years)
                        </Button>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value) || 90)
                          }
                          className="rounded-md"
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
                        className="rounded-md"
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
                  disabled={isSaving || isUploading}
                  className="h-8 rounded-md text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || isUploading || isExtracting}
                  className="h-8 rounded-md text-xs"
                >
                  {isSaving || isUploading ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      {isUploading ? 'Uploading…' : 'Saving…'}
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
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      <CertificatesPageHeader
        description="Pick a known certificate, upload a copy, and track issue and expiry dates."
        actions={addCertificateDialog}
      />

      <CertificatesStatTiles
        items={[
          {
            label: 'Total',
            value: certificateStats.total,
            hint: 'On file',
          },
          {
            label: 'Valid',
            value: certificateStats.valid,
            hint: 'In date',
            tone: 'emerald',
          },
          {
            label: 'Expiring soon',
            value: certificateStats.expiring,
            hint: 'Within notice window',
            tone: 'amber',
          },
          {
            label: 'Expired',
            value: certificateStats.expired,
            hint:
              certificateStats.gaps > 0
                ? `${certificateStats.gaps} career gap${certificateStats.gaps === 1 ? '' : 's'}`
                : 'Past expiry',
            tone: 'destructive',
          },
        ]}
      />

      {careerCertificateGaps.length > 0 ? (
        <CareerCertificateGapsPanel
          gaps={careerCertificateGaps}
          nextMilestoneLabel={careerNextMilestoneLabel}
        />
      ) : null}

      {isLoadingCertificates ? (
        <CertificatesSection title="Your certificates" flush>
          <CertificatesLoadingState />
        </CertificatesSection>
      ) : certificates.length === 0 ? (
        <CertificatesSection title="Your certificates" flush>
          <CertificatesEmptyState
            title="No certificates yet"
            description="Choose STCW, EDH, ENG1, or another preset, upload a copy, and track expiry dates."
            action={
              <Button
                onClick={() => handleOpenForm()}
                className="h-8 rounded-md text-xs"
              >
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                Add your first certificate
              </Button>
            }
          />
        </CertificatesSection>
      ) : (
        <CertificatesSection
          title="Your certificates"
          description="Track expiration dates and renewal requirements for all your certificates."
          flush
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-medium">
                    Certificate
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-medium">
                    Type
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-medium">
                    Issue Date
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-medium">
                    Expiry Date
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-[11px] font-medium">
                    Status
                  </TableHead>
                  <TableHead className="h-9 bg-muted/40 text-right text-[11px] font-medium">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((certificate) => {
                  const status = getCertificateStatus(certificate);
                  const careerGap = careerCertificateGaps.find((gap) =>
                    certificateMatchesGap(
                      {
                        certificateName: certificate.certificateName,
                        certificateType: certificate.certificateType,
                        presetId: certificate.presetId,
                      },
                      gap,
                    ),
                  );
                  const daysUntilExpiry = certificate.expiryDate
                    ? differenceInDays(
                        parse(certificate.expiryDate, 'yyyy-MM-dd', new Date()),
                        new Date(),
                      )
                    : null;

                  return (
                    <TableRow key={certificate.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {certificate.certificateName}
                            {certificate.documentUrl ? (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : null}
                            {careerGap ? (
                              <Badge
                                variant="outline"
                                className="gap-1 rounded-md border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-800 dark:text-amber-200"
                                title={careerGap.detail}
                              >
                                <Target className="h-3 w-3" />
                                {careerGap.certificateStatus === 'expired' ||
                                careerGap.certificateStatus === 'expiring_soon'
                                  ? `Renew for ${careerGap.milestoneLabels[0] || 'next ticket'}`
                                  : `Needed for ${careerGap.milestoneLabels[0] || 'next ticket'}`}
                              </Badge>
                            ) : null}
                          </div>
                          {certificate.certificateNumber && (
                            <div className="text-xs text-muted-foreground">
                              #{certificate.certificateNumber}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-md text-[10px]">
                          {certificate.certificateType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {format(
                          parse(certificate.issueDate, 'yyyy-MM-dd', new Date()),
                          'MMM d, yyyy',
                        )}
                      </TableCell>
                      <TableCell>
                        {certificate.expiryDate ? (
                          <div>
                            <div className="text-xs tabular-nums">
                              {format(
                                parse(
                                  certificate.expiryDate,
                                  'yyyy-MM-dd',
                                  new Date(),
                                ),
                                'MMM d, yyyy',
                              )}
                            </div>
                            {daysUntilExpiry !== null && (
                              <div
                                className={cn(
                                  'text-[11px]',
                                  daysUntilExpiry < 0 && 'text-destructive',
                                  daysUntilExpiry > 0 &&
                                    daysUntilExpiry <=
                                      certificate.renewalNoticeDays &&
                                    'text-amber-600',
                                  daysUntilExpiry >
                                    certificate.renewalNoticeDays &&
                                    'text-muted-foreground',
                                )}
                              >
                                {daysUntilExpiry < 0
                                  ? `${Math.abs(daysUntilExpiry)} days ago`
                                  : `${daysUntilExpiry} days left`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No expiry
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('rounded-md text-[10px]', status.badgeClass)}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {certificate.documentUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDocument(certificate)}
                              className="h-8 w-8 p-0"
                              title="Download copy"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          ) : null}
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
          </div>
        </CertificatesSection>
      )}

      <AlertDialog
        open={!!deleteCertificateId}
        onOpenChange={(open) => !open && setDeleteCertificateId(null)}
      >
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Certificate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this certificate? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 rounded-md text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="h-8 rounded-md bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
