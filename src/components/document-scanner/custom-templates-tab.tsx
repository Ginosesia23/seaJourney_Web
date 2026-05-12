'use client';

/**
 * "Form Builder" tab on the Documents page (previously "Custom Templates").
 *
 * Three views, switched via local state:
 *
 *   1. `list`    — cards showing every saved template for this vessel plus
 *                  actions: Use (fill & download), Edit (open builder),
 *                  Delete, and a "New form" button that kicks off scanning
 *                  inline to build a new template.
 *   2. `scanning` — the AI scanner mounted inline in template-build mode.
 *                  Once the user uploads + scans a document the scanner
 *                  hands back a draft which we feed straight into the
 *                  editor.
 *   3. `editor`  — the FormBuilderEditor, mounted either with that fresh
 *                  scan draft or with an existing template loaded via
 *                  /api/document-templates/[id].
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format as formatDate } from 'date-fns';
import {
  FileText,
  Loader2,
  Trash2,
  Play,
  FilePlus,
  Users,
  Calendar,
  Clock,
  Download,
  Pencil,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVesselStateLogs } from '@/supabase/database/queries';
import { computeSeaTimeInDateRange } from '@/lib/sea-time-in-range';
import {
  fillScannedDocument,
  downloadBlob,
  type FillableField,
} from '@/lib/fill-scanned-document';
import type {
  UserProfile,
  Vessel,
  VesselAssignment,
} from '@/lib/types';
import type {
  VesselDocumentTemplate,
  TemplateField,
} from '@/lib/vessel-document-templates';
import { FormBuilderEditor } from './form-builder-editor';
import {
  FormBuilderScanner,
  type FormBuilderScanDraft,
} from './form-builder-scanner';

interface CrewOption {
  profile: UserProfile;
  assignment: VesselAssignment;
}

interface SeaTimeResult {
  totalDays: number;
  atSeaDays: number;
  standbyDays: number;
  yardDays: number;
  leaveDays: number;
  underwayDays: number;
  atAnchorDays: number;
  inPortDays: number;
}

interface CustomTemplatesTabProps {
  supabase: SupabaseClient;
  session: { access_token: string } | null;
  activeVesselId: string | null;
  vessel: Vessel | undefined;
  currentUserProfile: UserProfile | null;
  crewList: CrewOption[];
  loadingCrew: boolean;
}

/**
 * Detects which kinds of context the template needs so the Use dialog can
 * show or hide the date-range block accordingly.
 */
function templateNeeds(template: VesselDocumentTemplate): { seaTime: boolean } {
  const seaTimeKeys = new Set([
    'servicePeriodStart',
    'servicePeriodEnd',
    'totalDays',
    'atSeaDays',
    'standbyDays',
    'yardDays',
    'leaveDays',
  ]);
  const seaTime = template.fields.some(
    (f) => f.profileKey && seaTimeKeys.has(f.profileKey),
  );
  return { seaTime };
}

/** Active editor target — either a fresh draft or a loaded existing template. */
type EditorState =
  | {
      mode: 'create';
      file: File;
      previewUrl: string | null;
      name: string;
      description: string | null;
      fields: TemplateField[];
    }
  | {
      mode: 'edit';
      templateId: string;
      file: File;
      previewUrl: string | null;
      name: string;
      description: string | null;
      fields: TemplateField[];
    };

