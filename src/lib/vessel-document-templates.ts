/**
 * Types and small helpers for the "Custom Templates" feature — reusable
 * fillable documents saved per vessel. A template = original PDF/image +
 * a list of fields (position + profileKey) that we stamp values into.
 *
 * The database representation lives in `vessel_document_templates`
 * (see sql/create-vessel-document-templates.sql). The file itself is
 * stored in the `vessel-document-templates` Storage bucket.
 */

/** Normalized bounding box in the same [0..1000] coordinate space the AI
 *  scanner uses — makes it trivial to render overlays and to stamp values
 *  onto the stored PDF without re-deriving page sizes. */
export interface TemplateBbox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/**
 * The input-type the form-builder treats a field as. Controls:
 *   - what UI we render in the "Use template" dialog,
 *   - what validators run on user-provided values,
 *   - how we normalise the value before stamping it onto the PDF.
 *
 * `text` is the default for any older saved template that predates this
 * schema, so existing rows keep working without a migration.
 */
export type TemplateFieldType =
  | 'text'
  | 'multiline'
  | 'number'
  | 'date'
  | 'email'
  | 'checkbox'
  | 'signature'
  | 'calculated';

/**
 * A calculated field derives its value from other fields on the template
 * AND/OR from data that lives on the site itself (sea-time totals,
 * assignment counts, etc.). Useful for "total sea time across all my
 * vessels in this date range", "days between two scanned date fields",
 * concatenated names, monthly sums, and so on.
 */
export type TemplateCalculationOperation =
  | 'sum'
  | 'difference'
  | 'average'
  | 'min'
  | 'max'
  | 'count'
  | 'days_between'
  | 'concat';

/**
 * Catalog of values pulled directly from the site (the crew profile,
 * computed sea-time totals, vessel-assignment counts) rather than from
 * fields on the document. A subset of these are *date-range scoped* —
 * they only have meaningful values once the user picks a date range when
 * filling the form. The Documents page already exposes that range
 * picker for sea-time forms; we reuse the same data here.
 *
 * Add new keys here AND wire them up in:
 *   - SITE_VALUE_OPTIONS                 (the inspector picker)
 *   - resolveSiteValues (in route.ts)    (the fill-time evaluator)
 */
export type SiteValueKey =
  // Sea-time totals computed for the user-chosen date range
  | 'totalDays'
  | 'atSeaDays'
  | 'standbyDays'
  | 'yardDays'
  | 'leaveDays'
  | 'underwayDays'
  | 'atAnchorDays'
  | 'inPortDays'
  // Aggregate counts derived from the crew member's history
  | 'numberOfVessels'
  | 'numberOfAssignments';

export interface SiteValueOption {
  key: SiteValueKey;
  label: string;
  description: string;
  /** Coarse grouping used to render the picker as labelled sections. */
  group: 'sea-time' | 'counts';
  /**
   * True when the value is computed from the date range the user picks
   * at fill time. Used by the Documents page to show the "needs date
   * range" UI even for templates whose only date-range dependency lives
   * inside a calculation.
   */
  dateRangeScoped: boolean;
}

export const SITE_VALUE_OPTIONS: SiteValueOption[] = [
  {
    key: 'totalDays',
    label: 'Total days (all categories)',
    description: 'Total days in the chosen date range',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'atSeaDays',
    label: 'Days at sea',
    description: 'Days the vessel was logged "at sea" in the date range',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'standbyDays',
    label: 'Standby days',
    description: 'Days the vessel was on standby in the date range',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'yardDays',
    label: 'Yard / refit days',
    description: 'Days the vessel was in the yard or under refit',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'leaveDays',
    label: 'Leave days',
    description: 'Days the crew member was on leave in the range',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'underwayDays',
    label: 'Underway days',
    description: 'Subset of "at sea" — days actively underway',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'atAnchorDays',
    label: 'At-anchor days',
    description: 'Subset of "at sea" — days at anchor',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'inPortDays',
    label: 'In-port days',
    description: 'Subset of "standby" — days alongside in port',
    group: 'sea-time',
    dateRangeScoped: true,
  },
  {
    key: 'numberOfVessels',
    label: 'Number of vessels',
    description: 'Distinct vessels the crew member has been assigned to',
    group: 'counts',
    dateRangeScoped: false,
  },
  {
    key: 'numberOfAssignments',
    label: 'Number of assignments',
    description: 'Total assignment records across all vessels',
    group: 'counts',
    dateRangeScoped: false,
  },
];

