'use client';

/**
 * FormBuilderEditor — the core of the "Form Builder" feature.
 *
 * Split-pane editor for authoring reusable fillable-document templates:
 *
 *   Left  : the original uploaded document with overlay boxes for each
 *           field. Reuses OriginalDocumentViewer's drag-to-move /
 *           drag-to-resize / align-all interactions.
 *   Right : a list of fields + an inspector for the selected field.
 *
 * Supports two modes (controlled by whether `templateId` is provided):
 *
 *   - Create : parent passes a File (from the AI scanner) + initial fields
 *              detected by the AI. Save issues a multipart POST to
 *              /api/document-templates.
 *   - Edit   : parent passes a templateId + File previously fetched from
 *              /api/document-templates/[id]/file. Save issues PATCH with
 *              only the mutable fields (name / description / fields).
 *
 * Phase-2 scope: add/delete/reposition fields, bind to a profile key,
 * static default, required toggle, per-field name. Richer criteria
 * (validation, formatting, conditional visibility) land in phase 3.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Loader2,
  AlertCircle,
  MousePointerClick,
  Wand2,
  Sparkles,
  Calculator,
  Rows3,
  ListOrdered,
  Globe,
  FileText,
  Type as TypeIcon,
  AlignLeft,
  Hash,
  Calendar,
  AtSign,
  CheckSquare,
  PenTool,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Search,
  Link2,
  MapPin,
  Settings2,
  Asterisk,
  User,
  Home,
  Ship,
  Anchor,
  BadgeCheck,
  Clock,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  type TemplateField,
  type TemplateFieldType,
  type TemplateFieldCalculation,
  type TemplateCalculationOperation,
  type TemplateFieldFormatting,
  type TemplateFieldValidation,
  type CalculationInput,
  type SiteValueKey,
  FIELD_TYPE_OPTIONS,
  PROFILE_KEY_OPTIONS,
  PROFILE_KEY_CATEGORY_META,
  type ProfileKeyCategory,
  type ProfileKeyOption,
  CALCULATION_OPERATION_OPTIONS,
  SITE_VALUE_OPTIONS,
  getFieldType,
  getCalculationInputs,
  makePlaceholderBbox,
  isPositionedField,
  newFieldId,
  extractRowIndexFromLabel,
  stripRowMarkerFromLabel,
  resolveFieldRowIndex,
  stripEphemeralFromFields,
  findProfileKeyLabel,
} from '@/lib/vessel-document-templates';
import { autoAlignTemplateFields } from '@/lib/auto-align-template-fields';
import {
  OriginalDocumentViewer,
  type OverlayField,
} from './original-document-viewer';

interface FormBuilderEditorProps {
  /** The original document the template is built on. */
  file: File;
  /** data: URL preview for images; null for PDFs (the viewer renders PDF itself). */
  previewUrl: string | null;

  /** Existing template id — when set we PATCH on save, otherwise POST. */
  templateId?: string | null;
  /** Vessel the template belongs to. Required for create. */
  vesselId: string;
  /** Auth bearer token used for the save call. */
  accessToken: string | null;

  /** Pre-filled name (from AI scan or existing template). */
  initialName?: string;
  /** Pre-filled description. */
  initialDescription?: string | null;
  /** Initial field list — comes from the AI scan or a loaded template. */
  initialFields: TemplateField[];

  /** Fired after a successful save. Parent typically refreshes list + closes editor. */
  onSaved: (templateId: string) => void;
  /** Fired when the user backs out without saving. */
  onCancel: () => void;
}

/** Maps a TemplateField to the OverlayField shape the viewer expects. */
function toOverlay(field: TemplateField): OverlayField {
  const isCalc = getFieldType(field) === 'calculated';
  const preview = isCalc && field.calculation
    ? `= ${field.calculation.operation}(${getCalculationInputs(field.calculation).length})`
    : null;
  // Prefix a compact "Row N · " on repeating-section fields so the hover
  // label on the document preview tells you which vessel/assignment it's
  // bound to at a glance. Cheaper than threading a new prop through the
  // whole viewer just for this one hint.
  const row = resolveFieldRowIndex(field);
  const displayLabel =
    row != null ? `Row ${row} · ${field.label || '(untitled)'}` : field.label;
  return {
    fieldName: displayLabel,
    // We surface the defaultValue so the viewer shows the field's content
    // even in the builder. profileKey (future per-crew value) can't be
    // resolved here since there's no crew selected — that's fine, the
    // builder is about layout + rules, not per-crew previews.
    suggestedValue: preview ?? field.defaultValue ?? null,
    // Distinct source key so the overlay palette can pick up a calc-specific
    // colour if we ever want one; for now it falls through to the default.
    source: isCalc ? 'calculated' : field.profileKey ? 'profile' : 'unmatched',
    page: field.page,
    bbox: field.bbox,
  };
}

