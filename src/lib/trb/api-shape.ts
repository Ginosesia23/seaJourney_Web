/**
 * Mobile/API response shaping: prefer camelCase JSON for Flutter + website clients.
 */

type Json = Record<string, unknown>;

/** Map a flat snake_case row to camelCase keys (one level). */
export function keysToCamel<T extends Json>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[snakeToCamel(key)] = value;
  }
  return out;
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function mapTaskCatalogRow(t: {
  id: string;
  section_id: string;
  task_code: string;
  title: string;
  description?: string | null;
  evidence_guidance?: string | null;
  seajourney_guidance?: string | null;
  required_signer_role?: string | null;
  sort_order?: number;
  is_required?: boolean;
  source_task_reference?: string | null;
  source_page_start?: number | null;
  source_page_end?: number | null;
  source_text_hash?: string | null;
  official_signer_instruction?: string | null;
  official_title?: string | null;
  official_description?: string | null;
  seajourney_summary?: string | null;
  seajourney_completion_guidance?: string | null;
  source_page_reference?: string | null;
  prerequisites?: unknown;
}) {
  return {
    id: t.id,
    sectionId: t.section_id,
    taskCode: t.task_code,
    title: t.title,
    description: t.description ?? null,
    evidenceGuidance: t.evidence_guidance ?? null,
    seajourneyGuidance: t.seajourney_guidance ?? null,
    requiredSignerRole: t.required_signer_role ?? 'captain',
    sortOrder: t.sort_order ?? 0,
    isRequired: t.is_required ?? true,
    sourceTaskReference: t.source_task_reference ?? null,
    sourcePageStart: t.source_page_start ?? null,
    sourcePageEnd: t.source_page_end ?? null,
    sourceTextHash: t.source_text_hash ?? null,
    officialSignerInstruction: t.official_signer_instruction ?? null,
    officialTitle: t.official_title ?? null,
    officialDescription: t.official_description ?? null,
    seajourneySummary: t.seajourney_summary ?? null,
    seajourneyCompletionGuidance: t.seajourney_completion_guidance ?? null,
    sourcePageReference: t.source_page_reference ?? null,
    prerequisites: t.prerequisites ?? [],
  };
}

export function mapSectionRow(s: {
  id: string;
  title: string;
  description?: string | null;
  sort_order?: number;
  source_section_reference?: string | null;
  source_page_start?: number | null;
  source_page_end?: number | null;
}) {
  return {
    id: s.id,
    title: s.title,
    description: s.description ?? null,
    sortOrder: s.sort_order ?? 0,
    sourceSectionReference: s.source_section_reference ?? null,
    sourcePageStart: s.source_page_start ?? null,
    sourcePageEnd: s.source_page_end ?? null,
  };
}

export function mapEvidenceRow(e: {
  id: string;
  task_progress_id?: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  evidence_type?: string;
  description?: string | null;
  created_at: string;
  uploaded_by?: string;
}) {
  return {
    id: e.id,
    taskProgressId: e.task_progress_id,
    originalFilename: e.original_filename,
    mimeType: e.mime_type,
    fileSize: e.file_size,
    evidenceType: e.evidence_type,
    description: e.description ?? null,
    createdAt: e.created_at,
    uploadedBy: e.uploaded_by,
  };
}

export function mapSignoffRequestRow(r: {
  id: string;
  signer_email: string;
  signer_name?: string | null;
  status: string;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
  updated_at?: string;
  batch_request_id?: string | null;
  batch_item_id?: string | null;
  is_batch_shadow?: boolean | null;
  viewed_at?: string | null;
  task_progress_id?: string;
  vessel_id?: string | null;
  vessel_name_snapshot?: string | null;
  required_signer_role?: string | null;
}) {
  return {
    id: r.id,
    signerEmail: r.signer_email,
    signerName: r.signer_name ?? null,
    status: r.status,
    expiresAt: r.expires_at,
    usedAt: r.used_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    batchRequestId: r.batch_request_id ?? null,
    batchItemId: r.batch_item_id ?? null,
    isBatchShadow: Boolean(r.is_batch_shadow),
    viewedAt: r.viewed_at ?? null,
    taskProgressId: r.task_progress_id,
    vesselId: r.vessel_id ?? null,
    vesselNameSnapshot: r.vessel_name_snapshot ?? null,
    requiredSignerRole: r.required_signer_role ?? null,
  };
}

export function mapSignoffRow(s: {
  id: string;
  decision: string;
  signer_name: string;
  signer_email: string;
  signer_rank?: string | null;
  signer_coc_number?: string | null;
  signer_issuing_authority?: string | null;
  signer_verification_status?: string;
  signer_declaration?: string;
  decision_notes?: string | null;
  signed_at: string;
  record_hash: string;
  created_at?: string;
  signoff_request_id?: string;
  task_progress_id?: string;
}) {
  return {
    id: s.id,
    decision: s.decision,
    signerName: s.signer_name,
    signerEmail: s.signer_email,
    signerRank: s.signer_rank ?? null,
    signerCocNumber: s.signer_coc_number ?? null,
    signerIssuingAuthority: s.signer_issuing_authority ?? null,
    signerVerificationStatus: s.signer_verification_status,
    signerDeclaration: s.signer_declaration,
    decisionNotes: s.decision_notes ?? null,
    signedAt: s.signed_at,
    recordHash: s.record_hash,
    createdAt: s.created_at,
    signoffRequestId: s.signoff_request_id,
    taskProgressId: s.task_progress_id,
  };
}

export function mapProgressRow(p: {
  id: string;
  enrollment_id?: string;
  task_id?: string;
  status: string;
  candidate_notes?: string | null;
  claimed_completed_at?: string | null;
  approved_at?: string | null;
  ready_for_assessment_at?: string | null;
  created_at?: string;
  updated_at?: string;
}) {
  return {
    id: p.id,
    enrollmentId: p.enrollment_id,
    taskId: p.task_id,
    status: p.status,
    candidateNotes: p.candidate_notes ?? null,
    claimedCompletedAt: p.claimed_completed_at ?? null,
    approvedAt: p.approved_at ?? null,
    readyForAssessmentAt: p.ready_for_assessment_at ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export function mapParallelBookRow(row: {
  id: string;
  task_progress_id: string;
  reporter_role: string;
  official_book_status: string;
  official_book_signed_at: string | null;
  official_book_signer_name: string | null;
  official_book_signer_rank: string | null;
  notes: string | null;
  updated_at: string;
}) {
  return {
    id: row.id,
    taskProgressId: row.task_progress_id,
    reporterRole: row.reporter_role,
    officialBookStatus: row.official_book_status,
    officialBookSignedAt: row.official_book_signed_at,
    officialBookSignerName: row.official_book_signer_name,
    officialBookSignerRank: row.official_book_signer_rank,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export function mapAuditEventRow(ev: {
  id: string;
  event_type: string;
  event_data?: unknown;
  actor_email?: string | null;
  created_at: string;
  task_progress_id?: string | null;
}) {
  return {
    id: ev.id,
    eventType: ev.event_type,
    eventData: ev.event_data,
    actorEmail: ev.actor_email ?? null,
    createdAt: ev.created_at,
    taskProgressId: ev.task_progress_id ?? null,
  };
}