/**
 * One entry in a calculation's input list. Either:
 *   - kind: 'field'      — value comes from another TemplateField on this
 *                          template (referenced by id).
 *   - kind: 'siteValue'  — value comes from the site (sea-time, counts,
 *                          etc.), looked up at fill time.
 *
 * The discriminated shape lets the editor and the evaluator handle each
 * source without ambiguity, and makes it easy to add more source kinds
 * later without breaking saved templates.
 */
export type CalculationInput =
  | { kind: 'field'; fieldId: string }
  | { kind: 'siteValue'; key: SiteValueKey };

export interface TemplateFieldCalculation {
  operation: TemplateCalculationOperation;
  /**
   * Ordered list of inputs the operation feeds on. Each input is either
   * another field on the template or a site value resolved at fill time.
   * Order matters for `difference`, `days_between`, and `concat`.
   *
   * Older templates may still be persisted with `inputFieldIds` instead;
   * use `getCalculationInputs(calc)` to read either shape uniformly.
   */
  inputs?: CalculationInput[];
  /**
   * @deprecated Pre-2026-04 templates stored field-only inputs here.
   * Use `inputs` for new writes; readers should call
   * `getCalculationInputs` which folds this into the modern shape.
   */
  inputFieldIds?: string[];
  /** For `concat` — joiner between values. Defaults to ", ". */
  separator?: string;
  /**
   * Number of decimal places for numeric operations (sum/difference/
   * average/min/max). Defaults to 0 except for `average` which defaults
   * to 2.
   */
  decimals?: number;
}

/**
 * Normalize a calculation's inputs into the modern discriminated shape.
 * Reads from `calc.inputs` first, falling back to legacy `inputFieldIds`
 * (treating each id as `{kind: 'field', fieldId: id}`). Centralising the
 * fallback keeps every consumer (UI, evaluator, resolver) reading the
 * same way without scattering "or" expressions everywhere.
 */
export function getCalculationInputs(
  calc: TemplateFieldCalculation,
): CalculationInput[] {
  if (calc.inputs && calc.inputs.length) return calc.inputs;
  if (calc.inputFieldIds && calc.inputFieldIds.length) {
    return calc.inputFieldIds.map((fieldId) => ({
      kind: 'field' as const,
      fieldId,
    }));
  }
  return [];
}

/** Rules evaluated in the fill dialog before we allow the user to submit. */
export interface TemplateFieldValidation {
  /** Minimum string length (text/multiline/email). */
  minLength?: number;
  /** Maximum string length (text/multiline/email). */
  maxLength?: number;
  /** Numeric bounds (number type). */
  min?: number;
  max?: number;
  /**
   * Regex pattern — stored as a plain string so we can round-trip it to
   * JSON. We compile it just-in-time on the client with `new RegExp(pattern)`.
   */
  pattern?: string;
  /** Error message shown when `pattern` fails. */
  patternMessage?: string;
}

/** How to transform the resolved/typed value before stamping it. */
export interface TemplateFieldFormatting {
  /** Case transform applied to the final string. */
  case?: 'upper' | 'lower' | 'title';
  /** Strip leading/trailing whitespace. */
  trim?: boolean;
  /**
   * date-fns-compatible format string for `date`-type fields, e.g.
   * `"dd/MM/yyyy"` or `"MMM d, yyyy"`. Ignored for non-date types.
   */
  dateFormat?: string;
  /** Prepended to the output (e.g. `"£"` for currency). */
  prefix?: string;
  /** Appended to the output (e.g. `" days"`). */
  suffix?: string;
  /**
   * Hard cap on the stamped string length — useful when the PDF cell is
   * small and you want to force truncation at a safe length.
   */
  maxOutputLength?: number;
}

/**
 * Conditional visibility — hide this field in the fill dialog (and skip
 * stamping it) unless the referenced field passes the check. Keeps
 * templates clean when only a subset of fields apply to certain crew.
 */
export interface TemplateFieldVisibility {
  /** The other field's `id` this rule depends on. */
  fieldId: string;
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'isEmpty'
    | 'isNotEmpty';
  /** Value to compare against (unused for isEmpty/isNotEmpty). */
  value?: string;
}

