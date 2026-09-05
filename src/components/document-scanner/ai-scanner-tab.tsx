'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format as formatDate, formatDistanceToNow } from 'date-fns';
import { Users, Loader2, Clock, Upload, ScanSearch, Sparkles, Copy, Check, AlertCircle, X, Eye, FileText, History, Trash2, Save, RotateCcw, CalendarRange, Download, BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  newFieldId,
  makePlaceholderBbox,
  type TemplateField,
} from '@/lib/vessel-document-templates';
import { autoAlignTemplateFields } from '@/lib/auto-align-template-fields';
import { snapTemplateFieldsToPdfText } from '@/lib/snap-fields-to-pdf-text';
import { getVesselStateLogs } from '@/supabase/database/queries';
import { getVesselCalculationCategory, isAllDaysExceptLeaveCountAsSea } from '@/lib/vessel-calculation-categories';
import { computeSeaTimeInDateRange } from '@/lib/sea-time-in-range';
import type { UserProfile, Vessel, VesselAssignment } from '@/lib/types';
import type { ExtractedField } from '@/ai/document-scan-flow';
import { FilledDocumentPreview } from './filled-document-preview';
import { OriginalDocumentViewer } from './original-document-viewer';
import { ScanningAnimation } from './scanning-animation';
import { getSavedScansForVessel, saveScanTemplate, deleteSavedScan, updateSavedScanFields, type SavedScanTemplate } from '@/lib/scan-history';
import { computePeriodsBetweenLeave } from '@/lib/periods-between-leave';
import { fillScannedDocument, downloadBlob, type FillableField } from '@/lib/fill-scanned-document';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CrewOption { profile: UserProfile; assignment: VesselAssignment; }

interface ScannedField extends ExtractedField {
  suggestedValue: string | null;
  source: string;
}

interface ScanResult {
  documentTitle: string;
  documentDescription: string | null;
  fields: ScannedField[];
  unmatchedFields: ScannedField[];
  crewName: string;
  vesselName: string;
}

const CALCULABLE_KEYS = new Set([
  'servicePeriodStart',
  'servicePeriodEnd',
  'totalDays',
  'atSeaDays',
  'standbyDays',
  'yardDays',
  'leaveDays',
]);

interface AIScannerTabProps {
  supabase: SupabaseClient;
  session: { access_token: string } | null;
  currentUserProfile: UserProfile | null;
  activeVesselId: string | null;
  vessel: Vessel | undefined;
  crewList: CrewOption[];
  loadingCrew: boolean;
  /**
   * Increments every time the user clicks "New form" in the Form Builder
   * tab. We use it to nudge the scanner into template-build mode (shows a
   * callout at the top + auto-hands off to the Form Builder editor once a
   * scan finishes).
   */
  templateBuildRequestCount?: number;
  /**
   * If provided, replaces the legacy "Save as template" dialog flow with a
   * handoff to the Form Builder editor. After a successful scan in
   * template-build mode we call this with the scan file + detected fields
   * and let the parent (Documents page) mount the builder.
   */
  onOpenInBuilder?: (draft: {
    file: File;
    previewUrl: string | null;
    suggestedName: string;
    fields: TemplateField[];
  }) => void;
}

