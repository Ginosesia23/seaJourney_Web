'use client';

/**
 * Focused, minimal document scanner used by the Form Builder.
 *
 * After upload the user chooses how fields are created:
 *   1. Auto-detect — existing /api/document-scan + PDF text snap.
 *   2. Draw boxes — user paints fill cells, then AI labels them via
 *      /api/document-scan/classify-regions (or skip AI and name them later).
 *
 * No crew selection, no date pickers, no sea-time UI, no scan history.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  FileText,
  Loader2,
  Pencil,
  ScanSearch,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  newFieldId,
  makePlaceholderBbox,
  extractRowIndexFromLabel,
  stripRowMarkerFromLabel,
  type TemplateField,
  type TemplateFieldType,
} from '@/lib/vessel-document-templates';
import { autoAlignTemplateFields } from '@/lib/auto-align-template-fields';
import { snapTemplateFieldsToPdfText } from '@/lib/snap-fields-to-pdf-text';
import { ScanningAnimation } from './scanning-animation';
import { OriginalDocumentViewer } from './original-document-viewer';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DRAWN_REGIONS = 80;
const VALID_TYPES: TemplateFieldType[] = [
  'text',
  'multiline',
  'number',
  'date',
  'email',
  'checkbox',
  'signature',
];

type CaptureMode = 'auto' | 'draw';

interface ScannedField {
  fieldName: string;
  suggestedValue?: string | null;
  originalValue?: string | null;
  profileKey?: string | null;
  fieldType?: TemplateFieldType;
  page?: number;
  bbox?: TemplateField['bbox'];
  autoBindSuggestion?: {
    profileKey: string | null;
    confidence: number;
    reason?: string | null;
  } | null;
  isCalculableSuggestion?: boolean;
}

interface ScanResponse {
  documentTitle?: string;
  documentDescription?: string | null;
  fields?: ScannedField[];
  unmatchedFields?: ScannedField[];
}

interface ClassifiedRegion {
  id: string;
  fieldName: string;
  fieldType?: TemplateFieldType;
  profileKey?: string | null;
  fieldDescription?: string;
}

export interface FormBuilderScanDraft {
  file: File;
  previewUrl: string | null;
  suggestedName: string;
  fields: TemplateField[];
}

interface FormBuilderScannerProps {
  vesselId: string;
  accessToken: string | null;
  onScanComplete: (draft: FormBuilderScanDraft) => void;
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function FormBuilderScanner({
  vesselId,
  accessToken,
  onScanComplete,
}: FormBuilderScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [drawnFields, setDrawnFields] = useState<TemplateField[]>([]);
  const [selectedDrawn, setSelectedDrawn] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokePreview = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    return () => {
      revokePreview(previewUrl);
    };
  }, [previewUrl, revokePreview]);

  const handleFileSelect = useCallback(
    (picked: File) => {
      setError(null);
      if (!ALLOWED_MIME_TYPES.has(picked.type)) {
        setError(
          `Unsupported file type: ${picked.type || 'unknown'}. Use PDF, PNG, JPEG or WebP.`,
        );
        return;
      }
      if (picked.size > MAX_FILE_SIZE) {
        setError(
          `File too large (${(picked.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
        );
        return;
      }
      setFile(picked);
      setCaptureMode(null);
      setDrawnFields([]);
      setSelectedDrawn([]);
      setPreviewUrl((prev) => {
        revokePreview(prev);
        return picked.type.startsWith('image/')
          ? URL.createObjectURL(picked)
          : null;
      });
    },
    [revokePreview],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect],
  );

  const handleReset = useCallback(() => {
    setFile(null);
    setCaptureMode(null);
    setDrawnFields([]);
    setSelectedDrawn([]);
    setError(null);
    setPreviewUrl((prev) => {
      revokePreview(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [revokePreview]);

  /**
   * Convert the raw scan response into the TemplateField rows the Form
   * Builder editor expects. Mirrors the logic that used to live in
   * AIScannerTab so output is identical — same auto-alignment, same
   * placeholder treatment for fields the AI couldn't position.
   */
  const buildFields = useCallback((data: ScanResponse): TemplateField[] => {
    const all = [...(data.fields ?? []), ...(data.unmatchedFields ?? [])];
    const fields: TemplateField[] = [];
    let placeholderIndex = 0;

    const bboxedFields = all.filter((f) => {
      const b = f.bbox;
      return b && Number.isFinite(b.xMax) && b.xMax > 0;
    });
    let bboxScale = 1;
    if (bboxedFields.length > 0) {
      const xMaxValues = bboxedFields
        .map((f) => f.bbox!.xMax)
        .sort((a, b) => a - b);
      const medianXMax = xMaxValues[Math.floor(xMaxValues.length / 2)];
      if (medianXMax < 2) {
        bboxScale = 1000;
      } else if (medianXMax < 110) {
        bboxScale = 10;
      }
    }

    const scaleBbox = (b: NonNullable<ScannedField['bbox']>) => {
      if (bboxScale === 1) return b;
      return {
        xMin: Math.round(b.xMin * bboxScale),
        yMin: Math.round(b.yMin * bboxScale),
        xMax: Math.round(b.xMax * bboxScale),
        yMax: Math.round(b.yMax * bboxScale),
      };
    };

    all.forEach((f) => {
      const rawPage = f.page;
      const rawBbox = f.bbox;
      const scaledBbox = rawBbox ? scaleBbox(rawBbox) : undefined;
      const hasBbox =
        !!scaledBbox &&
        Number.isFinite(scaledBbox.xMin) &&
        Number.isFinite(scaledBbox.xMax) &&
        Number.isFinite(scaledBbox.yMin) &&
        Number.isFinite(scaledBbox.yMax) &&
        scaledBbox.xMax > scaledBbox.xMin &&
        scaledBbox.yMax > scaledBbox.yMin;
      const page = rawPage && rawPage > 0 ? rawPage : 1;
      const bbox = hasBbox ? scaledBbox! : makePlaceholderBbox(placeholderIndex++);
      const detectedType: TemplateFieldType =
        f.fieldType && VALID_TYPES.includes(f.fieldType) ? f.fieldType : 'text';
      const detectedRow = extractRowIndexFromLabel(f.fieldName);
      const displayLabel = detectedRow
        ? stripRowMarkerFromLabel(f.fieldName)
        : f.fieldName;
      fields.push({
        id: newFieldId(),
        label: displayLabel,
        type: detectedType,
        profileKey:
          f.profileKey && f.profileKey !== 'none' ? f.profileKey : null,
        rowIndex: detectedRow,
        page,
        bbox,
        originalLabel: f.fieldName,
        autoBindSuggestion: f.autoBindSuggestion ?? undefined,
        isCalculableSuggestion: f.isCalculableSuggestion || undefined,
      });
    });
    return autoAlignTemplateFields(fields);
  }, []);

  const handoff = useCallback(
    (fields: TemplateField[], suggestedName?: string) => {
      if (!file) return;
      // Fresh object URL for the editor so this scanner can revoke its
      // own preview on unmount without breaking the builder.
      const editorPreview = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null;
      onScanComplete({
        file,
        previewUrl: editorPreview,
        suggestedName: suggestedName?.trim() || fileStem(file.name),
        fields,
      });
    },
    [file, onScanComplete],
  );

  const handleScan = useCallback(async () => {
    if (!file) return;
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Refresh and try again.',
        variant: 'destructive',
      });
      return;
    }
    setIsScanning(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('vesselId', vesselId);
      const res = await fetch('/api/document-scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const data = (await res.json()) as ScanResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      let fields = buildFields(data);
      if (file.type === 'application/pdf') {
        try {
          fields = await snapTemplateFieldsToPdfText(file, fields);
        } catch (snapErr) {
          console.warn(
            '[form-builder] PDF text snap failed, using AI boxes',
            snapErr,
          );
        }
      }
      if (!fields.length) {
        setError(
          'No fields were detected in this document. Try drawing the boxes yourself, a clearer scan, or build the form from scratch in the editor.',
        );
        return;
      }
      handoff(fields, data.documentTitle);
    } catch (e: any) {
      const msg = e?.message || 'Failed to scan document';
      setError(msg);
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  }, [file, accessToken, vesselId, buildFields, handoff]);

  const handleBoxCreate = useCallback(
    (
      bbox: { xMin: number; yMin: number; xMax: number; yMax: number },
      page: number,
    ) => {
      setDrawnFields((prev) => {
        if (prev.length >= MAX_DRAWN_REGIONS) {
          toast({
            title: 'Too many boxes',
            description: `You can draw up to ${MAX_DRAWN_REGIONS} fill areas on one form.`,
            variant: 'destructive',
          });
          return prev;
        }
        const next: TemplateField = {
          id: newFieldId(),
          label: `Field ${prev.length + 1}`,
          type: 'text',
          profileKey: null,
          page,
          bbox,
        };
        return [...prev, next];
      });
    },
    [],
  );

  const handleDrawnBboxChange = useCallback(
    (index: number, bbox: NonNullable<TemplateField['bbox']>) => {
      setDrawnFields((prev) =>
        prev.map((f, i) => (i === index ? { ...f, bbox } : f)),
      );
    },
    [],
  );

  const handleDrawnDelete = useCallback((index: number) => {
    setDrawnFields((prev) => prev.filter((_, i) => i !== index));
    setSelectedDrawn((sel) =>
      sel
        .filter((i) => i !== index)
        .map((i) => (i > index ? i - 1 : i)),
    );
  }, []);

  const handleDrawnSelect = useCallback(
    (index: number, mods?: { shift: boolean; meta: boolean }) => {
      setSelectedDrawn((sel) => {
        if (mods?.meta) {
          return sel.includes(index)
            ? sel.filter((i) => i !== index)
            : [...sel, index];
        }
        if (mods?.shift && sel.length) {
          const last = sel[sel.length - 1];
          const from = Math.min(last, index);
          const to = Math.max(last, index);
          const range: number[] = [];
          for (let i = from; i <= to; i++) range.push(i);
          return range;
        }
        return [index];
      });
    },
    [],
  );

  const applyClassifications = useCallback(
    (fields: TemplateField[], regions: ClassifiedRegion[]): TemplateField[] => {
      const byId = new Map(regions.map((r) => [r.id, r]));
      return fields.map((f) => {
        const r = byId.get(f.id);
        if (!r) return f;
        const rawName = (r.fieldName || f.label).trim() || f.label;
        const detectedRow = extractRowIndexFromLabel(rawName);
        const displayLabel = detectedRow
          ? stripRowMarkerFromLabel(rawName)
          : rawName;
        const detectedType: TemplateFieldType =
          r.fieldType && VALID_TYPES.includes(r.fieldType)
            ? r.fieldType
            : f.type ?? 'text';
        return {
          ...f,
          label: displayLabel,
          type: detectedType,
          profileKey:
            r.profileKey && r.profileKey !== 'none' ? r.profileKey : null,
          rowIndex: detectedRow,
          originalLabel: rawName,
        };
      });
    },
    [],
  );

  const openDrawnDraft = useCallback(
    (fields: TemplateField[]) => {
      if (!fields.length) {
        setError('Draw at least one fill box before opening the editor.');
        return;
      }
      handoff(fields);
    },
    [handoff],
  );

  const handleIdentifyAndOpen = useCallback(async () => {
    if (!file || !drawnFields.length) {
      setError('Draw at least one fill box first.');
      return;
    }
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Refresh and try again.',
        variant: 'destructive',
      });
      return;
    }
    setIsClassifying(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append(
        'regions',
        JSON.stringify(
          drawnFields.map((f) => ({
            id: f.id,
            page: f.page ?? 1,
            bbox: f.bbox,
          })),
        ),
      );
      const res = await fetch('/api/document-scan/classify-regions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const data = (await res.json()) as {
        regions?: ClassifiedRegion[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not identify boxes');
      const labelled = applyClassifications(drawnFields, data.regions ?? []);
      openDrawnDraft(labelled);
    } catch (e: any) {
      const msg = e?.message || 'Failed to identify boxes';
      setError(msg);
      toast({
        title: 'Identify failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsClassifying(false);
    }
  }, [file, drawnFields, accessToken, applyClassifications, openDrawnDraft]);

  const busy = isScanning || isClassifying;
  const overlayFields = drawnFields.map((f) => ({
    fieldName: f.label,
    suggestedValue: null as string | null,
    source: f.profileKey ? 'profile' : 'manual',
    page: f.page,
    bbox: f.bbox,
  }));

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="h-4 w-4" />
          {captureMode === 'draw'
            ? 'Draw fill boxes'
            : captureMode === 'auto'
              ? 'Auto-detect fields'
              : 'Upload document'}
        </CardTitle>
        <CardDescription>
          {captureMode === 'draw'
            ? 'Drag a rectangle over each blank you want filled. Then let AI read the printed labels, or skip straight to the editor.'
            : captureMode === 'auto'
              ? 'We’ll scan the page, detect blanks, and open them in the Form Builder so you can fine-tune labels and bindings.'
              : 'Drop a PDF or image, then choose auto-detect or draw the fill boxes yourself.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isScanning || isClassifying ? (
          <ScanningAnimation />
        ) : (
          <>
            {(!file || captureMode !== 'draw') && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-300',
                  isDragging
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : file
                      ? 'border-primary/40 bg-primary/[0.02]'
                      : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30',
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
                {file ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB ·{' '}
                        {file.type.split('/')[1]?.toUpperCase()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReset();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        Drop a file here or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF, PNG, JPEG, or WebP — max 10MB
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {file && !captureMode && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCaptureMode('auto')}
                  className="rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ScanSearch className="h-4 w-4 text-primary" />
                    Auto-detect fields
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                    AI finds blanks on the page. Best for simple forms. Tables
                    may need a nudge in the editor.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureMode('draw')}
                  className="rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Pencil className="h-4 w-4 text-primary" />
                    Draw boxes myself
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                    Paint the cells you want filled, then AI reads the labels
                    next to them. More accurate on tables and MCA forms.
                  </p>
                </button>
              </div>
            )}

            {file && captureMode === 'draw' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {file.name}
                    {drawnFields.length > 0
                      ? ` · ${drawnFields.length} box${drawnFields.length === 1 ? '' : 'es'}`
                      : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => {
                        setCaptureMode(null);
                        setDrawnFields([]);
                        setSelectedDrawn([]);
                      }}
                    >
                      Change method
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={handleReset}
                    >
                      Change file
                    </Button>
                  </div>
                </div>
                <OriginalDocumentViewer
                  file={file}
                  previewUrl={previewUrl}
                  fields={overlayFields}
                  drawCreateMode
                  onBoxCreate={handleBoxCreate}
                  onFieldBboxChange={handleDrawnBboxChange}
                  onFieldDelete={handleDrawnDelete}
                  onFieldSelect={handleDrawnSelect}
                  selectedIndices={selectedDrawn}
                />
              </div>
            )}

            {file && captureMode === 'auto' && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => setCaptureMode(null)}
                >
                  Change method
                </Button>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {file && !busy && captureMode === 'auto' && (
          <Button
            onClick={handleScan}
            className="w-full rounded-xl h-11"
            size="lg"
          >
            <ScanSearch className="mr-2 h-4 w-4" />
            Scan &amp; open in builder
          </Button>
        )}

        {file && !busy && captureMode === 'draw' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleIdentifyAndOpen}
              disabled={!drawnFields.length}
              className="flex-1 rounded-xl h-11"
              size="lg"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Identify with AI &amp; open
            </Button>
            <Button
              variant="outline"
              onClick={() => openDrawnDraft(drawnFields)}
              disabled={!drawnFields.length}
              className="rounded-xl h-11 sm:w-auto"
              size="lg"
            >
              Continue without AI
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
