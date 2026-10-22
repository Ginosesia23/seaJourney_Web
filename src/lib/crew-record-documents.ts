export const CREW_RECORD_DOCUMENTS_BUCKET = 'crew-record-documents';

export const CREW_RECORD_DOCUMENT_KINDS = [
  'testimonial',
  'proof_of_service',
  'certificate',
  'other',
] as const;

export type CrewRecordDocumentKind = (typeof CREW_RECORD_DOCUMENT_KINDS)[number];

export const CREW_RECORD_DOCUMENT_ORIGINS = ['pre_seajourney', 'manual'] as const;

export type CrewRecordDocumentOrigin = (typeof CREW_RECORD_DOCUMENT_ORIGINS)[number];

export type CrewRecordDocument = {
  id: string;
  crewUserId: string;
  vesselId: string;
  vesselName: string | null;
  uploadedByUserId: string;
  title: string;
  documentKind: CrewRecordDocumentKind;
  origin: CrewRecordDocumentOrigin;
  issuedOn: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  atSeaDays: number | null;
  standbyDays: number | null;
  yardDays: number | null;
  leaveDays: number | null;
  countsTowardCareer: boolean;
  fileName: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
};

export type CrewRecordSeaTimeFields = {
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  atSeaDays: number | null;
  standbyDays: number | null;
  yardDays: number | null;
  leaveDays: number | null;
  countsTowardCareer: boolean;
};