/** One fillable field on a saved template. */
export interface TemplateField {
  /** Stable id, generated on the client so edits don't shuffle the list. */
  id: string;
  /** Human-readable label shown in the builder / field list. */
  label: string;
  /**
   * Input type — defaults to 'text' if unset (older templates). Controls
   * the fill-dialog widget and downstream validation/formatting.
   */
  type?: TemplateFieldType;
  /**
   * What this field auto-fills from, e.g. "firstName", "vesselName",
   * "atSeaDays". `null` means the field is still unassigned — using the
   * template will leave it blank (or use defaultValue).
   */
  profileKey: string | null;
  /**
   * 1-based row number when this field belongs to a repeating section of
   * the document (e.g. the 2nd row of a "past vessels" table). The
   * resolver uses this to pull values from the Nth of the crew's
   * assignments/vessels instead of filling every row with the active
   * vessel. `null` / `undefined` = not part of a repeating section —
   * the default, single-row path is used.
   *
   * Populated automatically by the scanner when it detects "— Row N —"
   * style labels, but users can set or clear it per field in the
   * builder's inspector when the auto-detection miscounts or when they
   * rename a label and lose the marker.
   */
  rowIndex?: number | null;
  /** 1-indexed PDF page the field lives on (1 for image-based templates). */
  page: number;
  bbox: TemplateBbox;
  /** Optional per-field font size override for stamping. */
  fontSize?: number;
  /** Optional static value — used when profileKey is null or can't resolve. */
  defaultValue?: string | null;
  /**
   * When the AI detected this field we keep the original text for
   * reference ("Given names", "Date of birth"), useful for showing the
   * builder "what the form asked for".
   */
  originalLabel?: string;
  /** User-entered helper text displayed under the input in the fill dialog. */
  helpText?: string;
  /** If true, the fill dialog blocks submission when the value is empty. */
  required?: boolean;
  validation?: TemplateFieldValidation;
  formatting?: TemplateFieldFormatting;
  visibleWhen?: TemplateFieldVisibility;
  /**
   * Present when `type === 'calculated'`. The runtime resolves this after
   * all plain fields have values and stamps the computed string onto the
   * PDF. Users can't type into calculated fields in the fill dialog; the
   * input is replaced with a read-only preview.
   */
  calculation?: TemplateFieldCalculation;
}

