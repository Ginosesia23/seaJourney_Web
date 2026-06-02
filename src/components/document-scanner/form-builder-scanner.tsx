'use client';

/**
 * Focused, minimal document scanner used by the Form Builder.
 *
 * Unlike the full AI Scanner, this component intentionally only does one
 * thing: take a PDF/image, run it through the existing /api/document-scan
 * endpoint, and hand the detected fields back to the parent so it can
 * mount the Form Builder editor.
 *
 * No crew selection, no date pickers, no sea-time UI, no scan history,
 * no copy/download tooling — those concerns belong to the (now removed)
 * standalone scanner. Keeping this surface tiny means less noise for the
 * vessel manager who just wants to turn a document into a reusable form.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  FileText,
  Loader2,
  ScanSearch,
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
import { ScanningAnimation } from './scanning-animation';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface ScannedField {
  fieldName: string;
  suggestedValue?: string | null;
  originalValue?: string | null;
  profileKey?: string | null;
  /**
   * Widget/input type inferred by the AI scanner. Mirrors the
   * `TemplateFieldType` the Form Builder uses so we can drop it straight
   * into the saved template without translation. Older/less-confident
   * responses omit it — we fall back to 'text' in that case.
   */
  fieldType?: TemplateFieldType;
  page?: number;
  bbox?: TemplateField['bbox'];
  /**
   * Optional binding suggestion from the AI auto-bind classifier. When
   * confidence is high (>= AUTO_BIND_APPLY_THRESHOLD) the server has
   * already applied it to `profileKey`. We still pass it through so the
   * editor can show provenance ("auto-bound · 0.78 confidence") and
   * surface lower-confidence picks as pending suggestions the user can
   * one-click apply.
   */
  autoBindSuggestion?: {
    profileKey: string | null;
    confidence: number;
    reason?: string | null;
  } | null;
  /**
   * Heuristic flag from the AI / label parser: this field's label
   * implies a derived value (e.g. "Total = A + B"). The editor uses
   * this to show a "convert to calculation" prompt in the inspector.
   */
  isCalculableSuggestion?: boolean;
}

interface ScanResponse {
  documentTitle?: string;
  documentDescription?: string | null;
  fields?: ScannedField[];
  unmatchedFields?: ScannedField[];
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

export function FormBuilderScanner({
  vesselId,
  accessToken,
  onScanComplete,
}: FormBuilderScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((picked: File) => {
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
  }, []);

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
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  /**
   * Convert the raw scan response into the TemplateField rows the Form
   * Builder editor expects. Mirrors the logic that used to live in
   * AIScannerTab so output is identical — same auto-alignment, same
   * placeholder treatment for fields the AI couldn't position.
   *
   * We also use the scanner's inferred `fieldType` to pre-wire each
   * field to the right widget. That way a date blank opens the Form
   * Builder as a date field (with a date-format picker in the
   * inspector) instead of a generic text input. When the AI doesn't
   * give us a type, we default to 'text' — same as before.
   */
  const buildFields = useCallback(
    (data: ScanResponse): TemplateField[] => {
      const all = [...(data.fields ?? []), ...(data.unmatchedFields ?? [])];
      const fields: TemplateField[] = [];
      let placeholderIndex = 0;
      const VALID_TYPES: TemplateFieldType[] = [
        'text',
        'multiline',
        'number',
        'date',
        'email',
        'checkbox',
        'signature',
      ];

      // Detect the coordinate scale Gemini used across the whole batch.
      // We look at the median of all xMax values from fields that have a bbox.
      // A real [0,1000] form will have a median xMax well above 110.
      // [0,1]   floats  → median xMax typically 0.5–0.9  → scale ×1000
      // [0,100] percents → median xMax typically 50–95    → scale ×10
      // [0,1000] correct → median xMax typically 500–950  → no scaling needed
      const bboxedFields = all.filter(f => {
        const b = f.bbox;
        return b && Number.isFinite(b.xMax) && b.xMax > 0;
      });
      let bboxScale = 1;
      if (bboxedFields.length > 0) {
        const xMaxValues = bboxedFields.map(f => f.bbox!.xMax).sort((a, b) => a - b);
        const medianXMax = xMaxValues[Math.floor(xMaxValues.length / 2)];
        if (medianXMax < 2) {
          bboxScale = 1000; // [0,1] float range
        } else if (medianXMax < 110) {
          bboxScale = 10;   // [0,100] percentage range
        }
        // else bboxScale = 1 → already [0,1000], no scaling needed
        if (bboxScale !== 1) {
          // Detected non-standard coordinate range; scaling applied silently.
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
        // Multi-row detection — if the AI stamped "— Row N —" into the
        // label, lift it into a structured `rowIndex` and strip the
        // marker from the display label so the field list reads
        // "Vessel name" ×3 instead of three near-identical labels. The
        // original form wording is preserved in `originalLabel` for
        // reference.
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
          // Pass binding provenance + calc hint through to the editor.
          // These are non-persistent in the template schema — the
          // editor uses them for the "auto-fill summary" banner and to
          // surface pending suggestions, but they're stripped before
          // save. Anything we want to persist (profileKey, type, etc.)
          // is already applied above when the AI was confident enough.
          autoBindSuggestion: f.autoBindSuggestion ?? undefined,
          isCalculableSuggestion: f.isCalculableSuggestion || undefined,
        });
      });
      return autoAlignTemplateFields(fields);
    },
    [],
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
      const fields = buildFields(data);
      if (!fields.length) {
        setError(
          'No fields were detected in this document. Try a clearer scan, a different file, or build the form from scratch in the editor.',
        );
        return;
      }
      const previewUrl = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : null;
      const suggestedName =
        data.documentTitle?.trim() || file.name.replace(/\.[^.]+$/, '');
      onScanComplete({ file, previewUrl, suggestedName, fields });
    } catch (e: any) {
      const msg = e?.message || 'Failed to scan document';
      setError(msg);
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  }, [file, accessToken, vesselId, buildFields, onScanComplete]);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="h-4 w-4" />
          Upload &amp; scan document
        </CardTitle>
        <CardDescription>
          Drop a PDF or image — we&apos;ll detect the fields and open them in
          the Form Builder editor so you can position, label, and configure
          them before saving as a reusable template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isScanning ? (
          <ScanningAnimation />
        ) : (
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

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {file && !isScanning && (
          <Button
            onClick={handleScan}
            disabled={isScanning}
            className="w-full rounded-xl h-11"
            size="lg"
          >
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <ScanSearch className="mr-2 h-4 w-4" />
                Scan &amp; open in builder
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
