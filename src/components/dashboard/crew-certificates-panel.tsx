'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parse, differenceInDays, addYears } from 'date-fns';
import {
  Award,
  Calendar,
  Edit,
  ExternalLink,
  FileText,
  Loader2,
  PlusCircle,
  ScanSearch,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { bearerHeaders, downloadWithAuth } from '@/lib/applications/client';
import {
  CERTIFICATE_PRESET_CATEGORIES,
  type CertificatePreset,
} from '@/lib/certificates/presets';
import { mapCertificateRow } from '@/lib/certificates/map';
import { isCertificateStoragePath } from '@/lib/certificates/storage';
import { useCertificateCatalog } from '@/hooks/use-certificate-catalog';
import type { Certificate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/supabase';
import { useToast } from '@/hooks/use-toast';
import { notifyCrewOfDocumentCreated } from '@/lib/notify-crew-document-created';

const certificateSchema = z
  .object({
    certificateName: z.string().min(1, 'Certificate name is required.'),
    certificateType: z.string().min(1, 'Certificate type is required.'),
    certificateNumber: z.string().optional(),
    issuingAuthority: z.string().optional(),
    issueDate: z.date({ required_error: 'Issue date is required.' }),
    expiryDate: z.date().optional().nullable(),
    renewalNoticeDays: z.number().min(1).default(90),
  })
  .refine(
    (data) => !data.expiryDate || data.expiryDate >= data.issueDate,
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

function parseYmd(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parse(value, 'yyyy-MM-dd', new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

function certStatus(certificate: Certificate) {
  if (!certificate.expiryDate) {
    return { label: 'No Expiry', className: 'text-muted-foreground' };
  }
  const expiryDate = parse(certificate.expiryDate, 'yyyy-MM-dd', new Date());
  const days = differenceInDays(expiryDate, new Date());
  if (days < 0) {
    return {
      label: 'Expired',
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    };
  }
  if (days <= certificate.renewalNoticeDays) {
    return {
      label: 'Expiring Soon',
      className:
        'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    };
  }
  return {
    label: 'Valid',
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  };
}

/**
 * Vessel-facing certificates list + add/edit for a crew member with approved access.
 */
export function CrewCertificatesPanel({
  crewUserId,
  crewDisplayName,
  canManage,
  className,
}: {
  crewUserId: string;
  crewDisplayName?: string;
  canManage: boolean;
  className?: string;
}) {
  const { supabase, session } = useSupabase();
  const { toast } = useToast();
  const { presets: certificatePresets } = useCertificateCatalog();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formStep, setFormStep] = useState<'preset' | 'details'>('preset');
  const [presetCategory, setPresetCategory] = useState<string>('all');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [documentFileName, setDocumentFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);

  const who = crewDisplayName || 'this crew member';

  const form = useForm<CertificateFormValues>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      certificateName: '',
      certificateType: '',
      certificateNumber: '',
      issuingAuthority: '',
      issueDate: undefined,
      expiryDate: null,
      renewalNoticeDays: 90,
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

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', crewUserId)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setCertificates((data || []).map((row) => mapCertificateRow(row)));
    } catch (e) {
      console.error('[CrewCertificatesPanel]', e);
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  }, [crewUserId, supabase]);

  useEffect(() => {
    void loadCertificates();
  }, [loadCertificates]);

  const resetFormState = () => {
    form.reset({
      certificateName: '',
      certificateType: '',
      certificateNumber: '',
      issuingAuthority: '',
      issueDate: undefined,
      expiryDate: null,
      renewalNoticeDays: 90,
    });
    setEditing(null);
    setSelectedPresetId(null);
    setFormStep('preset');
    setPresetCategory('all');
    setDocumentPath(null);
    setDocumentFileName(null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    resetFormState();
  };

  const handleOpenAdd = () => {
    resetFormState();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (certificate: Certificate) => {
    setEditing(certificate);
    setSelectedPresetId(certificate.presetId || null);
    setFormStep('details');
    setDocumentPath(
      certificate.documentUrl && isCertificateStoragePath(certificate.documentUrl)
        ? certificate.documentUrl
        : null,
    );
    setDocumentFileName(
      certificate.documentUrl
        ? certificate.documentUrl.split('/').pop() || 'certificate'
        : null,
    );
    setPendingFile(null);
    form.reset({
      certificateName: certificate.certificateName,
      certificateType: certificate.certificateType,
      certificateNumber: certificate.certificateNumber || '',
      issuingAuthority: certificate.issuingAuthority || '',
      issueDate: parse(certificate.issueDate, 'yyyy-MM-dd', new Date()),
      expiryDate: certificate.expiryDate
        ? parse(certificate.expiryDate, 'yyyy-MM-dd', new Date())
        : null,
      renewalNoticeDays: certificate.renewalNoticeDays || 90,
    });
    setIsFormOpen(true);
  };

  const applyPreset = (preset: CertificatePreset) => {
    setSelectedPresetId(preset.id);
    form.reset({
      certificateName: preset.id === 'other' ? '' : preset.name,
      certificateType: preset.type,
      certificateNumber: '',
      issuingAuthority: preset.issuingAuthority,
      issueDate: undefined,
      expiryDate: null,
      renewalNoticeDays: preset.renewalNoticeDays,
    });
    setFormStep('details');
  };

  const uploadPendingFile = async (): Promise<string | null> => {
    if (!pendingFile) return documentPath;
    const token = session?.access_token;
    if (!token) {
      toast({
        title: 'Sign in required',
        description: 'Please refresh and try again.',
        variant: 'destructive',
      });
      return null;
    }
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append('file', pendingFile);
      body.append('crewUserId', crewUserId);
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
    if (!pendingFile) {
      toast({
        title: 'Upload a copy first',
        description: 'Choose a PDF or photo to scan.',
        variant: 'destructive',
      });
      return;
    }
    const token = session?.access_token;
    if (!token) return;
    setIsExtracting(true);
    try {
      const body = new FormData();
      body.append('file', pendingFile);
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
      if (issue && !expiry && selectedPreset?.typicalValidityYears) {
        form.setValue(
          'expiryDate',
          addYears(issue, selectedPreset.typicalValidityYears),
          { shouldValidate: true },
        );
      }
      toast({
        title: issue || expiry ? 'Dates extracted' : 'Nothing clear found',
        description: issue || expiry
          ? `Review the fields (confidence: ${extracted.confidence}).`
          : 'Enter dates manually.',
      });
    } catch (e: unknown) {
      toast({
        title: 'Scan failed',
        description: e instanceof Error ? e.message : 'Could not scan file.',
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async (values: CertificateFormValues) => {
    if (!canManage) return;
    setIsSaving(true);
    try {
      let path = documentPath;
      if (pendingFile) {
        path = await uploadPendingFile();
        if (!path && pendingFile) {
          throw new Error('Failed to upload certificate copy');
        }
      }

      const payload = {
        user_id: crewUserId,
        certificate_name: values.certificateName,
        certificate_type: values.certificateType,
        certificate_number: values.certificateNumber || null,
        issuing_authority: values.issuingAuthority || null,
        issue_date: format(values.issueDate, 'yyyy-MM-dd'),
        expiry_date: values.expiryDate
          ? format(values.expiryDate, 'yyyy-MM-dd')
          : null,
        renewal_required: true,
        renewal_notice_days: values.renewalNoticeDays || 90,
        preset_id: selectedPresetId,
        document_url: path,
      };

      if (editing) {
        const { error } = await supabase
          .from('certificates')
          .update(payload)
          .eq('id', editing.id)
          .eq('user_id', crewUserId);
        if (error) throw error;
        toast({ title: 'Certificate updated' });
      } else {
        const { error } = await supabase.from('certificates').insert(payload);
        if (error) throw error;
        toast({
          title: 'Certificate added',
          description: `Saved to ${who}’s account.`,
        });
        void notifyCrewOfDocumentCreated(supabase, {
          crewUserId,
          documentKind: 'certificate',
          documentLabel: values.certificateName,
        });
      }
      handleCloseForm();
      await loadCertificates();
    } catch (e: unknown) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Could not save certificate.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !canManage) return;
    try {
      const { error } = await supabase
        .from('certificates')
        .delete()
        .eq('id', deleteId)
        .eq('user_id', crewUserId);
      if (error) throw error;
      toast({ title: 'Certificate deleted' });
      setDeleteId(null);
      await loadCertificates();
    } catch (e: unknown) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Could not delete.',
        variant: 'destructive',
      });
    }
  };

  const handleViewDocument = async (certificate: Certificate) => {
    const url = certificate.documentUrl;
    if (!url) return;
    if (!isCertificateStoragePath(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const token = session?.access_token;
    if (!token) return;
    setDownloadingId(certificate.id);
    try {
      await downloadWithAuth(
        `/api/certificates/file?path=${encodeURIComponent(url)}`,
        token,
        certificate.certificateName || 'certificate',
      );
    } catch (e: unknown) {
      toast({
        title: 'Download failed',
        description:
          e instanceof Error ? e.message : 'Could not open certificate copy.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!canManage) {
    return (
      <section
        className={cn(
          'overflow-hidden rounded-md border border-border bg-background',
          className,
        )}
      >
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <h4 className="flex items-center gap-1.5 text-xs font-medium">
            <Award className="h-3.5 w-3.5 text-muted-foreground" />
            Certificates
          </h4>
        </div>
        <div className="px-4 py-4 text-xs text-muted-foreground sm:px-5">
          Request data access to view and manage certificates for {who}.
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-border bg-background',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Award className="h-3.5 w-3.5 text-muted-foreground" />
            Certificates
          </h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Credentials on {who}’s account — add copies and track expiry.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!loading ? (
            <Badge variant="secondary" className="h-5 text-[10px] tabular-nums">
              {certificates.length}
            </Badge>
          ) : null}
          <Dialog
            open={isFormOpen}
            onOpenChange={(open) => {
              if (!open) handleCloseForm();
              else setIsFormOpen(true);
            }}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="h-7 rounded-md text-xs"
                onClick={handleOpenAdd}
              >
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                Add certificate
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-md">
              <DialogHeader>
                <DialogTitle>
                  {editing ? 'Edit certificate' : formStep === 'preset' ? 'Choose a certificate' : 'Certificate details'}
                </DialogTitle>
                <DialogDescription>
                  {editing
                    ? `Update ${who}’s certificate details or replace the uploaded copy.`
                    : formStep === 'preset'
                      ? 'Start from a common maritime certificate, then upload a copy if you have one.'
                      : `This will be saved on ${who}’s SeaJourney account.`}
                </DialogDescription>
              </DialogHeader>

              {!editing && formStep === 'preset' ? (
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
                    {filteredPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="rounded-md border p-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="text-sm font-medium">{preset.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {preset.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleSubmit)}
                    className="space-y-4"
                  >
                    {!editing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-md text-xs"
                        onClick={() => setFormStep('preset')}
                      >
                        ← Change certificate type
                      </Button>
                    ) : null}

                    <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Certificate copy</p>
                          <p className="text-xs text-muted-foreground">
                            PDF or photo — optional. Scan to fill dates.
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
                              if (fileInputRef.current) {
                                fileInputRef.current.value = '';
                              }
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
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (!file) return;
                          setPendingFile(file);
                          setDocumentFileName(file.name);
                        }}
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
                          {documentFileName || pendingFile
                            ? 'Replace file'
                            : 'Upload copy'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 rounded-md text-xs"
                          onClick={() => void handleScanDates()}
                          disabled={!pendingFile || isExtracting || isUploading}
                        >
                          {isExtracting ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Scan for dates
                        </Button>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="certificateName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Certificate name *</FormLabel>
                          <FormControl>
                            <Input {...field} className="rounded-md" />
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
                          <FormLabel>Type *</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-md">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {commonCertificateTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="certificateNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number</FormLabel>
                            <FormControl>
                              <Input {...field} className="rounded-md" />
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
                            <FormLabel>Issuing authority</FormLabel>
                            <FormControl>
                              <Input {...field} className="rounded-md" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="issueDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Issue date *</FormLabel>
                            <Popover open={issueOpen} onOpenChange={setIssueOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      'w-full rounded-md pl-3 text-left font-normal',
                                      !field.value && 'text-muted-foreground',
                                    )}
                                  >
                                    {field.value
                                      ? format(field.value, 'PPP')
                                      : 'Pick a date'}
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
                                    setIssueOpen(false);
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
                            <FormLabel>Expiry date</FormLabel>
                            <Popover open={expiryOpen} onOpenChange={setExpiryOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      'w-full rounded-md pl-3 text-left font-normal',
                                      !field.value && 'text-muted-foreground',
                                    )}
                                  >
                                    {field.value
                                      ? format(field.value, 'PPP')
                                      : 'Optional'}
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
                                    setExpiryOpen(false);
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

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-md text-xs"
                        onClick={handleCloseForm}
                        disabled={isSaving || isUploading}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="h-8 rounded-md text-xs"
                        disabled={isSaving || isUploading || isExtracting}
                      >
                        {isSaving || isUploading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {editing ? 'Update' : 'Add'} certificate
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="px-4 py-3 sm:px-5">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading certificates…
          </div>
        ) : certificates.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            No certificates on file yet. Add STCW, ENG1, or other credentials for{' '}
            {who}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {certificates.map((certificate) => {
              const status = certStatus(certificate);
              return (
                <li
                  key={certificate.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {certificate.certificateName}
                      </span>
                      {certificate.documentUrl ? (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : null}
                      <Badge
                        variant="outline"
                        className={cn('rounded-md text-[10px]', status.className)}
                      >
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{certificate.certificateType}</span>
                      {certificate.expiryDate ? (
                        <span className="tabular-nums">
                          Expires{' '}
                          {format(
                            parse(
                              certificate.expiryDate,
                              'yyyy-MM-dd',
                              new Date(),
                            ),
                            'MMM d, yyyy',
                          )}
                        </span>
                      ) : (
                        <span>No expiry</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {certificate.documentUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={downloadingId === certificate.id}
                        onClick={() => void handleViewDocument(certificate)}
                        title="View copy"
                      >
                        {downloadingId === certificate.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleOpenEdit(certificate)}
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(certificate.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete certificate?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the certificate from {who}’s account. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 rounded-md text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="h-8 rounded-md bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