/** Row shape returned from Supabase — snake_case. */
export interface VesselDocumentTemplateRow {
  id: string;
  vessel_id: string;
  name: string;
  description: string | null;
  file_type: string;
  file_path: string;
  original_filename: string | null;
  fields: TemplateField[];
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Camel-cased shape used throughout the UI. */
export interface VesselDocumentTemplate {
  id: string;
  vesselId: string;
  name: string;
  description: string | null;
  fileType: string;
  filePath: string;
  originalFilename: string | null;
  fields: TemplateField[];
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function mapTemplateRow(
  row: VesselDocumentTemplateRow,
): VesselDocumentTemplate {
  return {
    id: row.id,
    vesselId: row.vessel_id,
    name: row.name,
    description: row.description,
    fileType: row.file_type,
    filePath: row.file_path,
    originalFilename: row.original_filename,
    fields: Array.isArray(row.fields) ? row.fields : [],
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Bucket name — kept as a constant so routes + UI can't drift. */
export const TEMPLATE_BUCKET = 'vessel-document-templates';

/** Build the storage path we use for a template's file. */
export function buildTemplateFilePath(
  vesselId: string,
  templateId: string,
  filename: string,
): string {
  // Sanitize filename — we don't want slashes to escape the template folder.
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${vesselId}/${templateId}/${safe}`;
}

/** Generate a new client-side field id. Short, sortable-by-time. */
export function newFieldId(): string {
  return `f_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * Friendly labels for the field-type picker in the builder. Order matches
 * the dropdown ordering we want the user to see (most common first).
 */
export const FIELD_TYPE_OPTIONS: {
  value: TemplateFieldType;
  label: string;
  description: string;
}[] = [
  { value: 'text', label: 'Short text', description: 'Single-line text input' },
  {
    value: 'multiline',
    label: 'Long text',
    description: 'Multi-line text area (comments, addresses, etc.)',
  },
  { value: 'number', label: 'Number', description: 'Numeric input with min/max' },
  {
    value: 'date',
    label: 'Date',
    description: 'Date picker; format controlled by Formatting',
  },
  {
    value: 'email',
    label: 'Email',
    description: 'Auto-validated email address',
  },
  {
    value: 'checkbox',
    label: 'Checkbox',
    description: 'Tick / cross stamped onto the PDF',
  },
  {
    value: 'signature',
    label: 'Signature',
    description: 'User draws a signature, stamped as an image',
  },
  {
    value: 'calculated',
    label: 'Calculated',
    description: 'Auto-computed from other fields (sum, average, days between, …)',
  },
];

/** Friendly labels for the operation picker in the calculation editor. */
export const CALCULATION_OPERATION_OPTIONS: {
  value: TemplateCalculationOperation;
  label: string;
  description: string;
  /** Minimum number of inputs required for this op. */
  minInputs: number;
}[] = [
  { value: 'sum', label: 'Sum', description: 'Add all numeric inputs', minInputs: 1 },
  {
    value: 'difference',
    label: 'Difference',
    description: 'First minus each subsequent (A − B − C …)',
    minInputs: 2,
  },
  { value: 'average', label: 'Average', description: 'Mean of numeric inputs', minInputs: 1 },
  { value: 'min', label: 'Minimum', description: 'Lowest numeric input', minInputs: 1 },
  { value: 'max', label: 'Maximum', description: 'Highest numeric input', minInputs: 1 },
  { value: 'count', label: 'Count filled', description: 'How many inputs have a non-empty value', minInputs: 1 },
  {
    value: 'days_between',
    label: 'Days between',
    description: 'Whole days between two date inputs',
    minInputs: 2,
  },
  {
    value: 'concat',
    label: 'Join text',
    description: 'Concatenate input values with a separator',
    minInputs: 1,
  },
];

/** Resolve the type with a sensible default for legacy templates. */
export function getFieldType(field: TemplateField): TemplateFieldType {
  return field.type ?? 'text';
}

/**
 * Placeholder bbox generator for newly-added / unpositioned fields. We
 * stack them down the left margin of page 1 so the user can see them on
 * the document preview and drag them into place.
 */
export function makePlaceholderBbox(index: number): TemplateBbox {
  const rows = 20;
  const rowHeight = 1000 / rows;
  const row = index % rows;
  const col = Math.floor(index / rows);
  const yMin = row * rowHeight + 5;
  const yMax = yMin + rowHeight - 10;
  const xMin = 20 + col * 220;
  const xMax = xMin + 200;
  return { xMin, yMin, xMax, yMax };
}

// ---------------------------------------------------------------------------
// Row-index helpers — support for multi-row tables (e.g. "past vessels")
// ---------------------------------------------------------------------------

/**
 * Regex patterns that match the row-number markers the AI scanner puts
 * into field labels when it detects a repeating section, e.g.
 *   "Sea service — Row 1 — Vessel name"   → 1
 *   "Sea service — Row 3 — Rank held"     → 3
 *   "Vessel 2 — IMO number"               → 2
 *   "Ship 4 - Flag"                       → 4
 *   "Service #5: Date of engagement"      → 5
 *
 * Kept in sync with `extractRowIndex` in `document-scan-flow.ts`, which is
 * the AI-facing twin that operates on raw ExtractedField labels.
 */
const ROW_INDEX_PATTERNS: RegExp[] = [
  /\brow\s*#?\s*(\d+)\b/i,
  /\b(?:vessel|ship|entry|line|service)\s*#?\s*(\d+)\b/i,
  /#\s*(\d+)\b/,
];

/** Parse a 1-based row index out of a label, or null if no marker. */
export function extractRowIndexFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  for (const re of ROW_INDEX_PATTERNS) {
    const m = label.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/**
 * Remove the row marker from a label so the builder can render a clean
 * "Vessel name" with the row number shown as a separate badge instead of
 * three near-duplicate labels ("Row 1 — Vessel name", "Row 2 — Vessel name",
 * …). Collapses leftover separator whitespace so the result looks tidy.
 */
export function stripRowMarkerFromLabel(label: string): string {
  if (!label) return label;
  const cleaned = label
    // " — Row 2 — " → " — "  (also handles hyphens / en-dashes as separators)
    .replace(/\s*[—\-–]\s*row\s*#?\s*\d+\s*[—\-–]\s*/gi, ' — ')
    // Leading "Row 2 — "
    .replace(/^\s*row\s*#?\s*\d+\s*[—\-–]\s*/i, '')
    // Trailing " — Row 2"
    .replace(/\s*[—\-–]\s*row\s*#?\s*\d+\s*$/i, '')
    // Collapse any double separators that slipped through
    .replace(/\s*[—\-–]\s*[—\-–]\s*/g, ' — ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/**
 * Preferred row-index lookup used by the builder and the resolver. Reads
 * the structured `rowIndex` first (populated by the scanner or by the
 * user in the inspector) and falls back to label parsing so legacy
 * templates saved before `rowIndex` existed keep working.
 */
export function resolveFieldRowIndex(
  field: { rowIndex?: number | null; label?: string | null; originalLabel?: string | null },
): number | null {
  if (field.rowIndex != null && field.rowIndex > 0) return field.rowIndex;
  return extractRowIndexFromLabel(field.label ?? field.originalLabel ?? '');
}

/** True when the bbox looks positioned rather than a left-margin placeholder. */
export function isPositionedField(field: TemplateField): boolean {
  const b = field.bbox;
  if (!b) return false;
  if (!Number.isFinite(b.xMin) || !Number.isFinite(b.yMin)) return false;
  if (b.xMax <= b.xMin || b.yMax <= b.yMin) return false;
  // Placeholders all start inside the first ~250px of the left edge — anything
  // wider or further right is user-positioned.
  if (b.xMin < 25 && b.xMax < 240) return false;
  return true;
}

/**
 * Evaluate a visibility rule against the current form values. Used by the
 * fill dialog to show/hide dependent fields. `values` is keyed by field id.
 */
export function evaluateVisibility(
  rule: TemplateFieldVisibility | undefined,
  values: Record<string, string>,
): boolean {
  if (!rule) return true;
  const other = (values[rule.fieldId] ?? '').trim();
  const target = (rule.value ?? '').trim();
  switch (rule.operator) {
    case 'equals':
      return other.toLowerCase() === target.toLowerCase();
    case 'notEquals':
      return other.toLowerCase() !== target.toLowerCase();
    case 'contains':
      return other.toLowerCase().includes(target.toLowerCase());
    case 'isEmpty':
      return other.length === 0;
    case 'isNotEmpty':
      return other.length > 0;
    default:
      return true;
  }
}

/**
 * Apply formatting rules to a raw value. Used both in the fill preview and
 * when stamping values onto the final PDF so the two stay in sync.
 */
export function applyFieldFormatting(
  value: string,
  formatting: TemplateFieldFormatting | undefined,
): string {
  if (!value) return value;
  let out = value;
  if (formatting?.trim) out = out.trim();
  if (formatting?.case === 'upper') out = out.toUpperCase();
  else if (formatting?.case === 'lower') out = out.toLowerCase();
  else if (formatting?.case === 'title') {
    out = out
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase());
  }
  if (formatting?.prefix) out = `${formatting.prefix}${out}`;
  if (formatting?.suffix) out = `${out}${formatting.suffix}`;
  if (formatting?.maxOutputLength && out.length > formatting.maxOutputLength) {
    out = out.slice(0, formatting.maxOutputLength);
  }
  return out;
}

/**
 * Runs all validation rules attached to a field against a raw string value.
 * Returns null when valid, or a human-readable error message to display.
 * Required/empty handling is intentionally NOT included here — the caller
 * decides whether a missing value is an error (e.g. hidden by visibility).
 */
export function validateFieldValue(
  field: TemplateField,
  value: string,
): string | null {
  const type = getFieldType(field);
  const v = value ?? '';
  const trimmed = v.trim();
  if (trimmed.length === 0) return null; // emptiness handled by required check

  if (type === 'number') {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 'Must be a number';
    if (field.validation?.min !== undefined && n < field.validation.min) {
      return `Must be ≥ ${field.validation.min}`;
    }
    if (field.validation?.max !== undefined && n > field.validation.max) {
      return `Must be ≤ ${field.validation.max}`;
    }
  }

  if (type === 'email') {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!ok) return 'Invalid email address';
  }

  if (type === 'date') {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return 'Invalid date';
  }

  if (field.validation?.minLength !== undefined &&
      trimmed.length < field.validation.minLength) {
    return `Must be at least ${field.validation.minLength} characters`;
  }
  if (field.validation?.maxLength !== undefined &&
      trimmed.length > field.validation.maxLength) {
    return `Must be at most ${field.validation.maxLength} characters`;
  }

  if (field.validation?.pattern) {
    try {
      const re = new RegExp(field.validation.pattern);
      if (!re.test(trimmed)) {
        return field.validation.patternMessage || 'Invalid format';
      }
    } catch {
      // Ignore malformed patterns so we don't block saves/fills.
    }
  }

  return null;
}

/**
 * Options shown in the "bind to" picker on a template field — each entry
 * is a profileKey plus a human label + category (for grouping) plus an
 * optional description for the searchable picker. Keep this in sync
 * with PROFILE_FIELD_MAP / SEA_TIME_FIELD_MAP in document-scan-flow.ts.
 */
export type ProfileKeyCategory =
  | 'personal'
  | 'address'
  | 'vessel'
  | 'service'
  | 'captain'
  | 'system';

export interface ProfileKeyOption {
  value: string;
  label: string;
  category: ProfileKeyCategory;
  /** Short hint shown in the picker under the label. */
  description?: string;
  /**
   * Extra search keywords — e.g. synonyms the user might type that
   * aren't in the label ("zip" for post code). Matched case-insensitively.
   */
  aliases?: string[];
}

/**
 * Human labels + display order for category section headers in the
 * searchable Auto-fill picker.
 */
export const PROFILE_KEY_CATEGORY_META: Record<
  ProfileKeyCategory,
  { label: string; description: string; order: number }
> = {
  personal: {
    label: 'Crew — personal',
    description: 'Details from the crew member\u2019s profile',
    order: 1,
  },
  address: {
    label: 'Crew — address',
    description: 'Home / postal address fields',
    order: 2,
  },
  vessel: {
    label: 'Vessel',
    description: 'Details for the vessel tied to the current row',
    order: 3,
  },
  service: {
    label: 'Sea time & service',
    description: 'Auto-calculated from the fill-time date range',
    order: 4,
  },
  captain: {
    label: 'Captain / approver',
    description: 'Filled once the form reaches the approving captain',
    order: 5,
  },
  system: {
    label: 'System',
    description: 'Computed at the moment the form is filled',
    order: 6,
  },
};

export const PROFILE_KEY_OPTIONS: ProfileKeyOption[] = [
  // ---------- Personal ----------
  {
    value: 'fullName',
    label: 'Full name',
    category: 'personal',
    description: 'First + last name',
    aliases: ['name of seafarer', 'crew name'],
  },
  { value: 'firstName', label: 'First name', category: 'personal', aliases: ['given name', 'forename'] },
  { value: 'lastName', label: 'Last name', category: 'personal', aliases: ['surname', 'family name'] },
  { value: 'title', label: 'Title', category: 'personal', description: 'Mr / Mrs / Ms / …' },
  { value: 'email', label: 'Email', category: 'personal', aliases: ['e-mail'] },
  { value: 'dateOfBirth', label: 'Date of birth', category: 'personal', aliases: ['dob', 'd.o.b.', 'born'] },
  { value: 'placeOfBirth', label: 'Place of birth', category: 'personal' },
  { value: 'countryOfBirth', label: 'Country of birth', category: 'personal' },
  { value: 'nationality', label: 'Nationality', category: 'personal', aliases: ['citizenship'] },
  { value: 'telephone', label: 'Telephone', category: 'personal', aliases: ['phone', 'landline'] },
  { value: 'mobile', label: 'Mobile', category: 'personal', aliases: ['cell', 'cell phone'] },
  {
    value: 'position',
    label: 'Position / rank',
    category: 'personal',
    description:
      'Current rank from profile — overridden by per-row rank in multi-vessel tables',
    aliases: ['rank', 'role', 'grade', 'rating', 'capacity'],
  },
  {
    value: 'dischargeBookNumber',
    label: 'Discharge book no.',
    category: 'personal',
    aliases: ['seaman\u2019s book', 'cdc', 'sid'],
  },

  // ---------- Address ----------
  { value: 'fullAddress', label: 'Home address (full)', category: 'address', description: 'Comma-joined street/town/country', aliases: ['postal address'] },
  { value: 'addressLine1', label: 'Address line 1', category: 'address', aliases: ['street'] },
  { value: 'addressLine2', label: 'Address line 2', category: 'address' },
  { value: 'addressDistrict', label: 'District', category: 'address' },
  { value: 'addressTownCity', label: 'Town / city', category: 'address', aliases: ['locality', 'suburb'] },
  { value: 'addressCountyState', label: 'County / state', category: 'address', aliases: ['province', 'region'] },
  { value: 'addressPostCode', label: 'Post code', category: 'address', aliases: ['zip', 'postcode'] },
  { value: 'addressCountry', label: 'Country', category: 'address' },

  // ---------- Vessel ----------
  { value: 'vesselName', label: 'Vessel name', category: 'vessel', aliases: ['ship name', 'name of ship'] },
  { value: 'vesselType', label: 'Vessel type', category: 'vessel', aliases: ['ship type'] },
  { value: 'vesselIMO', label: 'IMO number', category: 'vessel' },
  { value: 'vesselOfficialNumber', label: 'Official number', category: 'vessel', aliases: ['o.n.', 'on number'] },
  { value: 'vesselFlag', label: 'Flag state', category: 'vessel', aliases: ['port of registry', 'country of registry'] },
  { value: 'vesselGrossTonnage', label: 'Gross tonnage', category: 'vessel', aliases: ['gt', 'g.t.'] },
  { value: 'vesselLength', label: 'Length (m)', category: 'vessel', aliases: ['loa', 'length overall'] },
  { value: 'vesselBeam', label: 'Beam (m)', category: 'vessel', aliases: ['width'] },
  { value: 'vesselDraft', label: 'Draft (m)', category: 'vessel', aliases: ['draught'] },
  { value: 'vesselNumberOfCrew', label: 'Number of crew', category: 'vessel', aliases: ['crew complement'] },
  { value: 'vesselBuildYear', label: 'Year built', category: 'vessel', aliases: ['build year'] },
  { value: 'vesselCallSign', label: 'Call sign', category: 'vessel' },
  { value: 'vesselMMSI', label: 'MMSI', category: 'vessel' },
  { value: 'vesselManagementCompany', label: 'Management company', category: 'vessel', aliases: ['owner', 'managing owner'] },
  { value: 'vesselCompanyAddress', label: 'Company address', category: 'vessel' },
  { value: 'vesselCompanyContact', label: 'Company contact', category: 'vessel', aliases: ['company phone', 'company email'] },

  // ---------- Service / sea-time ----------
  {
    value: 'servicePeriodStart',
    label: 'Service period start',
    category: 'service',
    description: 'From the date range picked at fill time',
    aliases: ['from', 'signed on', 'engagement date', 'date joined', 'start'],
  },
  {
    value: 'servicePeriodEnd',
    label: 'Service period end',
    category: 'service',
    description: 'From the date range picked at fill time',
    aliases: ['to', 'signed off', 'discharge date', 'date left', 'end'],
  },
  { value: 'totalDays', label: 'Total days', category: 'service', description: 'Across the filled date range' },
  { value: 'atSeaDays', label: 'Days at sea', category: 'service', aliases: ['sea days'] },
  { value: 'standbyDays', label: 'Standby days', category: 'service', aliases: ['harbour days'] },
  { value: 'yardDays', label: 'Yard days', category: 'service', aliases: ['refit'] },
  { value: 'leaveDays', label: 'Leave days', category: 'service' },
  { value: 'underwayDays', label: 'Underway days', category: 'service', description: 'Daily status = underway', aliases: ['sailing'] },
  { value: 'atAnchorDays', label: 'At-anchor days', category: 'service', aliases: ['anchored'] },
  { value: 'inPortDays', label: 'In-port days', category: 'service', aliases: ['alongside'] },

  // ---------- Captain ----------
  {
    value: 'captainName',
    label: 'Captain name',
    category: 'captain',
    description: 'Captain of the vessel on this assignment',
    aliases: ['master', 'commanding officer'],
  },
  { value: 'captainPosition', label: 'Captain position', category: 'captain', description: 'Master / Chief Officer / …' },
  {
    value: 'captainSignature',
    label: 'Captain signature',
    category: 'captain',
    description: 'Captured when the captain signs off the form',
  },

  // ---------- System (computed at fill time) ----------
  {
    value: 'todayDate',
    label: 'Today\u2019s date',
    category: 'system',
    description: 'The date the form is filled (ISO; format via Date options)',
    aliases: ['current date', 'date signed'],
  },
];

export function findProfileKeyLabel(value: string | null | undefined): string {
  if (!value) return 'Manual entry';
  const match = PROFILE_KEY_OPTIONS.find((o) => o.value === value);
  return match?.label ?? value;
}

// ---------------------------------------------------------------------------
// Calculation evaluation
// ---------------------------------------------------------------------------

/** Parse a raw field value into a finite number, or null if it isn't numeric. */
function toNumber(v: string | null | undefined): number | null {
  if (v == null) return null;
  const trimmed = String(v).trim();
  if (!trimmed.length) return null;
  // Strip trailing unit markers users sometimes type ("120 days", "12.5 hrs").
  const numeric = trimmed.replace(/[^0-9.\-]/g, '');
  if (!numeric.length) return null;
  const n = Number(numeric);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: string | null | undefined): Date | null {
  if (v == null) return null;
  const trimmed = String(v).trim();
  if (!trimmed.length) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, Math.max(0, decimals | 0));
  return Math.round(n * factor) / factor;
}

/**
 * Map of resolved site values, used at fill time so the evaluator can
 * substitute "atSeaDays", "totalDays" etc. into a calculation's inputs.
 * Values are pre-stringified by the caller so we don't need to know
 * about types here. Missing keys = unknown / unavailable.
 */
export type SiteValueMap = Partial<Record<SiteValueKey, string>>;

/**
 * Compute the string value of a calculated field.
 *
 * @param values   field id → string value (existing fill-dialog input map)
 * @param siteValues  optional site value bag — used when the calculation
 *                    has `kind: 'siteValue'` inputs. Pass null/undefined
 *                    when no site values are available; those inputs will
 *                    resolve to "" and the operation degrades gracefully.
 *
 * Returns "" when the calculation can't produce a value yet (e.g. no
 * numeric inputs, two dates missing for days_between). Non-calculated
 * fields return their existing value. Safe to call on any field.
 */
export function evaluateCalculation(
  field: TemplateField,
  values: Record<string, string>,
  siteValues?: SiteValueMap | null,
): string {
  if (getFieldType(field) !== 'calculated' || !field.calculation) {
    return values[field.id] ?? '';
  }
  const calc = field.calculation;
  const inputs = getCalculationInputs(calc);
  const rawInputs = inputs.map((inp) => {
    if (inp.kind === 'siteValue') {
      return siteValues?.[inp.key] ?? '';
    }
    return values[inp.fieldId] ?? '';
  });

  switch (calc.operation) {
    case 'sum': {
      const nums = rawInputs.map(toNumber).filter((n): n is number => n != null);
      if (!nums.length) return '';
      return String(roundTo(nums.reduce((a, b) => a + b, 0), calc.decimals ?? 0));
    }
    case 'difference': {
      const nums = rawInputs.map(toNumber);
      if (nums[0] == null) return '';
      const result = nums.slice(1).reduce<number>(
        (acc, n) => (n == null ? acc : acc - n),
        nums[0],
      );
      return String(roundTo(result, calc.decimals ?? 0));
    }
    case 'average': {
      const nums = rawInputs.map(toNumber).filter((n): n is number => n != null);
      if (!nums.length) return '';
      return String(
        roundTo(nums.reduce((a, b) => a + b, 0) / nums.length, calc.decimals ?? 2),
      );
    }
    case 'min': {
      const nums = rawInputs.map(toNumber).filter((n): n is number => n != null);
      if (!nums.length) return '';
      return String(roundTo(Math.min(...nums), calc.decimals ?? 0));
    }
    case 'max': {
      const nums = rawInputs.map(toNumber).filter((n): n is number => n != null);
      if (!nums.length) return '';
      return String(roundTo(Math.max(...nums), calc.decimals ?? 0));
    }
    case 'count': {
      return String(rawInputs.filter((v) => v && v.trim().length > 0).length);
    }
    case 'days_between': {
      const a = toDate(rawInputs[0]);
      const b = toDate(rawInputs[1]);
      if (!a || !b) return '';
      const ms = Math.abs(b.getTime() - a.getTime());
      return String(Math.round(ms / 86_400_000));
    }
    case 'concat': {
      const sep = calc.separator ?? ', ';
      const parts = rawInputs.map((v) => v.trim()).filter(Boolean);
      return parts.join(sep);
    }
    default:
      return '';
  }
}

/**
 * Evaluate every calculated field on the template against the given
 * values map, returning a new map that includes the derived values. Runs
 * multiple passes so a calculation can depend on another calculation
 * (up to 5 levels deep — plenty for any realistic form, and guards
 * against accidental cycles).
 *
 * `siteValues` is forwarded to each calculation so site-value inputs
 * (e.g. atSeaDays for the chosen date range) resolve correctly.
 */
export function evaluateAllCalculations(
  fields: TemplateField[],
  values: Record<string, string>,
  siteValues?: SiteValueMap | null,
): Record<string, string> {
  const out: Record<string, string> = { ...values };
  const calcFields = fields.filter(
    (f) => getFieldType(f) === 'calculated' && f.calculation,
  );
  if (!calcFields.length) return out;

  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const f of calcFields) {
      const next = evaluateCalculation(f, out, siteValues);
      if (next !== (out[f.id] ?? '')) {
        out[f.id] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/**
 * True when ANY calculated field on the template references at least
 * one date-range-scoped site value. Used by the Documents page to
 * decide whether to demand a date range / sea-time calculation before
 * the user can download — even when no plain field is bound to a
 * sea-time profile key.
 */
export function templateHasDateRangedCalculation(
  fields: TemplateField[],
): boolean {
  const dateRangedKeys = new Set<SiteValueKey>(
    SITE_VALUE_OPTIONS.filter((o) => o.dateRangeScoped).map((o) => o.key),
  );
  for (const f of fields) {
    if (getFieldType(f) !== 'calculated' || !f.calculation) continue;
    const inputs = getCalculationInputs(f.calculation);
    for (const inp of inputs) {
      if (inp.kind === 'siteValue' && dateRangedKeys.has(inp.key)) return true;
    }
  }
  return false;
}