export function AIScannerTab({
  supabase, session, currentUserProfile, activeVesselId, vessel, crewList, loadingCrew,
  templateBuildRequestCount = 0,
  onOpenInBuilder,
}: AIScannerTabProps) {
  // Crew & date state
  const [selectedCrewId, setSelectedCrewId] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  // Sea time calculation
  const [isCalculating, setIsCalculating] = useState(false);
  const [seaTime, setSeaTime] = useState<{
    totalDays: number; atSeaDays: number; standbyDays: number; yardDays: number; leaveDays: number;
    underwayDays: number; atAnchorDays: number; inPortDays: number;
  } | null>(null);

  // File & scan state
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanFilePreview, setScanFilePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewTab, setViewTab] = useState<'filled' | 'original'>('filled');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Recent scans
  const [savedScans, setSavedScans] = useState<SavedScanTemplate[]>([]);
  const [isRematching, setIsRematching] = useState(false);
  const [usedTemplateId, setUsedTemplateId] = useState<string | null>(null);

  // Leave periods used to build "between-leave" preset date ranges for the selected crew.
  const [leavePeriods, setLeavePeriods] = useState<Array<{ startDate: string; endDate: string }>>([]);
  const [leavePeriodsFromLogs, setLeavePeriodsFromLogs] = useState<Array<{ startDate: string; endDate: string }>>([]);
  const [hasApprovedAccess, setHasApprovedAccess] = useState(false);

  // Load saved scans on mount / vessel change
  useEffect(() => {
    if (activeVesselId) {
      setSavedScans(getSavedScansForVessel(activeVesselId));
    }
  }, [activeVesselId]);

  // Fetch manual leave periods for the selected crew.
  useEffect(() => {
    if (!selectedCrewId || !activeVesselId) {
      setLeavePeriods([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/crew-leave-periods?crewUserId=${encodeURIComponent(selectedCrewId)}&vesselId=${encodeURIComponent(activeVesselId)}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.leavePeriods)) {
          setLeavePeriods(
            data.leavePeriods.map((p: { startDate: string; endDate: string }) => ({
              startDate: p.startDate,
              endDate: p.endDate,
            })),
          );
        } else if (!cancelled) {
          setLeavePeriods([]);
        }
      } catch {
        if (!cancelled) setLeavePeriods([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCrewId, activeVesselId]);

  // Check if this vessel manager has approved sea-time access for the crew member;
  // when yes, we can also pull leave periods inferred from state logs.
  useEffect(() => {
    if (!selectedCrewId || !activeVesselId || !currentUserProfile?.id) {
      setHasApprovedAccess(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('vessel_sea_time_access_requests')
        .select('status')
        .eq('vessel_user_id', currentUserProfile.id)
        .eq('crew_user_id', selectedCrewId)
        .eq('vessel_id', activeVesselId)
        .eq('status', 'approved')
        .maybeSingle();
      if (!cancelled) setHasApprovedAccess(data?.status === 'approved');
    })();
    return () => { cancelled = true; };
  }, [supabase, selectedCrewId, activeVesselId, currentUserProfile?.id]);

  // Fetch leave periods inferred from logs when access is approved.
  useEffect(() => {
    const assignment = (crewList.find((c) => c.profile.id === selectedCrewId)?.assignment) ?? null;
    if (!hasApprovedAccess || !selectedCrewId || !activeVesselId || !currentUserProfile?.id || !assignment?.startDate) {
      setLeavePeriodsFromLogs([]);
      return;
    }
    const rangeStart = assignment.startDate;
    const rangeEnd = assignment.endDate ?? formatDate(new Date(), 'yyyy-MM-dd');
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          crewUserId: selectedCrewId,
          vesselUserId: currentUserProfile.id,
          rangeStart,
          rangeEnd,
          vesselId: activeVesselId,
        });
        const res = await fetch(`/api/vessel-sea-time-access/sea-time-data?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.leavePeriodsFromLogs)) {
          setLeavePeriodsFromLogs(data.leavePeriodsFromLogs);
        } else if (!cancelled) {
          setLeavePeriodsFromLogs([]);
        }
      } catch {
        if (!cancelled) setLeavePeriodsFromLogs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [hasApprovedAccess, selectedCrewId, activeVesselId, currentUserProfile?.id, crewList]);

  const selectedCrew = useMemo(
    () => crewList.find((c) => c.profile.id === selectedCrewId) ?? null,
    [crewList, selectedCrewId],
  );

  // Preset date ranges: the non-leave windows inside the crew's assignment.
  const presetPeriods = useMemo(() => {
    if (!selectedCrew?.assignment) return [];
    return computePeriodsBetweenLeave(
      selectedCrew.assignment,
      leavePeriods,
      leavePeriodsFromLogs,
    );
  }, [selectedCrew?.assignment, leavePeriods, leavePeriodsFromLogs]);

  const crewSelectOptions = useMemo(
    () => crewList.map((c) => {
      const name = [c.profile.firstName, c.profile.lastName].filter(Boolean).join(' ') || c.profile.username || c.profile.email || 'Unknown';
      const email = c.profile.email ? ` (${c.profile.email})` : '';
      return { value: c.profile.id, label: `${name}${email}` };
    }),
    [crewList],
  );

  // Auto-scroll to next step when it appears
  useEffect(() => {
    if (selectedCrewId && step2Ref.current) {
      setTimeout(() => step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  }, [selectedCrewId]);

  useEffect(() => {
    if (seaTime && step3Ref.current) {
      setTimeout(() => step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  }, [seaTime]);

  // Auto-scroll to results only when the scan FIRST completes (null → set),
  // never on subsequent updates. Otherwise adjustments to overlay positions
  // (which mutate scanResult in place) yank the page back to the top and
  // make repositioning impossible.
  const didScrollToResults = useRef(false);
  useEffect(() => {
    if (!scanResult) {
      didScrollToResults.current = false;
      return;
    }
    if (didScrollToResults.current || !resultsRef.current) return;
    didScrollToResults.current = true;
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [scanResult]);

  // Calculate sea time (reuses same logic as Generator)
  const handleCalculate = async () => {
    if (!selectedCrew || !activeVesselId || !startDate || !endDate) {
      toast({ title: 'Error', description: 'Select crew, start and end dates.', variant: 'destructive' });
      return;
    }
    if (startDate > endDate) {
      toast({ title: 'Error', description: 'Start date must be before end date.', variant: 'destructive' });
      return;
    }
    setIsCalculating(true);
    setSeaTime(null);
    try {
      const startStr = formatDate(startDate, 'yyyy-MM-dd');
      const endStr = formatDate(endDate, 'yyyy-MM-dd');
      const targetUserId = (vessel as any)?.vessel_manager_id || currentUserProfile?.id;
      const logs = await getVesselStateLogs(supabase, activeVesselId, targetUserId);
      const filtered = logs.filter((l) => l.date >= startStr && l.date <= endStr);
      if (!filtered.length) {
        toast({ title: 'No Data', description: 'No state logs found for the selected range.', variant: 'destructive' });
        return;
      }
      const result = computeSeaTimeInDateRange({
        filteredLogs: filtered, rangeStart: startStr, rangeEnd: endStr,
        useCrewLogs: false, vesselType: vessel?.type ?? null, watchDates: new Set(),
      });
      setSeaTime({
        totalDays: result.totalDays, atSeaDays: result.atSeaDays, standbyDays: result.standbyDays,
        yardDays: result.yardDays, leaveDays: result.leaveDays, underwayDays: result.underwayDays,
        atAnchorDays: result.atAnchorDays, inPortDays: result.inPortDays,
      });
      toast({ title: 'Calculated', description: 'Sea time calculated. Now upload and scan a document.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to calculate sea time.', variant: 'destructive' });
    } finally {
      setIsCalculating(false);
    }
  };

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Invalid file', description: 'Upload a PDF, PNG, JPEG, or WebP.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum 10MB.', variant: 'destructive' });
      return;
    }
    setScanFile(file);
    setScanResult(null);
    setScanError(null);
    setEditedValues({});
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setScanFilePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setScanFilePreview(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // Scan document. Crew is OPTIONAL up-front — you can upload any document,
  // see what the scanner detects, and only then pick a crew member / date
  // range if the document actually asks for that kind of data.
  const handleScan = async () => {
    if (!scanFile || !activeVesselId || !session?.access_token) {
      toast({ title: 'Missing info', description: 'Upload a file to scan.', variant: 'destructive' });
      return;
    }
    setIsScanning(true);
    setScanError(null);
    setScanResult(null);
    setEditedValues({});
    try {
      const fd = new FormData();
      fd.append('file', scanFile);
      if (selectedCrewId) fd.append('crewUserId', selectedCrewId);
      fd.append('vesselId', activeVesselId);
      if (seaTime && startDate && endDate && selectedCrewId) {
        fd.append('seaTimeData', JSON.stringify({
          startDate: formatDate(startDate, 'yyyy-MM-dd'),
          endDate: formatDate(endDate, 'yyyy-MM-dd'),
          ...seaTime,
        }));
      }
      const res = await fetch('/api/document-scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setScanResult(data as ScanResult);
      // Seed the rematch key so the auto-rematch effect doesn't fire a
      // redundant request for context we just submitted during the scan.
      lastRematchKey.current = JSON.stringify({
        crew: selectedCrewId || '',
        vessel: activeVesselId,
        st: seaTime && startDate && endDate
          ? { s: startDate.toISOString(), e: endDate.toISOString(), ...seaTime }
          : null,
      });
      const initial: Record<string, string> = {};
      [...(data.fields || []), ...(data.unmatchedFields || [])].forEach((f: ScannedField, i: number) => {
        initial[`${f.fieldName}-${i}`] = f.suggestedValue || f.originalValue || '';
      });
      setEditedValues(initial);
      // Auto-save the scan template
      if (activeVesselId && currentUserProfile?.id && scanFile) {
        const allFields = [...(data.fields || []), ...(data.unmatchedFields || [])];
        const saved = saveScanTemplate({
          documentTitle: data.documentTitle,
          documentDescription: data.documentDescription ?? null,
          fileName: scanFile.name,
          fileType: scanFile.type,
          fields: allFields.map((f: ScannedField) => ({
            fieldName: f.fieldName,
            fieldDescription: f.fieldDescription,
            originalValue: f.originalValue,
            category: f.category,
            profileKey: f.profileKey,
            page: (f as any).page,
            bbox: (f as any).bbox,
          })),
          vesselId: activeVesselId,
          vesselName: data.vesselName,
          savedBy: currentUserProfile.id,
        });
        setUsedTemplateId(saved.id);
        setSavedScans(getSavedScansForVessel(activeVesselId));
      }
      toast({ title: 'Scan complete', description: `Found ${data.fields?.length || 0} matched and ${data.unmatchedFields?.length || 0} unmatched fields.` });
    } catch (e: any) {
      setScanError(e?.message || 'Failed to scan document');
      toast({ title: 'Scan failed', description: e?.message, variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  };

  const [isDownloading, setIsDownloading] = useState(false);

  // --- Template-save state ---
  // `templateBuildMode` is true when the user came from the "Custom
  // Templates → New template" button. It shows a callout up top and auto-
  // opens the save dialog after a successful scan.
  const [templateBuildMode, setTemplateBuildMode] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const lastTemplateBuildCountRef = useRef<number>(templateBuildRequestCount);

  // When the parent increments `templateBuildRequestCount`, flip into
  // template-build mode. We compare to the previous value so mounting
  // doesn't accidentally trigger it.
  useEffect(() => {
    if (templateBuildRequestCount > lastTemplateBuildCountRef.current) {
      setTemplateBuildMode(true);
      lastTemplateBuildCountRef.current = templateBuildRequestCount;
      // Scroll to the top so they see the upload step.
      if (typeof window !== 'undefined') {
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
      }
    }
  }, [templateBuildRequestCount]);

  /**
   * Build the TemplateField[] we'd save from the current scan result. We
   * share this between (a) the auto-handoff to the Form Builder and (b)
   * the legacy "Save as template" dialog so both emit identical rows.
   *
   * Returns null when there are no detected fields. Fields without a
   * detected position are stacked down the left margin so the builder can
   * surface them for the user to drag into place.
   */
  const buildTemplateFieldsFromScan = useCallback(
    (): { fields: TemplateField[]; unpositionedCount: number } | null => {
      if (!scanResult) return null;
      const all = [...scanResult.fields, ...scanResult.unmatchedFields];
      const fields: TemplateField[] = [];
      let placeholderIndex = 0;
      let unpositionedCount = 0;
      all.forEach((f, i) => {
        const rawPage = (f as any).page as number | undefined;
        const rawBbox = (f as any).bbox as TemplateField['bbox'] | undefined;
        const hasBbox =
          !!rawBbox &&
          Number.isFinite(rawBbox.xMin) &&
          Number.isFinite(rawBbox.xMax) &&
          Number.isFinite(rawBbox.yMin) &&
          Number.isFinite(rawBbox.yMax) &&
          rawBbox.xMax > rawBbox.xMin &&
          rawBbox.yMax > rawBbox.yMin;
        const page = rawPage && rawPage > 0 ? rawPage : 1;
        const bbox = hasBbox ? rawBbox! : makePlaceholderBbox(placeholderIndex++);
        if (!hasBbox) unpositionedCount += 1;

        const valueKey = `${f.fieldName}-${i}`;
        const edited = editedValues[valueKey];
        const defaultValue =
          edited &&
          edited !== (f.suggestedValue ?? '') &&
          edited !== (f.originalValue ?? '')
            ? edited
            : undefined;
        fields.push({
          id: newFieldId(),
          label: f.fieldName,
          type: 'text',
          profileKey: f.profileKey && f.profileKey !== 'none' ? f.profileKey : null,
          page,
          bbox,
          defaultValue,
          originalLabel: f.fieldName,
        });
      });
      // Clean up the AI's bboxes — snap same-row fields to identical y,
      // same-column fields to identical x, and normalise single-line
      // heights. Placeholders are untouched so the user still sees them
      // stacked on the left margin.
      const aligned = autoAlignTemplateFields(fields);
      return { fields: aligned, unpositionedCount };
    },
    [scanResult, editedValues],
  );

  const finalizeFieldsForBuilder = useCallback(
    async (fields: TemplateField[]): Promise<TemplateField[]> => {
      if (!scanFile || scanFile.type !== 'application/pdf') return fields;
      try {
        return await snapTemplateFieldsToPdfText(scanFile, fields);
      } catch (err) {
        console.warn('[form-builder] PDF text snap failed, using AI boxes', err);
        return fields;
      }
    },
    [scanFile],
  );

  // Once a scan finishes while in template-build mode we hand the draft
  // straight to the Form Builder (the parent mounts the editor). Each scan
  // triggers only once — rescans reset the guard via a new scan signature.
  const didHandOffToBuilder = useRef<string | null>(null);
  useEffect(() => {
    if (!templateBuildMode || !scanResult || !scanFile) return;
    const key = `${scanFile.name}-${scanResult.documentTitle}`;
    if (didHandOffToBuilder.current === key) return;

    let cancelled = false;

    const handOff = async () => {
      // Preferred path: let the parent swap us out for the full builder.
      if (onOpenInBuilder) {
        const built = buildTemplateFieldsFromScan();
        if (!built || !built.fields.length) return;
        didHandOffToBuilder.current = key;
        const fields = await finalizeFieldsForBuilder(built.fields);
        if (cancelled) return;
        const suggested =
          scanResult.documentTitle || scanFile.name.replace(/\.[^.]+$/, '');
        onOpenInBuilder({
          file: scanFile,
          previewUrl: scanFilePreview,
          suggestedName: suggested,
          fields,
        });
        // Clear templateBuildMode so we don't re-trigger on a subsequent
        // rescan of the same session.
        setTemplateBuildMode(false);
        return;
      }

      // Legacy fallback: open the old quick-save dialog.
      didHandOffToBuilder.current = key;
      setTemplateName((prev) =>
        prev || scanResult.documentTitle || scanFile.name.replace(/\.[^.]+$/, ''),
      );
      setTemplateDescription((prev) => prev || scanResult.documentDescription || '');
      setSaveTemplateOpen(true);
    };

    void handOff();
    return () => {
      cancelled = true;
    };
  }, [
    templateBuildMode,
    scanResult,
    scanFile,
    scanFilePreview,
    onOpenInBuilder,
    buildTemplateFieldsFromScan,
    finalizeFieldsForBuilder,
  ]);

  /**
   * Remove a field entirely from the current scan result. Used by the
   * "X" button next to each field in the Filled Document Preview — lets
   * the user clean up fields the AI detected that aren't actually wanted
   * on the template (e.g. decorative labels, watermarks).
   */
  const handleDeleteField = useCallback((globalIndex: number) => {
    setScanResult((prev) => {
      if (!prev) return prev;
      const matchedLen = prev.fields.length;
      if (globalIndex < matchedLen) {
        const next = prev.fields.filter((_, i) => i !== globalIndex);
        return { ...prev, fields: next };
      }
      const idx = globalIndex - matchedLen;
      const next = prev.unmatchedFields.filter((_, i) => i !== idx);
      return { ...prev, unmatchedFields: next };
    });
  }, []);

  /**
   * POST the current scan as a new template. We derive TemplateField rows
   * from the scan result — keeping position, bbox, profileKey and an
   * optional `defaultValue` pulled from the user's current edits (so they
   * can freeze in a literal value for fields that shouldn't auto-fill).
   */
  const handleSaveAsTemplate = async () => {
    if (!scanFile || !scanResult || !activeVesselId || !session?.access_token) {
      toast({
        title: 'Cannot save yet',
        description: 'Upload and scan a document first.',
        variant: 'destructive',
      });
      return;
    }
    const trimmedName = templateName.trim();
    if (!trimmedName) {
      toast({
        title: 'Name required',
        description: 'Give the template a name so you can find it later.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingTemplate(true);
    try {
      const all = [...scanResult.fields, ...scanResult.unmatchedFields];
      const templateFields: TemplateField[] = [];
      // We stack "un-positioned" placeholders down the left margin of page
      // 1 so the user can see them on the Original view and drag them into
      // place. Without this, a scan where the AI didn't return bboxes
      // would save zero fields and the template would be useless.
      let placeholderIndex = 0;
      const makePlaceholderBbox = () => {
        const rows = 20;
        const rowHeight = 1000 / rows;
        const row = placeholderIndex % rows;
        const col = Math.floor(placeholderIndex / rows); // shift right after each column fills
        placeholderIndex += 1;
        const yMin = row * rowHeight + 5;
        const yMax = yMin + rowHeight - 10;
        const xMin = 20 + col * 220;
        const xMax = xMin + 200;
        return { xMin, yMin, xMax, yMax };
      };

      let unpositionedCount = 0;
      all.forEach((f, i) => {
        const rawPage = (f as any).page as number | undefined;
        const rawBbox = (f as any).bbox as TemplateField['bbox'] | undefined;
        const hasBbox =
          !!rawBbox &&
          Number.isFinite(rawBbox.xMin) &&
          Number.isFinite(rawBbox.xMax) &&
          Number.isFinite(rawBbox.yMin) &&
          Number.isFinite(rawBbox.yMax) &&
          rawBbox.xMax > rawBbox.xMin &&
          rawBbox.yMax > rawBbox.yMin;

        const page = rawPage && rawPage > 0 ? rawPage : 1;
        const bbox = hasBbox ? rawBbox! : makePlaceholderBbox();
        if (!hasBbox) unpositionedCount += 1;

        const valueKey = `${f.fieldName}-${i}`;
        const edited = editedValues[valueKey];
        // If the user typed a value that differs from the auto-filled
        // suggestion we treat it as a static default on the template.
        // Otherwise we leave defaultValue undefined so the field will
        // auto-fill per-crew.
        const defaultValue =
          edited &&
          edited !== (f.suggestedValue ?? '') &&
          edited !== (f.originalValue ?? '')
            ? edited
            : undefined;
        templateFields.push({
          id: newFieldId(),
          label: f.fieldName,
          profileKey: f.profileKey && f.profileKey !== 'none' ? f.profileKey : null,
          page,
          bbox,
          defaultValue,
          originalLabel: f.fieldName,
        });
      });

      if (!templateFields.length) {
        toast({
          title: 'Nothing to save',
          description:
            'No fields were detected on this document. Try re-scanning or uploading a clearer file.',
          variant: 'destructive',
        });
        return;
      }

      const fd = new FormData();
      fd.append('file', scanFile);
      fd.append('vesselId', activeVesselId);
      fd.append('name', trimmedName);
      if (templateDescription.trim()) fd.append('description', templateDescription.trim());
      fd.append('fields', JSON.stringify(templateFields));

      const res = await fetch('/api/document-templates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save template');

      toast({
        title: 'Template saved',
        description:
          unpositionedCount > 0
            ? `"${trimmedName}" saved with ${unpositionedCount} field${unpositionedCount === 1 ? '' : 's'} stacked on the left edge — drag them into place on the Original view next time you open this document, or they'll fill there by default.`
            : `"${trimmedName}" is now in Custom Templates. Use it for any crew member in one click.`,
      });
      setSaveTemplateOpen(false);
      setTemplateBuildMode(false);
      setTemplateName('');
      setTemplateDescription('');
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Build a filled PDF of the uploaded document by stamping each extracted
  // field's current value into its AI-detected bounding box, and trigger a
  // browser download. This is the "upload → scan → filled doc" output — no
  // manual repositioning required.
  const handleDownloadFilled = async () => {
    if (!scanResult || !scanFile) {
      toast({ title: 'Nothing to download', description: 'Run a scan first.', variant: 'destructive' });
      return;
    }
    setIsDownloading(true);
    try {
      const all = [...scanResult.fields, ...scanResult.unmatchedFields];
      const fillable: FillableField[] = all.map((f, i) => ({
        fieldName: f.fieldName,
        value: (editedValues[`${f.fieldName}-${i}`] ?? f.suggestedValue ?? f.originalValue ?? '').toString(),
        page: (f as any).page,
        bbox: (f as any).bbox,
      }));
      const { blob, filledCount, skippedCount } = await fillScannedDocument(scanFile, fillable);
      const base = scanFile.name.replace(/\.[^.]+$/, '') || 'scanned-document';
      downloadBlob(blob, `${base}-filled.pdf`);
      toast({
        title: 'Filled document ready',
        description:
          skippedCount > 0
            ? `Stamped ${filledCount} fields. ${skippedCount} skipped (no position or empty value).`
            : `Stamped ${filledCount} fields.`,
      });
    } catch (e: any) {
      toast({ title: 'Download failed', description: e?.message || 'Could not build filled document.', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyAll = () => {
    if (!scanResult) return;
    const all = [...scanResult.fields, ...scanResult.unmatchedFields];
    const lines = all.map((f, i) => {
      const val = editedValues[`${f.fieldName}-${i}`] ?? f.suggestedValue ?? f.originalValue ?? '';
      return `${f.fieldName}: ${val}`;
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast({ title: 'Copied', description: 'All values copied to clipboard.' });
  };

  const handleCopyField = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleReset = () => {
    setScanFile(null);
    setScanFilePreview(null);
    setScanResult(null);
    setScanError(null);
    setEditedValues({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Use a saved scan template — re-match against selected crew
  const handleUseSavedScan = async (template: SavedScanTemplate) => {
    if (!selectedCrewId || !activeVesselId || !session?.access_token) {
      toast({ title: 'Select a crew member first', description: 'Pick a crew member before using a saved template.', variant: 'destructive' });
      return;
    }
    setIsRematching(true);
    setScanError(null);
    setScanResult(null);
    setScanFile(null);
    setEditedValues({});
    setUsedTemplateId(template.id);
    try {
      const body: any = {
        fields: template.fields,
        crewUserId: selectedCrewId,
        vesselId: activeVesselId,
      };
      if (seaTime && startDate && endDate) {
        body.seaTimeData = {
          startDate: formatDate(startDate, 'yyyy-MM-dd'),
          endDate: formatDate(endDate, 'yyyy-MM-dd'),
          ...seaTime,
        };
      }
      const res = await fetch('/api/document-scan/rematch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rematch failed');
      setScanResult({
        documentTitle: template.documentTitle,
        documentDescription: template.documentDescription,
        fields: data.fields,
        unmatchedFields: data.unmatchedFields,
        crewName: data.crewName,
        vesselName: data.vesselName,
      });
      const initial: Record<string, string> = {};
      [...(data.fields || []), ...(data.unmatchedFields || [])].forEach((f: ScannedField, i: number) => {
        initial[`${f.fieldName}-${i}`] = f.suggestedValue || f.originalValue || '';
      });
      setEditedValues(initial);
      toast({ title: 'Template applied', description: `Matched ${data.fields?.length || 0} fields for the selected crew member.` });
    } catch (e: any) {
      setScanError(e?.message || 'Failed to apply template');
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally {
      setIsRematching(false);
    }
  };

  const handleDeleteScan = (id: string) => {
    deleteSavedScan(id);
    if (activeVesselId) setSavedScans(getSavedScansForVessel(activeVesselId));
    toast({ title: 'Deleted', description: 'Saved scan removed.' });
  };

  // Determine which step the user is at
  const hasCrewSelected = !!selectedCrewId;
  const hasDates = !!startDate && !!endDate;
  const hasSeaTime = !!seaTime;
  const hasFile = !!scanFile;

  // Look at the extracted fields and decide what context the document
  // actually needs. A passport photo doesn't need sea-time; an AMSA 771
  // testimonial does. Rather than forcing every upload through the
  // sea-service flow, we derive the requirements from what the AI found.
  const docRequirements = useMemo(() => {
    if (!scanResult) return { needsCrew: false, needsSeaTime: false, hasVesselFields: false };
    const all = [...scanResult.fields, ...scanResult.unmatchedFields];
    const PERSONAL_CATS = new Set(['personal', 'certificate', 'authority']);
    let needsCrew = false;
    let needsSeaTime = false;
    let hasVesselFields = false;
    for (const f of all) {
      const key = (f as any).profileKey as string | undefined;
      const cat = (f as any).category as string | undefined;
      if (cat === 'vessel') hasVesselFields = true;
      if (cat === 'service' || (key && CALCULABLE_KEYS.has(key))) needsSeaTime = true;
      if (
        (key && key !== 'none') ||
        (cat && PERSONAL_CATS.has(cat)) ||
        cat === 'service'
      ) {
        needsCrew = true;
      }
    }
    return { needsCrew, needsSeaTime, hasVesselFields };
  }, [scanResult]);

  // Auto-rematch whenever the user supplies (or changes) the context the
  // scanned document needs. Keeps suggestedValues in sync without making
  // the user click "Scan" again.
  const lastRematchKey = useRef<string>('');
  useEffect(() => {
    if (!scanResult || !activeVesselId || !selectedCrewId || !session?.access_token) return;
    // Build a stable key to avoid re-running rematch in a loop for the
    // same context. Include sea time so changes are picked up.
    const key = JSON.stringify({
      crew: selectedCrewId,
      vessel: activeVesselId,
      st: seaTime
        ? { s: startDate?.toISOString() ?? '', e: endDate?.toISOString() ?? '', ...seaTime }
        : null,
    });
    if (lastRematchKey.current === key) return;
    lastRematchKey.current = key;

    let cancelled = false;
    (async () => {
      try {
        setIsRematching(true);
        const allFields = [...scanResult.fields, ...scanResult.unmatchedFields].map((f) => ({
          fieldName: f.fieldName,
          fieldDescription: (f as any).fieldDescription,
          originalValue: (f as any).originalValue,
          category: (f as any).category,
          profileKey: (f as any).profileKey,
          page: (f as any).page,
          bbox: (f as any).bbox,
        }));
        const body: any = {
          fields: allFields,
          crewUserId: selectedCrewId,
          vesselId: activeVesselId,
        };
        if (seaTime && startDate && endDate) {
          body.seaTimeData = {
            startDate: formatDate(startDate, 'yyyy-MM-dd'),
            endDate: formatDate(endDate, 'yyyy-MM-dd'),
            ...seaTime,
          };
        }
        const res = await fetch('/api/document-scan/rematch', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Rematch failed');
        if (cancelled) return;
        setScanResult((prev) =>
          prev
            ? {
                ...prev,
                fields: data.fields,
                unmatchedFields: data.unmatchedFields,
                crewName: data.crewName || prev.crewName,
                vesselName: data.vesselName || prev.vesselName,
              }
            : prev,
        );
        const next: Record<string, string> = {};
        [...(data.fields || []), ...(data.unmatchedFields || [])].forEach((f: ScannedField, i: number) => {
          next[`${f.fieldName}-${i}`] = f.suggestedValue || f.originalValue || '';
        });
        setEditedValues(next);
      } catch (e: any) {
        if (!cancelled) {
          toast({ title: 'Auto-fill failed', description: e?.message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setIsRematching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCrewId, seaTime, scanResult?.documentTitle, activeVesselId]);

  const scanReadiness = useMemo(() => {
    if (!scanResult) return null;
    const allFields = [...scanResult.fields, ...scanResult.unmatchedFields];
    const missingManual = allFields.filter((f) => !f.suggestedValue);
    const filled = allFields.length - missingManual.length;
    const calculated = allFields.filter((f) => f.source === 'calculated').length;
    const fromProfile = allFields.filter((f) => f.source === 'profile').length;
    const fromVessel = allFields.filter((f) => f.source === 'vessel').length;
    const fromCaptain = allFields.filter((f) => f.source === 'captain').length;
    const calculableMissing = missingManual.filter((f) => CALCULABLE_KEYS.has(f.profileKey || '')).length;

    return {
      total: allFields.length,
      filled,
      missingManual,
      calculated,
      fromProfile,
      fromVessel,
      fromCaptain,
      calculableMissing,
    };
  }, [scanResult]);

  return (
    <div className="flex flex-col gap-6">
      {templateBuildMode && (
        <Card className="order-0 border-primary/30 bg-primary/[0.04]">
          <CardContent className="py-3 flex items-start gap-3">
            <BookmarkPlus className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Build a form</p>
              <p className="text-xs text-muted-foreground">
                Upload the document and scan it. As soon as the scan finishes
                we&apos;ll open the <strong>Form Builder</strong> where you can
                position, rename, add, remove, and configure fields before
                saving it for reuse across your crew.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTemplateBuildMode(false)}
              aria-label="Dismiss template-build callout"
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent scans */}
      {savedScans.length > 0 && (
        <Card className="order-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />
              Recent scans
            </CardTitle>
            <CardDescription>Previously scanned documents. Click to re-use with a different crew member — no AI re-scan needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {savedScans.slice(0, 6).map((scan) => (
                <div
                  key={scan.id}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-200 hover:bg-muted/50 hover:border-primary/30',
                    usedTemplateId === scan.id && 'border-primary/40 bg-primary/[0.03]',
                  )}
                  onClick={() => handleUseSavedScan(scan)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-violet-500/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{scan.documentTitle}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {scan.fileName} · {formatDistanceToNow(new Date(scan.savedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isRematching && usedTemplateId === scan.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDeleteScan(scan.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/*
        New flow (doc-driven): upload first → the scanner works out what
        the document is asking for → we only prompt for the context the
        document actually needs (crew, date range, etc.). A passport scan
        doesn't need sea-time; an AMSA 771 does.
      */}

      {/* Step 2 (conditional): Crew member — shown after scan if the doc
          has any profile-driven fields (personal / vessel / certificate /
          authority / service). Picking a crew here triggers auto-rematch. */}
      {scanResult && docRequirements.needsCrew && (
        <Card ref={step2Ref} className="order-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', hasCrewSelected ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground')}>2</div>
              <Users className="h-4 w-4" />
              Select crew member
            </CardTitle>
            <CardDescription>The scanned document needs profile data. Pick a crew member and fields will auto-fill.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCrew ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading crew…</div>
            ) : (
              <SearchableSelect
                options={crewSelectOptions}
                value={selectedCrewId}
                onValueChange={(v) => {
                  setSelectedCrewId(v);
                  // Different crew → different logs, so any prior sea-time
                  // calc no longer applies. DON'T clear scanResult — the
                  // auto-rematch effect will refill values for the new crew.
                  setSeaTime(null);
                }}
                placeholder="Select crew member"
                searchPlaceholder="Search by name or email…"
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3 (conditional): Date range + Calculate — shown only if the
          doc has sea-time fields AND we have a crew to calculate for. */}
      {scanResult && docRequirements.needsSeaTime && hasCrewSelected && (
        <Card ref={step3Ref} className="order-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', hasSeaTime ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground')}>3</div>
              <Clock className="h-4 w-4" />
              Date range &amp; calculate
            </CardTitle>
            <CardDescription>The scanned document has sea-service fields. Pick the period and calculate — values auto-fill when ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {presetPeriods.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarRange className="h-3.5 w-3.5" />
                  <span className="font-medium">Quick presets</span>
                  <span>— periods between this crew member's leaves</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {presetPeriods.map((p, idx) => {
                    const isActive =
                      startDate?.getTime() === p.startDate.getTime() &&
                      endDate?.getTime() === p.endDate.getTime();
                    return (
                      <Button
                        key={`${p.startDate.toISOString()}-${idx}`}
                        type="button"
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        className="h-7 rounded-lg text-[11px] font-normal"
                        onClick={() => {
                          setStartDate(p.startDate);
                          setEndDate(p.endDate);
                          setSeaTime(null);
                        }}
                      >
                        {p.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                      {startDate ? formatDate(startDate, 'PPP') : 'Pick start date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={startDate} onSelect={setStartDate} disabled={(d) => d > new Date()} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                      {endDate ? formatDate(endDate, 'PPP') : 'Pick end date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={endDate} onSelect={setEndDate} disabled={(d) => d > new Date()} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <Button onClick={handleCalculate} disabled={isCalculating || !hasDates || (startDate! > endDate!)} className="w-full rounded-xl h-11" size="lg">
              {isCalculating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculating…</> : <><Clock className="mr-2 h-4 w-4" /> Calculate Sea Time</>}
            </Button>
            {seaTime && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-xl border bg-muted/30 p-4 animate-in fade-in-0 duration-300">
                {[
                  { label: 'Total', value: seaTime.totalDays },
                  { label: 'At Sea', value: seaTime.atSeaDays, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Standby', value: seaTime.standbyDays, color: 'text-[#7629BB] dark:text-purple-400' },
                  { label: 'Yard', value: seaTime.yardDays },
                  { label: 'Leave', value: seaTime.leaveDays },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                    <div className={cn('text-xl font-bold tabular-nums', color)}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Upload & Scan — always available. The doc-driven flow
          starts here; crew / date-range cards are shown ONLY if the
          scanned document actually asks for that information. */}
      <Card className="order-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 scroll-mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', scanResult ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground')}>1</div>
              <ScanSearch className="h-4 w-4" />
              Upload &amp; scan document
            </CardTitle>
            <CardDescription>Drop any PDF or image — the scanner detects what the document needs, then only asks you for the context required to fill it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scanning animation — replaces upload + button while scanning */}
            {isScanning && (
              <ScanningAnimation />
            )}

            {/* Upload area — hidden while scanning */}
            {!scanResult && !isScanning && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-300',
                  isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : scanFile ? 'border-primary/40 bg-primary/[0.02]' : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30',
                )}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                {scanFile ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{scanFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(scanFile.size / 1024).toFixed(0)} KB · {scanFile.type.split('/')[1]?.toUpperCase()}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="ml-2 h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleReset(); }}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10"><Upload className="h-6 w-6 text-primary" /></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop a file here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPEG, or WebP — max 10MB</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Scan button — hidden while scanning */}
            {hasFile && !scanResult && !isScanning && (
              <Button onClick={handleScan} disabled={isScanning} className="w-full rounded-xl h-11" size="lg">
                <ScanSearch className="mr-2 h-4 w-4" /> Scan Document
              </Button>
            )}

            {/* Error */}
            {scanError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /><span>{scanError}</span>
                <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={handleReset}>Try again</Button>
              </div>
            )}

            {/* Results */}
            {scanResult && (
              <div ref={resultsRef} className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 scroll-mt-6">
                {scanReadiness && (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Data readiness</span>
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {scanReadiness.filled}/{scanReadiness.total} auto-filled
                      </span>
                      {scanReadiness.calculated > 0 && (
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                          {scanReadiness.calculated} calculated
                        </span>
                      )}
                      {scanReadiness.missingManual.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          {scanReadiness.missingManual.length} need manual input
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Sources: profile {scanReadiness.fromProfile}, vessel {scanReadiness.fromVessel}
                      {scanReadiness.fromCaptain ? `, captain ${scanReadiness.fromCaptain}` : ''},
                      calculated {scanReadiness.calculated}.
                      {scanReadiness.calculableMissing > 0
                        ? ` ${scanReadiness.calculableMissing} service fields look calculable — check date range and re-run Calculate.`
                        : ''}
                    </p>
                    {scanReadiness.missingManual.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">Still needed (manual):</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {scanReadiness.missingManual.slice(0, 10).map((f, i) => (
                            <span
                              key={`${f.fieldName}-${i}`}
                              className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-900 dark:text-amber-200"
                            >
                              {f.fieldName}
                            </span>
                          ))}
                          {scanReadiness.missingManual.length > 10 && (
                            <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
                              +{scanReadiness.missingManual.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as 'filled' | 'original')} className="w-auto">
                    <TabsList className="h-8 rounded-lg">
                      <TabsTrigger value="filled" className="text-xs rounded-md px-3 h-6 gap-1.5"><Sparkles className="h-3 w-3" /> Filled Document</TabsTrigger>
                      <TabsTrigger value="original" className="text-xs rounded-md px-3 h-6 gap-1.5"><Eye className="h-3 w-3" /> Original</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="rounded-lg text-xs h-8"
                      onClick={handleDownloadFilled}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-3 w-3" />
                      )}
                      {isDownloading ? 'Building…' : 'Download filled'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg text-xs h-8"
                      onClick={async () => {
                        // If the parent wired up a Form Builder handoff,
                        // hand the draft over there — gives the user the
                        // full editor (positioning, criteria, etc.).
                        if (onOpenInBuilder && scanFile) {
                          const built = buildTemplateFieldsFromScan();
                          if (!built || !built.fields.length) {
                            toast({
                              title: 'Nothing to save',
                              description:
                                'No fields were detected. Try re-scanning or uploading a clearer file.',
                              variant: 'destructive',
                            });
                            return;
                          }
                          const fields = await finalizeFieldsForBuilder(built.fields);
                          // Guard the auto-effect so it doesn't fire again
                          // for the same scan after we navigate.
                          didHandOffToBuilder.current = `${scanFile.name}-${scanResult.documentTitle}`;
                          onOpenInBuilder({
                            file: scanFile,
                            previewUrl: scanFilePreview,
                            suggestedName:
                              scanResult.documentTitle ||
                              scanFile.name.replace(/\.[^.]+$/, ''),
                            fields,
                          });
                          return;
                        }
                        // Fallback to the legacy dialog.
                        setTemplateName(
                          (prev) =>
                            prev ||
                            scanResult.documentTitle ||
                            scanFile?.name.replace(/\.[^.]+$/, '') ||
                            '',
                        );
                        setTemplateDescription(
                          (prev) => prev || scanResult.documentDescription || '',
                        );
                        setSaveTemplateOpen(true);
                      }}
                    >
                      <BookmarkPlus className="mr-1.5 h-3 w-3" />{' '}
                      {onOpenInBuilder ? 'Open in Form Builder' : 'Save as template'}
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-8" onClick={handleCopyAll}>
                      {copiedAll ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copiedAll ? 'Copied!' : 'Copy all'}
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-lg text-xs h-8" onClick={handleReset}>
                      <ScanSearch className="mr-1.5 h-3 w-3" /> Scan another
                    </Button>
                  </div>
                </div>
                {viewTab === 'filled' && (
                  <FilledDocumentPreview
                    documentTitle={scanResult.documentTitle}
                    documentDescription={scanResult.documentDescription}
                    crewName={scanResult.crewName}
                    vesselName={scanResult.vesselName}
                    fields={scanResult.fields}
                    unmatchedFields={scanResult.unmatchedFields}
                    editedValues={editedValues}
                    onValueChange={(k, v) => setEditedValues((p) => ({ ...p, [k]: v }))}
                    copiedField={copiedField}
                    onCopyField={handleCopyField}
                    onDeleteField={handleDeleteField}
                  />
                )}
                {viewTab === 'original' && scanFile && (
                  <OriginalDocumentViewer
                    file={scanFile}
                    previewUrl={scanFilePreview}
                    fields={[...scanResult.fields, ...scanResult.unmatchedFields]}
                    editedValues={editedValues}
                    onFieldBboxChange={(globalIndex, bbox) => {
                      // globalIndex is position in combined [matched, unmatched] array.
                      setScanResult((prev) => {
                        if (!prev) return prev;
                        const matchedLen = prev.fields.length;
                        const nextMatched = [...prev.fields];
                        const nextUnmatched = [...prev.unmatchedFields];
                        if (globalIndex < matchedLen) {
                          nextMatched[globalIndex] = { ...nextMatched[globalIndex], bbox } as ScannedField;
                        } else {
                          const idx = globalIndex - matchedLen;
                          nextUnmatched[idx] = { ...nextUnmatched[idx], bbox } as ScannedField;
                        }
                        const updated = { ...prev, fields: nextMatched, unmatchedFields: nextUnmatched };
                        if (usedTemplateId) {
                          const all = [...updated.fields, ...updated.unmatchedFields];
                          updateSavedScanFields(
                            usedTemplateId,
                            all.map((f) => ({
                              fieldName: f.fieldName,
                              fieldDescription: f.fieldDescription,
                              originalValue: f.originalValue,
                              category: f.category,
                              profileKey: f.profileKey,
                              page: (f as any).page,
                              bbox: (f as any).bbox,
                            })),
                          );
                        }
                        return updated;
                      });
                    }}
                    onPageShift={(page, dx, dy) => {
                      const clamp = (n: number) => Math.min(Math.max(n, 0), 1000);
                      const shift = <T extends ScannedField>(f: T): T => {
                        const b = (f as any).bbox as { yMin: number; xMin: number; yMax: number; xMax: number } | undefined;
                        const p = (f as any).page ?? 1;
                        if (!b || p !== page) return f;
                        const w = b.xMax - b.xMin;
                        const h = b.yMax - b.yMin;
                        const newXMin = clamp(b.xMin + dx);
                        const newYMin = clamp(b.yMin + dy);
                        const newXMax = Math.min(newXMin + w, 1000);
                        const newYMax = Math.min(newYMin + h, 1000);
                        return { ...f, bbox: { xMin: newXMin, yMin: newYMin, xMax: newXMax, yMax: newYMax } } as T;
                      };
                      setScanResult((prev) => {
                        if (!prev) return prev;
                        const updated = {
                          ...prev,
                          fields: prev.fields.map(shift),
                          unmatchedFields: prev.unmatchedFields.map(shift),
                        };
                        if (usedTemplateId) {
                          const all = [...updated.fields, ...updated.unmatchedFields];
                          updateSavedScanFields(
                            usedTemplateId,
                            all.map((f) => ({
                              fieldName: f.fieldName,
                              fieldDescription: f.fieldDescription,
                              originalValue: f.originalValue,
                              category: f.category,
                              profileKey: f.profileKey,
                              page: (f as any).page,
                              bbox: (f as any).bbox,
                            })),
                          );
                        }
                        return updated;
                      });
                    }}
                  />
                )}
              </div>
            )}
          </CardContent>
      </Card>

      <Dialog
        open={saveTemplateOpen}
        onOpenChange={(open) => {
          if (!isSavingTemplate) setSaveTemplateOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-5 w-5 text-primary" />
              Save as template
            </DialogTitle>
            <DialogDescription>
              Store this document (and the fields we mapped) as a reusable
              template for your vessel. You can then fill it for any crew
              member from the <strong>Custom Templates</strong> tab in one click.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tmpl-name">Template name</Label>
              <Input
                id="tmpl-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. MCA Sea Service Testimonial"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tmpl-desc">Description (optional)</Label>
              <Input
                id="tmpl-desc"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="What this template is used for"
                className="rounded-xl"
              />
            </div>
            {scanResult && scanFile && (() => {
              const all = [...scanResult.fields, ...scanResult.unmatchedFields];
              const total = all.length;
              const bound = scanResult.fields.filter(
                (f) => f.profileKey && f.profileKey !== 'none',
              ).length;
              const unpositioned = all.filter((f) => {
                const b = (f as any).bbox;
                return (
                  !b ||
                  !Number.isFinite(b.xMin) ||
                  !Number.isFinite(b.yMin) ||
                  !Number.isFinite(b.xMax) ||
                  !Number.isFinite(b.yMax) ||
                  b.xMax <= b.xMin ||
                  b.yMax <= b.yMin
                );
              }).length;
              return (
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                  <div>
                    <span className="font-medium text-foreground">File:</span>{' '}
                    {scanFile.name}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Fields:</span>{' '}
                    {total} total, {bound} bound to crew / vessel / sea-time data
                  </div>
                  {unpositioned > 0 && (
                    <div className="text-amber-600 dark:text-amber-400">
                      {unpositioned} field{unpositioned === 1 ? '' : 's'} without a
                      detected position — we'll stack them on the left so you can drag
                      them into place in the Original view.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveTemplateOpen(false)}
              disabled={isSavingTemplate}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAsTemplate}
              disabled={isSavingTemplate || !templateName.trim()}
              className="rounded-xl"
            >
              {isSavingTemplate ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
