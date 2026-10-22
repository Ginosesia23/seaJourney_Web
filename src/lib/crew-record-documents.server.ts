import {
  mergeCareerSeaFromRecordDocuments,
  overlapInclusiveRange,
  type CareerSeaRecordRow,
  type SeaServiceDateConflict,
} from '@/lib/crew-record-documents';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function loadCrewRecordCareerSea(
  userId: string,
): Promise<CareerSeaRecordRow[]> {
  const { data, error } = await supabaseAdmin
    .from('crew_record_documents')
    .select(
      'id, document_kind, counts_toward_career, at_sea_days, total_days, standby_days',
    )
    .eq('crew_user_id', userId)
    .eq('counts_toward_career', true);

  if (error || !data) return [];
  return data as CareerSeaRecordRow[];
}

export async function withUploadedCareerSea<T extends {
  id: string;
  status: string;
  at_sea_days?: number | null;
  total_days?: number | null;
  standby_days?: number | null;
}>(
  userId: string,
  testimonials: T[],
  proof: { id: string }[],
): Promise<{ testimonials: T[]; proofOfService: { id: string }[] }> {
  const records = await loadCrewRecordCareerSea(userId);
  return mergeCareerSeaFromRecordDocuments(testimonials, proof, records);
}

function ymd(value: unknown): string | null {
  if (value == null) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

async function vesselNameById(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabaseAdmin.from('vessels').select('id, name').in('id', unique);
  for (const row of data ?? []) {
    map.set(row.id as string, (row.name as string) || 'Vessel');
  }
  return map;
}

function pushConflict(
  out: SeaServiceDateConflict[],
  opts: {
    id: string;
    source: SeaServiceDateConflict['source'];
    sourceLabel: string;
    title: string;
    vesselId: string | null;
    vesselName: string | null;
    startDate: string;
    endDate: string;
    proposedStart: string;
    proposedEnd: string;
    proposedVesselId: string | null;
    countsTowardCareer: boolean;
  },
) {
  const overlap = overlapInclusiveRange(
    opts.proposedStart,
    opts.proposedEnd,
    opts.startDate,
    opts.endDate,
  );
  if (!overlap) return;
  out.push({
    id: opts.id,
    source: opts.source,
    sourceLabel: opts.sourceLabel,
    title: opts.title,
    vesselName: opts.vesselName,
    startDate: opts.startDate,
    endDate: opts.endDate,
    overlapStart: overlap.start,
    overlapEnd: overlap.end,
    overlapDays: overlap.days,
    countsTowardCareer: opts.countsTowardCareer,
    sameVessel: Boolean(
      opts.proposedVesselId && opts.vesselId && opts.proposedVesselId === opts.vesselId,
    ),
  });
}

/**
 * Find existing sea-service periods for this crew member that overlap
 * the proposed start/end dates.
 */
export async function findSeaServiceDateConflicts(opts: {
  crewUserId: string;
  startDate: string;
  endDate: string;
  vesselId?: string | null;
  excludeDocumentId?: string | null;
}): Promise<SeaServiceDateConflict[]> {
  const startDate = ymd(opts.startDate);
  const endDate = ymd(opts.endDate);
  if (!startDate || !endDate || endDate < startDate) return [];

  const proposedVesselId = opts.vesselId ?? null;
  const excludeId = opts.excludeDocumentId ?? null;

  const [uploadedRes, testimonialsRes, vesselGenRes, proofRes] = await Promise.all([
    supabaseAdmin
      .from('crew_record_documents')
      .select(
        'id, title, document_kind, vessel_id, start_date, end_date, counts_toward_career, at_sea_days, total_days',
      )
      .eq('crew_user_id', opts.crewUserId)
      .not('start_date', 'is', null)
      .not('end_date', 'is', null),
    supabaseAdmin
      .from('testimonials')
      .select('id, vessel_id, start_date, end_date, status, at_sea_days, total_days')
      .eq('user_id', opts.crewUserId)
      .neq('status', 'rejected')
      .not('start_date', 'is', null)
      .not('end_date', 'is', null),
    supabaseAdmin
      .from('vessel_generated_testimonials')
      .select('id, vessel_id, start_date, end_date, at_sea_days, total_days')
      .eq('crew_user_id', opts.crewUserId),
    supabaseAdmin
      .from('proof_of_service')
      .select('id, vessel_id, vessel_name, start_date, end_date, at_sea_days, total_days')
      .eq('crew_user_id', opts.crewUserId),
  ]);

  const uploaded = uploadedRes.error ? [] : uploadedRes.data ?? [];
  const testimonials = testimonialsRes.error ? [] : testimonialsRes.data ?? [];
  const vesselGen = vesselGenRes.error ? [] : vesselGenRes.data ?? [];
  const proof = proofRes.error ? [] : proofRes.data ?? [];

  const vesselIds = [
    ...uploaded.map((r) => String(r.vessel_id ?? '')),
    ...testimonials.map((r) => String(r.vessel_id ?? '')),
    ...vesselGen.map((r) => String(r.vessel_id ?? '')),
    ...proof.map((r) => String(r.vessel_id ?? '')),
  ];
  const names = await vesselNameById(vesselIds);
  const conflicts: SeaServiceDateConflict[] = [];

  for (const row of uploaded) {
    const id = String(row.id);
    if (excludeId && id === excludeId) continue;
    const rowStart = ymd(row.start_date);
    const rowEnd = ymd(row.end_date);
    if (!rowStart || !rowEnd) continue;
    const kind = String(row.document_kind || 'other');
    const counts =
      row.counts_toward_career === true &&
      ((Number(row.at_sea_days) || 0) > 0 || (Number(row.total_days) || 0) > 0);
    const vesselId = row.vessel_id ? String(row.vessel_id) : null;
    pushConflict(conflicts, {
      id,
      source: 'uploaded_record',
      sourceLabel: 'Uploaded record',
      title: String(row.title || 'Uploaded record'),
      vesselId,
      vesselName: vesselId ? names.get(vesselId) ?? null : null,
      startDate: rowStart,
      endDate: rowEnd,
      proposedStart: startDate,
      proposedEnd: endDate,
      proposedVesselId,
      countsTowardCareer: counts && (kind === 'testimonial' || kind === 'proof_of_service'),
    });
  }

  for (const row of testimonials) {
    const rowStart = ymd(row.start_date);
    const rowEnd = ymd(row.end_date);
    if (!rowStart || !rowEnd) continue;
    const status = String(row.status || '').toLowerCase();
    const vesselId = row.vessel_id ? String(row.vessel_id) : null;
    const approved = status === 'approved';
    pushConflict(conflicts, {
      id: String(row.id),
      source: 'testimonial',
      sourceLabel: approved ? 'Approved testimonial' : 'Pending testimonial',
      title: approved ? 'Approved testimonial' : 'Pending testimonial',
      vesselId,
      vesselName: vesselId ? names.get(vesselId) ?? null : null,
      startDate: rowStart,
      endDate: rowEnd,
      proposedStart: startDate,
      proposedEnd: endDate,
      proposedVesselId,
      countsTowardCareer: approved,
    });
  }

  for (const row of vesselGen) {
    const rowStart = ymd(row.start_date);
    const rowEnd = ymd(row.end_date);
    if (!rowStart || !rowEnd) continue;
    const vesselId = row.vessel_id ? String(row.vessel_id) : null;
    pushConflict(conflicts, {
      id: String(row.id),
      source: 'vessel_testimonial',
      sourceLabel: 'Vessel testimonial',
      title: 'Vessel-generated testimonial',
      vesselId,
      vesselName: vesselId ? names.get(vesselId) ?? null : null,
      startDate: rowStart,
      endDate: rowEnd,
      proposedStart: startDate,
      proposedEnd: endDate,
      proposedVesselId,
      countsTowardCareer: false,
    });
  }

  for (const row of proof) {
    const rowStart = ymd(row.start_date);
    const rowEnd = ymd(row.end_date);
    if (!rowStart || !rowEnd) continue;
    const vesselId = row.vessel_id ? String(row.vessel_id) : null;
    pushConflict(conflicts, {
      id: String(row.id),
      source: 'proof_of_service',
      sourceLabel: 'Proof of service',
      title: 'Proof of service',
      vesselId,
      vesselName:
        (typeof row.vessel_name === 'string' && row.vessel_name) ||
        (vesselId ? names.get(vesselId) ?? null : null),
      startDate: rowStart,
      endDate: rowEnd,
      proposedStart: startDate,
      proposedEnd: endDate,
      proposedVesselId,
      countsTowardCareer: false,
    });
  }

  conflicts.sort((a, b) => {
    if (a.countsTowardCareer !== b.countsTowardCareer) {
      return a.countsTowardCareer ? -1 : 1;
    }
    return b.overlapDays - a.overlapDays;
  });
  return conflicts;
}
