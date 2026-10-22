'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format, parse } from 'date-fns';
import {
  AlertTriangle,
  CalendarIcon,
  Download,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Pencil,
  ScanSearch,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { bearerHeaders, downloadWithAuth } from '@/lib/applications/client';
import {
  CREW_RECORD_KIND_LABELS,
  CREW_RECORD_ORIGIN_LABELS,
  careerCountingConflicts,
  isSeaServiceRecordKind,
  overlapInclusiveRange,
  type CrewRecordDocument,
  type CrewRecordDocumentKind,
  type CrewRecordDocumentOrigin,
  type SeaServiceDateConflict,
} from '@/lib/crew-record-documents';
import { notifyCrewOfDocumentCreated } from '@/lib/notify-crew-document-created';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/supabase';
import { useToast } from '@/hooks/use-toast';

type SeaTimeDraft = {
  startDate: string;
  endDate: string;
  totalDays: string;
  atSeaDays: string;
  standbyDays: string;
  yardDays: string;
  leaveDays: string;
  countsTowardCareer: boolean;
};

type ExtractedSea = {
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  issuedOn: string | null;
  totalDays: number | null;
  atSeaDays: number | null;
  standbyDays: number | null;
  yardDays: number | null;
  leaveDays: number | null;
  confidence: string;
};

function emptySeaTime(): SeaTimeDraft {
  return {
    startDate: '',
    endDate: '',
    totalDays: '',
    atSeaDays: '',
    standbyDays: '',
    yardDays: '',
    leaveDays: '',
    countsTowardCareer: true,
  };
}

function seaTimeFromDoc(doc: CrewRecordDocument): SeaTimeDraft {
  return {
    startDate: doc.startDate ?? '',
    endDate: doc.endDate ?? '',
    totalDays: doc.totalDays != null ? String(doc.totalDays) : '',
    atSeaDays: doc.atSeaDays != null ? String(doc.atSeaDays) : '',
    standbyDays: doc.standbyDays != null ? String(doc.standbyDays) : '',
    yardDays: doc.yardDays != null ? String(doc.yardDays) : '',
    leaveDays: doc.leaveDays != null ? String(doc.leaveDays) : '',
    countsTowardCareer: doc.countsTowardCareer,
  };
}

function formatYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return format(parse(value, 'yyyy-MM-dd', new Date()), 'd MMM yyyy');
  } catch {
    return value;
  }
}