export type CareerSeaRecordRow = {
  id: string;
  document_kind: string;
  counts_toward_career: boolean;
  at_sea_days: number | null;
  total_days: number | null;
  standby_days: number | null;
  vessel_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type VesselGeneratedCareerRow = {
  id: string;
  vessel_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  at_sea_days?: number | null;
  total_days?: number | null;
  standby_days?: number | null;
};

type CareerTestimonialLike = {
  id: string;
  status: string;
  at_sea_days?: number | null;
  total_days?: number | null;
  standby_days?: number | null;
  vessel_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export const CREW_RECORD_KIND_LABELS: Record<CrewRecordDocumentKind, string> = {
  testimonial: 'Testimonial',
  proof_of_service: 'Proof of service',
  certificate: 'Certificate',
  other: 'Document',
};

export const CREW_RECORD_ORIGIN_LABELS: Record<CrewRecordDocumentOrigin, string> = {
  pre_seajourney: 'Before SeaJourney',
  manual: 'Added manually',
};

export function isCrewRecordDocumentKind(v: string): v is CrewRecordDocumentKind {
  return (CREW_RECORD_DOCUMENT_KINDS as readonly string[]).includes(v);
}

export function isCrewRecordDocumentOrigin(v: string): v is CrewRecordDocumentOrigin {
  return (CREW_RECORD_DOCUMENT_ORIGINS as readonly string[]).includes(v);
}

export function isSeaServiceRecordKind(kind: CrewRecordDocumentKind): boolean {
  return kind === 'testimonial' || kind === 'proof_of_service';
}

function optionalYmd(v: unknown): string | null {
  if (v == null) return null;
  const match = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function optionalNonNegInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

function asString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function parseDaysField(
  raw: string,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) {
    return { ok: false, error: `${label} must be a whole number of 0 or more` };
  }
  return { ok: true, value: Number(s) };
}

export function inclusiveServiceDays(startDate: string, endDate: string): number | null {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

export type SeaServiceConflictSource =
  | 'uploaded_record'
  | 'testimonial'
  | 'vessel_testimonial'
  | 'proof_of_service';

export type SeaServiceDateConflict = {
  id: string;
  source: SeaServiceConflictSource;
  sourceLabel: string;
  title: string;
  vesselName: string | null;
  startDate: string;
  endDate: string;
  overlapStart: string;
  overlapEnd: string;
  overlapDays: number;
  countsTowardCareer: boolean;
  sameVessel: boolean;
};

export function overlapInclusiveRange(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { start: string; end: string; days: number } | null {
  if (aStart > aEnd || bStart > bEnd) return null;
  if (aStart > bEnd || bStart > aEnd) return null;
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  const days = inclusiveServiceDays(start, end);
  if (days == null || days <= 0) return null;
  return { start, end, days };
}

export function careerCountingConflicts(
  conflicts: SeaServiceDateConflict[],
): SeaServiceDateConflict[] {
  return conflicts.filter((c) => c.countsTowardCareer);
}

export function parseCrewRecordSeaTimeInput(
  input: Record<string, unknown>,
  documentKind: CrewRecordDocumentKind,
): { ok: true; value: CrewRecordSeaTimeFields } | { ok: false; error: string } {
  const startRaw = asString(input.startDate).trim();
  const endRaw = asString(input.endDate).trim();
  const parsedStart = startRaw ? optionalYmd(startRaw) : null;
  const parsedEnd = endRaw ? optionalYmd(endRaw) : null;
  if (startRaw && !parsedStart) {
    return { ok: false, error: 'Start date must be YYYY-MM-DD' };
  }
  if (endRaw && !parsedEnd) {
    return { ok: false, error: 'End date must be YYYY-MM-DD' };
  }
  if (parsedStart && parsedEnd && parsedEnd < parsedStart) {
    return { ok: false, error: 'End date must be on or after the start date' };
  }

  const total = parseDaysField(asString(input.totalDays), 'Total days');
  if (!total.ok) return total;
  const atSea = parseDaysField(asString(input.atSeaDays), 'At-sea days');
  if (!atSea.ok) return atSea;
  const standby = parseDaysField(asString(input.standbyDays), 'Standby days');
  if (!standby.ok) return standby;
  const yard = parseDaysField(asString(input.yardDays), 'Yard days');
  if (!yard.ok) return yard;
  const leave = parseDaysField(asString(input.leaveDays), 'Leave days');
  if (!leave.ok) return leave;

  let totalDays = total.value;
  if (totalDays == null && parsedStart && parsedEnd) {
    totalDays = inclusiveServiceDays(parsedStart, parsedEnd);
  }

  const countsRaw = asString(input.countsTowardCareer).trim().toLowerCase();
  const hasDays = (atSea.value ?? 0) > 0 || (totalDays ?? 0) > 0;
  const countsTowardCareer =
    countsRaw === 'true' || countsRaw === '1' || countsRaw === 'on'
      ? true
      : countsRaw === 'false' || countsRaw === '0' || countsRaw === 'off'
        ? false
        : isSeaServiceRecordKind(documentKind) && hasDays;

  return {
    ok: true,
    value: {
      startDate: parsedStart,
      endDate: parsedEnd,
      totalDays,
      atSeaDays: atSea.value,
      standbyDays: standby.value,
      yardDays: yard.value,
      leaveDays: leave.value,
      countsTowardCareer: isSeaServiceRecordKind(documentKind) ? countsTowardCareer : false,
    },
  };
}

export function seaTimeInsertFields(sea: CrewRecordSeaTimeFields) {
  return {
    start_date: sea.startDate,
    end_date: sea.endDate,
    total_days: sea.totalDays,
    at_sea_days: sea.atSeaDays,
    standby_days: sea.standbyDays,
    yard_days: sea.yardDays,
    leave_days: sea.leaveDays,
    counts_toward_career: sea.countsTowardCareer,
  };
}

function periodOverlapsCareerSea(
  startDate: string | null,
  endDate: string | null,
  vesselId: string | null | undefined,
  others: Array<{
    start_date?: string | null;
    end_date?: string | null;
    vessel_id?: string | null;
  }>,
): boolean {
  const start = optionalYmd(startDate);
  const end = optionalYmd(endDate);
  if (!start || !end) return false;
  for (const other of others) {
    const otherStart = optionalYmd(other.start_date);
    const otherEnd = optionalYmd(other.end_date);
    if (!otherStart || !otherEnd) continue;
    if (vesselId && other.vessel_id && vesselId !== other.vessel_id) continue;
    if (overlapInclusiveRange(start, end, otherStart, otherEnd)) return true;
  }
  return false;
}

export function mergeCareerSeaFromRecordDocuments<T extends CareerTestimonialLike>(
  testimonials: T[],
  proof: { id: string }[],
  records: CareerSeaRecordRow[],
  vesselGenerated: VesselGeneratedCareerRow[] = [],
): { testimonials: T[]; proofOfService: { id: string }[] } {
  const extraTestimonials: T[] = [];
  const extraProof: { id: string }[] = [];

  for (const row of records) {
    if (!row.counts_toward_career) continue;
    const kind = String(row.document_kind || '');
    if (kind !== 'testimonial' && kind !== 'proof_of_service') continue;
    const atSea = row.at_sea_days ?? 0;
    const total = row.total_days ?? 0;
    if (atSea <= 0 && total <= 0) continue;
    const syntheticId = `record:${row.id}`;
    extraTestimonials.push({
      id: syntheticId,
      status: 'approved',
      at_sea_days: atSea,
      total_days: total,
      standby_days: row.standby_days ?? 0,
      vessel_id: row.vessel_id ?? null,
      start_date: row.start_date ?? null,
      end_date: row.end_date ?? null,
    } as T);
    extraProof.push({ id: syntheticId });
  }

  const alreadyCounting = [
    ...testimonials.filter((t) => t.status === 'approved'),
    ...extraTestimonials,
  ];

  const vesselGenSorted = [...vesselGenerated].sort((a, b) => {
    const aStart = optionalYmd(a.start_date) || '';
    const bStart = optionalYmd(b.start_date) || '';
    return aStart.localeCompare(bStart);
  });

  for (const row of vesselGenSorted) {
    const atSea = row.at_sea_days ?? 0;
    const total = row.total_days ?? 0;
    if (atSea <= 0 && total <= 0) continue;
    if (
      periodOverlapsCareerSea(
        row.start_date ?? null,
        row.end_date ?? null,
        row.vessel_id,
        alreadyCounting,
      )
    ) {
      continue;
    }
    const synthetic = {
      id: `vessel-gen:${row.id}`,
      status: 'approved',
      at_sea_days: atSea,
      total_days: total,
      standby_days: row.standby_days ?? 0,
      vessel_id: row.vessel_id ?? null,
      start_date: row.start_date ?? null,
      end_date: row.end_date ?? null,
    } as T;
    extraTestimonials.push(synthetic);
    alreadyCounting.push(synthetic);
  }

  return {
    testimonials: [...testimonials, ...extraTestimonials],
    proofOfService: [...proof, ...extraProof],
  };
}

export function buildCrewRecordDocumentPath(
  crewUserId: string,
  documentId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return `${crewUserId}/${documentId}-${safe}`;
}

export function mapCrewRecordDocumentRow(
  row: Record<string, unknown>,
  vesselName?: string | null,
): CrewRecordDocument {
  return {
    id: String(row.id),
    crewUserId: String(row.crew_user_id),
    vesselId: String(row.vessel_id),
    vesselName: vesselName ?? (typeof row.vessel_name === 'string' ? row.vessel_name : null),
    uploadedByUserId: String(row.uploaded_by_user_id),
    title: String(row.title ?? ''),
    documentKind: isCrewRecordDocumentKind(String(row.document_kind))
      ? (row.document_kind as CrewRecordDocumentKind)
      : 'other',
    origin: isCrewRecordDocumentOrigin(String(row.origin))
      ? (row.origin as CrewRecordDocumentOrigin)
      : 'manual',
    issuedOn: optionalYmd(row.issued_on),
    notes: typeof row.notes === 'string' ? row.notes : null,
    startDate: optionalYmd(row.start_date),
    endDate: optionalYmd(row.end_date),
    totalDays: optionalNonNegInt(row.total_days),
    atSeaDays: optionalNonNegInt(row.at_sea_days),
    standbyDays: optionalNonNegInt(row.standby_days),
    yardDays: optionalNonNegInt(row.yard_days),
    leaveDays: optionalNonNegInt(row.leave_days),
    countsTowardCareer: row.counts_toward_career === true,
    fileName: String(row.file_name ?? 'document'),
    contentType: String(row.content_type ?? 'application/octet-stream'),
    fileSize: typeof row.file_size === 'number' ? row.file_size : Number(row.file_size) || 0,
    createdAt: String(row.created_at),
  };
}