export function FormBuilderEditor({
  file,
  previewUrl,
  templateId,
  vesselId,
  accessToken,
  initialName,
  initialDescription,
  initialFields,
  onSaved,
  onCancel,
}: FormBuilderEditorProps) {
  // Backfill rowIndex + strip "— Row N —" from labels on templates saved
  // before rowIndex existed as a structured field. Keeps the inspector in
  // sync with legacy data — the user sees the same row badges whether the
  // template was scanned today or last month. Originals are preserved on
  // `originalLabel` so we never lose the raw form wording.
  const hydrateInitialFields = useCallback((list: TemplateField[]): TemplateField[] => {
    return list.map((f) => {
      const parsed = extractRowIndexFromLabel(f.label);
      if (parsed == null) return f;
      // Only rewrite when the data really needs it — leave already-clean
      // fields alone so we don't thrash undo history on every re-render.
      if (f.rowIndex === parsed && !extractRowIndexFromLabel(f.label)) return f;
      return {
        ...f,
        rowIndex: f.rowIndex ?? parsed,
        label: stripRowMarkerFromLabel(f.label),
        originalLabel: f.originalLabel ?? f.label,
      };
    });
  }, []);

  const [name, setName] = useState(initialName ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [fields, setFields] = useState<TemplateField[]>(() =>
    hydrateInitialFields(initialFields),
  );
  // Selection is a SET so the user can multi-select via shift/ctrl-click or
  // by lasso. The FieldInspector still expects exactly one active field, so
  // we derive a single `selectedId` below — when more than one field is
  // selected we render a group-summary card in place of the inspector.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialFields[0]?.id ? new Set([initialFields[0].id]) : new Set(),
  );
  // Anchor for shift-range selects in the field list. Set on every plain /
  // ctrl click and used as the "from" end when the user shift-clicks.
  const selectionAnchorRef = useRef<string | null>(
    initialFields[0]?.id ?? null,
  );
  // Single-select shim: the inspector + several derived values only care
  // about "is exactly ONE field selected, and if so, which?". Anything
  // that needs the whole set reads `selectedIds` directly.
  const selectedId = useMemo<string | null>(
    () => (selectedIds.size === 1 ? selectedIds.values().next().value ?? null : null),
    [selectedIds],
  );
  // Narrow setter used by legacy call-sites that want single-select
  // semantics ("newly created field becomes the only selection").
  const selectOnly = useCallback(
    (id: string | null) => {
      setSelectedIds(id ? new Set([id]) : new Set());
      selectionAnchorRef.current = id;
    },
    [],
  );
  const [saving, setSaving] = useState(false);
  // Track which page the viewer is currently showing so "Add field" can drop
  // the new box onto the visible page (not blindly onto page 1), and so the
  // inspector can show a page picker when the document has > 1 page.
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const handlePageInfoChange = useCallback(
    (info: { currentPage: number; pageCount: number }) => {
      setCurrentPage(info.currentPage);
      setPageCount(info.pageCount);
    },
    [],
  );

  // Keep local state in sync if the parent ever swaps out the initial data
  // (e.g. switching between edit-template-A and edit-template-B without
  // unmounting). We don't want the builder to stay pinned to the old draft.
  useEffect(() => {
    setName(initialName ?? '');
    setDescription(initialDescription ?? '');
    setFields(hydrateInitialFields(initialFields));
    const firstId = initialFields[0]?.id ?? null;
    setSelectedIds(firstId ? new Set([firstId]) : new Set());
    selectionAnchorRef.current = firstId;
  }, [initialName, initialDescription, initialFields, hydrateInitialFields]);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId],
  );

  // List of actually-selected fields (preserving fields-array order). Used
  // to drive the multi-select summary card, group-delete, etc.
  const selectedFields = useMemo(
    () => fields.filter((f) => selectedIds.has(f.id)),
    [fields, selectedIds],
  );

  const overlayFields = useMemo(() => fields.map(toOverlay), [fields]);

  // Indices (into the flat `fields` array) of all currently-selected
  // fields. The viewer uses this space for its highlight + group-drag
  // APIs, so we translate ids → indices once.
  const selectedIndices = useMemo(() => {
    if (selectedIds.size === 0) return [] as number[];
    const out: number[] = [];
    fields.forEach((f, i) => {
      if (selectedIds.has(f.id)) out.push(i);
    });
    return out;
  }, [fields, selectedIds]);

  /**
   * Apply overlay-click modifier semantics to `selectedIds`:
   *   - plain click  → replace selection with just this one
   *   - meta/ctrl   → toggle this id in/out of selection
   *   - shift        → range-select from anchor to clicked id (union)
   * The anchor is updated on every plain / ctrl click so subsequent
   * shift-clicks have a sensible starting point, matching Finder / file-
   * list conventions in most desktop apps.
   */
  const selectWithMods = useCallback(
    (id: string, mods?: { shift: boolean; meta: boolean }) => {
      if (mods?.meta) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        selectionAnchorRef.current = id;
        return;
      }
      if (mods?.shift) {
        const anchor = selectionAnchorRef.current;
        const fromIdx = anchor
          ? fields.findIndex((f) => f.id === anchor)
          : -1;
        const toIdx = fields.findIndex((f) => f.id === id);
        if (fromIdx === -1 || toIdx === -1) {
          setSelectedIds(new Set([id]));
          selectionAnchorRef.current = id;
          return;
        }
        const [lo, hi] =
          fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        const rangeIds = fields.slice(lo, hi + 1).map((f) => f.id);
        // Shift-click UNIONS with the existing set (matches file browsers).
        setSelectedIds((prev) => new Set([...prev, ...rangeIds]));
        return;
      }
      setSelectedIds(new Set([id]));
      selectionAnchorRef.current = id;
    },
    [fields],
  );

  const handleOverlaySelect = useCallback(
    (index: number, mods?: { shift: boolean; meta: boolean }) => {
      const f = fields[index];
      if (!f) return;
      selectWithMods(f.id, mods);
    },
    [fields, selectWithMods],
  );

  /**
   * Lasso mouseup — parent applies the returned indices to its selection
   * state. Modifier semantics mirror overlay-click:
   *   - shift/meta  → add to current selection
   *   - plain        → replace selection (or clear if nothing was captured)
   */
  const handleLassoSelect = useCallback(
    (indices: number[], mods: { shift: boolean; meta: boolean }) => {
      const capturedIds = indices
        .map((i) => fields[i]?.id)
        .filter((id): id is string => Boolean(id));
      if (mods.shift || mods.meta) {
        setSelectedIds((prev) => new Set([...prev, ...capturedIds]));
        if (capturedIds.length > 0) {
          selectionAnchorRef.current = capturedIds[capturedIds.length - 1];
        }
        return;
      }
      if (capturedIds.length === 0) {
        // Plain click on empty canvas clears the selection — gives users
        // a way to "escape" a multi-select back to zero without having to
        // click an exact single box.
        setSelectedIds(new Set());
        selectionAnchorRef.current = null;
        return;
      }
      setSelectedIds(new Set(capturedIds));
      selectionAnchorRef.current = capturedIds[capturedIds.length - 1];
    },
    [fields],
  );

  const handleOverlayDelete = useCallback(
    (index: number) => {
      const f = fields[index];
      if (!f) return;
      setFields((prev) => prev.filter((x) => x.id !== f.id));
      setSelectedIds((prev) => {
        if (!prev.has(f.id)) return prev;
        const next = new Set(prev);
        next.delete(f.id);
        return next;
      });
      if (selectionAnchorRef.current === f.id) selectionAnchorRef.current = null;
    },
    [fields],
  );

  const unpositionedCount = useMemo(
    () => fields.filter((f) => !isPositionedField(f)).length,
    [fields],
  );

  const updateField = useCallback(
    (id: string, patch: Partial<TemplateField>) => {
      setFields((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const handleBboxChange = useCallback(
    (
      index: number,
      bbox: { xMin: number; yMin: number; xMax: number; yMax: number },
    ) => {
      // `index` is the position in the combined fields array the viewer was
      // given. We pass one flat `fields` array, so it matches by index.
      setFields((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = [...prev];
        next[index] = { ...next[index], bbox };
        return next;
      });
    },
    [],
  );

  const handlePageShift = useCallback((page: number, dx: number, dy: number) => {
    setFields((prev) =>
      prev.map((f) => {
        if ((f.page ?? 1) !== page) return f;
        const b = f.bbox;
        const w = b.xMax - b.xMin;
        const h = b.yMax - b.yMin;
        const clamp = (n: number, min: number, max: number) =>
          Math.min(Math.max(n, min), max);
        const nxMin = clamp(b.xMin + dx, 0, 1000 - w);
        const nyMin = clamp(b.yMin + dy, 0, 1000 - h);
        return {
          ...f,
          bbox: {
            xMin: nxMin,
            yMin: nyMin,
            xMax: nxMin + w,
            yMax: nyMin + h,
          },
        };
      }),
    );
  }, []);

  /**
   * Group-drag handler: the viewer emits this per mousemove with the
   * incremental delta in normalised [0,1000] units. We shift every field
   * in `indices` by that delta, clamped to page bounds. Shares the same
   * clamp logic as `handlePageShift` — different scope (subset vs whole
   * page) is the only functional difference.
   */
  const handleFieldsMove = useCallback(
    (indices: number[], dx: number, dy: number) => {
      if (indices.length === 0) return;
      const targetSet = new Set(indices);
      setFields((prev) =>
        prev.map((f, i) => {
          if (!targetSet.has(i)) return f;
          const b = f.bbox;
          const w = b.xMax - b.xMin;
          const h = b.yMax - b.yMin;
          const clamp = (n: number, min: number, max: number) =>
            Math.min(Math.max(n, min), max);
          const nxMin = clamp(b.xMin + dx, 0, 1000 - w);
          const nyMin = clamp(b.yMin + dy, 0, 1000 - h);
          return {
            ...f,
            bbox: {
              xMin: nxMin,
              yMin: nyMin,
              xMax: nxMin + w,
              yMax: nyMin + h,
            },
          };
        }),
      );
    },
    [],
  );

  const handleAddField = () => {
    // Stack new fields down the left margin so the user can drop them into
    // place. The placeholder position is intentionally ugly so it's obvious
    // the field hasn't been positioned yet. Attach the new field to the
    // page the viewer is currently on so a user adding a field on page 3
    // doesn't have to also flip the page picker afterwards.
    const placeholderIndex = fields.filter(
      (f) => !isPositionedField(f) && (f.page ?? 1) === currentPage,
    ).length;
    const next: TemplateField = {
      id: newFieldId(),
      label: `New field ${fields.length + 1}`,
      type: 'text',
      profileKey: null,
      page: currentPage,
      bbox: makePlaceholderBbox(placeholderIndex),
      defaultValue: null,
      required: false,
    };
    setFields((prev) => [...prev, next]);
    selectOnly(next.id);
  };

  const handleDeleteField = (id: string) => {
    setFields((prev) =>
      prev
        .filter((f) => f.id !== id)
        // Also strip the deleted id from any calculation's input list so
        // we don't leave dangling references that silently produce empty
        // values later. We normalize via `getCalculationInputs` so legacy
        // `inputFieldIds`-shaped data gets migrated to `inputs` on the
        // way out — callers don't need to remember which shape it was.
        .map((f) => {
          if (!f.calculation) return f;
          const current = getCalculationInputs(f.calculation);
          const next = current.filter(
            (inp) => !(inp.kind === 'field' && inp.fieldId === id),
          );
          if (next.length === current.length) return f;
          return {
            ...f,
            calculation: {
              ...f.calculation,
              inputs: next,
              inputFieldIds: undefined,
            },
          };
        }),
    );
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (selectionAnchorRef.current === id) selectionAnchorRef.current = null;
  };

  const handleAddCalculation = () => {
    const placeholderIndex = fields.filter(
      (f) => !isPositionedField(f) && (f.page ?? 1) === currentPage,
    ).length;
    const next: TemplateField = {
      id: newFieldId(),
      label: 'Total',
      type: 'calculated',
      profileKey: null,
      page: currentPage,
      bbox: makePlaceholderBbox(placeholderIndex),
      defaultValue: null,
      required: false,
      calculation: {
        operation: 'sum',
        inputs: [],
      },
    };
    setFields((prev) => [...prev, next]);
    selectOnly(next.id);
  };

  /**
   * Re-run the row/column clustering pass on the current fields. Useful
   * after manual drag-adjustments — the user can tidy up a whole page of
   * boxes at once without going one-by-one. Placeholders are left alone.
   */
  const handleAutoAlign = () => {
    setFields((prev) => autoAlignTemplateFields(prev));
    toast({
      title: 'Aligned',
      description:
        'Same-row fields now share a single y, same-column fields share a single x, and single-line heights are uniform.',
    });
  };

  /**
   * Detect fields that share a profile binding but don't all have a
   * rowIndex — that's a "3 cells will fill with the same vessel" smell.
   * Returns the grouped field ids so the UI can flag them and the
   * auto-numbering handler can target them.
   *
   * We only treat a group as "needs fixing" when:
   *   - it has ≥2 fields,
   *   - AND not every field carries a rowIndex (either structured or
   *     parseable from the label — use the shared resolver).
   *   - OR all fields carry the SAME rowIndex (obviously wrong for a
   *     repeating section).
   *
   * Fields with no profileKey are ignored — without a binding there's
   * nothing to fill anyway.
   */
  const duplicateBindingGroups = useMemo(() => {
    const byKey = new Map<string, TemplateField[]>();
    for (const f of fields) {
      if (!f.profileKey) continue;
      const arr = byKey.get(f.profileKey) ?? [];
      arr.push(f);
      byKey.set(f.profileKey, arr);
    }
    const problematic: Array<{ profileKey: string; fields: TemplateField[] }> = [];
    for (const [pk, group] of byKey.entries()) {
      if (group.length < 2) continue;
      const rowIndices = group.map((f) => resolveFieldRowIndex(f));
      const allHaveUniqueRowIdx =
        rowIndices.every((r) => r != null && r > 0) &&
        new Set(rowIndices).size === rowIndices.length;
      if (allHaveUniqueRowIdx) continue;
      problematic.push({ profileKey: pk, fields: group });
    }
    return problematic;
  }, [fields]);

  /**
   * Assign rowIndex 1..N to each problematic group based on the fields'
   * visual order (top-to-bottom, left-to-right, by page). Non-problem
   * fields are left alone.
   */
  const handleAutoNumberRows = () => {
    if (!duplicateBindingGroups.length) return;
    const idsToRow = new Map<string, number>();
    for (const group of duplicateBindingGroups) {
      const sorted = [...group.fields].sort((a, b) => {
        const pa = a.page ?? 1;
        const pb = b.page ?? 1;
        if (pa !== pb) return pa - pb;
        const ya = a.bbox.yMin;
        const yb = b.bbox.yMin;
        if (Math.abs(ya - yb) > 8) return ya - yb; // a line is ~25 units
        return a.bbox.xMin - b.bbox.xMin;
      });
      sorted.forEach((f, i) => idsToRow.set(f.id, i + 1));
    }
    setFields((prev) =>
      prev.map((f) =>
        idsToRow.has(f.id) ? { ...f, rowIndex: idsToRow.get(f.id)! } : f,
      ),
    );
    const total = Array.from(idsToRow.values()).length;
    toast({
      title: 'Rows numbered',
      description: `Assigned row numbers to ${total} field${total === 1 ? '' : 's'} across ${duplicateBindingGroups.length} repeating group${duplicateBindingGroups.length === 1 ? '' : 's'}. Fill with a crew member to see each row populate with a different vessel.`,
    });
  };

  // -------------------------------------------------------------------
  // AI auto-fill summary + pending suggestions
  // -------------------------------------------------------------------
  // We split the current field list into three buckets so the editor
  // can show a glanceable summary banner:
  //   - autoFillFields: bound to a profile key → resolved from the
  //     crew profile / vessel / sea-time at fill time
  //   - calculatedFields: type === 'calculated' (computed from inputs)
  //   - manualFields: no binding, no calculation → user types each fill
  // Pending suggestions are unbound fields where the scan attached an
  // `autoBindSuggestion` with confidence below the auto-apply threshold.
  // The user can review them and apply the lot with one click.
  const fieldStats = useMemo(() => {
    let autoFill = 0;
    let manual = 0;
    let calculated = 0;
    for (const f of fields) {
      if (getFieldType(f) === 'calculated') {
        calculated += 1;
      } else if (f.profileKey) {
        autoFill += 1;
      } else {
        manual += 1;
      }
    }
    return { autoFill, manual, calculated, total: fields.length };
  }, [fields]);

  const pendingSuggestions = useMemo(() => {
    return fields.filter(
      (f) =>
        !f.profileKey &&
        getFieldType(f) !== 'calculated' &&
        f.autoBindSuggestion &&
        f.autoBindSuggestion.profileKey,
    );
  }, [fields]);

  const calcSuggestions = useMemo(() => {
    return fields.filter(
      (f) =>
        f.isCalculableSuggestion === true &&
        getFieldType(f) !== 'calculated',
    );
  }, [fields]);

  /**
   * Apply every pending binding suggestion in one go. Keeps the
   * suggestion metadata around (so the user can see "applied by AI"
   * provenance in the inspector) but moves the value into the
   * real `profileKey` so it'll auto-fill at runtime.
   */
  const handleApplyAllSuggestions = () => {
    if (!pendingSuggestions.length) return;
    const idsToApply = new Set(pendingSuggestions.map((f) => f.id));
    setFields((prev) =>
      prev.map((f) => {
        if (!idsToApply.has(f.id)) return f;
        const suggested = f.autoBindSuggestion?.profileKey ?? null;
        if (!suggested) return f;
        return { ...f, profileKey: suggested };
      }),
    );
    toast({
      title: 'Suggestions applied',
      description: `${idsToApply.size} field${idsToApply.size === 1 ? '' : 's'} will now auto-fill from the account data.`,
    });
  };

  /**
   * Re-run the binding classifier on every field that's still unbound
   * AND has no existing suggestion. Useful after manual edits / when
   * loading an existing template that pre-dates auto-bind.
   */
  const [rebinding, setRebinding] = useState(false);
  const handleRebindWithAi = useCallback(async () => {
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Refresh and try again.',
        variant: 'destructive',
      });
      return;
    }
    // Send every field with no profile binding AND not a calculation.
    // We don't filter on "already has a suggestion" — re-running picks
    // up improvements from prompt changes / model upgrades, and the
    // user opted into this explicitly by clicking the button.
    const candidates = fields
      .filter(
        (f) =>
          !f.profileKey &&
          getFieldType(f) !== 'calculated' &&
          (f.label || f.originalLabel),
      )
      .map((f) => ({
        id: f.id,
        fieldName: f.originalLabel || f.label,
        fieldDescription: undefined as string | undefined,
      }));
    if (!candidates.length) {
      toast({
        title: 'Nothing to bind',
        description: 'Every field already has a binding or is calculated.',
      });
      return;
    }
    setRebinding(true);
    try {
      const res = await fetch('/api/document-scan/auto-bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ fields: candidates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to bind');
      const suggestions: Array<{
        id: string;
        profileKey: string | null;
        confidence: number;
        isCalculable?: boolean;
        reason?: string;
        source: 'fuzzy' | 'ai';
      }> = data.suggestions ?? [];
      if (!suggestions.length) {
        toast({
          title: 'No matches',
          description:
            'AI could not match any of the unbound labels to account data. Try renaming the labels to be more descriptive.',
        });
        return;
      }
      const byId = new Map(suggestions.map((s) => [s.id, s]));
      let appliedCount = 0;
      let suggestedCount = 0;
      setFields((prev) =>
        prev.map((f) => {
          const s = byId.get(f.id);
          if (!s) return f;
          // High-confidence (≥0.75) → apply directly. Lower → surface
          // as a pending suggestion in the inspector. Keeps the user
          // in control without making the button a no-op for borderline
          // labels.
          if (s.profileKey && s.confidence >= 0.75) {
            appliedCount += 1;
            return {
              ...f,
              profileKey: s.profileKey,
              autoBindSuggestion: {
                profileKey: s.profileKey,
                confidence: s.confidence,
                reason: s.reason ?? null,
                source: s.source,
              },
              isCalculableSuggestion:
                s.isCalculable || f.isCalculableSuggestion,
            };
          }
          if (s.profileKey) {
            suggestedCount += 1;
            return {
              ...f,
              autoBindSuggestion: {
                profileKey: s.profileKey,
                confidence: s.confidence,
                reason: s.reason ?? null,
                source: s.source,
              },
              isCalculableSuggestion:
                s.isCalculable || f.isCalculableSuggestion,
            };
          }
          return f;
        }),
      );
      const parts: string[] = [];
      if (appliedCount) parts.push(`${appliedCount} bound automatically`);
      if (suggestedCount) parts.push(`${suggestedCount} suggested`);
      toast({
        title: 'AI re-bind complete',
        description: parts.length
          ? parts.join(' · ')
          : 'No confident matches — review the unbound fields manually.',
      });
    } catch (err: any) {
      console.error('[form-builder] re-bind failed', err);
      toast({
        title: 'Re-bind failed',
        description: err?.message ?? 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setRebinding(false);
    }
  }, [fields, accessToken]);

  /**
   * Convert one of the calc-suggested fields into a calculated field
   * with the right operation pre-selected. Lets the user accept the
   * scanner's hint with a single click rather than going through the
   * "Add calculation" → "wire up inputs" dance.
   */
  const handleConvertSuggestionToCalc = (id: string) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        if (getFieldType(f) === 'calculated') return f;
        return {
          ...f,
          type: 'calculated',
          calculation: f.calculation ?? { operation: 'sum', inputs: [] },
        };
      }),
    );
    selectOnly(id);
  };


  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({
        title: 'Name required',
        description: 'Give the form a short name so you can find it later.',
        variant: 'destructive',
      });
      return;
    }
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Your session expired — refresh and try again.',
        variant: 'destructive',
      });
      return;
    }
    if (!fields.length) {
      toast({
        title: 'No fields',
        description: 'Add at least one field before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (templateId) {
        // --- EDIT path -------------------------------------------------
        const res = await fetch(`/api/document-templates/${templateId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name: trimmedName,
            description: description.trim() || null,
            // Strip ephemeral AI suggestion metadata before persisting
            // — those properties only live in editor memory.
            fields: stripEphemeralFromFields(fields),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        toast({
          title: 'Saved',
          description: unpositionedCount
            ? `"${trimmedName}" saved — ${unpositionedCount} field${
                unpositionedCount === 1 ? '' : 's'
              } still stacked on the left edge, drag them into place next time.`
            : `"${trimmedName}" updated.`,
        });
        onSaved(templateId);
      } else {
        // --- CREATE path -----------------------------------------------
        const form = new FormData();
        form.append('file', file);
        form.append('vesselId', vesselId);
        form.append('name', trimmedName);
        if (description.trim()) form.append('description', description.trim());
        form.append('fields', JSON.stringify(stripEphemeralFromFields(fields)));

        const res = await fetch('/api/document-templates', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        toast({
          title: 'Template saved',
          description: unpositionedCount
            ? `"${trimmedName}" saved — ${unpositionedCount} field${
                unpositionedCount === 1 ? '' : 's'
              } need to be dragged into place.`
            : `"${trimmedName}" is now in Form Builder.`,
        });
        onSaved(data.template?.id ?? '');
      }
    } catch (err: any) {
      console.error('[form-builder] save failed', err);
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ----- Toolbar ----- */}
      {/*
        Sticky so it stays visible while the user scrolls through tall
        multi-page documents. The dashboard's scroll container has a
        `py-4` padding, and `position: sticky; top: 0` sticks at the
        inner padding edge — which leaves a visible 1rem gap above the
        bar once it latches. Using `-top-4` (top: -1rem) pulls the sticky
        anchor 1rem above the padding edge, flush with the scroll
        viewport's top, so the background runs all the way up. `-mt-4`
        compensates the same 1rem in the initial flow position, and
        `pt-4` gives the content inside the bar the breathing room the
        dashboard padding originally provided. `-mx-8 px-8` extends the
        bar across the page's horizontal padding too.
      */}
      <div className="sticky -top-4 z-30 -mx-8 px-8 -mt-4 pt-4 pb-3 bg-content-background/90 backdrop-blur supports-[backdrop-filter]:bg-content-background/75 border-b border-border/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" aria-hidden />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Form name"
            className="max-w-sm font-medium"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {fields.length} field{fields.length === 1 ? '' : 's'}
            {unpositionedCount > 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                · {unpositionedCount} unpositioned
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleAutoAlign}
            disabled={saving || fields.length < 2}
            className="gap-1.5 rounded-xl"
            title="Snap same-row fields to one y, same-column fields to one x, and normalise heights"
          >
            <Wand2 className="h-4 w-4" />
            Auto-align
          </Button>
          <Button
            variant="outline"
            onClick={handleRebindWithAi}
            disabled={saving || rebinding || fields.length === 0}
            className="gap-1.5 rounded-xl"
            title="Use Gemini to suggest profile-key bindings for any field that's still unbound"
          >
            {rebinding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Re-bind with AI
          </Button>
          {duplicateBindingGroups.length > 0 && (
            <Button
              variant="outline"
              onClick={handleAutoNumberRows}
              disabled={saving}
              className="gap-1.5 rounded-xl border-amber-500/50 text-amber-700 hover:text-amber-800 dark:text-amber-400"
              title="Assign row numbers to duplicated profile bindings so each row fills with a different vessel / assignment"
            >
              <ListOrdered className="h-4 w-4" />
              Number rows
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleAddField}
            disabled={saving}
            className="gap-1.5 rounded-xl"
          >
            <Plus className="h-4 w-4" />
            Add field
          </Button>
          <Button
            variant="outline"
            onClick={handleAddCalculation}
            disabled={saving}
            className="gap-1.5 rounded-xl"
            title="Add a field whose value is computed from other fields (e.g. total sea time)"
          >
            <Calculator className="h-4 w-4" />
            Add calculation
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 rounded-xl"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {templateId ? 'Save changes' : 'Save template'}
          </Button>
        </div>
      </div>
      </div>

      {/*
        Kept OUTSIDE the sticky band so the toolbar stays a fixed height,
        which lets the sticky right panel use a reliable top offset.
      */}
      {unpositionedCount > 0 && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>{unpositionedCount}</strong> field
            {unpositionedCount === 1 ? ' is' : 's are'} stacked on the left
            edge of the document. Switch to <em>Adjust single</em> mode and
            drag them onto the right spot — values won&apos;t appear on the
            filled PDF in their correct place until you do.
          </div>
        </div>
      )}

      {/*
        AI auto-fill summary banner. Shows at-a-glance how much of the
        form the user gets for free (account-bound + calculated) vs how
        much they still have to type at fill time. The two right-side
        chips are interactive: "Apply suggestions" lifts pending
        AI-suggested bindings into the live profileKey in one click,
        and the calculation hint converts a single field at a time.
      */}
      {fieldStats.total > 0 && (
        <div className="rounded-xl border border-violet-300/50 bg-gradient-to-r from-violet-50/70 via-sky-50/40 to-emerald-50/40 dark:from-violet-950/30 dark:via-sky-950/20 dark:to-emerald-950/20 dark:border-violet-500/30 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <span className="font-medium text-foreground">
                  AI auto-fill
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <strong className="text-foreground">{fieldStats.autoFill}</strong>
                  <span className="text-muted-foreground">auto-fill from account</span>
                </span>
                {fieldStats.calculated > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    <strong className="text-foreground">{fieldStats.calculated}</strong>
                    <span className="text-muted-foreground">calculated</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <strong className="text-foreground">{fieldStats.manual}</strong>
                  <span className="text-muted-foreground">manual entry</span>
                </span>
              </div>
            </div>
            {pendingSuggestions.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleApplyAllSuggestions}
                disabled={saving}
                className="gap-1.5 rounded-xl border-violet-300 bg-white/50 hover:bg-white text-violet-700 dark:text-violet-300 dark:bg-violet-950/40 dark:hover:bg-violet-950/70 dark:border-violet-500/40"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Apply {pendingSuggestions.length} suggestion
                {pendingSuggestions.length === 1 ? '' : 's'}
              </Button>
            )}
          </div>
          {pendingSuggestions.length > 0 && (
            <div className="mt-3 border-t border-violet-200/50 dark:border-violet-500/20 pt-2.5 text-xs text-muted-foreground">
              <div className="font-medium text-foreground mb-1.5">
                Pending AI suggestions:
              </div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {pendingSuggestions.slice(0, 6).map((f) => {
                  const s = f.autoBindSuggestion!;
                  const pct = Math.round((s.confidence ?? 0) * 100);
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 rounded-lg bg-white/40 dark:bg-violet-950/20 border border-violet-200/40 dark:border-violet-500/20 px-2 py-1.5"
                    >
                      <span className="truncate max-w-[40%] text-foreground font-medium">
                        {f.label || '(untitled)'}
                      </span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="truncate text-violet-700 dark:text-violet-300">
                        {findProfileKeyLabel(s.profileKey)}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {pct}%
                      </span>
                    </li>
                  );
                })}
                {pendingSuggestions.length > 6 && (
                  <li className="text-muted-foreground italic">
                    …and {pendingSuggestions.length - 6} more
                  </li>
                )}
              </ul>
            </div>
          )}
          {calcSuggestions.length > 0 && (
            <div className="mt-3 border-t border-violet-200/50 dark:border-violet-500/20 pt-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground mb-1.5">
                <Calculator className="h-3.5 w-3.5" />
                Looks like {calcSuggestions.length} field
                {calcSuggestions.length === 1 ? '' : 's'} could be calculated
                from other fields
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {calcSuggestions.slice(0, 4).map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => handleConvertSuggestionToCalc(f.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-900/70"
                    >
                      <Calculator className="h-3 w-3" />
                      {f.label || '(untitled)'} → Calculation
                    </button>
                  </li>
                ))}
                {calcSuggestions.length > 4 && (
                  <li className="text-muted-foreground italic self-center">
                    …and {calcSuggestions.length - 4} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {duplicateBindingGroups.length > 0 && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/30 px-3 py-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <Rows3 className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div>
              <strong>
                {duplicateBindingGroups.length} repeating group
                {duplicateBindingGroups.length === 1 ? '' : 's'}
              </strong>{' '}
              {duplicateBindingGroups.length === 1 ? 'has' : 'have'} multiple
              fields bound to the same profile value but no row number —
              every row will fill with the <em>same</em> data when the form
              is used.
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              {duplicateBindingGroups.slice(0, 3).map((g) => (
                <li key={g.profileKey}>
                  <code className="rounded bg-amber-100 dark:bg-amber-900/40 px-1">
                    {g.profileKey}
                  </code>{' '}
                  — {g.fields.length} fields
                </li>
              ))}
              {duplicateBindingGroups.length > 3 && (
                <li>…and {duplicateBindingGroups.length - 3} more</li>
              )}
            </ul>
            <div className="pt-1">
              Hit <strong>Number rows</strong> in the toolbar to label them
              1, 2, 3, … based on their position on the page — or open a
              field and set its <strong>Row</strong> manually.
            </div>
          </div>
        </div>
      )}

      {/* ----- Split pane ----- */}
      {/*
        `items-start` is important — without it the right panel would
        stretch to the document height and `position: sticky` would have
        nothing to slide against. `items-start` keeps the panel its
        natural height so sticky kicks in once the user scrolls past it.
      */}
      <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Document preview ---------------------------------------------
           `overflow-visible` overrides the base Card's default
           `overflow-hidden`. That default would make the Card the
           nearest scroll-creating ancestor for the viewer's sticky
           inner toolbar and pin it uselessly to the Card's own top
           edge, so it'd scroll behind the outer sticky toolbar. With
           overflow visible the dashboard scroll container is the
           sticky ancestor and the inner bar docks against the viewport
           correctly.
        */}
        <Card className="overflow-visible">
          <CardContent className="p-0">
            <OriginalDocumentViewer
              file={file}
              previewUrl={previewUrl}
              fields={overlayFields}
              onFieldBboxChange={handleBboxChange}
              onPageShift={handlePageShift}
              onPageInfoChange={handlePageInfoChange}
              onFieldSelect={handleOverlaySelect}
              selectedIndices={selectedIndices}
              onFieldDelete={handleOverlayDelete}
              onFieldsMove={handleFieldsMove}
              onLassoSelect={handleLassoSelect}
            />
          </CardContent>
        </Card>

        {/* Right panel: list + inspector --------------------------------
           Sticky on lg+ screens so the field list / inspector stay in
           view while the user scrolls a tall multi-page document. The
           panel scrolls internally if its own content is too tall to fit
           the viewport. `top` accounts for the sticky toolbar above. */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100svh-7rem)] lg:overflow-y-auto lg:pr-1">
          <FieldListPanel
            fields={fields}
            selectedIds={selectedIds}
            onSelect={selectWithMods}
            onClearSelection={() => {
              setSelectedIds(new Set());
              selectionAnchorRef.current = null;
            }}
            onDelete={handleDeleteField}
          />
          {selectedFields.length > 1 ? (
            <MultiSelectPanel
              fields={selectedFields}
              onClear={() => {
                setSelectedIds(new Set());
                selectionAnchorRef.current = null;
              }}
              onDeleteAll={() => {
                const idsToDelete = selectedFields.map((f) => f.id);
                for (const id of idsToDelete) handleDeleteField(id);
              }}
            />
          ) : (
            <FieldInspector
              field={selectedField}
              fields={fields}
              pageCount={pageCount}
              onChange={updateField}
              onDelete={handleDeleteField}
            />
          )}
          <DescriptionPanel
            value={description}
            onChange={setDescription}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — kept in the same file because they're tightly coupled to
// the builder's internal state and aren't used anywhere else.
// ---------------------------------------------------------------------------

/**
 * Replacement for the single-field `FieldInspector` when the user has
 * more than one field selected. Deliberately minimal: multi-editing per-
 * field attributes like labels or profile keys doesn't really make sense
 * (they're usually different across the selected fields), so we focus on
 * the group-level actions that ARE sensible — move-as-group (handled by
 * the overlay drag) + delete-all + clear-selection — plus a scannable
 * list of what's currently captured so the user can double-check before
 * running a destructive action.
 */
function MultiSelectPanel({
  fields,
  onClear,
  onDeleteAll,
}: {
  fields: TemplateField[];
  onClear: () => void;
  onDeleteAll: () => void;
}) {
  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
              {fields.length}
            </span>
            fields selected
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Drag any selected box on the document to move the whole group at
          once. Per-field options (label, type, calculation, auto-fill) are
          only editable one field at a time — pick a single field in the
          list above to tweak its properties.
        </p>

        <div className="rounded-md border bg-background max-h-[200px] overflow-auto">
          <ul className="divide-y text-xs">
            {fields.map((f) => {
              const rowIdx = resolveFieldRowIndex(f);
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-2 px-2 py-1.5 min-w-0"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide shrink-0">
                    {getFieldType(f)}
                  </span>
                  {rowIdx != null && (
                    <span className="rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold px-1.5 py-0.5 uppercase tracking-wide shrink-0">
                      R{rowIdx}
                    </span>
                  )}
                  <span className="truncate flex-1">
                    {f.label || '(untitled)'}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    p{f.page ?? 1}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          onClick={onDeleteAll}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete {fields.length} selected fields
        </Button>
      </CardContent>
    </Card>
  );
}

function FieldListPanel({
  fields,
  selectedIds,
  onSelect,
  onClearSelection,
  onDelete,
}: {
  fields: TemplateField[];
  selectedIds: Set<string>;
  /**
   * Forwarded with the modifier flags at the time of the click so the
   * parent can do replace (plain) / toggle (ctrl-meta) / range (shift)
   * selection. Matches the overlay's `onFieldSelect` signature so both
   * surfaces feel identical.
   */
  onSelect: (id: string, mods?: { shift: boolean; meta: boolean }) => void;
  onClearSelection: () => void;
  onDelete: (id: string) => void;
}) {
  // Intentionally no scroll-into-view on select. Users interact with fields
  // directly on the document (delete button on the box, drag to move) so
  // yanking the page back to the list on every click was more disruptive
  // than helpful. Keep `itemRefs` around only for possible future needs.
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const multi = selectedIds.size > 1;

  // "Needs attention" filter — narrows the list to fields that aren't
  // bound to a profile key, aren't calculated, and don't have a
  // pending AI suggestion. These are the rows the user has to fill in
  // by hand at fill time, so isolating them makes it easier to either
  // bind, set a default, or delete them. The filter is purely a view
  // toggle (no mutation), and we still show "1 of N" so the user
  // knows there's more under the filter.
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const visibleFields = useMemo(() => {
    if (!needsAttentionOnly) return fields;
    return fields.filter((f) => {
      if (getFieldType(f) === 'calculated') return false;
      if (f.profileKey) return false;
      return true;
    });
  }, [fields, needsAttentionOnly]);

  const needsAttentionCount = useMemo(
    () =>
      fields.filter(
        (f) =>
          getFieldType(f) !== 'calculated' && !f.profileKey,
      ).length,
    [fields],
  );

  return (
    <Card>
      <CardHeader className="py-3 flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          Fields
          {fields.length > 0 && (
            <span className="text-[11px] font-normal text-muted-foreground">
              ({fields.length})
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {needsAttentionCount > 0 && (
            <button
              type="button"
              onClick={() => setNeedsAttentionOnly((v) => !v)}
              className={cn(
                'rounded-md text-[11px] px-2 py-0.5 transition-colors',
                needsAttentionOnly
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200',
              )}
              title="Show only fields without a binding — the ones that need manual entry at fill time"
            >
              {needsAttentionOnly
                ? `Showing ${needsAttentionCount} unbound`
                : `${needsAttentionCount} unbound`}
            </button>
          )}
          {multi && (
            <>
              <span className="text-[11px] text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={onClearSelection}
              >
                Clear
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 max-h-[420px] overflow-auto">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fields yet. Click <strong>Add field</strong> to start.
          </p>
        ) : visibleFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every field has a binding — nothing left to clean up.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visibleFields.map((f) => {
              const positioned = isPositionedField(f);
              const isSelected = selectedIds.has(f.id);
              const rowIdx = resolveFieldRowIndex(f);
              return (
                <li
                  key={f.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(f.id, el);
                    else itemRefs.current.delete(f.id);
                  }}
                  className={cn(
                    'group rounded-lg border px-2.5 py-2 text-sm cursor-pointer transition-colors',
                    isSelected
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                  onClick={(e) =>
                    onSelect(f.id, {
                      shift: e.shiftKey,
                      meta: e.metaKey || e.ctrlKey,
                    })
                  }
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium flex items-center gap-1.5">
                        {rowIdx != null && (
                          <span
                            className="shrink-0 inline-flex items-center rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold px-1.5 py-0.5 uppercase tracking-wide"
                            title={`This field is row ${rowIdx} of a repeating section — it will fill with the ${rowIdx === 1 ? 'most recent' : `#${rowIdx} most recent`} vessel/assignment.`}
                          >
                            Row {rowIdx}
                          </span>
                        )}
                        <span className="truncate">
                          {f.label || '(untitled)'}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                        <span className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">
                          {getFieldType(f)}
                        </span>
                        {f.profileKey && (
                          <span className="truncate text-blue-600 dark:text-blue-400">
                            → {f.profileKey}
                          </span>
                        )}
                        {!f.profileKey &&
                          f.autoBindSuggestion?.profileKey &&
                          getFieldType(f) !== 'calculated' && (
                            <span
                              className="inline-flex items-center gap-1 rounded bg-violet-100 dark:bg-violet-950/40 px-1.5 py-0.5 text-violet-700 dark:text-violet-300"
                              title="AI suggested a binding — open this field to apply it"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              suggested
                            </span>
                          )}
                        {f.required && (
                          <span className="text-rose-600">required</span>
                        )}
                        {!positioned && (
                          <span className="text-amber-600 dark:text-amber-400">
                            unpositioned
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(f.id);
                      }}
                      aria-label="Delete field"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Icon for each field type — used in the inspector header so a glance
 * at the panel tells the user what kind of field is selected without
 * having to read the Type dropdown.
 */
const FIELD_TYPE_ICONS: Record<
  TemplateFieldType,
  React.ComponentType<{ className?: string }>
> = {
  text: TypeIcon,
  multiline: AlignLeft,
  number: Hash,
  date: Calendar,
  email: AtSign,
  checkbox: CheckSquare,
  signature: PenTool,
  calculated: Calculator,
};

/**
 * Subtle colour accent per type — applied to the icon and the top badge
 * of the inspector so each type's panel has a consistent visual cue.
 * Kept understated (no backgrounds) to avoid the "gaming UI" look.
 */
const FIELD_TYPE_COLOR: Record<TemplateFieldType, string> = {
  text: 'text-slate-600 dark:text-slate-300',
  multiline: 'text-slate-600 dark:text-slate-300',
  number: 'text-indigo-600 dark:text-indigo-400',
  date: 'text-amber-600 dark:text-amber-400',
  email: 'text-sky-600 dark:text-sky-400',
  checkbox: 'text-emerald-600 dark:text-emerald-400',
  signature: 'text-rose-600 dark:text-rose-400',
  calculated: 'text-violet-600 dark:text-violet-400',
};

/**
 * Small titled section used inside the Field properties panel. The label
 * is rendered as a light uppercase header with an icon + a thin divider,
 * keeping the panel scannable without heavy dashed borders everywhere.
 * Children are the section's form controls.
 */
function InspectorSection({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 pt-3 first:pt-0">
      <div className="flex items-center gap-1.5 border-b border-border/60 pb-1">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {hint && (
          <span className="ml-1 truncate text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">
            {hint}
          </span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * Tiny status pill shown in the inspector's header row. Communicates
 * rowIndex, required, auto-fill binding at a glance so the user doesn't
 * have to scroll the whole panel to see what's set.
 */
function InspectorPill({
  icon: Icon,
  children,
  className,
  title,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80',
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Icon per auto-fill category — surfaced in the picker's section
 * headers + on each option row so the user can eyeball the origin of a
 * value (profile vs vessel vs sea time, etc.) without reading every label.
 */
const PROFILE_CATEGORY_ICONS: Record<
  ProfileKeyCategory,
  React.ComponentType<{ className?: string }>
> = {
  personal: User,
  address: Home,
  vessel: Ship,
  service: Anchor,
  captain: BadgeCheck,
  system: Clock,
};

/**
 * Case-insensitive containment check used for the picker search.
 *
 * Looks through label + description + aliases so users can type either
 * the display label ("Post code") or a synonym ("zip") and still find
 * the right option.
 */
function profileKeyMatchesQuery(opt: ProfileKeyOption, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (opt.label.toLowerCase().includes(needle)) return true;
  if (opt.description && opt.description.toLowerCase().includes(needle)) return true;
  if (opt.value.toLowerCase().includes(needle)) return true;
  if (opt.aliases?.some((a) => a.toLowerCase().includes(needle))) return true;
  return false;
}

/**
 * ProfileKeyPicker — searchable, keyboard-navigable combobox for the
 * "Auto-fill from" field in the Inspector.
 *
 * Differences from the plain Select we used before:
 *   1. A search input at the top filters across labels, descriptions,
 *      and aliases (so "zip" finds "Post code", "rank" finds "Position").
 *   2. Options are grouped by category with sticky section headers + an
 *      icon per group, making a 50+ item list feel browsable.
 *   3. Arrow keys navigate visible results; Enter selects; Escape closes.
 *   4. The "Manual / no auto-fill" entry is always pinned at the top of
 *      the list as a zero-index option so clearing the binding is one
 *      keypress.
 */
function ProfileKeyPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset search + active row whenever the popover closes — a fresh
  // open always starts from a clean slate.
  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveIdx(0);
    } else {
      // Focus the search input when the popover opens so the user can
      // type immediately without clicking.
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  // Group the (filtered) options by category and sort the groups using
  // the category metadata's `order` field. Manual is rendered separately
  // as a pinned sentinel so it isn't affected by the search/grouping.
  const grouped = useMemo(() => {
    const filtered = PROFILE_KEY_OPTIONS.filter((o) =>
      profileKeyMatchesQuery(o, search),
    );
    const byCategory = new Map<ProfileKeyCategory, ProfileKeyOption[]>();
    for (const opt of filtered) {
      if (!byCategory.has(opt.category)) byCategory.set(opt.category, []);
      byCategory.get(opt.category)!.push(opt);
    }
    return Array.from(byCategory.entries()).sort(
      (a, b) =>
        PROFILE_KEY_CATEGORY_META[a[0]].order -
        PROFILE_KEY_CATEGORY_META[b[0]].order,
    );
  }, [search]);

  // Flat list in render order — used for keyboard navigation. First
  // entry is always the "Manual" sentinel (value === null), then each
  // filtered option in the same order they appear grouped.
  const flat = useMemo(() => {
    const list: Array<{ value: string | null; opt: ProfileKeyOption | null }> = [
      { value: null, opt: null },
    ];
    for (const [, opts] of grouped) {
      for (const opt of opts) list.push({ value: opt.value, opt });
    }
    return list;
  }, [grouped]);

  // Keep activeIdx in bounds when the filter changes.
  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(Math.max(0, flat.length - 1));
  }, [flat.length, activeIdx]);

  // Ensure the keyboard-highlighted row is actually visible inside the
  // scroll container (relevant when searching inside a long group).
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-active="true"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const selectedOption = value
    ? (PROFILE_KEY_OPTIONS.find((o) => o.value === value) ?? null)
    : null;

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = flat[activeIdx];
      if (picked) pick(picked.value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // The entry index in `flat` we're currently rendering — bumped as we
  // walk through the grouped structure so keyboard highlight matches
  // the visual rows.
  let runningIdx = 0;
  // Pre-compute the Manual row's running index (always 0) so the JSX
  // below doesn't need to think about offsets.
  const manualIdx = runningIdx++;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between font-normal',
            !selectedOption && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selectedOption ? (
              <>
                {(() => {
                  const Icon =
                    PROFILE_CATEGORY_ICONS[selectedOption.category];
                  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
                })()}
                <span className="truncate">{selectedOption.label}</span>
                <span className="text-[10px] uppercase text-muted-foreground">
                  {PROFILE_KEY_CATEGORY_META[selectedOption.category].label.split(' — ')[0]}
                </span>
              </>
            ) : (
              <span>Manual / no auto-fill</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <div className="flex items-center gap-2 border-b px-2 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search profile, vessel, sea time…"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setActiveIdx(0);
                searchRef.current?.focus();
              }}
              className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <div
          ref={listRef}
          className="max-h-[340px] overflow-auto py-1"
          role="listbox"
        >
          {/* ---- Pinned "Manual" entry -----------------------------
             Zero-index so pressing ArrowDown → Enter straight away
             gives the fastest path to "clear this binding". */}
          <button
            type="button"
            role="option"
            data-active={activeIdx === manualIdx || undefined}
            aria-selected={value == null}
            onMouseEnter={() => setActiveIdx(manualIdx)}
            onClick={() => pick(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-xs',
              activeIdx === manualIdx && 'bg-accent text-accent-foreground',
            )}
          >
            <Check
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                value == null ? 'opacity-100' : 'opacity-0',
              )}
            />
            <span className="flex-1">Manual / no auto-fill</span>
            <span className="text-[10px] uppercase text-muted-foreground">
              Default
            </span>
          </button>

          {grouped.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing matches &ldquo;{search}&rdquo;. Try another term, or
              leave this field as manual entry.
            </div>
          )}

          {grouped.map(([cat, opts]) => {
            const meta = PROFILE_KEY_CATEGORY_META[cat];
            const CatIcon = PROFILE_CATEGORY_ICONS[cat];
            return (
              <div key={cat} className="mt-1">
                <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-popover/95 px-3 py-1 backdrop-blur">
                  <CatIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </span>
                </div>
                {opts.map((opt) => {
                  const idx = runningIdx++;
                  const isActive = idx === activeIdx;
                  const isSelected = value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      data-active={isActive || undefined}
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => pick(opt.value)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-sm px-3 py-1.5 text-left text-xs',
                        isActive && 'bg-accent text-accent-foreground',
                      )}
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 mt-0.5',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-medium">
                          {opt.label}
                        </span>
                        {opt.description && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {opt.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t px-2 py-1 text-[10px] text-muted-foreground">
          <span>
            {flat.length - 1} auto-fill{' '}
            {flat.length - 1 === 1 ? 'option' : 'options'}
          </span>
          <span className="hidden sm:inline">↑↓ move · Enter pick</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * FieldInspector — the right-hand properties panel.
 *
 * Structure (top → bottom):
 *   1. Header      — type icon + type label + delete button.
 *   2. Status row  — pills summarising Required / Row / Auto-fill so
 *                    the user sees the field's state without scrolling.
 *   3. Basics      — Label, Type.
 *   4. Placement   — Page (multi-page only) + Row. Collapsed into a
 *                    2-col grid when both apply.
 *   5. Type body   — inline type-specific options (no nested cards).
 *   6. Data        — Auto-fill from + Default value (hidden for field
 *                    types that don't support string binding).
 *   7. Advanced    — Collapsible: help text. Closed by default.
 *   8. Required    — Pinned prominent toggle at the bottom.
 */
function FieldInspector({
  field,
  fields,
  pageCount,
  onChange,
  onDelete,
}: {
  field: TemplateField | null;
  fields: TemplateField[];
  pageCount: number;
  onChange: (id: string, patch: Partial<TemplateField>) => void;
  onDelete: (id: string) => void;
}) {
  if (!field) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <MousePointerClick className="h-5 w-5" />
            <span>Select a field to edit its properties.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const type = getFieldType(field);
  // A field has a "profile binding" concept only when the stamped value
  // is a plain string. Checkboxes stamp a glyph, signatures stamp an
  // image/printed name, and calculated fields derive from other fields —
  // none of those make sense to bind to firstName / vesselName etc.
  const supportsProfileBinding =
    type !== 'calculated' && type !== 'checkbox' && type !== 'signature';
  // Same logic for a raw string "default value" — calculated has no
  // default (it's computed), and checkbox has its own dedicated default
  // state in the body block below.
  const supportsStringDefault = type !== 'calculated' && type !== 'checkbox';

  const typeMeta = FIELD_TYPE_OPTIONS.find((o) => o.value === type);
  const TypeIconComp = FIELD_TYPE_ICONS[type] ?? TypeIcon;
  const typeColor = FIELD_TYPE_COLOR[type] ?? 'text-muted-foreground';

  // Suggest a sensible set of row numbers to pick from: 1 through "the
  // highest row any field in this template currently uses" + 2 buffer
  // slots. This gives a scan-table user with 3 past-vessel rows options
  // 1–5 out of the box but grows as they add more.
  const maxExistingRow = fields.reduce(
    (max, f) => Math.max(max, resolveFieldRowIndex(f) ?? 0),
    0,
  );
  const rowOptions = Array.from(
    { length: Math.max(maxExistingRow + 2, 5) },
    (_, i) => i + 1,
  );
  const currentRow = resolveFieldRowIndex(field);

  // Whether any template field has a row index — used to decide if the
  // Placement section should show the Row picker at all (keeps the panel
  // minimal for single-row forms where rows aren't relevant yet).
  const templateUsesRows = maxExistingRow > 0 || currentRow != null;
  const showPlacement = pageCount > 1 || templateUsesRows;

  // Advanced section is collapsed by default — opens when the field has
  // help text already, so the user never loses sight of content they set.
  const advancedInitiallyOpen = !!field.helpText;

  // Short, friendly summary for the current profile binding — shown as a
  // pill in the status row. Falls back to the raw key if we don't have a
  // label in PROFILE_KEY_OPTIONS.
  const profileKeyLabel = field.profileKey
    ? (PROFILE_KEY_OPTIONS.find((o) => o.value === field.profileKey)?.label ??
        field.profileKey)
    : null;

  return (
    <Card>
      {/* ---- Header: type icon + type label + delete button --------
         Replaces the generic "Field properties" title. Seeing the type
         up front + the type colour accent makes it instantly clear
         which kind of field is being edited. */}
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <TypeIconComp className={cn('h-4 w-4 shrink-0', typeColor)} />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">
                {field.label || '(untitled)'}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {typeMeta?.label ?? type}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(field.id)}
            aria-label="Delete field"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* ---- Status pills: at-a-glance summary of the key state --
           Only renders pills for properties that are actually set, so
           the header stays calm for fresh fields. */}
        {(field.required || currentRow != null || profileKeyLabel) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {field.required && (
              <InspectorPill
                icon={Asterisk}
                className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                title="This field must have a value before the form can be submitted"
              >
                Required
              </InspectorPill>
            )}
            {currentRow != null && (
              <InspectorPill
                icon={Rows3}
                className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300"
                title={`Row ${currentRow} of a repeating section`}
              >
                Row {currentRow}
              </InspectorPill>
            )}
            {profileKeyLabel && (
              <InspectorPill
                icon={Link2}
                className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                title={`Auto-fills from ${field.profileKey}`}
              >
                {profileKeyLabel}
              </InspectorPill>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0 space-y-0">
        {/* ---- Basics: label + type ---------------------------------- */}
        <InspectorSection label="Basics">
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              value={field.label}
              onChange={(e) => onChange(field.id, { label: e.target.value })}
              placeholder="Field label"
              className="h-9"
            />
            {field.originalLabel && field.originalLabel !== field.label && (
              <p className="text-[10px] text-muted-foreground">
                Scanned as: <em>{field.originalLabel}</em>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                const nextType = v as TemplateFieldType;
                if (nextType === 'calculated' && !field.calculation) {
                  onChange(field.id, {
                    type: nextType,
                    profileKey: null,
                    defaultValue: null,
                    calculation: { operation: 'sum', inputs: [] },
                  });
                } else if (nextType !== 'calculated' && field.calculation) {
                  onChange(field.id, { type: nextType, calculation: undefined });
                } else {
                  onChange(field.id, { type: nextType });
                }
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_OPTIONS.map((opt) => {
                  const OptIcon = FIELD_TYPE_ICONS[opt.value];
                  return (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-start gap-2">
                        <OptIcon
                          className={cn(
                            'h-3.5 w-3.5 mt-0.5 shrink-0',
                            FIELD_TYPE_COLOR[opt.value],
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {opt.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </InspectorSection>

        {/* ---- Placement: page + row ------------------------------
           Collapses into a 2-col grid when both are visible so the
           panel doesn't waste vertical space. */}
        {showPlacement && (
          <InspectorSection label="Placement" icon={MapPin}>
            <div
              className={cn(
                'gap-2',
                pageCount > 1 ? 'grid grid-cols-2' : 'space-y-2',
              )}
            >
              {pageCount > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Page</Label>
                  <Select
                    value={String(field.page ?? 1)}
                    onValueChange={(v) =>
                      onChange(field.id, { page: Number(v) })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: pageCount },
                        (_, i) => i + 1,
                      ).map((p) => (
                        <SelectItem key={p} value={String(p)}>
                          Page {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Row</Label>
                <Select
                  value={currentRow == null ? '__none__' : String(currentRow)}
                  onValueChange={(v) => {
                    const next = v === '__none__' ? null : Number(v);
                    onChange(field.id, { rowIndex: next });
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No row</SelectItem>
                    {rowOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Row {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {currentRow != null && (
              <p className="text-[10px] text-muted-foreground">
                Row 1 fills from the newest assignment, Row 2 the next,
                and so on.
              </p>
            )}
          </InspectorSection>
        )}

        {/* ---- Type-specific options ------------------------------
           Each sub-component renders flat controls (the dashed-card
           wrapper was removed) so this flows naturally inside its own
           section header. Calculated fields keep their own coloured
           block since they're structurally richer. */}
        {type !== 'calculated' && (
          <InspectorSection
            label={`${typeMeta?.label ?? 'Type'} options`}
            icon={Settings2}
          >
            {type === 'text' && (
              <TextFieldOptions field={field} onChange={onChange} />
            )}
            {type === 'multiline' && (
              <MultilineFieldOptions field={field} onChange={onChange} />
            )}
            {type === 'number' && (
              <NumberFieldOptions field={field} onChange={onChange} />
            )}
            {type === 'date' && (
              <DateFieldOptions field={field} onChange={onChange} />
            )}
            {type === 'email' && (
              <EmailFieldOptions field={field} onChange={onChange} />
            )}
            {type === 'checkbox' && (
              <CheckboxFieldOptions field={field} onChange={onChange} />
            )}
            {type === 'signature' && (
              <SignatureFieldOptions field={field} onChange={onChange} />
            )}
          </InspectorSection>
        )}
        {type === 'calculated' && (
          <InspectorSection label="Calculation" icon={Calculator}>
            <CalculationEditor
              field={field}
              fields={fields}
              onChange={onChange}
            />
          </InspectorSection>
        )}

        {/* ---- Data: auto-fill binding + default value ----------- */}
        {supportsProfileBinding && (
          <InspectorSection label="Data" icon={Link2}>
            {/*
              Pending AI suggestion pill — shown when the scanner / re-bind
              attached an `autoBindSuggestion` whose profileKey doesn't yet
              match what's set on the field. Clicking applies it; clicking
              the dismiss button drops the suggestion so it doesn't keep
              nagging. Gives the user provenance ("AI · 0.78 confidence")
              without forcing them to accept a guess.
            */}
            {field.autoBindSuggestion?.profileKey &&
              field.autoBindSuggestion.profileKey !== field.profileKey && (
                <div className="rounded-lg border border-violet-300/60 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-500/40 px-2.5 py-2 text-xs flex items-start gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-muted-foreground">
                      AI suggests{' '}
                      <span className="font-medium text-violet-700 dark:text-violet-300">
                        {findProfileKeyLabel(
                          field.autoBindSuggestion.profileKey,
                        )}
                      </span>{' '}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        ({Math.round(field.autoBindSuggestion.confidence * 100)}%)
                      </span>
                    </div>
                    {field.autoBindSuggestion.reason && (
                      <div className="text-[11px] text-muted-foreground italic line-clamp-2">
                        {field.autoBindSuggestion.reason}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onChange(field.id, {
                          profileKey:
                            field.autoBindSuggestion?.profileKey ?? null,
                        })
                      }
                      className="rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[11px] px-2 py-0.5 font-medium"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChange(field.id, {
                          autoBindSuggestion: undefined,
                        })
                      }
                      className="rounded-md border border-transparent hover:border-border text-[11px] px-2 py-0.5 text-muted-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            <div className="space-y-1">
              <Label className="text-xs">Auto-fill from</Label>
              <ProfileKeyPicker
                value={field.profileKey ?? null}
                onChange={(next) =>
                  onChange(field.id, { profileKey: next })
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Crew profile, vessel details, computed sea time, or
                today&rsquo;s date. Type to search.
              </p>
            </div>

            {supportsStringDefault && (
              <div className="space-y-1">
                <Label className="text-xs">Default value</Label>
                <Input
                  value={field.defaultValue ?? ''}
                  onChange={(e) =>
                    onChange(field.id, {
                      defaultValue: e.target.value.length
                        ? e.target.value
                        : null,
                    })
                  }
                  placeholder={
                    field.profileKey
                      ? 'Used only if auto-fill is empty'
                      : 'Static text stamped for every crew'
                  }
                  className="h-9"
                />
              </div>
            )}
          </InspectorSection>
        )}
        {/* For signature fields we still surface the printed-name
           default, just under its own heading so the user doesn't go
           looking for it in the vanished Data section. */}
        {!supportsProfileBinding && type === 'signature' && (
          <InspectorSection label="Printed name" icon={PenTool}>
            <Input
              value={field.defaultValue ?? ''}
              onChange={(e) =>
                onChange(field.id, {
                  defaultValue: e.target.value.length
                    ? e.target.value
                    : null,
                })
              }
              placeholder="Printed under the signature line"
              className="h-9"
            />
          </InspectorSection>
        )}

        {/* ---- Advanced (collapsible) — help text only for now --- */}
        <details
          className="group pt-3"
          {...(advancedInitiallyOpen ? { open: true } : {})}
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 border-b border-border/60 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-0 -rotate-90" />
            <span>Advanced</span>
          </summary>
          <div className="space-y-2 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Help text</Label>
              <Input
                value={field.helpText ?? ''}
                onChange={(e) =>
                  onChange(field.id, {
                    helpText: e.target.value.length ? e.target.value : undefined,
                  })
                }
                placeholder="Shown under the field when filling the form"
                className="h-9"
              />
            </div>
          </div>
        </details>

        {/* ---- Required toggle — pinned, always visible ---------- */}
        <div className="mt-3 flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <Label className="text-xs font-medium">Required</Label>
            <p className="text-[10px] text-muted-foreground">
              {type === 'checkbox'
                ? "Must be ticked before the form can be submitted."
                : 'Must have a value before the form can be submitted.'}
            </p>
          </div>
          <Switch
            checked={!!field.required}
            onCheckedChange={(v) => onChange(field.id, { required: v })}
          />
        </div>

        {/*
          `fields` is referenced here so React's exhaustive-deps lint
          still recognises it as a dep of the panel when we add cross-
          field features (visibility rules, validators that reference
          sibling values) in a follow-up.
        */}
        <input type="hidden" data-fields-available={fields.length} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Type-specific option blocks. Kept small + colocated so the inspector's
// rendering logic can stay mostly declarative. Each block receives the
// whole field so it can read/write any nested prop (validation / formatting
// / defaultValue).
// ---------------------------------------------------------------------------

interface TypeOptionsProps {
  field: TemplateField;
  onChange: (id: string, patch: Partial<TemplateField>) => void;
}

/** Shallow-merge a patch into `field.validation`, creating the object if missing. */
function patchValidation(
  field: TemplateField,
  onChange: TypeOptionsProps['onChange'],
  patch: Partial<TemplateFieldValidation>,
) {
  onChange(field.id, {
    validation: { ...(field.validation ?? {}), ...patch },
  });
}

/** Shallow-merge a patch into `field.formatting`, creating the object if missing. */
function patchFormatting(
  field: TemplateField,
  onChange: TypeOptionsProps['onChange'],
  patch: Partial<TemplateFieldFormatting>,
) {
  onChange(field.id, {
    formatting: { ...(field.formatting ?? {}), ...patch },
  });
}

/** Parse an optional-number <Input value> into { set: true, value } or { set: false }. */
function parseOptionalNumber(
  raw: string,
): { set: false } | { set: true; value: number } {
  const trimmed = raw.trim();
  if (!trimmed.length) return { set: false };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { set: false };
  return { set: true, value: n };
}

function TextFieldOptions({ field, onChange }: TypeOptionsProps) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs">Max length</Label>
        <Input
          type="number"
          min={1}
          value={field.validation?.maxLength ?? ''}
          onChange={(e) => {
            const parsed = parseOptionalNumber(e.target.value);
            patchValidation(field, onChange, {
              maxLength: parsed.set ? parsed.value : undefined,
            });
          }}
          placeholder="No limit"
          className="h-9"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Pattern (regex)</Label>
        <Input
          value={field.validation?.pattern ?? ''}
          onChange={(e) =>
            patchValidation(field, onChange, {
              pattern: e.target.value.length ? e.target.value : undefined,
            })
          }
          placeholder="^[A-Z0-9-]+$"
          className="h-9 font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Fill dialog rejects values that don&apos;t match.
        </p>
      </div>
      {field.validation?.pattern && (
        <div className="space-y-1">
          <Label className="text-xs">Pattern error message</Label>
          <Input
            value={field.validation?.patternMessage ?? ''}
            onChange={(e) =>
              patchValidation(field, onChange, {
                patternMessage: e.target.value.length
                  ? e.target.value
                  : undefined,
              })
            }
            placeholder="Invalid format"
            className="h-9"
          />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Case</Label>
        <Select
          value={field.formatting?.case ?? '__none__'}
          onValueChange={(v) =>
            patchFormatting(field, onChange, {
              case:
                v === '__none__'
                  ? undefined
                  : (v as NonNullable<TemplateFieldFormatting['case']>),
            })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">As entered</SelectItem>
            <SelectItem value="upper">UPPERCASE</SelectItem>
            <SelectItem value="lower">lowercase</SelectItem>
            <SelectItem value="title">Title Case</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function MultilineFieldOptions({ field, onChange }: TypeOptionsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Min length</Label>
          <Input
            type="number"
            min={0}
            value={field.validation?.minLength ?? ''}
            onChange={(e) => {
              const parsed = parseOptionalNumber(e.target.value);
              patchValidation(field, onChange, {
                minLength: parsed.set ? parsed.value : undefined,
              });
            }}
            placeholder="0"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max length</Label>
          <Input
            type="number"
            min={1}
            value={field.validation?.maxLength ?? ''}
            onChange={(e) => {
              const parsed = parseOptionalNumber(e.target.value);
              patchValidation(field, onChange, {
                maxLength: parsed.set ? parsed.value : undefined,
              });
            }}
            placeholder="No limit"
            className="h-9"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Renders as a multi-line textarea. Long values wrap into the box.
      </p>
    </>
  );
}

function NumberFieldOptions({ field, onChange }: TypeOptionsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Min</Label>
          <Input
            type="number"
            value={field.validation?.min ?? ''}
            onChange={(e) => {
              const parsed = parseOptionalNumber(e.target.value);
              patchValidation(field, onChange, {
                min: parsed.set ? parsed.value : undefined,
              });
            }}
            placeholder="—"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max</Label>
          <Input
            type="number"
            value={field.validation?.max ?? ''}
            onChange={(e) => {
              const parsed = parseOptionalNumber(e.target.value);
              patchValidation(field, onChange, {
                max: parsed.set ? parsed.value : undefined,
              });
            }}
            placeholder="—"
            className="h-9"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Prefix</Label>
          <Input
            value={field.formatting?.prefix ?? ''}
            onChange={(e) =>
              patchFormatting(field, onChange, {
                prefix: e.target.value.length ? e.target.value : undefined,
              })
            }
            placeholder="£ / $ / …"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Suffix</Label>
          <Input
            value={field.formatting?.suffix ?? ''}
            onChange={(e) =>
              patchFormatting(field, onChange, {
                suffix: e.target.value.length ? e.target.value : undefined,
              })
            }
            placeholder=" days / kg / …"
            className="h-9"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Prefix/suffix are added when stamping (e.g. 12 → 12 days).
      </p>
    </>
  );
}

/** Common date formats we pre-populate the picker with. Users can still type a custom format. */
const DATE_FORMAT_PRESETS: { value: string; label: string; example: string }[] = [
  { value: 'dd/MM/yyyy', label: 'Day/Month/Year', example: '15/04/2026' },
  { value: 'MM/dd/yyyy', label: 'Month/Day/Year', example: '04/15/2026' },
  { value: 'yyyy-MM-dd', label: 'ISO (YYYY-MM-DD)', example: '2026-04-15' },
  { value: 'd MMM yyyy', label: '15 Apr 2026', example: '15 Apr 2026' },
  { value: 'MMM d, yyyy', label: 'Apr 15, 2026', example: 'Apr 15, 2026' },
  { value: 'd MMMM yyyy', label: '15 April 2026', example: '15 April 2026' },
];

function DateFieldOptions({ field, onChange }: TypeOptionsProps) {
  const current = field.formatting?.dateFormat ?? 'dd/MM/yyyy';
  const isPreset = DATE_FORMAT_PRESETS.some((p) => p.value === current);
  return (
    <div className="space-y-1">
      <Label className="text-xs">Date format</Label>
      <Select
        value={isPreset ? current : '__custom__'}
        onValueChange={(v) => {
          if (v === '__custom__') {
            patchFormatting(field, onChange, { dateFormat: current });
          } else {
            patchFormatting(field, onChange, { dateFormat: v });
          }
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_FORMAT_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              <div className="flex flex-col">
                <span>{p.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {p.example}
                </span>
              </div>
            </SelectItem>
          ))}
          <SelectItem value="__custom__">Custom format…</SelectItem>
        </SelectContent>
      </Select>
      {!isPreset && (
        <Input
          value={current}
          onChange={(e) =>
            patchFormatting(field, onChange, {
              dateFormat: e.target.value.length
                ? e.target.value
                : 'dd/MM/yyyy',
            })
          }
          placeholder="dd/MM/yyyy"
          className="h-9 font-mono text-xs"
        />
      )}
      <p className="text-[10px] text-muted-foreground">
        date-fns tokens (dd, MM, yyyy, MMM…). Only affects how the date is
        stamped onto the PDF.
      </p>
    </div>
  );
}

function EmailFieldOptions({ field, onChange }: TypeOptionsProps) {
  return (
    <>
      <p className="text-[10px] text-muted-foreground">
        Built-in validation ensures <code className="rounded bg-muted px-1">name@example.com</code>{' '}
        shape. Add a max length if the PDF cell is narrow.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Max length</Label>
        <Input
          type="number"
          min={1}
          value={field.validation?.maxLength ?? ''}
          onChange={(e) => {
            const parsed = parseOptionalNumber(e.target.value);
            patchValidation(field, onChange, {
              maxLength: parsed.set ? parsed.value : undefined,
            });
          }}
          placeholder="No limit"
          className="h-9"
        />
      </div>
    </>
  );
}

/**
 * Checkbox options.
 *
 * We store the checkbox state in the existing string-shaped `defaultValue`
 * field so we don't need a schema change:
 *   - `null`       → user ticks/unticks in the fill dialog.
 *   - non-empty    → the string is stamped into the box when the user
 *                    leaves the checkbox ticked (default glyph "✓").
 *   - ""           → unticked by default (no string stamped).
 *
 * The user configures the STAMP character (the thing that actually lands
 * on the PDF when ticked) and the DEFAULT STATE (pre-ticked or not) in
 * the panel below.
 */
function CheckboxFieldOptions({ field, onChange }: TypeOptionsProps) {
  const stampChar = field.defaultValue && field.defaultValue.length
    ? field.defaultValue
    : '✓';
  const isPreChecked = !!field.defaultValue && field.defaultValue.length > 0;
  return (
    <>
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <Label className="text-xs font-medium">Pre-ticked</Label>
          <p className="text-[10px] text-muted-foreground">
            Stamp the tick automatically.
          </p>
        </div>
        <Switch
          checked={isPreChecked}
          onCheckedChange={(v) =>
            onChange(field.id, { defaultValue: v ? stampChar : null })
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tick character</Label>
        <Input
          value={stampChar}
          maxLength={3}
          onChange={(e) => {
            const next = e.target.value.length ? e.target.value : '✓';
            // Only rewrite defaultValue when the box is currently pre-ticked;
            // otherwise keep the "not ticked by default" state.
            if (isPreChecked) {
              onChange(field.id, { defaultValue: next });
            }
          }}
          placeholder="✓"
          className="h-9 font-mono text-center"
        />
        <p className="text-[10px] text-muted-foreground">
          Stamped when ticked. Common:{' '}
          <code className="rounded bg-muted px-1">✓</code>{' '}
          <code className="rounded bg-muted px-1">X</code>{' '}
          <code className="rounded bg-muted px-1">●</code>.
        </p>
      </div>
    </>
  );
}

/**
 * Signature options.
 *
 * Signatures are stamped as text in the current PDF generator (a future
 * upgrade will let the user draw a signature and stamp the image). The
 * printed-name default is captured in a dedicated "Printed name" section
 * rendered by the FieldInspector, so this block only explains the flow.
 */
function SignatureFieldOptions(_: TypeOptionsProps) {
  return (
    <p className="text-[10px] text-muted-foreground">
      The fill dialog will prompt for a signature and render it over the
      bounding box. The <strong>Printed name</strong> section below lets
      you stamp a typed name under the signature line.
    </p>
  );
}

/**
 * Compact key used in React lists / equality checks for a CalculationInput.
 * Site values and form fields share an id namespace via the `kind:` prefix
 * so a Map<string, ...> can store both without collisions.
 */
function inputKey(inp: CalculationInput): string {
  return inp.kind === 'field' ? `field:${inp.fieldId}` : `site:${inp.key}`;
}

function CalculationEditor({
  field,
  fields,
  onChange,
}: {
  field: TemplateField;
  fields: TemplateField[];
  onChange: (id: string, patch: Partial<TemplateField>) => void;
}) {
  const calc: TemplateFieldCalculation = field.calculation ?? {
    operation: 'sum',
    inputs: [],
  };
  const op = CALCULATION_OPERATION_OPTIONS.find((o) => o.value === calc.operation);

  // Normalise once at the top — handles legacy `inputFieldIds`-shaped
  // calculations transparently so the rest of the editor only deals with
  // the modern `CalculationInput[]` shape.
  const inputs: CalculationInput[] = useMemo(
    () => getCalculationInputs(calc),
    [calc],
  );

  // Form-field candidates. You can't pick the field itself (no circular
  // refs). Other calculated fields ARE allowed as inputs ("grand total
  // of subtotals") — the evaluator runs multiple passes for that.
  const candidateFields = useMemo(
    () => fields.filter((f) => f.id !== field.id),
    [fields, field.id],
  );

  // Quick-lookup sets for "is this candidate already selected?"
  const selectedFieldIds = useMemo(() => {
    const s = new Set<string>();
    for (const inp of inputs) {
      if (inp.kind === 'field') s.add(inp.fieldId);
    }
    return s;
  }, [inputs]);
  const selectedSiteKeys = useMemo(() => {
    const s = new Set<SiteValueKey>();
    for (const inp of inputs) {
      if (inp.kind === 'siteValue') s.add(inp.key);
    }
    return s;
  }, [inputs]);

  const patchCalculation = (patch: Partial<TemplateFieldCalculation>) => {
    // Always migrate writes off the deprecated `inputFieldIds` shape so
    // future loads of this template see the modern structure. We seed
    // from the normalised `inputs` array, then apply the patch on top.
    const base: TemplateFieldCalculation = {
      ...calc,
      inputs,
      inputFieldIds: undefined,
    };
    onChange(field.id, { calculation: { ...base, ...patch } });
  };

  /**
   * Toggle an input on/off. Preserves the existing click order (new
   * additions go to the end) so `difference`, `days_between` and `concat`
   * behave predictably as the user clicks.
   */
  const toggleInput = (target: CalculationInput) => {
    const key = inputKey(target);
    const exists = inputs.some((inp) => inputKey(inp) === key);
    const nextInputs = exists
      ? inputs.filter((inp) => inputKey(inp) !== key)
      : [...inputs, target];
    patchCalculation({ inputs: nextInputs });
  };

  const moveInput = (index: number, dir: -1 | 1) => {
    const next = [...inputs];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patchCalculation({ inputs: next });
  };

  const minInputs = op?.minInputs ?? 1;
  const tooFew = inputs.length < minInputs;

  // Group site values by their `group` key so the picker reads as
  // labelled sections ("Sea time", "Counts") instead of one flat list.
  const siteGroups = useMemo(() => {
    const map = new Map<string, typeof SITE_VALUE_OPTIONS>();
    for (const opt of SITE_VALUE_OPTIONS) {
      const arr = map.get(opt.group) ?? [];
      arr.push(opt);
      map.set(opt.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  // Friendly label for a site-value group header.
  const groupLabel = (g: string): string => {
    if (g === 'sea-time') return 'Sea time (date-range scoped)';
    if (g === 'counts') return 'History counts';
    return g;
  };

  // Look up display info for an input row in the "Order" list.
  const describeInput = (inp: CalculationInput): {
    label: string;
    icon: React.ReactNode;
    sub?: string;
  } => {
    if (inp.kind === 'siteValue') {
      const opt = SITE_VALUE_OPTIONS.find((o) => o.key === inp.key);
      return {
        label: opt?.label ?? inp.key,
        icon: <Globe className="h-3.5 w-3.5 text-emerald-600" />,
        sub: 'site',
      };
    }
    const f = fields.find((x) => x.id === inp.fieldId);
    return {
      label: f?.label ?? '(deleted field)',
      icon: <FileText className="h-3.5 w-3.5 text-blue-600" />,
      sub: f && getFieldType(f) === 'calculated' ? 'calc' : 'form',
    };
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Operation</Label>
        <Select
          value={calc.operation}
          onValueChange={(v) =>
            patchCalculation({ operation: v as TemplateCalculationOperation })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CALCULATION_OPERATION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {opt.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ---- Inputs picker — site values + form fields ----------------
         Two clearly-labelled sections inside one scroll container. The
         site values come first because they're usually the answer for
         "total sea time", "yard days" etc. — the original headline use
         case. Form fields stay below for things like summing two date
         fields the AI extracted from the document. */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Inputs</Label>
          <span className="text-[10px] text-muted-foreground">
            {inputs.length} selected
          </span>
        </div>
        <div className="max-h-[280px] overflow-auto rounded-md border bg-background">
          {/* Site values */}
          {siteGroups.map(([groupKey, opts]) => (
            <div key={groupKey}>
              <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-emerald-50/95 dark:bg-emerald-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300 backdrop-blur">
                <Globe className="h-3 w-3" />
                {groupLabel(groupKey)}
              </div>
              {opts.map((opt) => {
                const checked = selectedSiteKeys.has(opt.key);
                return (
                  <label
                    key={opt.key}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs border-b last:border-b-0',
                      checked && 'bg-emerald-50/60 dark:bg-emerald-950/30',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleInput({ kind: 'siteValue', key: opt.key })
                      }
                      className="mt-0.5 h-3.5 w-3.5 rounded border-input"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-2">
                        {opt.description}
                      </div>
                    </div>
                    {checked && (
                      <span className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                        #
                        {inputs.findIndex(
                          (inp) =>
                            inp.kind === 'siteValue' && inp.key === opt.key,
                        ) + 1}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ))}

          {/* Form fields */}
          <div>
            <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-blue-50/95 dark:bg-blue-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300 backdrop-blur">
              <FileText className="h-3 w-3" />
              Form fields on this template
            </div>
            {candidateFields.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                No other fields on this template yet.
              </p>
            ) : (
              candidateFields.map((f) => {
                const checked = selectedFieldIds.has(f.id);
                const idx = inputs.findIndex(
                  (inp) => inp.kind === 'field' && inp.fieldId === f.id,
                );
                return (
                  <label
                    key={f.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs border-b last:border-b-0',
                      checked && 'bg-blue-50/60 dark:bg-blue-950/30',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleInput({ kind: 'field', fieldId: f.id })
                      }
                      className="h-3.5 w-3.5 rounded border-input"
                    />
                    <span className="flex-1 truncate">
                      {f.label || '(untitled)'}
                      {getFieldType(f) === 'calculated' && (
                        <span className="ml-1 text-[10px] text-primary">
                          (calc)
                        </span>
                      )}
                    </span>
                    {checked && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        #{idx + 1}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
        {tooFew && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {op?.label} needs at least {minInputs} input
            {minInputs === 1 ? '' : 's'}.
          </p>
        )}
      </div>

      {/* Order controls — only matter for difference / days_between / concat */}
      {inputs.length > 1 &&
        (calc.operation === 'difference' ||
          calc.operation === 'days_between' ||
          calc.operation === 'concat') && (
          <div className="space-y-1.5">
            <Label className="text-xs">Order</Label>
            <ul className="space-y-1">
              {inputs.map((inp, i) => {
                const info = describeInput(inp);
                return (
                  <li
                    key={inputKey(inp)}
                    className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {i + 1}.
                    </span>
                    {info.icon}
                    <span className="flex-1 truncate">{info.label}</span>
                    {info.sub && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {info.sub}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={i === 0}
                      onClick={() => moveInput(i, -1)}
                      aria-label="Move up"
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={i === inputs.length - 1}
                      onClick={() => moveInput(i, 1)}
                      aria-label="Move down"
                    >
                      ↓
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      {calc.operation === 'concat' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Separator</Label>
          <Input
            value={calc.separator ?? ', '}
            onChange={(e) => patchCalculation({ separator: e.target.value })}
            placeholder=", "
          />
        </div>
      )}

      {(calc.operation === 'sum' ||
        calc.operation === 'difference' ||
        calc.operation === 'average' ||
        calc.operation === 'min' ||
        calc.operation === 'max') && (
        <div className="space-y-1.5">
          <Label className="text-xs">Decimal places</Label>
          <Input
            type="number"
            min={0}
            max={6}
            value={calc.decimals ?? (calc.operation === 'average' ? 2 : 0)}
            onChange={(e) =>
              patchCalculation({
                decimals: Math.max(0, Math.min(6, Number(e.target.value) || 0)),
              })
            }
            className="h-9"
          />
        </div>
      )}

      {/* Hint when site values are in play — gives users the context for
         why the Documents page asks for a date range. */}
      {selectedSiteKeys.size > 0 && (
        <div className="rounded-md border border-emerald-300/40 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-700/40 px-2 py-1.5 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-1.5">
          <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Site values are computed from the date range you pick when
            filling this form for a crew member.
          </span>
        </div>
      )}
    </div>
  );
}

function DescriptionPanel({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Description</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Short note shown on the template card (optional)"
          rows={3}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
}