function overlappingUploadedIds(docs: CrewRecordDocument[]): Set<string> {
  const seaDocs = docs.filter(
    (d) =>
      d.startDate &&
      d.endDate &&
      isSeaServiceRecordKind(d.documentKind),
  );
  const ids = new Set<string>();
  for (let i = 0; i < seaDocs.length; i++) {
    for (let j = i + 1; j < seaDocs.length; j++) {
      const a = seaDocs[i];
      const b = seaDocs[j];
      if (
        a.startDate &&
        a.endDate &&
        b.startDate &&
        b.endDate &&
        overlapInclusiveRange(a.startDate, a.endDate, b.startDate, b.endDate)
      ) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return ids;
}

function seaTimeSummary(doc: CrewRecordDocument): string | null {
  const range =
    doc.startDate && doc.endDate
      ? `${formatYmd(doc.startDate)} – ${formatYmd(doc.endDate)}`
      : null;
  const bits = [
    range,
    doc.atSeaDays != null ? `${doc.atSeaDays} days at sea` : null,
    doc.totalDays != null && doc.totalDays !== doc.atSeaDays
      ? `${doc.totalDays} total days`
      : null,
    doc.standbyDays ? `${doc.standbyDays} standby` : null,
    doc.countsTowardCareer ? 'counts toward career' : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

function originBadgeClass(origin: CrewRecordDocumentOrigin): string {
  return origin === 'pre_seajourney'
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
    : 'border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

function kindBadgeClass(kind: CrewRecordDocumentKind): string {
  if (kind === 'testimonial') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  }
  if (kind === 'proof_of_service') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  return 'border-border bg-muted/40 text-muted-foreground';
}

function appendSeaTime(body: FormData, sea: SeaTimeDraft, kind: CrewRecordDocumentKind) {
  if (!isSeaServiceRecordKind(kind)) return;
  if (sea.startDate) body.append('startDate', sea.startDate);
  if (sea.endDate) body.append('endDate', sea.endDate);
  if (sea.totalDays.trim()) body.append('totalDays', sea.totalDays.trim());
  if (sea.atSeaDays.trim()) body.append('atSeaDays', sea.atSeaDays.trim());
  if (sea.standbyDays.trim()) body.append('standbyDays', sea.standbyDays.trim());
  if (sea.yardDays.trim()) body.append('yardDays', sea.yardDays.trim());
  if (sea.leaveDays.trim()) body.append('leaveDays', sea.leaveDays.trim());
  body.append('countsTowardCareer', sea.countsTowardCareer ? 'true' : 'false');
}

function DayField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="rounded-xl border bg-background px-3 py-2.5 shadow-sm">
      <Label
        htmlFor={id}
        className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        min={0}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        className="mt-1 h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}

function SeaTimeFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SeaTimeDraft;
  onChange: (next: SeaTimeDraft) => void;
  idPrefix: string;
}) {
  const set = (patch: Partial<SeaTimeDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`}>Start date</Label>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={value.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-end`}>End date</Label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={value.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <DayField
          id={`${idPrefix}-at-sea`}
          label="Days at sea"
          value={value.atSeaDays}
          onChange={(atSeaDays) => set({ atSeaDays })}
          placeholder="180"
        />
        <DayField
          id={`${idPrefix}-total`}
          label="Total days"
          value={value.totalDays}
          onChange={(totalDays) => set({ totalDays })}
        />
        <DayField
          id={`${idPrefix}-standby`}
          label="Standby"
          value={value.standbyDays}
          onChange={(standbyDays) => set({ standbyDays })}
        />
        <DayField
          id={`${idPrefix}-yard`}
          label="Yard"
          value={value.yardDays}
          onChange={(yardDays) => set({ yardDays })}
        />
        <DayField
          id={`${idPrefix}-leave`}
          label="Leave"
          value={value.leaveDays}
          onChange={(leaveDays) => set({ leaveDays })}
        />
      </div>
      <label className="flex items-start gap-3 rounded-xl border bg-muted/20 px-3 py-3 text-sm">
        <Checkbox
          checked={value.countsTowardCareer}
          onCheckedChange={(checked) => set({ countsTowardCareer: checked === true })}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Count toward career tracking</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Adds these days as documented sea service / proof of service.
          </span>
        </span>
      </label>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function useSeaDateConflicts({
  token,
  crewUserId,
  vesselId,
  startDate,
  endDate,
  excludeId,
  enabled,
}: {
  token?: string;
  crewUserId: string;
  vesselId: string;
  startDate: string;
  endDate: string;
  excludeId?: string | null;
  enabled: boolean;
}) {
  const [conflicts, setConflicts] = useState<SeaServiceDateConflict[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !token || !startDate || !endDate || endDate < startDate) {
      setConflicts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ crewUserId, vesselId, startDate, endDate });
        if (excludeId) qs.set('excludeId', excludeId);
        const res = await fetch(`/api/crew-record-documents/conflicts?${qs}`, {
          headers: bearerHeaders(token),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        setConflicts(Array.isArray(json.conflicts) ? json.conflicts : []);
      } catch {
        if (!cancelled) setConflicts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, crewUserId, vesselId, startDate, endDate, excludeId, enabled]);

  return { conflicts, loading };
}

function DateConflictNotice({
  conflicts,
  loading,
  countsTowardCareer,
  onDontCount,
}: {
  conflicts: SeaServiceDateConflict[];
  loading: boolean;
  countsTowardCareer: boolean;
  onDontCount: () => void;
}) {
  if (loading && conflicts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking for overlapping dates…
      </p>
    );
  }
  if (conflicts.length === 0) return null;

  const blocking = countsTowardCareer ? careerCountingConflicts(conflicts) : [];
  const blockingSet = new Set(blocking.map((c) => `${c.source}:${c.id}`));

  return (
    <Alert
      variant={blocking.length > 0 ? 'destructive' : 'default'}
      className={
        blocking.length > 0
          ? undefined
          : 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100 [&>svg]:text-amber-700 dark:[&>svg]:text-amber-200'
      }
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {blocking.length > 0
          ? 'Overlapping sea service'
          : 'Dates overlap an existing record'}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1.5">
          {conflicts.map((conflict) => {
            const isBlock = blockingSet.has(`${conflict.source}:${conflict.id}`);
            const overlap =
              conflict.overlapStart === conflict.overlapEnd
                ? formatYmd(conflict.overlapStart)
                : `${formatYmd(conflict.overlapStart)} – ${formatYmd(conflict.overlapEnd)}`;
            return (
              <li key={`${conflict.source}:${conflict.id}`}>
                {conflict.sourceLabel}
                {conflict.vesselName ? ` · ${conflict.vesselName}` : ''}
                {` · ${formatYmd(conflict.startDate)} – ${formatYmd(conflict.endDate)}`}
                {` (${conflict.overlapDays} overlapping day${conflict.overlapDays === 1 ? '' : 's'}${overlap ? `, ${overlap}` : ''})`}
                {isBlock ? ' — already counted toward career' : ''}
              </li>
            );
          })}
        </ul>
        {blocking.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p>
              Counting both toward career tracking would double-count those days. Change the dates, or save this file without counting it.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onDontCount}>
              Do not count toward career
            </Button>
          </div>
        ) : (
          <p className="mt-2">
            You can still save this file. Review the dates so the same period is not documented twice.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Vessel-facing list + upload for files attached to a crew record
 * (historical testimonials, manual scans). Crew see the same files
 * on Career documents → From vessels.
 */
export function CrewRecordDocumentsPanel({
  crewUserId,
  crewDisplayName,
  vesselId,
  canManage,
  className,
}: {
  crewUserId: string;
  crewDisplayName?: string;
  vesselId: string;
  canManage: boolean;
  className?: string;
}) {
  const { supabase, session } = useSupabase();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<CrewRecordDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [documentKind, setDocumentKind] = useState<CrewRecordDocumentKind>('testimonial');
  const [origin, setOrigin] = useState<CrewRecordDocumentOrigin>('pre_seajourney');
  const [issuedOn, setIssuedOn] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [issuedOpen, setIssuedOpen] = useState(false);
  const [seaTime, setSeaTime] = useState<SeaTimeDraft>(emptySeaTime);
  const [extracting, setExtracting] = useState(false);

  const [editDoc, setEditDoc] = useState<CrewRecordDocument | null>(null);
  const [editSeaTime, setEditSeaTime] = useState<SeaTimeDraft>(emptySeaTime);
  const [editSaving, setEditSaving] = useState(false);

  const who = crewDisplayName || 'this crew member';
  const token = session?.access_token;
  const showSeaTime = isSeaServiceRecordKind(documentKind);
  const addConflictState = useSeaDateConflicts({
    token,
    crewUserId,
    vesselId,
    startDate: seaTime.startDate,
    endDate: seaTime.endDate,
    enabled: formOpen && showSeaTime,
  });
  const editConflictState = useSeaDateConflicts({
    token,
    crewUserId,
    vesselId,
    startDate: editSeaTime.startDate,
    endDate: editSeaTime.endDate,
    excludeId: editDoc?.id ?? null,
    enabled: !!editDoc,
  });
  const addBlocking =
    showSeaTime && seaTime.countsTowardCareer
      ? careerCountingConflicts(addConflictState.conflicts)
      : [];
  const editBlocking = editSeaTime.countsTowardCareer
    ? careerCountingConflicts(editConflictState.conflicts)
    : [];
  const overlappingIds = overlappingUploadedIds(documents);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ crewUserId, vesselId });
      const res = await fetch(`/api/crew-record-documents?${qs}`, {
        headers: bearerHeaders(token),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load documents');
      setDocuments(Array.isArray(json.documents) ? json.documents : []);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not load uploaded documents',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [token, crewUserId, vesselId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setTitle('');
    setDocumentKind('testimonial');
    setOrigin('pre_seajourney');
    setIssuedOn(undefined);
    setNotes('');
    setFile(null);
    setIsDragging(false);
    setSeaTime(emptySeaTime());
    setExtracting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyExtracted = (extracted: ExtractedSea) => {
    if (extracted.title && !title.trim()) setTitle(extracted.title);
    setSeaTime((prev) => ({
      ...prev,
      startDate: extracted.startDate || prev.startDate,
      endDate: extracted.endDate || prev.endDate,
      totalDays:
        extracted.totalDays != null ? String(extracted.totalDays) : prev.totalDays,
      atSeaDays:
        extracted.atSeaDays != null ? String(extracted.atSeaDays) : prev.atSeaDays,
      standbyDays:
        extracted.standbyDays != null ? String(extracted.standbyDays) : prev.standbyDays,
      yardDays:
        extracted.yardDays != null ? String(extracted.yardDays) : prev.yardDays,
      leaveDays:
        extracted.leaveDays != null ? String(extracted.leaveDays) : prev.leaveDays,
      countsTowardCareer: true,
    }));
    if (!issuedOn) {
      const fallback = extracted.issuedOn || extracted.endDate;
      if (fallback) {
        try {
          setIssuedOn(parse(fallback, 'yyyy-MM-dd', new Date()));
        } catch {
          /* ignore */
        }
      }
    }
  };

  const extractFromFile = async (nextFile: File) => {
    if (!token) return;
    setExtracting(true);
    try {
      const body = new FormData();
      body.append('file', nextFile);
      const res = await fetch('/api/crew-record-documents/extract', {
        method: 'POST',
        headers: bearerHeaders(token),
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Could not read the file');
      }
      const extracted = (json as { extracted: ExtractedSea }).extracted;
      applyExtracted(extracted);
      const foundDays =
        extracted.atSeaDays != null || extracted.totalDays != null;
      toast({
        title: foundDays ? 'Sea time detected' : 'Nothing clear found',
        description: foundDays
          ? `Review the numbers (confidence: ${extracted.confidence}).`
          : 'Enter the sea-service totals manually.',
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not read sea time',
        description: e instanceof Error ? e.message : 'Enter the numbers manually.',
      });
    } finally {
      setExtracting(false);
    }
  };

  const applyChosenFile = (next: File | null) => {
    if (next) {
      const okType =
        ACCEPT_TYPES.has(next.type) || /\.(pdf|png|jpe?g|webp)$/i.test(next.name);
      if (!okType) {
        toast({
          variant: 'destructive',
          title: 'Unsupported file type',
          description: 'Use PDF, PNG, JPEG, or WebP.',
        });
        return;
      }
    }
    setFile(next);
    if (fileInputRef.current && !next) fileInputRef.current.value = '';
    if (next && isSeaServiceRecordKind(documentKind)) {
      void extractFromFile(next);
    }
  };

  const handleUpload = async () => {
    if (!token) return;
    if (!file) {
      toast({ variant: 'destructive', title: 'Choose a file' });
      return;
    }
    if (!title.trim()) {
      toast({ variant: 'destructive', title: 'Add a title' });
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('crewUserId', crewUserId);
      body.append('vesselId', vesselId);
      body.append('title', title.trim());
      body.append('documentKind', documentKind);
      body.append('origin', origin);
      if (issuedOn) body.append('issuedOn', format(issuedOn, 'yyyy-MM-dd'));
      if (notes.trim()) body.append('notes', notes.trim());
      appendSeaTime(body, seaTime, documentKind);

      const res = await fetch('/api/crew-record-documents', {
        method: 'POST',
        headers: bearerHeaders(token),
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || (res.status === 409 ? 'Dates overlap another record' : 'Upload failed'));
      }

      toast({
        title: 'Document added',
        description: `${who} can now see this on their career documents.`,
      });
      void notifyCrewOfDocumentCreated(supabase, {
        crewUserId,
        documentKind: 'record_upload',
        documentLabel: title.trim(),
        vesselId,
      });
      setFormOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not add document',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (doc: CrewRecordDocument, inline: boolean) => {
    if (!token) return;
    setBusyId(doc.id);
    try {
      const qs = inline ? '' : '?download=1';
      if (inline) {
        const res = await fetch(`/api/crew-record-documents/${doc.id}/file${qs}`, {
          headers: bearerHeaders(token),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Preview failed');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        await downloadWithAuth(
          `/api/crew-record-documents/${doc.id}/file?download=1`,
          token,
          doc.fileName,
        );
      }
    } catch (e) {
      toast({
        variant: 'destructive',
        title: inline ? 'Could not preview' : 'Could not download',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/crew-record-documents/${id}`, {
        method: 'DELETE',
        headers: bearerHeaders(token),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setDeleteId(null);
      toast({ title: 'Document removed' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not delete',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveSeaTime = async () => {
    if (!token || !editDoc) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/crew-record-documents/${editDoc.id}`, {
        method: 'PATCH',
        headers: {
          ...bearerHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: editSeaTime.startDate || null,
          endDate: editSeaTime.endDate || null,
          totalDays: editSeaTime.totalDays.trim() || null,
          atSeaDays: editSeaTime.atSeaDays.trim() || null,
          standbyDays: editSeaTime.standbyDays.trim() || null,
          yardDays: editSeaTime.yardDays.trim() || null,
          leaveDays: editSeaTime.leaveDays.trim() || null,
          countsTowardCareer: editSeaTime.countsTowardCareer,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error || (res.status === 409 ? 'Dates overlap another record' : 'Update failed'),
        );
      }
      const updated = json.document as CrewRecordDocument | undefined;
      if (updated) {
        setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      }
      setEditDoc(null);
      toast({ title: 'Sea time saved' });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not save sea time',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="font-semibold">Uploaded records</h4>
          <p className="text-sm text-muted-foreground mt-0.5">
            Attach testimonials or other files you already have — including ones created before SeaJourney.
            {who ? ` ${who} will see them with a badge.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {documents.length > 0 ? (
            <Badge variant="outline" className="text-xs">
              {documents.length} file{documents.length === 1 ? '' : 's'}
            </Badge>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setFormOpen(true)}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Add document
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading uploaded records…
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center">
          No uploaded records yet. Add a past testimonial or other file this crew member should keep.
        </p>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => {
            const issued = formatYmd(doc.issuedOn);
            const sea = seaTimeSummary(doc);
            return (
              <Card key={doc.id} className="rounded-xl border shadow-none">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <p className="font-semibold text-sm truncate">{doc.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn('text-[10px]', kindBadgeClass(doc.documentKind))}>
                          {CREW_RECORD_KIND_LABELS[doc.documentKind]}
                        </Badge>
                        <Badge variant="outline" className={cn('text-[10px]', originBadgeClass(doc.origin))}>
                          {CREW_RECORD_ORIGIN_LABELS[doc.origin]}
                        </Badge>
                        {overlappingIds.has(doc.id) ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                          >
                            Overlapping dates
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {issued ? `Dated ${issued} · ` : ''}
                        Added {format(new Date(doc.createdAt), 'd MMM yyyy')}
                        {doc.fileName ? ` · ${doc.fileName}` : ''}
                      </p>
                      {sea ? (
                        <p className="text-xs text-foreground/80">{sea}</p>
                      ) : isSeaServiceRecordKind(doc.documentKind) ? (
                        <p className="text-xs text-muted-foreground">
                          No sea-service totals yet — add them so this counts toward career tracking.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        title="Preview"
                        disabled={busyId === doc.id}
                        onClick={() => void handleDownload(doc, true)}
                      >
                        {busyId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        title="Download"
                        disabled={busyId === doc.id}
                        onClick={() => void handleDownload(doc, false)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canManage && isSeaServiceRecordKind(doc.documentKind) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          title="Edit sea time"
                          onClick={() => {
                            setEditDoc(doc);
                            setEditSeaTime(seaTimeFromDoc(doc));
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete"
                          disabled={busyId === doc.id}
                          onClick={() => setDeleteId(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-3xl">
          <DialogHeader className="space-y-0 border-b bg-muted/30 px-6 py-5 pr-14 text-left">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-600/10">
                <Upload className="h-5 w-5 text-sky-700 dark:text-sky-300" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="text-xl tracking-tight">Add document</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Attach a file to {who}'s record. For testimonials we can read sea time from the document, or you can enter the numbers.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-6">
              <section className="space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  File
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => applyChosenFile(e.target.files?.[0] ?? null)}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    applyChosenFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className={cn(
                    'flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : file
                        ? 'border-sky-500/40 bg-sky-500/[0.04]'
                        : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30',
                  )}
                >
                  {file ? (
                    <div className="flex w-full items-center gap-3 text-left">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10">
                        <FileText className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                          {extracting ? ' · Reading sea time…' : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          applyChosenFile(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-sky-500/10">
                        <FileUp className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Drop a file here or click to browse</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          PDF, PNG, JPEG, or WebP — max 15MB
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {showSeaTime && file ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={extracting}
                    onClick={() => void extractFromFile(file)}
                  >
                    {extracting ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ScanSearch className="mr-2 h-3.5 w-3.5" />
                    )}
                    {extracting ? 'Reading sea time…' : 'Read sea time from file'}
                  </Button>
                ) : null}
              </section>

              <section className="space-y-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="crd-title">Title</Label>
                  <Input
                    id="crd-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Sea service testimonial 2022–2024"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                      value={documentKind}
                      onValueChange={(v) => {
                        const next = v as CrewRecordDocumentKind;
                        setDocumentKind(next);
                        if (
                          file &&
                          isSeaServiceRecordKind(next) &&
                          !seaTime.atSeaDays &&
                          !seaTime.totalDays
                        ) {
                          void extractFromFile(file);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="testimonial">Testimonial</SelectItem>
                        <SelectItem value="proof_of_service">Proof of service</SelectItem>
                        <SelectItem value="certificate">Certificate</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Origin</Label>
                    <Select
                      value={origin}
                      onValueChange={(v) => setOrigin(v as CrewRecordDocumentOrigin)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre_seajourney">Before SeaJourney</SelectItem>
                        <SelectItem value="manual">Added manually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Document date</Label>
                    <Popover open={issuedOpen} onOpenChange={setIssuedOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            'w-full justify-start font-normal',
                            !issuedOn && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {issuedOn ? format(issuedOn, 'PPP') : 'Optional'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={issuedOn}
                          onSelect={(d) => {
                            setIssuedOn(d);
                            setIssuedOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crd-notes">Notes</Label>
                  <Textarea
                    id="crd-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Anything the crew should know about this file"
                    className="resize-none"
                  />
                </div>
              </section>

              {showSeaTime ? (
                <section className="space-y-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Sea service
                  </p>
                  <div className="space-y-4 rounded-2xl border bg-muted/15 p-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Review the dates and day counts before saving. Overlapping periods that already count toward career tracking cannot be counted twice.
                    </p>
                    <SeaTimeFields idPrefix="crd" value={seaTime} onChange={setSeaTime} />
                    <DateConflictNotice
                      conflicts={addConflictState.conflicts}
                      loading={addConflictState.loading}
                      countsTowardCareer={seaTime.countsTowardCareer}
                      onDontCount={() =>
                        setSeaTime((prev) => ({ ...prev, countsTowardCareer: false }))
                      }
                    />
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:justify-between">
            <p className="hidden text-xs text-muted-foreground sm:block">
              {who} will see this on their career documents with an origin badge.
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                disabled={saving || extracting || addBlocking.length > 0}
                onClick={() => void handleUpload()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add to records
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
        <DialogContent className="flex max-h-[min(92vh,820px)] w-[calc(100%-1.25rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-2xl">
          <DialogHeader className="space-y-0 border-b bg-muted/30 px-6 py-5 pr-14 text-left">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-600/10">
                <Pencil className="h-5 w-5 text-sky-700 dark:text-sky-300" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="text-xl tracking-tight">Edit sea time</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  {editDoc?.title || 'Uploaded record'} — these numbers are used as documented sea service for career tracking.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <SeaTimeFields idPrefix="edit" value={editSeaTime} onChange={setEditSeaTime} />
            <DateConflictNotice
              conflicts={editConflictState.conflicts}
              loading={editConflictState.loading}
              countsTowardCareer={editSeaTime.countsTowardCareer}
              onDontCount={() =>
                setEditSeaTime((prev) => ({ ...prev, countsTowardCareer: false }))
              }
            />
          </div>
          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => setEditDoc(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={editSaving || editBlocking.length > 0}
              onClick={() => void handleSaveSeaTime()}
            >
              {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save sea time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Remove this document?</DialogTitle>
            <DialogDescription>
              It will disappear from this vessel and from the crew member's career documents.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!!busyId}
              onClick={() => deleteId && void handleDelete(deleteId)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