export function CustomTemplatesTab({
  supabase,
  session,
  activeVesselId,
  vessel,
  currentUserProfile,
  crewList,
  loadingCrew,
}: CustomTemplatesTabProps) {
  const [templates, setTemplates] = useState<VesselDocumentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editor state — when non-null the builder takes over the tab. We hold
  // the file on this object so it survives re-renders without reloading.
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);

  // Scanning state — when true we show the focused FormBuilderScanner
  // inline. As soon as it returns a draft we flip straight into the
  // editor below; the user never has to interact with the list again.
  const [scanning, setScanning] = useState(false);

  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] =
    useState<VesselDocumentTemplate | null>(null);
  const [useCrewId, setUseCrewId] = useState('');
  const [useStartDate, setUseStartDate] = useState<Date | undefined>(undefined);
  const [useEndDate, setUseEndDate] = useState<Date | undefined>(undefined);
  const [useSeaTime, setUseSeaTime] = useState<SeaTimeResult | null>(null);
  const [isCalculatingSeaTime, setIsCalculatingSeaTime] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!activeVesselId || !session?.access_token) {
      setTemplates([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/document-templates?vesselId=${encodeURIComponent(activeVesselId)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load templates');
      setTemplates(data.templates ?? []);
    } catch (err: any) {
      console.error('[custom-templates] load failed', err);
      setError(err?.message ?? 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, [activeVesselId, session?.access_token]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  /** Kick off the scan flow — replaces the old "switch to AI Scanner tab" UX. */
  const handleStartScanFlow = useCallback(() => {
    setScanning(true);
  }, []);

  /**
   * Called by the focused scanner once it has detected the fields. We
   * always flip straight into the builder editor — no preview, no save
   * dialog, no extra clicks. This is the contract requested by the user:
   * scanning a document should hand the user to the editor immediately
   * so they can fine-tune fields.
   */
  const handleScannerHandoff = useCallback(
    (draft: FormBuilderScanDraft) => {
      setEditor({
        mode: 'create',
        file: draft.file,
        previewUrl: draft.previewUrl,
        name: draft.suggestedName,
        description: null,
        fields: draft.fields,
      });
      setScanning(false);
    },
    [],
  );

  /**
   * Open an existing template in the builder. We fetch the original file
   * through the existing streaming route, then hand everything to the
   * editor. Uses an isOpeningEditor flag so a double-click on "Edit" won't
   * kick off two loads.
   */
  const handleOpenEditor = useCallback(
    async (template: VesselDocumentTemplate) => {
      if (!session?.access_token) {
        toast({
          title: 'Not signed in',
          description: 'Refresh and try again.',
          variant: 'destructive',
        });
        return;
      }
      setIsOpeningEditor(true);
      try {
        const res = await fetch(
          `/api/document-templates/${template.id}/file`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || 'Failed to load template file');
        }
        const blob = await res.blob();
        const file = new File(
          [blob],
          template.originalFilename || `${template.name}.pdf`,
          { type: template.fileType || blob.type || 'application/pdf' },
        );
        // For PDFs we don't need a preview URL (the viewer renders via
        // pdfjs). For images we build a data: URL so we can show them.
        const previewUrl =
          file.type.startsWith('image/') ? URL.createObjectURL(blob) : null;
        setEditor({
          mode: 'edit',
          templateId: template.id,
          file,
          previewUrl,
          name: template.name,
          description: template.description,
          fields: template.fields,
        });
      } catch (err: any) {
        console.error('[custom-templates] open editor failed', err);
        toast({
          title: 'Open failed',
          description: err?.message ?? 'Unexpected error',
          variant: 'destructive',
        });
      } finally {
        setIsOpeningEditor(false);
      }
    },
    [session?.access_token],
  );

  const closeEditor = useCallback(() => {
    // Revoke any object URL we minted so we don't leak blobs.
    if (editor?.previewUrl && editor.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(editor.previewUrl);
    }
    setEditor(null);
  }, [editor]);

  const handleEditorSaved = useCallback(
    async (_savedId: string) => {
      closeEditor();
      await loadTemplates();
    },
    [closeEditor, loadTemplates],
  );

  const crewSelectOptions = useMemo(
    () =>
      crewList.map((c) => {
        const name =
          [c.profile.firstName, c.profile.lastName].filter(Boolean).join(' ') ||
          c.profile.username ||
          c.profile.email ||
          'Unknown';
        const email = c.profile.email ? ` (${c.profile.email})` : '';
        return { value: c.profile.id, label: `${name}${email}` };
      }),
    [crewList],
  );

  const templateNeedsSeaTime = activeTemplate
    ? templateNeeds(activeTemplate).seaTime
    : false;

  const selectedUseCrew = useMemo(
    () => crewList.find((c) => c.profile.id === useCrewId) ?? null,
    [crewList, useCrewId],
  );

  const handleOpenUseDialog = (template: VesselDocumentTemplate) => {
    setActiveTemplate(template);
    setUseCrewId('');
    setUseStartDate(undefined);
    setUseEndDate(undefined);
    setUseSeaTime(null);
    setUseDialogOpen(true);
  };

  const handleCloseUseDialog = (open: boolean) => {
    setUseDialogOpen(open);
    if (!open) {
      setActiveTemplate(null);
      setUseCrewId('');
      setUseStartDate(undefined);
      setUseEndDate(undefined);
      setUseSeaTime(null);
    }
  };

  const handleCalculateSeaTime = async () => {
    if (!selectedUseCrew || !activeVesselId || !useStartDate || !useEndDate) {
      toast({
        title: 'Missing info',
        description: 'Pick a crew member and date range first.',
        variant: 'destructive',
      });
      return;
    }
    if (useStartDate > useEndDate) {
      toast({
        title: 'Invalid range',
        description: 'Start date must be before end date.',
        variant: 'destructive',
      });
      return;
    }
    setIsCalculatingSeaTime(true);
    setUseSeaTime(null);
    try {
      const startStr = formatDate(useStartDate, 'yyyy-MM-dd');
      const endStr = formatDate(useEndDate, 'yyyy-MM-dd');
      const targetUserId =
        (vessel as any)?.vessel_manager_id || currentUserProfile?.id;
      const logs = await getVesselStateLogs(
        supabase,
        activeVesselId,
        targetUserId,
      );
      const filtered = logs.filter(
        (l) => l.date >= startStr && l.date <= endStr,
      );
      if (!filtered.length) {
        toast({
          title: 'No log data',
          description: 'No state logs for that range — fields will fill blank.',
          variant: 'destructive',
        });
        return;
      }
      const result = computeSeaTimeInDateRange({
        filteredLogs: filtered,
        rangeStart: startStr,
        rangeEnd: endStr,
        useCrewLogs: false,
        vesselType: vessel?.type ?? null,
        watchDates: new Set(),
      });
      setUseSeaTime({
        totalDays: result.totalDays,
        atSeaDays: result.atSeaDays,
        standbyDays: result.standbyDays,
        yardDays: result.yardDays,
        leaveDays: result.leaveDays,
        underwayDays: result.underwayDays,
        atAnchorDays: result.atAnchorDays,
        inPortDays: result.inPortDays,
      });
      toast({
        title: 'Calculated',
        description: 'Sea time ready — click "Fill & download" next.',
      });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'Failed to calculate sea time.',
        variant: 'destructive',
      });
    } finally {
      setIsCalculatingSeaTime(false);
    }
  };

  const handleFillAndDownload = async () => {
    if (!activeTemplate || !useCrewId || !session?.access_token) {
      toast({
        title: 'Missing info',
        description: 'Pick a crew member first.',
        variant: 'destructive',
      });
      return;
    }

    setIsFilling(true);
    try {
      const seaTimePayload =
        templateNeedsSeaTime && useSeaTime && useStartDate && useEndDate
          ? {
              startDate: formatDate(useStartDate, 'yyyy-MM-dd'),
              endDate: formatDate(useEndDate, 'yyyy-MM-dd'),
              ...useSeaTime,
            }
          : null;

      // 1. Ask the server to resolve each field's value for this crew.
      const resolveRes = await fetch(
        `/api/document-templates/${activeTemplate.id}/resolve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            crewUserId: useCrewId,
            seaTimeData: seaTimePayload,
          }),
        },
      );
      const resolveData = await resolveRes.json();
      if (!resolveRes.ok) {
        throw new Error(resolveData.error || 'Failed to resolve values');
      }
      const values: Record<string, string | null> = resolveData.values ?? {};

      // 2. Download the original file.
      const fileRes = await fetch(
        `/api/document-templates/${activeTemplate.id}/file`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!fileRes.ok) {
        const errJson = await fileRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to fetch template file');
      }
      const blob = await fileRes.blob();
      const file = new File(
        [blob],
        activeTemplate.originalFilename || 'template',
        { type: activeTemplate.fileType || blob.type },
      );

      // 3. Build the list of fillable fields using the stored bboxes.
      const fillable: FillableField[] = activeTemplate.fields
        .map((f) => ({
          fieldName: f.label || f.id,
          value: (values[f.id] ?? f.defaultValue ?? '').toString(),
          page: f.page,
          bbox: f.bbox,
        }))
        .filter((f) => f.value && f.bbox);

      if (!fillable.length) {
        toast({
          title: 'Nothing to fill',
          description:
            'No fields could be resolved with values. Edit the template to bind fields to data.',
          variant: 'destructive',
        });
        return;
      }

      // 4. Stamp and trigger download.
      const { blob: filled, filledCount } = await fillScannedDocument(
        file,
        fillable,
      );
      const crewName = resolveData.crewName || 'crew';
      const safeCrew = crewName.replace(/[^A-Za-z0-9]+/g, '_');
      const baseName =
        (activeTemplate.originalFilename || activeTemplate.name).replace(
          /\.[^.]+$/,
          '',
        ) || 'template';
      downloadBlob(filled, `${baseName}-${safeCrew}.pdf`);

      toast({
        title: 'Downloaded',
        description: `Filled ${filledCount} fields for ${crewName}.`,
      });
      handleCloseUseDialog(false);
    } catch (err: any) {
      console.error('[custom-templates] fill failed', err);
      toast({
        title: 'Fill failed',
        description: err?.message ?? 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setIsFilling(false);
    }
  };

  const handleDelete = async (template: VesselDocumentTemplate) => {
    if (!session?.access_token) return;
    const confirmed = window.confirm(
      `Delete template "${template.name}"? This can't be undone.`,
    );
    if (!confirmed) return;
    setDeletingId(template.id);
    try {
      const res = await fetch(`/api/document-templates/${template.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      toast({ title: 'Deleted', description: `"${template.name}" removed.` });
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err?.message ?? 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!activeVesselId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">
            Select an active vessel to manage custom forms.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Editor mode takes over the whole tab — we never show list + editor at
  // the same time, it gets too crowded and the viewer wants the full width.
  if (editor) {
    return (
      <FormBuilderEditor
        file={editor.file}
        previewUrl={editor.previewUrl}
        templateId={editor.mode === 'edit' ? editor.templateId : null}
        vesselId={activeVesselId}
        accessToken={session?.access_token ?? null}
        initialName={editor.name}
        initialDescription={editor.description}
        initialFields={editor.fields}
        onSaved={handleEditorSaved}
        onCancel={closeEditor}
      />
    );
  }

  // Scanning mode takes over the tab while the user uploads + scans a
  // document. As soon as the scanner finishes we flip straight into the
  // editor above (handleScannerHandoff sets `editor`).
  if (scanning) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">New form</h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              Upload the document you want to turn into a reusable form. We&apos;ll
              scan it and drop you straight into the Form Builder editor with
              the detected fields.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setScanning(false)}
            className="rounded-xl"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to forms
          </Button>
        </div>
        <FormBuilderScanner
          vesselId={activeVesselId}
          accessToken={session?.access_token ?? null}
          onScanComplete={handleScannerHandoff}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Form Builder
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Turn any document into a reusable, fillable form. Scan a PDF or
            image, position + configure the fields, then fill it for any crew
            member in one click.
          </p>
        </div>
        <Button
          onClick={handleStartScanFlow}
          className="rounded-xl"
          disabled={isOpeningEditor}
        >
          <FilePlus className="mr-2 h-4 w-4" />
          New form
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading templates…
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No forms yet. Click <strong>New form</strong> to scan a document,
            configure its fields, and save it as a reusable template.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const needsSeaTime = templateNeeds(template).seaTime;
            const boundFields = template.fields.filter((f) => f.profileKey).length;
            const totalFields = template.fields.length;
            return (
              <Card key={template.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="line-clamp-2">{template.name}</span>
                    </CardTitle>
                    {needsSeaTime && (
                      <Badge variant="secondary" className="shrink-0">
                        Sea-time
                      </Badge>
                    )}
                  </div>
                  {template.description && (
                    <CardDescription className="line-clamp-3">
                      {template.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1 pt-0">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      <span className="font-medium text-foreground">
                        {boundFields}
                      </span>{' '}
                      of {totalFields} fields bound to data
                    </div>
                    <div>
                      Created {formatDate(new Date(template.createdAt), 'PP')}
                    </div>
                  </div>
                </CardContent>
                <div className="px-6 pb-4 flex items-center gap-2">
                  <Button
                    className="flex-1 rounded-xl"
                    onClick={() => handleOpenUseDialog(template)}
                  >
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Use
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleOpenEditor(template)}
                    disabled={isOpeningEditor}
                    className="rounded-xl"
                    aria-label="Edit template"
                  >
                    {isOpeningEditor ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDelete(template)}
                    disabled={deletingId === template.id}
                    className="rounded-xl"
                    aria-label="Delete template"
                  >
                    {deletingId === template.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={useDialogOpen} onOpenChange={handleCloseUseDialog}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Fill {activeTemplate?.name ?? 'template'}</DialogTitle>
            <DialogDescription>
              Pick a crew member
              {templateNeedsSeaTime ? ' and a date range' : ''}. We'll auto-fill
              the template and download a PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Crew member
              </Label>
              {loadingCrew ? (
                <div className="text-sm text-muted-foreground">
                  Loading crew…
                </div>
              ) : (
                <SearchableSelect
                  options={crewSelectOptions}
                  value={useCrewId}
                  onValueChange={setUseCrewId}
                  placeholder="Select crew member"
                  searchPlaceholder="Search by name or email…"
                />
              )}
            </div>

            {templateNeedsSeaTime && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Start
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !useStartDate && 'text-muted-foreground',
                          )}
                        >
                          {useStartDate
                            ? formatDate(useStartDate, 'PPP')
                            : 'Pick start'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={useStartDate}
                          onSelect={setUseStartDate}
                          disabled={(date) => date > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> End
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !useEndDate && 'text-muted-foreground',
                          )}
                        >
                          {useEndDate
                            ? formatDate(useEndDate, 'PPP')
                            : 'Pick end'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={useEndDate}
                          onSelect={setUseEndDate}
                          disabled={(date) => date > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={handleCalculateSeaTime}
                  disabled={
                    !useCrewId ||
                    !useStartDate ||
                    !useEndDate ||
                    isCalculatingSeaTime
                  }
                  className="w-full rounded-xl"
                >
                  {isCalculatingSeaTime ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Calculating…
                    </>
                  ) : (
                    <>
                      <Clock className="mr-2 h-4 w-4" />
                      Calculate sea time
                    </>
                  )}
                </Button>

                {useSeaTime && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                    <div className="font-medium mb-1">Calculated:</div>
                    <div className="grid grid-cols-3 gap-1 text-muted-foreground">
                      <div>Total: {useSeaTime.totalDays}</div>
                      <div>At sea: {useSeaTime.atSeaDays}</div>
                      <div>Standby: {useSeaTime.standbyDays}</div>
                      <div>Yard: {useSeaTime.yardDays}</div>
                      <div>Leave: {useSeaTime.leaveDays}</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleCloseUseDialog(false)}
              disabled={isFilling}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFillAndDownload}
              disabled={
                !useCrewId ||
                isFilling ||
                (templateNeedsSeaTime && !useSeaTime)
              }
              className="rounded-xl"
            >
              {isFilling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Filling…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Fill &amp; download
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
