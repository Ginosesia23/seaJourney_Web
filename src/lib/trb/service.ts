import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TRB_DISCLAIMER,
  TRB_EVIDENCE_ALLOWED_MIME,
  TRB_EVIDENCE_BUCKET,
  TRB_EVIDENCE_MAX_BYTES,
  type TrbTaskStatus,
  canCandidateTransition,
} from '@/lib/trb/constants';
import {
  evaluateSignerEligibility,
  getCandidateActiveVessel,
  listEligibleSignersForVessel,
} from '@/lib/trb/eligibility';
import { sendTrbSignoffRequestEmail, trbAppBaseUrl } from '@/lib/trb/email';
import { notifyTrbEvent } from '@/lib/trb/notifications';
import {
  calculateTrbProgress,
  groupProgressBySection,
} from '@/lib/trb/progress';
import {
  MCA_PILOT_ATTRIBUTION,
  MCA_PILOT_CONSENT_VERSION,
  MCA_PILOT_DISCLAIMER,
  MCA_PILOT_DISCLAIMER_VERSION,
  MCA_PILOT_OGL_URL,
  MCA_PILOT_PROGRAM_CODE,
  MCA_PILOT_SOURCE_URL,
  canDiscoverMcaPilot,
  isMcaPilotProgramCode,
} from '@/lib/trb/pilot';
import {
  computeTrbSignoffRecordHash,
  generateTrbSignoffToken,
  hashIpForAudit,
  hashTrbSignoffToken,
} from '@/lib/trb/tokens';
import {
  mapAuditEventRow,
  mapEvidenceRow,
  mapParallelBookRow,
  mapProgressRow,
  mapSectionRow,
  mapSignoffRequestRow,
  mapSignoffRow,
  mapTaskCatalogRow,
} from '@/lib/trb/api-shape';
type AuditCtx = {
  actorUserId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

type ViewerCtx = {
  userId: string;
  email: string | null;
  isAdmin?: boolean;
};

export type EnrolConsent = {
  understandsTrial: true;
  doesNotReplaceOfficialTrb: true;
  willMaintainOfficialTrb: true;
  feedbackMayBeAnalysed: true;
  noMcaPyaApprovalImplied: true;
  consentVersion?: string;
  disclaimerVersion?: string;
};

async function writeAudit(
  admin: SupabaseClient,
  params: {
    enrollmentId: string;
    taskProgressId?: string | null;
    eventType: string;
    eventData?: Record<string, unknown>;
  } & AuditCtx,
): Promise<void> {
  const { error } = await admin.from('trb_audit_events').insert({
    enrollment_id: params.enrollmentId,
    task_progress_id: params.taskProgressId ?? null,
    actor_user_id: params.actorUserId ?? null,
    actor_email: params.actorEmail ?? null,
    event_type: params.eventType,
    event_data: params.eventData ?? {},
    ip_hash: hashIpForAudit(params.ip),
    user_agent: params.userAgent ? params.userAgent.slice(0, 500) : null,
  });
  if (error) {
    console.error('[TRB audit] insert failed', error.message);
  }
}

export async function listActivePrograms(
  admin: SupabaseClient,
  viewer?: ViewerCtx,
) {
  const { data: programs, error } = await admin
    .from('trb_programs')
    .select(
      'id, code, name, description, programme_type, issuing_body, is_official, is_active, recognition_status, source_authority, source_title, source_url, source_published_at, source_license, source_license_url, source_pdf_filename, source_document_sha256, source_revision_label, companion_notice',
    )
    .eq('is_active', true)
    .order('name');
  if (error) throw error;

  const { data: versions, error: vErr } = await admin
    .from('trb_program_versions')
    .select(
      'id, program_id, version, status, disclaimer, pilot_disclaimer, attribution_html, effective_from, published_at, source_version_reference, source_checked_at, content_provenance, superseded_by_version_id',
    )
    .in('status', ['pilot', 'active']);
  if (vErr) throw vErr;

  const mcaAccess = viewer
    ? canDiscoverMcaPilot({ email: viewer.email, isAdmin: viewer.isAdmin })
    : { allowed: false, reason: 'no_viewer' };

  return (programs || [])
    .filter((p) => {
      if (p.code === 'SJ-DEMO-TRB-OOW') return false;
      if (!isMcaPilotProgramCode(p.code)) return true;
      return mcaAccess.allowed;
    })
    .map((p) => {
      const progVersions = (versions || []).filter((v) => v.program_id === p.id);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        programmeType: p.programme_type,
        issuingBody: p.issuing_body,
        isOfficial: p.is_official,
        isActive: p.is_active,
        recognitionStatus: p.recognition_status ?? 'not_approved',
        sourceAuthority: p.source_authority ?? null,
        sourceTitle: p.source_title ?? null,
        sourceUrl: p.source_url ?? null,
        sourcePublishedAt: p.source_published_at ?? null,
        sourceLicense: p.source_license ?? null,
        sourceLicenseUrl: p.source_license_url ?? null,
        sourcePdfFilename: (p as { source_pdf_filename?: string | null }).source_pdf_filename ?? null,
        sourceDocumentSha256:
          (p as { source_document_sha256?: string | null }).source_document_sha256 ?? null,
        sourceRevisionLabel:
          (p as { source_revision_label?: string | null }).source_revision_label ?? null,
        companionNotice: (p as { companion_notice?: string | null }).companion_notice ?? null,
        // Transitional snake_case for older clients
        programme_type: p.programme_type,
        issuing_body: p.issuing_body,
        is_official: p.is_official,
        is_active: p.is_active,
        recognition_status: p.recognition_status,
        source_authority: p.source_authority,
        source_title: p.source_title,
        source_url: p.source_url,
        source_published_at: p.source_published_at,
        source_license: p.source_license,
        source_license_url: p.source_license_url,
        isMcaPilot: isMcaPilotProgramCode(p.code),
        isOowYachts3000: isMcaPilotProgramCode(p.code),
        versions: progVersions.map((v) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          disclaimer: v.disclaimer,
          companionNotice:
            (v as { pilot_disclaimer?: string | null }).pilot_disclaimer ||
            v.disclaimer,
          pilotDisclaimer: (v as { pilot_disclaimer?: string | null }).pilot_disclaimer ?? null,
          attributionHtml: v.attribution_html ?? null,
          effectiveFrom: v.effective_from ?? null,
          publishedAt: v.published_at ?? null,
          sourceVersionReference: v.source_version_reference ?? null,
          sourceCheckedAt:
            (v as { source_checked_at?: string | null }).source_checked_at ?? null,
          contentProvenance:
            (v as { content_provenance?: string | null }).content_provenance ?? null,
          supersededByVersionId:
            (v as { superseded_by_version_id?: string | null }).superseded_by_version_id ??
            null,
          // Transitional
          pilot_disclaimer: (v as { pilot_disclaimer?: string | null }).pilot_disclaimer,
          attribution_html: v.attribution_html,
          source_version_reference: v.source_version_reference,
        })),
      };
    });
}

export async function listUserEnrollments(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('trb_enrollments')
    .select(`
      id, status, started_at, completed_at, program_version_id, created_at,
      trb_program_versions (
        id, version, status, disclaimer,
        trb_programs ( id, code, name, description, programme_type, is_official )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function enrolUser(
  admin: SupabaseClient,
  userId: string,
  opts: {
    programVersionId?: string;
    programCode?: string;
    consent?: EnrolConsent;
    actorEmail?: string | null;
    isAdmin?: boolean;
  },
  ctx: AuditCtx,
) {
  let versionId = opts.programVersionId;
  let programCode = opts.programCode;

  if (!versionId && opts.programCode) {
    const { data: prog } = await admin
      .from('trb_programs')
      .select('id, code')
      .eq('code', opts.programCode)
      .eq('is_active', true)
      .maybeSingle();
    if (!prog) throw new Error('Programme not found');
    programCode = prog.code;

    const { data: ver } = await admin
      .from('trb_program_versions')
      .select('id')
      .eq('program_id', prog.id)
      .in('status', ['pilot', 'active'])
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ver) throw new Error('No active programme version');
    versionId = ver.id;
  }

  if (!versionId) throw new Error('programVersionId required');

  const { data: version, error: vErr } = await admin
    .from('trb_program_versions')
    .select(
      'id, status, disclaimer, pilot_disclaimer, program_id, trb_programs ( code, recognition_status )',
    )
    .eq('id', versionId)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!version || !['pilot', 'active'].includes(version.status)) {
    throw new Error('Programme version is not available for enrolment');
  }

  const progMeta = version.trb_programs as {
    code?: string;
    recognition_status?: string;
  } | null;
  programCode = progMeta?.code || programCode;

  if (isMcaPilotProgramCode(programCode)) {
    const access = canDiscoverMcaPilot({
      email: opts.actorEmail ?? ctx.actorEmail,
      isAdmin: opts.isAdmin,
    });
    if (!access.allowed) {
      throw new Error(
        access.reason === 'pilot_disabled'
          ? 'OOW Training Record companion is not enabled'
          : 'You are not authorised to enrol in this Training Record programme',
      );
    }
    if (!opts.consent) {
      throw new Error('Pilot consent is required before enrolment');
    }
    const c = opts.consent;
    if (
      !c.understandsTrial ||
      !c.doesNotReplaceOfficialTrb ||
      !c.willMaintainOfficialTrb ||
      !c.feedbackMayBeAnalysed ||
      !c.noMcaPyaApprovalImplied
    ) {
      throw new Error('All companion consent confirmations are required');
    }
  }

  const { data: existing } = await admin
    .from('trb_enrollments')
    .select('id, status')
    .eq('user_id', userId)
    .eq('program_version_id', versionId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    return { enrollmentId: existing.id as string, alreadyEnrolled: true };
  }

  const consentPayload = opts.consent
    ? {
        ...opts.consent,
        consentVersion: opts.consent.consentVersion || MCA_PILOT_CONSENT_VERSION,
        disclaimerVersion:
          opts.consent.disclaimerVersion || MCA_PILOT_DISCLAIMER_VERSION,
      }
    : null;

  const { data: enrollment, error: eErr } = await admin
    .from('trb_enrollments')
    .insert({
      user_id: userId,
      program_version_id: versionId,
      status: 'active',
      consent_version: consentPayload?.consentVersion ?? null,
      consent_disclaimer_version: consentPayload?.disclaimerVersion ?? null,
      consent_accepted_at: consentPayload ? new Date().toISOString() : null,
      consent_payload: consentPayload,
    })
    .select('id')
    .single();
  if (eErr) throw eErr;

  const { data: sections } = await admin
    .from('trb_sections')
    .select('id')
    .eq('program_version_id', versionId);
  const sectionIds = (sections || []).map((s) => s.id);
  let tasks: { id: string }[] = [];
  if (sectionIds.length) {
    const { data: taskRows } = await admin
      .from('trb_tasks')
      .select('id')
      .in('section_id', sectionIds);
    tasks = taskRows || [];
  }

  if (tasks.length) {
    const rows = tasks.map((t) => ({
      enrollment_id: enrollment.id,
      task_id: t.id,
      status: 'not_started' as const,
    }));
    const { error: pErr } = await admin.from('trb_task_progress').insert(rows);
    if (pErr) throw pErr;
  }

  await writeAudit(admin, {
    enrollmentId: enrollment.id,
    eventType: 'enrollment_created',
    eventData: {
      program_version_id: versionId,
      task_count: tasks.length,
      program_code: programCode,
      consent_version: consentPayload?.consentVersion ?? null,
    },
    ...ctx,
    actorUserId: userId,
  });

  return { enrollmentId: enrollment.id as string, alreadyEnrolled: false };
}

export async function getEnrollmentDetail(
  admin: SupabaseClient,
  userId: string,
  enrollmentId: string,
) {
  const { data: enrollment, error } = await admin
    .from('trb_enrollments')
    .select(`
      id, user_id, status, started_at, completed_at, program_version_id, created_at, updated_at,
      consent_version, consent_disclaimer_version, consent_accepted_at,
      trb_program_versions (
        id, version, status, disclaimer, pilot_disclaimer, attribution_html,
        source_version_reference, source_checked_at, content_provenance,
        superseded_by_version_id,
        trb_programs (
          id, code, name, description, programme_type, issuing_body, is_official,
          recognition_status, source_authority, source_title, source_url,
          source_published_at, source_license, source_license_url,
          source_pdf_filename, source_document_sha256, source_revision_label,
          companion_notice
        )
      )
    `)
    .eq('id', enrollmentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!enrollment) return null;

  const versionId = enrollment.program_version_id as string;
  const progCode = (
    enrollment.trb_program_versions as {
      trb_programs?: { code?: string } | null;
    } | null
  )?.trb_programs?.code;
  const isMcaPilot = isMcaPilotProgramCode(progCode);

  const { data: sections } = await admin
    .from('trb_sections')
    .select(
      'id, title, description, sort_order, source_section_reference, source_page_start, source_page_end',
    )
    .eq('program_version_id', versionId)
    .order('sort_order');

  const sectionIds = (sections || []).map((s) => s.id);
  const { data: tasks } = sectionIds.length
    ? await admin
        .from('trb_tasks')
        .select(
          'id, section_id, task_code, title, description, evidence_guidance, seajourney_guidance, required_signer_role, sort_order, is_required, source_task_reference, source_page_start, source_page_end, source_text_hash, official_signer_instruction, official_title, official_description, seajourney_summary, seajourney_completion_guidance, source_page_reference, prerequisites',
        )
        .in('section_id', sectionIds)
        .order('sort_order')
    : { data: [] as never[] };

  const { data: progress } = await admin
    .from('trb_task_progress')
    .select(
      'id, task_id, status, candidate_notes, claimed_completed_at, approved_at, updated_at, created_at',
    )
    .eq('enrollment_id', enrollmentId);

  const progressIds = (progress || []).map((p) => p.id as string);

  const { data: pendingBatchItems } = progressIds.length
    ? await admin
        .from('trb_batch_signoff_items')
        .select('task_progress_id, batch_request_id')
        .in('task_progress_id', progressIds)
        .eq('status', 'pending')
    : { data: [] as { task_progress_id: string; batch_request_id: string }[] };

  const pendingBatchByProgress = new Map(
    (pendingBatchItems || []).map((row) => [
      row.task_progress_id as string,
      row.batch_request_id as string,
    ]),
  );

  const { data: parallelRows } = progressIds.length
    ? await admin
        .from('trb_parallel_book_confirmations')
        .select(
          'id, task_progress_id, reporter_role, official_book_status, official_book_signed_at, official_book_signer_name, official_book_signer_rank, notes, updated_at',
        )
        .in('task_progress_id', progressIds)
    : { data: [] as never[] };

  const { data: signoffRows } = progressIds.length
    ? await admin
        .from('trb_signoffs')
        .select(
          'id, decision, signer_name, signer_email, signer_rank, signer_coc_number, signer_issuing_authority, signer_verification_status, signer_declaration, decision_notes, signed_at, record_hash, created_at, signoff_request_id, task_progress_id',
        )
        .in('task_progress_id', progressIds)
        .order('signed_at', { ascending: false })
    : { data: [] as never[] };

  const latestSignoffByProgress = new Map<
    string,
    ReturnType<typeof mapSignoffRow>
  >();
  for (const row of signoffRows || []) {
    const key = row.task_progress_id as string;
    if (!latestSignoffByProgress.has(key)) {
      latestSignoffByProgress.set(key, mapSignoffRow(row as Parameters<typeof mapSignoffRow>[0]));
    }
  }

  const { data: audit } = await admin
    .from('trb_audit_events')
    .select('id, event_type, event_data, actor_email, created_at, task_progress_id')
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false })
    .limit(30);

  const progressByTask = new Map(
    (progress || []).map((p) => [p.task_id as string, p]),
  );

  const parallelByProgress = new Map<
    string,
    Array<ReturnType<typeof mapParallelBookRow>>
  >();
  for (const row of parallelRows || []) {
    const key = row.task_progress_id as string;
    if (!parallelByProgress.has(key)) parallelByProgress.set(key, []);
    parallelByProgress.get(key)!.push(mapParallelBookRow(row as {
      id: string;
      task_progress_id: string;
      reporter_role: string;
      official_book_status: string;
      official_book_signed_at: string | null;
      official_book_signer_name: string | null;
      official_book_signer_rank: string | null;
      notes: string | null;
      updated_at: string;
    }));
  }

  const taskRows = (tasks || []).map((t) => {
    const p = progressByTask.get(t.id);
    const parallels = p ? parallelByProgress.get(p.id) || [] : [];
    const candidateBook = parallels.find((x) => x.reporterRole === 'candidate');
    const captainBook = parallels.find((x) => x.reporterRole === 'captain');
    const discrepancy =
      Boolean(candidateBook && captainBook) &&
      candidateBook!.officialBookStatus !== captainBook!.officialBookStatus;
    const batchRequestId = p
      ? pendingBatchByProgress.get(p.id as string) ?? null
      : null;
    const latestSignoff = p
      ? latestSignoffByProgress.get(p.id as string) ?? null
      : null;
    return {
      ...mapTaskCatalogRow(t),
      progressId: p?.id ?? null,
      status: (p?.status ?? 'not_started') as TrbTaskStatus,
      claimedCompletedAt: p?.claimed_completed_at ?? null,
      approvedAt: p?.approved_at ?? null,
      updatedAt: p?.updated_at ?? null,
      batchRequestId,
      isBatchShadow: Boolean(batchRequestId),
      latestSignoff,
      officialBookCandidate: candidateBook || null,
      officialBookCaptain: captainBook || null,
      officialBookDiscrepancy: discrepancy,
    };
  });

  const overall = calculateTrbProgress(taskRows.map((t) => t.status));
  const bySection = groupProgressBySection(
    taskRows.map((t) => ({ sectionId: t.sectionId, status: t.status })),
  );

  const officialSigned = taskRows.filter(
    (t) => t.officialBookCandidate?.officialBookStatus === 'signed',
  ).length;
  const officialDiscrepancies = taskRows.filter((t) => t.officialBookDiscrepancy).length;

  const version = enrollment.trb_program_versions as {
    version?: string;
    status?: string;
    disclaimer?: string;
    pilot_disclaimer?: string;
    attribution_html?: string;
    source_version_reference?: string | null;
    source_checked_at?: string | null;
    content_provenance?: string | null;
    superseded_by_version_id?: string | null;
    trb_programs?: {
      code?: string;
      name?: string;
      recognition_status?: string;
      source_authority?: string | null;
      source_title?: string | null;
      source_url?: string | null;
      source_published_at?: string | null;
      source_license?: string | null;
      source_license_url?: string | null;
      source_pdf_filename?: string | null;
      source_document_sha256?: string | null;
      source_revision_label?: string | null;
      companion_notice?: string | null;
    } | null;
  } | null;

  const prog = version?.trb_programs;
  const companionNotice =
    prog?.companion_notice ||
    version?.pilot_disclaimer ||
    version?.disclaimer ||
    (isMcaPilot ? MCA_PILOT_DISCLAIMER : TRB_DISCLAIMER);

  return {
    enrollment,
    isMcaPilot,
    isOowYachts3000: isMcaPilot,
    disclaimer: companionNotice,
    companionNotice,
    attribution: isMcaPilot
      ? version?.attribution_html || MCA_PILOT_ATTRIBUTION
      : null,
    sourceUrl: isMcaPilot ? prog?.source_url || MCA_PILOT_SOURCE_URL : null,
    oglUrl: isMcaPilot ? MCA_PILOT_OGL_URL : null,
    programmeSource: prog
      ? {
          programCode: prog.code ?? null,
          programName: prog.name ?? null,
          programVersion: version?.version ?? null,
          versionStatus: version?.status ?? null,
          recognitionStatus: prog.recognition_status ?? 'not_approved',
          sourceAuthority: prog.source_authority ?? null,
          sourceTitle: prog.source_title ?? null,
          sourceUrl: prog.source_url ?? null,
          sourcePublishedAt: prog.source_published_at ?? null,
          sourceLicense: prog.source_license ?? null,
          sourceLicenseUrl: prog.source_license_url ?? null,
          sourcePdfFilename: prog.source_pdf_filename ?? null,
          sourceDocumentSha256: prog.source_document_sha256 ?? null,
          sourceRevisionLabel: prog.source_revision_label ?? null,
          sourceVersionReference: version?.source_version_reference ?? null,
          sourceCheckedAt: version?.source_checked_at ?? null,
          contentProvenance: version?.content_provenance ?? null,
          companionNotice: prog.companion_notice ?? companionNotice,
          supersededByVersionId: version?.superseded_by_version_id ?? null,
          isOfficial: false,
        }
      : null,
    sections: (sections || []).map((s) => mapSectionRow(s)),
    tasks: taskRows,
    overall,
    officialBookProgress: {
      signedInOfficialBook: officialSigned,
      total: taskRows.length,
      discrepancies: officialDiscrepancies,
      percentSigned:
        taskRows.length === 0
          ? 0
          : Math.round((officialSigned / taskRows.length) * 100),
    },
    bySection,
    recentActivity: (audit || []).map((ev) => mapAuditEventRow(ev)),
  };
}

export async function getTaskDetail(
  admin: SupabaseClient,
  userId: string,
  enrollmentId: string,
  taskProgressId: string,
) {
  const detail = await getEnrollmentDetail(admin, userId, enrollmentId);
  if (!detail) return null;

  const { data: progress, error } = await admin
    .from('trb_task_progress')
    .select('*')
    .eq('id', taskProgressId)
    .eq('enrollment_id', enrollmentId)
    .maybeSingle();
  if (error) throw error;
  if (!progress) return null;

  const task = detail.tasks.find((t) => t.id === progress.task_id);
  if (!task) return null;

  const section = detail.sections.find((s) => s.id === task.sectionId) || null;

  const { data: evidence } = await admin
    .from('trb_task_evidence')
    .select(
      'id, original_filename, mime_type, file_size, evidence_type, description, created_at, uploaded_by, task_progress_id',
    )
    .eq('task_progress_id', taskProgressId)
    .order('created_at', { ascending: false });

  const { data: requests } = await admin
    .from('trb_signoff_requests')
    .select(
      'id, signer_email, signer_name, status, expires_at, used_at, created_at, updated_at, batch_request_id, batch_item_id, is_batch_shadow',
    )
    .eq('task_progress_id', taskProgressId)
    .order('created_at', { ascending: false });

  const { data: signoffs } = await admin
    .from('trb_signoffs')
    .select(
      'id, decision, signer_name, signer_email, signer_rank, signer_coc_number, signer_issuing_authority, signer_verification_status, signer_declaration, decision_notes, signed_at, record_hash, created_at, signoff_request_id, task_progress_id',
    )
    .eq('task_progress_id', taskProgressId)
    .order('signed_at', { ascending: false });

  const mappedRequests = (requests || []).map((r) => mapSignoffRequestRow(r));
  const pending = mappedRequests.find((r) => r.status === 'pending') || null;
  const activeBatchRequestId =
    pending?.batchRequestId ||
    task.batchRequestId ||
    null;

  return {
    enrollment: detail.enrollment,
    isMcaPilot: detail.isMcaPilot,
    disclaimer: detail.disclaimer,
    attribution: detail.attribution,
    sourceUrl: detail.sourceUrl,
    oglUrl: detail.oglUrl,
    section,
    task,
    progress: mapProgressRow(progress),
    evidence: (evidence || []).map((e) => mapEvidenceRow(e)),
    requests: mappedRequests,
    signoffs: (signoffs || []).map((s) => mapSignoffRow(s)),
    pendingRequest: pending,
    batchRequestId: activeBatchRequestId,
    isBatchShadow: Boolean(pending?.isBatchShadow || task.isBatchShadow),
    officialBookCandidate: task.officialBookCandidate,
    officialBookCaptain: task.officialBookCaptain,
    officialBookDiscrepancy: task.officialBookDiscrepancy,
  };
}

export async function updateCandidateNotes(
  admin: SupabaseClient,
  userId: string,
  taskProgressId: string,
  candidateNotes: string,
  markInProgress: boolean,
  ctx: AuditCtx,
) {
  const { data: progress, error } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status, candidate_notes')
    .eq('id', taskProgressId)
    .maybeSingle();
  if (error) throw error;
  if (!progress) throw new Error('Task progress not found');

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) {
    throw new Error('Forbidden');
  }

  const status = progress.status as TrbTaskStatus;
  if (
    status === 'approved' ||
    status === 'awaiting_signoff' ||
    status === 'ready_for_assessment' ||
    status === 'superseded'
  ) {
    throw new Error('Cannot edit notes in current status');
  }

  let nextStatus = status;
  if (markInProgress) {
    if (status === 'not_started' && canCandidateTransition(status, 'in_progress')) {
      nextStatus = 'in_progress';
    } else if (
      (status === 'changes_requested' || status === 'rejected') &&
      canCandidateTransition(status, 'in_progress')
    ) {
      nextStatus = 'in_progress';
    }
  }

  const { error: uErr } = await admin
    .from('trb_task_progress')
    .update({
      candidate_notes: candidateNotes,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskProgressId);
  if (uErr) throw uErr;

  if (status === 'not_started' && nextStatus === 'in_progress') {
    await writeAudit(admin, {
      enrollmentId: progress.enrollment_id,
      taskProgressId,
      eventType: 'task_started',
      ...ctx,
      actorUserId: userId,
    });
  }
  if (
    (status === 'changes_requested' || status === 'rejected') &&
    nextStatus === 'in_progress'
  ) {
    await writeAudit(admin, {
      enrollmentId: progress.enrollment_id,
      taskProgressId,
      eventType: 'task_resumed',
      eventData: { from: status },
      ...ctx,
      actorUserId: userId,
    });
  }

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId,
    eventType: 'candidate_notes_updated',
    ...ctx,
    actorUserId: userId,
  });

  return { status: nextStatus };
}

export async function uploadEvidence(
  admin: SupabaseClient,
  userId: string,
  taskProgressId: string,
  file: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  },
  description: string | null,
  ctx: AuditCtx,
) {
  if (!TRB_EVIDENCE_ALLOWED_MIME.has(file.mimeType)) {
    throw new Error('Unsupported file type. Use PDF, JPEG or PNG.');
  }
  if (file.size <= 0 || file.size > TRB_EVIDENCE_MAX_BYTES) {
    throw new Error(`File too large. Maximum is ${TRB_EVIDENCE_MAX_BYTES / (1024 * 1024)}MB.`);
  }

  const ext = file.filename.split('.').pop()?.toLowerCase();
  const mimeExtOk =
    (file.mimeType === 'application/pdf' && ext === 'pdf') ||
    (file.mimeType === 'image/jpeg' && (ext === 'jpg' || ext === 'jpeg')) ||
    (file.mimeType === 'image/png' && ext === 'png');
  if (!mimeExtOk) {
    throw new Error('Filename extension does not match MIME type');
  }

  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status')
    .eq('id', taskProgressId)
    .maybeSingle();
  if (!progress) throw new Error('Task progress not found');

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  const status = progress.status as TrbTaskStatus;
  if (['approved', 'awaiting_signoff', 'superseded'].includes(status)) {
    throw new Error('Cannot upload evidence in current status');
  }

  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const storagePath = `${userId}/${progress.enrollment_id}/${taskProgressId}/${randomUUID()}-${safeName}`;

  const { error: upErr } = await admin.storage
    .from(TRB_EVIDENCE_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimeType,
      upsert: false,
    });
  if (upErr) throw upErr;

  const evidenceType =
    file.mimeType === 'application/pdf' ? 'document' : 'image';

  const { data: row, error: iErr } = await admin
    .from('trb_task_evidence')
    .insert({
      task_progress_id: taskProgressId,
      uploaded_by: userId,
      storage_path: storagePath,
      original_filename: file.filename.slice(0, 255),
      mime_type: file.mimeType,
      file_size: file.size,
      evidence_type: evidenceType,
      description,
    })
    .select('id, original_filename, mime_type, file_size, evidence_type, description, created_at')
    .single();
  if (iErr) {
    await admin.storage.from(TRB_EVIDENCE_BUCKET).remove([storagePath]);
    throw iErr;
  }

  if (status === 'not_started') {
    await admin
      .from('trb_task_progress')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', taskProgressId);
    await writeAudit(admin, {
      enrollmentId: progress.enrollment_id,
      taskProgressId,
      eventType: 'task_started',
      ...ctx,
      actorUserId: userId,
    });
  }

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId,
    eventType: 'evidence_added',
    eventData: { evidence_id: row.id, filename: row.original_filename },
    ...ctx,
    actorUserId: userId,
  });

  return row;
}

export async function removeEvidence(
  admin: SupabaseClient,
  userId: string,
  evidenceId: string,
  ctx: AuditCtx,
) {
  const { data: evidence } = await admin
    .from('trb_task_evidence')
    .select('id, task_progress_id, storage_path, uploaded_by, original_filename')
    .eq('id', evidenceId)
    .maybeSingle();
  if (!evidence) throw new Error('Evidence not found');
  if (evidence.uploaded_by !== userId) throw new Error('Forbidden');

  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status')
    .eq('id', evidence.task_progress_id)
    .maybeSingle();
  if (!progress) throw new Error('Task progress not found');

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('user_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  if (
    ['approved', 'awaiting_signoff', 'superseded'].includes(
      progress.status as string,
    )
  ) {
    throw new Error('Cannot remove evidence in current status');
  }

  await admin.storage.from(TRB_EVIDENCE_BUCKET).remove([evidence.storage_path]);
  const { error } = await admin.from('trb_task_evidence').delete().eq('id', evidenceId);
  if (error) throw error;

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId: progress.id,
    eventType: 'evidence_removed',
    eventData: { evidence_id: evidenceId, filename: evidence.original_filename },
    ...ctx,
    actorUserId: userId,
  });
}

export async function markReadyForAssessment(
  admin: SupabaseClient,
  userId: string,
  taskProgressId: string,
  idempotencyKey: string | undefined,
  ctx: AuditCtx,
) {
  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status, candidate_notes, idempotency_key')
    .eq('id', taskProgressId)
    .maybeSingle();
  if (!progress) throw new Error('Task progress not found');

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  const status = progress.status as TrbTaskStatus;
  if (status === 'ready_for_assessment') {
    return { status: 'ready_for_assessment' as const, idempotent: true };
  }
  if (!canCandidateTransition(status, 'ready_for_assessment')) {
    throw new Error('Task cannot be marked ready for assessment from its current status');
  }

  const key = idempotencyKey?.trim() || null;
  if (key) {
    const { data: existing } = await admin
      .from('trb_task_progress')
      .select('id, status')
      .eq('enrollment_id', progress.enrollment_id)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (existing && existing.id !== taskProgressId) {
      throw new Error('Idempotency key already used');
    }
  }

  const { error } = await admin
    .from('trb_task_progress')
    .update({
      status: 'ready_for_assessment',
      ready_for_assessment_at: new Date().toISOString(),
      idempotency_key: key,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskProgressId)
    .eq('status', status);
  if (error) throw error;

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId,
    eventType: 'task_ready_for_assessment',
    eventData: { idempotency_key: key },
    ...ctx,
    actorUserId: userId,
  });

  await notifyTrbEvent({
    userId,
    event: 'task_ready_for_assessment',
    body: 'A training task is ready for assessment. You can now request captain sign-off.',
    metadata: { taskProgressId, enrollmentId: progress.enrollment_id },
  });

  return { status: 'ready_for_assessment' as const, idempotent: false };
}

export async function listEligibleSignersForTask(
  admin: SupabaseClient,
  userId: string,
  taskProgressId: string,
) {
  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, task_id')
    .eq('id', taskProgressId)
    .maybeSingle();
  if (!progress) throw new Error('Task progress not found');

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('user_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  const { data: task } = await admin
    .from('trb_tasks')
    .select('required_signer_role')
    .eq('id', progress.task_id)
    .maybeSingle();

  const vessel = await getCandidateActiveVessel(admin, userId);
  if (!vessel.vesselId) {
    return {
      vesselId: null,
      vesselName: null,
      requiredSignerRole: task?.required_signer_role || 'captain',
      signers: [],
      allowExternalInviteHint:
        'No active vessel assignment. Assign to a vessel, or invite an external captain (self-declared credentials).',
    };
  }

  const required = task?.required_signer_role || 'captain';
  const signers = await listEligibleSignersForVessel(
    admin,
    vessel.vesselId,
    required,
  );

  return {
    vesselId: vessel.vesselId,
    vesselName: vessel.vesselName,
    requiredSignerRole: required,
    signers,
    allowExternalInviteHint:
      'Training Record sign-off requires an authenticated SeaJourney user with explicit Training Record authority on this vessel. External email-only invites are not eligible.',
  };
}

export async function createSignoffRequest(
  admin: SupabaseClient,
  userId: string,
  args: {
    taskProgressId: string;
    signerUserId?: string | null;
    signerName?: string | null;
    signerEmail?: string | null;
    optionalMessage?: string;
    allowExternalInvite?: boolean;
    idempotencyKey?: string;
  },
  ctx: AuditCtx,
) {
  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status, candidate_notes, task_id')
    .eq('id', args.taskProgressId)
    .maybeSingle();
  if (!progress) throw new Error('Task progress not found');

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id, program_version_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  const status = progress.status as TrbTaskStatus;
  if (status === 'awaiting_signoff') {
    throw new Error('A pending sign-off request already exists');
  }
  if (status === 'approved' || status === 'superseded') {
    throw new Error('This task is already closed and cannot be sent for sign-off');
  }

  // Verbal / light-touch flow: prepare the task for assessment automatically.
  // Notes and evidence remain optional.
  if (status !== 'ready_for_assessment') {
    if (!canCandidateTransition(status, 'ready_for_assessment')) {
      throw new Error(
        'Task cannot be sent for sign-off from its current status',
      );
    }
    const { error: readyErr } = await admin
      .from('trb_task_progress')
      .update({
        status: 'ready_for_assessment',
        ready_for_assessment_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.taskProgressId)
      .eq('status', status);
    if (readyErr) throw readyErr;

    await writeAudit(admin, {
      enrollmentId: progress.enrollment_id,
      taskProgressId: args.taskProgressId,
      eventType: 'task_ready_for_assessment',
      eventData: { autoPreparedForSignoff: true },
      ...ctx,
      actorUserId: userId,
    });
  }

  const idemKey = args.idempotencyKey?.trim() || null;
  if (idemKey) {
    const { data: prior } = await admin
      .from('trb_signoff_requests')
      .select('id, expires_at, status, created_at')
      .eq('task_progress_id', args.taskProgressId)
      .eq('idempotency_key', idemKey)
      .maybeSingle();
    if (prior) {
      return {
        requestId: prior.id as string,
        expiresAt: prior.expires_at as string,
        emailSent: false,
        emailSkipped: true,
        idempotent: true,
        reviewUrl: undefined as string | undefined,
      };
    }
  }

  const { data: pending } = await admin
    .from('trb_signoff_requests')
    .select('id')
    .eq('task_progress_id', args.taskProgressId)
    .eq('status', 'pending')
    .maybeSingle();
  if (pending) {
    throw new Error('A pending sign-off request already exists');
  }

  const { data: task } = await admin
    .from('trb_tasks')
    .select(
      'title, official_title, section_id, required_signer_role, source_task_reference',
    )
    .eq('id', progress.task_id)
    .maybeSingle();

  const requiredRole = task?.required_signer_role || 'captain';

  if (args.signerUserId && args.signerUserId === userId) {
    throw Object.assign(new Error('Candidates cannot request sign-off from themselves'), {
      code: 'CANNOT_SIGN_OWN_TASK',
    });
  }

  const { data: candidateUser } = await admin
    .from('users')
    .select('first_name, last_name, email, active_vessel_id')
    .eq('id', userId)
    .maybeSingle();

  const eligibility = await evaluateSignerEligibility(admin, {
    candidateUserId: userId,
    signerUserId: args.signerUserId,
    signerEmail: args.signerEmail,
    requiredSignerRole: requiredRole,
    allowExternalInvite: Boolean(args.allowExternalInvite),
  });
  if (!eligibility.eligible || !eligibility.signer || !eligibility.signer.userId) {
    throw Object.assign(
      new Error(
        eligibility.reason || 'Proposed signer is not eligible for this task',
      ),
      { code: eligibility.code || 'SIGNER_ELIGIBILITY_CHANGED' },
    );
  }

  const signer = eligibility.signer;
  // Server-authoritative identity; ignore/verify client name/email
  if (
    args.signerEmail &&
    args.signerEmail.trim().toLowerCase() !== signer.email
  ) {
    throw Object.assign(
      new Error('signerEmail does not match selected signerUserId'),
      { code: 'SIGNER_ELIGIBILITY_CHANGED' },
    );
  }
  if (
    candidateUser?.email &&
    candidateUser.email.trim().toLowerCase() === signer.email
  ) {
    throw Object.assign(new Error('Candidates cannot request sign-off from themselves'), {
      code: 'CANNOT_SIGN_OWN_TASK',
    });
  }

  const email = signer.email;
  const signerName = signer.fullName || args.signerName?.trim() || email;

  // Cancel any stray pending (race safety)
  await admin
    .from('trb_signoff_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('task_progress_id', args.taskProgressId)
    .eq('status', 'pending');

  const { rawToken, tokenHash, expiresAt } = generateTrbSignoffToken();

  const { data: request, error } = await admin
    .from('trb_signoff_requests')
    .insert({
      task_progress_id: args.taskProgressId,
      requested_by: userId,
      signer_email: email,
      signer_name: signerName,
      required_signer_role: requiredRole,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      vessel_id: eligibility.vesselId,
      vessel_name_snapshot: eligibility.vesselName,
      candidate_assignment_id: eligibility.candidateAssignmentId,
      signer_user_id: signer.userId,
      signer_assignment_id: signer.assignmentId,
      eligibility_snapshot: {
        source: signer.source,
        selfDeclared: signer.selfDeclared,
        credentialVerificationStatus: signer.credentialVerificationStatus,
        reason: eligibility.reason ?? null,
        authorityId: signer.authorityId,
        authorityType: signer.authorityType,
        vesselRole: signer.vesselRole,
        isVesselManager: signer.isVesselManager,
        qualificationSummary: signer.qualificationSummary,
        authorityExpiresAt: signer.authorityExpiresAt,
        eligibilityLabel: signer.eligibilityLabel,
      },
      idempotency_key: idemKey,
    })
    .select('id, expires_at, created_at')
    .single();
  if (error) throw error;

  await admin
    .from('trb_task_progress')
    .update({
      status: 'awaiting_signoff',
      claimed_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.taskProgressId);

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId: args.taskProgressId,
    eventType: 'signoff_requested',
    eventData: {
      request_id: request.id,
      signer_user_id: signer.userId,
      signer_email: email,
      expires_at: request.expires_at,
      eligibility_source: signer.source,
      authority_id: signer.authorityId,
      self_declared: signer.selfDeclared,
    },
    ...ctx,
    actorUserId: userId,
  });

  const crewName =
    [candidateUser?.first_name, candidateUser?.last_name]
      .filter(Boolean)
      .join(' ') ||
    candidateUser?.email ||
    'Crew member';

  const vesselName = eligibility.vesselName;

  const { data: version } = await admin
    .from('trb_program_versions')
    .select('id, pilot_disclaimer, disclaimer, trb_programs ( name, code )')
    .eq('id', enrollment.program_version_id)
    .maybeSingle();

  const programmeName =
    (version?.trb_programs as { name?: string } | null)?.name ||
    'Digital TRB Companion';
  const progCode = (version?.trb_programs as { code?: string } | null)?.code;
  const emailDisclaimer = isMcaPilotProgramCode(progCode)
    ? version?.pilot_disclaimer || version?.disclaimer || MCA_PILOT_DISCLAIMER
    : version?.disclaimer || TRB_DISCLAIMER;

  const reviewUrl = `${trbAppBaseUrl()}/training-records/signoff/${encodeURIComponent(rawToken)}`;
  const taskTitle =
    task?.official_title || task?.title || 'Training task';

  const emailResult = await sendTrbSignoffRequestEmail({
    to: email,
    signerName,
    crewName,
    vesselName,
    programmeName,
    taskTitle,
    requestedAt: request.created_at,
    expiresAt: request.expires_at,
    reviewUrl,
    optionalMessage: args.optionalMessage,
    disclaimer: emailDisclaimer,
  });

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId: args.taskProgressId,
    eventType: emailResult.success ? 'request_email_sent' : 'request_email_failed',
    eventData: {
      request_id: request.id,
      skipped: Boolean(emailResult.skipped),
    },
    ...ctx,
    actorUserId: userId,
  });

  await notifyTrbEvent({
    userId,
    event: 'signoff_requested',
    body: `Sign-off requested from ${signerName} (${signer.eligibilityLabel}) for ${taskTitle}.`,
    metadata: {
      domain: 'trb',
      taskProgressId: args.taskProgressId,
      requestId: request.id,
      enrollmentId: progress.enrollment_id,
      signerUserId: signer.userId,
    },
  });

  if (signer.userId && signer.userId !== userId) {
    await notifyTrbEvent({
      userId: signer.userId,
      event: 'signoff_requested',
      body: `${crewName} requested training sign-off for ${taskTitle}. Review it in your Inbox or the email link.`,
      metadata: {
        domain: 'trb',
        taskProgressId: args.taskProgressId,
        requestId: request.id,
        enrollmentId: progress.enrollment_id,
        deepLink: `/dashboard/inbox`,
        route: `/dashboard/inbox`,
      },
    });
  }

  const allowDevReviewUrl =
    process.env.NODE_ENV !== 'production' && Boolean(emailResult.skipped);

  return {
    requestId: request.id as string,
    expiresAt: request.expires_at as string,
    emailSent: emailResult.success,
    emailSkipped: Boolean(emailResult.skipped),
    idempotent: false,
    reviewUrl: allowDevReviewUrl ? reviewUrl : undefined,
    eligibility: {
      source: signer.source,
      selfDeclared: signer.selfDeclared,
      vesselId: eligibility.vesselId,
      vesselName: eligibility.vesselName,
      signerUserId: signer.userId,
      authorityId: signer.authorityId,
      eligibilityLabel: signer.eligibilityLabel,
    },
  };
}

export async function cancelPendingSignoffRequest(
  admin: SupabaseClient,
  userId: string,
  taskProgressId: string,
  requestId: string | undefined,
  ctx: AuditCtx,
) {
  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status')
    .eq('id', taskProgressId)
    .maybeSingle();
  if (!progress) throw new Error('Task progress not found');

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('user_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  let q = admin
    .from('trb_signoff_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('task_progress_id', taskProgressId)
    .eq('status', 'pending');
  if (requestId) q = q.eq('id', requestId);
  const { error } = await q;
  if (error) throw error;

  await admin
    .from('trb_task_progress')
    .update({ status: 'ready_for_assessment', updated_at: new Date().toISOString() })
    .eq('id', taskProgressId);

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId,
    eventType: 'signoff_request_cancelled',
    eventData: { request_id: requestId ?? null },
    ...ctx,
    actorUserId: userId,
  });

  await notifyTrbEvent({
    userId,
    event: 'request_cancelled',
    body: 'A pending training sign-off request was cancelled. You can request again when ready.',
    metadata: { taskProgressId, requestId: requestId ?? null },
  });
}

type SignoffRequestRow = {
  id: string;
  task_progress_id: string;
  signer_email: string;
  signer_name: string | null;
  signer_user_id?: string | null;
  status: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  required_signer_role: string | null;
  token_hash?: string;
};

async function resolveSignoffRequestRow(
  admin: SupabaseClient,
  request: SignoffRequestRow,
  ctx: AuditCtx & { recordView?: boolean; requirePending?: boolean },
) {
  const requirePending = ctx.requirePending !== false;

  if (request.status === 'pending' && new Date(request.expires_at) <= new Date()) {
    await admin
      .from('trb_signoff_requests')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('status', 'pending');

    const { data: progress } = await admin
      .from('trb_task_progress')
      .select('enrollment_id')
      .eq('id', request.task_progress_id)
      .maybeSingle();
    if (progress) {
      await writeAudit(admin, {
        enrollmentId: progress.enrollment_id,
        taskProgressId: request.task_progress_id,
        eventType: 'request_expired',
        eventData: { request_id: request.id },
        ...ctx,
      });
    }
    if (requirePending) {
      return { ok: false as const, reason: 'expired' as const };
    }
    request = { ...request, status: 'expired' };
  }

  if (requirePending && (request.status !== 'pending' || request.used_at)) {
    return {
      ok: false as const,
      reason: 'used' as const,
      status: request.status as string,
    };
  }

  return buildSignoffResolvePayload(admin, request, ctx);
}

export async function resolveSignoffToken(
  admin: SupabaseClient,
  rawToken: string,
  ctx: AuditCtx & { recordView?: boolean },
) {
  const tokenHash = hashTrbSignoffToken(rawToken);
  const { data: request, error } = await admin
    .from('trb_signoff_requests')
    .select(
      'id, task_progress_id, signer_email, signer_name, signer_user_id, status, expires_at, used_at, created_at, required_signer_role',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!request) return { ok: false as const, reason: 'invalid_token' as const };

  return resolveSignoffRequestRow(admin, request as SignoffRequestRow, ctx);
}

/** Authenticated signer/admin (or crew owner) detail for dashboard review — pending or settled. */
export async function getSignoffRequestDetailAsSigner(
  admin: SupabaseClient,
  opts: { userId: string; requestId: string },
  ctx: AuditCtx & { recordView?: boolean } = {},
) {
  const { data: request, error } = await admin
    .from('trb_signoff_requests')
    .select(
      'id, task_progress_id, signer_email, signer_name, signer_user_id, status, expires_at, used_at, created_at, required_signer_role, token_hash, is_batch_shadow',
    )
    .eq('id', opts.requestId)
    .eq('is_batch_shadow', false)
    .maybeSingle();
  if (error) throw error;
  if (!request) return null;

  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('enrollment_id')
    .eq('id', request.task_progress_id)
    .maybeSingle();
  const { data: enrollment } = progress
    ? await admin
        .from('trb_enrollments')
        .select('user_id')
        .eq('id', progress.enrollment_id)
        .maybeSingle()
    : { data: null };

  const { data: viewer } = await admin
    .from('users')
    .select('email, role')
    .eq('id', opts.userId)
    .maybeSingle();

  const isOwner = enrollment?.user_id === opts.userId;
  const isSignerByUser =
    Boolean(request.signer_user_id) && request.signer_user_id === opts.userId;
  const isSignerByEmail =
    Boolean(viewer?.email) &&
    viewer!.email!.trim().toLowerCase() ===
      String(request.signer_email).trim().toLowerCase();
  const isSigner = isSignerByUser || isSignerByEmail;
  if (!isOwner && !isSigner && viewer?.role !== 'admin') return null;

  const result = await resolveSignoffRequestRow(
    admin,
    request as SignoffRequestRow,
    {
      ...ctx,
      recordView: Boolean(ctx.recordView && isSigner && request.status === 'pending'),
      requirePending: false,
      actorUserId: opts.userId,
      actorEmail: viewer?.email ?? ctx.actorEmail,
    },
  );
  if (!result.ok) return null;
  return result;
}

/** Decide via dashboard/inbox using the same pending request as the email link (RPC consumes token once). */
export async function submitSignoffDecisionAsSigner(
  admin: SupabaseClient,
  userId: string,
  args: {
    requestId: string;
    decision: 'approved' | 'changes_requested' | 'rejected';
    signerName: string;
    signerRank: string;
    signerCocNumber: string;
    signerIssuingAuthority: string;
    signerDeclaration: string;
    decisionNotes?: string | null;
    officialBookStatus?:
      | 'not_recorded'
      | 'awaiting_signature'
      | 'signed'
      | 'discrepancy_reported';
    officialBookNotes?: string | null;
  },
  ctx: AuditCtx,
) {
  const { data: request } = await admin
    .from('trb_signoff_requests')
    .select('id, token_hash, signer_user_id, signer_email, status, is_batch_shadow')
    .eq('id', args.requestId)
    .eq('is_batch_shadow', false)
    .maybeSingle();
  if (!request) {
    throw Object.assign(new Error('Not found'), { code: 'not_found' });
  }

  const { data: viewer } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .maybeSingle();

  const isSigner =
    request.signer_user_id === userId ||
    (viewer?.email &&
      viewer.email.trim().toLowerCase() ===
        String(request.signer_email).trim().toLowerCase());

  if (!isSigner && viewer?.role !== 'admin') {
    throw Object.assign(new Error('Forbidden'), { code: 'forbidden' });
  }

  return submitCaptainDecision(
    admin,
    {
      tokenHash: request.token_hash as string,
      decision: args.decision,
      signerName: args.signerName,
      signerRank: args.signerRank,
      signerCocNumber: args.signerCocNumber,
      signerIssuingAuthority: args.signerIssuingAuthority,
      signerDeclaration: args.signerDeclaration,
      decisionNotes: args.decisionNotes,
      officialBookStatus: args.officialBookStatus,
      officialBookNotes: args.officialBookNotes,
    },
    { ...ctx, actorUserId: userId },
  );
}

async function buildSignoffResolvePayload(
  admin: SupabaseClient,
  request: SignoffRequestRow,
  ctx: AuditCtx & { recordView?: boolean },
) {

  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status, candidate_notes, claimed_completed_at, task_id')
    .eq('id', request.task_progress_id)
    .maybeSingle();
  if (!progress) return { ok: false as const, reason: 'invalid_token' as const };

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id, program_version_id')
    .eq('id', progress.enrollment_id)
    .maybeSingle();
  if (!enrollment) return { ok: false as const, reason: 'invalid_token' as const };

  const { data: candidate } = await admin
    .from('users')
    .select('first_name, last_name, email, active_vessel_id')
    .eq('id', enrollment.user_id)
    .maybeSingle();

  let vesselName: string | null = null;
  if (candidate?.active_vessel_id) {
    const { data: vessel } = await admin
      .from('vessels_public_identity')
      .select('name')
      .eq('id', candidate.active_vessel_id)
      .maybeSingle();
    vesselName = vessel?.name ?? null;
  }

  const { data: task } = await admin
    .from('trb_tasks')
    .select(
      'id, task_code, title, description, evidence_guidance, seajourney_guidance, section_id, source_task_reference, source_page_start, source_page_end, official_signer_instruction, official_title, official_description, seajourney_summary, seajourney_completion_guidance, source_page_reference, required_signer_role',
    )
    .eq('id', progress.task_id)
    .maybeSingle();

  const { data: section } = task
    ? await admin
        .from('trb_sections')
        .select(
          'id, title, source_section_reference, source_page_start, source_page_end',
        )
        .eq('id', task.section_id)
        .maybeSingle()
    : { data: null };

  const { data: version } = await admin
    .from('trb_program_versions')
    .select(
      'id, version, disclaimer, pilot_disclaimer, attribution_html, trb_programs ( name, code )',
    )
    .eq('id', enrollment.program_version_id)
    .maybeSingle();

  const { data: evidence } = await admin
    .from('trb_task_evidence')
    .select('id, original_filename, mime_type, file_size, evidence_type, description, created_at')
    .eq('task_progress_id', progress.id)
    .order('created_at', { ascending: false });

  const { data: priorSignoffs } = await admin
    .from('trb_signoffs')
    .select(
      'id, decision, decision_notes, signed_at, signer_name, signer_email, signer_verification_status, record_hash',
    )
    .eq('task_progress_id', progress.id)
    .eq('decision', 'changes_requested')
    .order('signed_at', { ascending: false })
    .limit(5);

  const { data: parallelRows } = await admin
    .from('trb_parallel_book_confirmations')
    .select(
      'reporter_role, official_book_status, official_book_signed_at, notes, updated_at',
    )
    .eq('task_progress_id', progress.id);

  if (ctx.recordView) {
    await admin
      .from('trb_signoff_requests')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', request.id)
      .is('viewed_at', null);

    await writeAudit(admin, {
      enrollmentId: enrollment.id,
      taskProgressId: progress.id,
      eventType: 'request_viewed',
      eventData: { request_id: request.id },
      ...ctx,
      actorEmail: request.signer_email,
    });

    await notifyTrbEvent({
      userId: enrollment.user_id,
      event: 'request_viewed',
      body: 'Your training sign-off request was opened by the reviewer.',
      metadata: { requestId: request.id, taskProgressId: progress.id },
    });
  }

  const crewName =
    [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ') ||
    candidate?.email ||
    'Candidate';

  const progCode = (version?.trb_programs as { code?: string } | null)?.code;
  const isMcaPilot = isMcaPilotProgramCode(progCode);

  return {
    ok: true as const,
    isMcaPilot,
    request: {
      id: request.id,
      status: request.status,
      expiresAt: request.expires_at,
      signerEmail: request.signer_email,
      signerName: request.signer_name,
      requiredSignerRole: request.required_signer_role,
    },
    candidate: { name: crewName, vesselName },
    programme: {
      name: (version?.trb_programs as { name?: string } | null)?.name || 'Digital TRB Companion',
      code: progCode || null,
      version: version?.version || null,
      disclaimer: isMcaPilot
        ? version?.pilot_disclaimer || version?.disclaimer || MCA_PILOT_DISCLAIMER
        : version?.disclaimer || TRB_DISCLAIMER,
      attribution: isMcaPilot
        ? version?.attribution_html || MCA_PILOT_ATTRIBUTION
        : null,
      sourceUrl: isMcaPilot ? MCA_PILOT_SOURCE_URL : null,
      oglUrl: isMcaPilot ? MCA_PILOT_OGL_URL : null,
    },
    section: section
      ? mapSectionRow(
          section as {
            id: string;
            title: string;
            description?: string | null;
            sort_order?: number;
            source_section_reference?: string | null;
            source_page_start?: number | null;
            source_page_end?: number | null;
          },
        )
      : null,
    task: task
      ? mapTaskCatalogRow(
          task as Parameters<typeof mapTaskCatalogRow>[0],
        )
      : null,
    progress: {
      id: progress.id,
      status: progress.status,
      candidateNotes: progress.candidate_notes,
      claimedCompletedAt: progress.claimed_completed_at,
      enrollmentId: enrollment.id,
    },
    evidence: (evidence || []).map((e) => mapEvidenceRow(e)),
    priorChangesRequested: (priorSignoffs || []).map((s) => ({
      id: s.id as string,
      decision: s.decision as string,
      decisionNotes: (s.decision_notes as string | null) ?? null,
      signedAt: s.signed_at as string,
      signerName: s.signer_name as string,
      signerEmail: (s.signer_email as string) || '',
      signerVerificationStatus: s.signer_verification_status as string,
      recordHash: (s.record_hash as string) || '',
    })),
    officialBookCandidate: (() => {
      const row = (parallelRows || []).find((r) => r.reporter_role === 'candidate');
      return row
        ? mapParallelBookRow({
            id: '',
            task_progress_id: progress.id as string,
            reporter_role: row.reporter_role as string,
            official_book_status: row.official_book_status as string,
            official_book_signed_at: (row.official_book_signed_at as string | null) ?? null,
            official_book_signer_name: null,
            official_book_signer_rank: null,
            notes: (row.notes as string | null) ?? null,
            updated_at: (row.updated_at as string) || new Date().toISOString(),
          })
        : null;
    })(),
    officialBookCaptain: (() => {
      const row = (parallelRows || []).find((r) => r.reporter_role === 'captain');
      return row
        ? mapParallelBookRow({
            id: '',
            task_progress_id: progress.id as string,
            reporter_role: row.reporter_role as string,
            official_book_status: row.official_book_status as string,
            official_book_signed_at: (row.official_book_signed_at as string | null) ?? null,
            official_book_signer_name: null,
            official_book_signer_rank: null,
            notes: (row.notes as string | null) ?? null,
            updated_at: (row.updated_at as string) || new Date().toISOString(),
          })
        : null;
    })(),
  };
}

export async function submitCaptainDecision(
  admin: SupabaseClient,
  args: {
    rawToken?: string;
    tokenHash?: string;
    decision: 'approved' | 'changes_requested' | 'rejected';
    signerName: string;
    signerRank: string;
    signerCocNumber: string;
    signerIssuingAuthority: string;
    signerDeclaration: string;
    decisionNotes?: string | null;
    officialBookStatus?:
      | 'not_recorded'
      | 'awaiting_signature'
      | 'signed'
      | 'discrepancy_reported';
    officialBookNotes?: string | null;
  },
  ctx: AuditCtx,
) {
  const tokenHash =
    args.tokenHash ||
    (args.rawToken ? hashTrbSignoffToken(args.rawToken) : null);
  if (!tokenHash) {
    throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
  }
  const signedAt = new Date().toISOString();

  // Look up request id for hash (without exposing token)
  const { data: req } = await admin
    .from('trb_signoff_requests')
    .select('id, task_progress_id, status, expires_at, used_at, signer_email')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!req) throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
  if (req.status !== 'pending' || req.used_at) {
    throw Object.assign(new Error('token_not_pending'), { code: 'token_not_pending' });
  }
  if (new Date(req.expires_at) <= new Date()) {
    throw Object.assign(new Error('token_expired'), { code: 'token_expired' });
  }

  const recordHash = computeTrbSignoffRecordHash({
    signoffRequestId: req.id,
    taskProgressId: req.task_progress_id,
    decision: args.decision,
    signerName: args.signerName,
    signerEmail: req.signer_email,
    signerRank: args.signerRank,
    signerCocNumber: args.signerCocNumber,
    signerIssuingAuthority: args.signerIssuingAuthority,
    signerDeclaration: args.signerDeclaration,
    decisionNotes: args.decisionNotes ?? null,
    signedAt,
  });

  // Upsert self-declared officer credentials (does not imply SeaJourney verification)
  await admin.from('officer_credentials').insert({
    user_id: null,
    email: req.signer_email,
    full_name: args.signerName.trim(),
    rank: args.signerRank.trim(),
    coc_number: args.signerCocNumber.trim(),
    issuing_authority: args.signerIssuingAuthority.trim(),
    verification_status: 'self_declared',
  });

  const { data, error } = await admin.rpc('trb_submit_signoff_decision', {
    p_token_hash: tokenHash,
    p_decision: args.decision,
    p_signer_name: args.signerName.trim(),
    p_signer_email: req.signer_email,
    p_signer_rank: args.signerRank.trim(),
    p_signer_coc_number: args.signerCocNumber.trim(),
    p_signer_issuing_authority: args.signerIssuingAuthority.trim(),
    p_signer_verification_status: 'self_declared',
    p_signer_declaration: args.signerDeclaration.trim(),
    p_decision_notes: args.decisionNotes?.trim() || null,
    p_record_hash: recordHash,
    p_signed_at: signedAt,
    p_actor_email: req.signer_email,
    p_ip_hash: hashIpForAudit(ctx.ip),
    p_user_agent: ctx.userAgent ? ctx.userAgent.slice(0, 500) : null,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('invalid_token')) throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
    if (msg.includes('token_expired')) throw Object.assign(new Error('token_expired'), { code: 'token_expired' });
    if (msg.includes('token_not_pending') || msg.includes('token_already_used')) {
      throw Object.assign(new Error('token_not_pending'), { code: 'token_not_pending' });
    }
    throw error;
  }

  // Captain official-book confirmation is separate and never overwrites candidate row
  // and never auto-sets signed from digital approval alone.
  if (args.officialBookStatus) {
    await upsertParallelBookConfirmation(admin, {
      taskProgressId: req.task_progress_id,
      reporterRole: 'captain',
      reportedByEmail: req.signer_email,
      officialBookStatus: args.officialBookStatus,
      notes: args.officialBookNotes ?? null,
      candidateDeclaration:
        'Captain-reported trial comparison only — not independent verification of the official TRB.',
    }, ctx);
  }

  // Enrich immutable snapshots on the sign-off row (additive columns).
  try {
    const signoffId =
      data && typeof data === 'object' && 'signoff_id' in data
        ? String((data as { signoff_id: string }).signoff_id)
        : null;
    const enrollmentId =
      data && typeof data === 'object' && 'enrollment_id' in data
        ? String((data as { enrollment_id: string }).enrollment_id)
        : null;

    if (signoffId) {
      const { data: progressRow } = await admin
        .from('trb_task_progress')
        .select('id, enrollment_id, task_id')
        .eq('id', req.task_progress_id)
        .maybeSingle();
      const { data: enrollmentRow } = progressRow
        ? await admin
            .from('trb_enrollments')
            .select('id, user_id, program_version_id')
            .eq('id', progressRow.enrollment_id)
            .maybeSingle()
        : { data: null };
      const { data: versionRow } = enrollmentRow
        ? await admin
            .from('trb_program_versions')
            .select('id, program_id')
            .eq('id', enrollmentRow.program_version_id)
            .maybeSingle()
        : { data: null };
      const { data: taskRow } = progressRow
        ? await admin
            .from('trb_tasks')
            .select('id, section_id, source_task_reference')
            .eq('id', progressRow.task_id)
            .maybeSingle()
        : { data: null };
      const { data: candidateRow } = enrollmentRow
        ? await admin
            .from('users')
            .select('first_name, last_name, email')
            .eq('id', enrollmentRow.user_id)
            .maybeSingle()
        : { data: null };
      const { data: requestRow } = await admin
        .from('trb_signoff_requests')
        .select(
          'vessel_id, vessel_name_snapshot, candidate_assignment_id, signer_user_id, signer_assignment_id, viewed_at, created_at, eligibility_snapshot',
        )
        .eq('id', req.id)
        .maybeSingle();
      const { data: evidenceRows } = await admin
        .from('trb_task_evidence')
        .select('id, original_filename, mime_type, file_size, created_at')
        .eq('task_progress_id', req.task_progress_id);

      const candidateName =
        [candidateRow?.first_name, candidateRow?.last_name]
          .filter(Boolean)
          .join(' ') ||
        candidateRow?.email ||
        null;

      await admin
        .from('trb_signoffs')
        .update({
          candidate_user_id: enrollmentRow?.user_id ?? null,
          candidate_name_snapshot: candidateName,
          program_id: versionRow?.program_id ?? null,
          program_version_id: versionRow?.id ?? null,
          section_id: taskRow?.section_id ?? null,
          task_id: taskRow?.id ?? null,
          task_source_reference: taskRow?.source_task_reference ?? null,
          vessel_id: requestRow?.vessel_id ?? null,
          vessel_name_snapshot: requestRow?.vessel_name_snapshot ?? null,
          candidate_assignment_id: requestRow?.candidate_assignment_id ?? null,
          signer_user_id: requestRow?.signer_user_id ?? null,
          signer_assignment_id: requestRow?.signer_assignment_id ?? null,
          authority_id:
            (requestRow?.eligibility_snapshot as { authorityId?: string } | null)
              ?.authorityId ?? null,
          authority_source:
            (requestRow?.eligibility_snapshot as { authorityType?: string; source?: string } | null)
              ?.authorityType ||
            (requestRow?.eligibility_snapshot as { source?: string } | null)?.source ||
            null,
          signer_vessel_role:
            (requestRow?.eligibility_snapshot as { vesselRole?: string } | null)?.vesselRole ??
            null,
          is_vessel_manager_snapshot: Boolean(
            (requestRow?.eligibility_snapshot as { isVesselManager?: boolean } | null)
              ?.isVesselManager,
          ),
          evidence_refs: evidenceRows || [],
          request_created_at: requestRow?.created_at ?? null,
          request_viewed_at: requestRow?.viewed_at ?? null,
        })
        .eq('id', signoffId);

      if (enrollmentRow?.user_id) {
        const notifyEvent =
          args.decision === 'approved'
            ? 'task_approved'
            : args.decision === 'rejected'
              ? 'task_rejected'
              : 'changes_requested';
        await notifyTrbEvent({
          userId: enrollmentRow.user_id,
          event: notifyEvent,
          body:
            args.decision === 'approved'
              ? 'A training task was approved by the captain/officer.'
              : args.decision === 'rejected'
                ? 'A training task sign-off was rejected. Review feedback and continue.'
                : 'Changes were requested on a training task. Update notes/evidence and mark ready again.',
          metadata: {
            signoffId,
            requestId: req.id,
            taskProgressId: req.task_progress_id,
            enrollmentId: enrollmentId || enrollmentRow.id,
            decision: args.decision,
          },
        });
      }
    }
  } catch (enrichErr) {
    console.warn(
      '[TRB] signoff snapshot enrich failed',
      enrichErr instanceof Error ? enrichErr.message : enrichErr,
    );
  }

  return { ...(data as Record<string, unknown>), recordHash, signedAt };
}

export async function createEvidenceDownloadUrl(
  admin: SupabaseClient,
  opts:
    | { mode: 'candidate'; userId: string; evidenceId: string }
    | { mode: 'signer'; userId: string; evidenceId: string; batchRequestId?: string }
    | { mode: 'token'; rawToken: string; evidenceId: string },
): Promise<{ signedUrl: string; filename: string; mimeType: string }> {
  let evidence: {
    id: string;
    storage_path: string;
    original_filename: string;
    mime_type: string;
    task_progress_id: string;
  } | null = null;

  if (opts.mode === 'candidate') {
    const { data } = await admin
      .from('trb_task_evidence')
      .select('id, storage_path, original_filename, mime_type, task_progress_id')
      .eq('id', opts.evidenceId)
      .maybeSingle();
    if (!data) throw new Error('Evidence not found');
    const { data: progress } = await admin
      .from('trb_task_progress')
      .select('enrollment_id')
      .eq('id', data.task_progress_id)
      .maybeSingle();
    const { data: enrollment } = progress
      ? await admin
          .from('trb_enrollments')
          .select('user_id')
          .eq('id', progress.enrollment_id)
          .maybeSingle()
      : { data: null };
    if (!enrollment || enrollment.user_id !== opts.userId) throw new Error('Forbidden');
    evidence = data;
  } else if (opts.mode === 'signer') {
    const { data } = await admin
      .from('trb_task_evidence')
      .select('id, storage_path, original_filename, mime_type, task_progress_id')
      .eq('id', opts.evidenceId)
      .maybeSingle();
    if (!data) throw new Error('Evidence not found');

    let allowed = false;
    if (opts.batchRequestId) {
      const detail = await (
        await import('@/lib/trb/batch')
      ).getBatchRequestDetail(admin, {
        userId: opts.userId,
        batchRequestId: opts.batchRequestId,
      });
      if (detail?.ok) {
        const progressIds = new Set(
          detail.items.map((i: { taskProgressId: string }) => i.taskProgressId),
        );
        allowed = progressIds.has(data.task_progress_id);
      }
    } else {
      // Single-task: signer must own a pending/used request for this progress
      const { data: viewer } = await admin
        .from('users')
        .select('email')
        .eq('id', opts.userId)
        .maybeSingle();
      const email = viewer?.email?.trim().toLowerCase();
      let q = admin
        .from('trb_signoff_requests')
        .select('id')
        .eq('task_progress_id', data.task_progress_id)
        .eq('is_batch_shadow', false)
        .limit(1);
      const { data: byUser } = await admin
        .from('trb_signoff_requests')
        .select('id')
        .eq('task_progress_id', data.task_progress_id)
        .eq('signer_user_id', opts.userId)
        .eq('is_batch_shadow', false)
        .limit(1);
      const { data: byEmail } = email
        ? await q.eq('signer_email', email)
        : { data: [] as never[] };
      allowed = Boolean(byUser?.length || byEmail?.length);
    }
    if (!allowed) throw new Error('Forbidden');
    evidence = data;
  } else {
    // Batch tokens first (parent hashed token), then single-task tokens
    const { resolveBatchSignoffToken } = await import('@/lib/trb/batch');
    const batchResolved = await resolveBatchSignoffToken(admin, opts.rawToken, {
      recordView: false,
    });
    if (batchResolved && batchResolved.ok) {
      const allowedProgressIds = new Set(
        batchResolved.items.map((i) => i.taskProgressId as string),
      );
      const { data } = await admin
        .from('trb_task_evidence')
        .select('id, storage_path, original_filename, mime_type, task_progress_id')
        .eq('id', opts.evidenceId)
        .maybeSingle();
      if (!data || !allowedProgressIds.has(data.task_progress_id)) {
        throw new Error('Evidence not found');
      }
      evidence = data;
    } else {
      const resolved = await resolveSignoffToken(admin, opts.rawToken, {
        recordView: false,
      });
      if (!resolved.ok) throw new Error('Forbidden');
      const { data } = await admin
        .from('trb_task_evidence')
        .select('id, storage_path, original_filename, mime_type, task_progress_id')
        .eq('id', opts.evidenceId)
        .eq('task_progress_id', resolved.progress.id)
        .maybeSingle();
      if (!data) throw new Error('Evidence not found');
      evidence = data;
    }
  }

  const { data: signed, error } = await admin.storage
    .from(TRB_EVIDENCE_BUCKET)
    .createSignedUrl(evidence.storage_path, 120);
  if (error || !signed?.signedUrl) throw error || new Error('Could not sign URL');

  return {
    signedUrl: signed.signedUrl,
    filename: evidence.original_filename,
    mimeType: evidence.mime_type,
  };
}

export async function buildAuditReport(
  admin: SupabaseClient,
  userId: string,
  enrollmentId: string,
  ctx: AuditCtx,
) {
  const detail = await getEnrollmentDetail(admin, userId, enrollmentId);
  if (!detail) throw new Error('Enrollment not found');

  const progressIds = detail.tasks
    .map((t) => t.progressId)
    .filter((id): id is string => Boolean(id));

  const { data: evidence } = progressIds.length
    ? await admin
        .from('trb_task_evidence')
        .select(
          'id, task_progress_id, original_filename, mime_type, file_size, evidence_type, description, created_at',
        )
        .in('task_progress_id', progressIds)
    : { data: [] as never[] };

  const { data: signoffs } = progressIds.length
    ? await admin
        .from('trb_signoffs')
        .select(
          'id, task_progress_id, decision, signer_name, signer_email, signer_rank, signer_coc_number, signer_issuing_authority, signer_verification_status, decision_notes, signed_at, record_hash',
        )
        .in('task_progress_id', progressIds)
        .order('signed_at', { ascending: true })
    : { data: [] as never[] };

  const { data: audit } = await admin
    .from('trb_audit_events')
    .select('id, event_type, event_data, actor_email, created_at, task_progress_id')
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: true });

  const { data: candidate } = await admin
    .from('users')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle();

  const reportId = randomUUID();
  const generatedAt = new Date().toISOString();

  await writeAudit(admin, {
    enrollmentId,
    eventType: 'export_generated',
    eventData: { report_id: reportId },
    ...ctx,
    actorUserId: userId,
  });

  return {
    reportId,
    generatedAt,
    isMcaPilot: detail.isMcaPilot,
    watermark: detail.isMcaPilot ? 'DIGITAL COMPANION PILOT' : null,
    notOfficialStatement: detail.isMcaPilot ? 'NOT AN OFFICIAL TRB' : null,
    disclaimer: detail.disclaimer,
    attribution: detail.attribution,
    sourceUrl: detail.sourceUrl,
    oglUrl: detail.oglUrl,
    officialBookProgress: detail.officialBookProgress,
    candidate: {
      name:
        [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ') ||
        candidate?.email ||
        userId,
      email: candidate?.email ?? null,
    },
    enrollment: detail.enrollment,
    overall: detail.overall,
    sections: detail.sections,
    tasks: detail.tasks,
    evidence: (evidence || []).map((e) => mapEvidenceRow(e)),
    signoffs: (signoffs || []).map((s) => mapSignoffRow(s)),
    auditEvents: (audit || []).map((ev) => mapAuditEventRow(ev)),
  };
}

export async function upsertParallelBookConfirmation(
  admin: SupabaseClient,
  args: {
    taskProgressId: string;
    reporterRole: 'candidate' | 'captain';
    candidateId?: string | null;
    reportedByUserId?: string | null;
    reportedByEmail?: string | null;
    officialBookStatus:
      | 'not_recorded'
      | 'awaiting_signature'
      | 'signed'
      | 'discrepancy_reported';
    officialBookSignedAt?: string | null;
    officialBookSignerName?: string | null;
    officialBookSignerRank?: string | null;
    candidateDeclaration: string;
    notes?: string | null;
  },
  ctx: AuditCtx,
) {
  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, status')
    .eq('id', args.taskProgressId)
    .maybeSingle();
  if (!progress) throw new Error('Task progress not found');

  if (args.reporterRole === 'candidate') {
    const { data: enrollment } = await admin
      .from('trb_enrollments')
      .select('user_id')
      .eq('id', progress.enrollment_id)
      .maybeSingle();
    if (!enrollment || enrollment.user_id !== args.candidateId) {
      throw new Error('Forbidden');
    }
  }

  // Digital approval must never auto-set official book to signed
  const row = {
    task_progress_id: args.taskProgressId,
    candidate_id: args.candidateId ?? null,
    reporter_role: args.reporterRole,
    reported_by_user_id: args.reportedByUserId ?? null,
    reported_by_email: args.reportedByEmail ?? null,
    official_book_status: args.officialBookStatus,
    official_book_signed_at: args.officialBookSignedAt ?? null,
    official_book_signer_name: args.officialBookSignerName ?? null,
    official_book_signer_rank: args.officialBookSignerRank ?? null,
    candidate_declaration: args.candidateDeclaration,
    notes: args.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from('trb_parallel_book_confirmations')
    .select('id')
    .eq('task_progress_id', args.taskProgressId)
    .eq('reporter_role', args.reporterRole)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from('trb_parallel_book_confirmations')
      .update(row)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from('trb_parallel_book_confirmations').insert(row);
    if (error) throw error;
  }

  await writeAudit(admin, {
    enrollmentId: progress.enrollment_id,
    taskProgressId: args.taskProgressId,
    eventType: 'official_book_confirmation_recorded',
    eventData: {
      reporter_role: args.reporterRole,
      official_book_status: args.officialBookStatus,
    },
    ...ctx,
  });

  // Detect discrepancy without overwriting either answer
  const { data: both } = await admin
    .from('trb_parallel_book_confirmations')
    .select('reporter_role, official_book_status')
    .eq('task_progress_id', args.taskProgressId);
  const candidate = (both || []).find((b) => b.reporter_role === 'candidate');
  const captain = (both || []).find((b) => b.reporter_role === 'captain');
  const discrepancy =
    Boolean(candidate && captain) &&
    candidate!.official_book_status !== captain!.official_book_status;

  if (discrepancy) {
    await writeAudit(admin, {
      enrollmentId: progress.enrollment_id,
      taskProgressId: args.taskProgressId,
      eventType: 'official_book_discrepancy',
      eventData: {
        candidate_status: candidate?.official_book_status,
        captain_status: captain?.official_book_status,
      },
      ...ctx,
    });
  }

  return { discrepancy };
}

export async function submitPilotFeedback(
  admin: SupabaseClient,
  args: {
    enrollmentId: string;
    taskProgressId?: string | null;
    signoffRequestId?: string | null;
    submittedByUserId?: string | null;
    submitterRole: 'candidate' | 'captain' | 'administrator';
    submitterEmail?: string | null;
    easeOfUseRating: number;
    clarityRating: number;
    confidenceRating: number;
    timeToCompleteMinutes?: number | null;
    whatWorked?: string | null;
    whatWasUnclear?: string | null;
    whatWouldYouChange?: string | null;
    encounteredConnectivityIssue?: boolean | null;
    wouldUseAgain?: boolean | null;
  },
  ctx: AuditCtx,
) {
  if (args.submitterRole === 'candidate' && args.submittedByUserId) {
    const { data: enrollment } = await admin
      .from('trb_enrollments')
      .select('user_id')
      .eq('id', args.enrollmentId)
      .maybeSingle();
    if (!enrollment || enrollment.user_id !== args.submittedByUserId) {
      throw new Error('Forbidden');
    }
  }

  const { data, error } = await admin
    .from('trb_pilot_feedback')
    .insert({
      enrollment_id: args.enrollmentId,
      task_progress_id: args.taskProgressId ?? null,
      signoff_request_id: args.signoffRequestId ?? null,
      submitted_by_user_id: args.submittedByUserId ?? null,
      submitter_role: args.submitterRole,
      submitter_email: args.submitterEmail ?? null,
      ease_of_use_rating: args.easeOfUseRating,
      clarity_rating: args.clarityRating,
      confidence_rating: args.confidenceRating,
      time_to_complete_minutes: args.timeToCompleteMinutes ?? null,
      what_worked: args.whatWorked ?? null,
      what_was_unclear: args.whatWasUnclear ?? null,
      what_would_you_change: args.whatWouldYouChange ?? null,
      encountered_connectivity_issue: args.encounteredConnectivityIssue ?? null,
      would_use_again: args.wouldUseAgain ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  await writeAudit(admin, {
    enrollmentId: args.enrollmentId,
    taskProgressId: args.taskProgressId,
    eventType: 'pilot_feedback_submitted',
    eventData: {
      feedback_id: data.id,
      submitter_role: args.submitterRole,
    },
    ...ctx,
  });

  return { feedbackId: data.id as string };
}

export async function listSignoffsForSigner(
  admin: SupabaseClient,
  opts: {
    email?: string | null;
    userId?: string | null;
    status?: string;
    limit?: number;
  },
) {
  const normalized = opts.email?.trim().toLowerCase() || null;
  const limit = opts.limit ?? 50;

  type Row = {
    id: string;
    status: string;
    signer_email: string;
    signer_name: string | null;
    expires_at: string;
    used_at: string | null;
    created_at: string;
    task_progress_id: string;
    vessel_id: string | null;
    vessel_name_snapshot: string | null;
    required_signer_role: string | null;
    viewed_at: string | null;
    is_batch_shadow: boolean | null;
    batch_request_id: string | null;
    signer_user_id?: string | null;
  };

  // Prefer stable user id; also include email matches for legacy rows
  let byUser: Row[] = [];
  let byEmail: Row[] = [];

  const selectCols =
    'id, status, signer_email, signer_name, expires_at, used_at, created_at, task_progress_id, vessel_id, vessel_name_snapshot, required_signer_role, viewed_at, is_batch_shadow, batch_request_id, signer_user_id';

  if (opts.userId) {
    let q = admin
      .from('trb_signoff_requests')
      .select(selectCols)
      .eq('signer_user_id', opts.userId)
      .eq('is_batch_shadow', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    byUser = (data || []) as Row[];
  }

  if (normalized) {
    let q = admin
      .from('trb_signoff_requests')
      .select(selectCols)
      .eq('signer_email', normalized)
      .eq('is_batch_shadow', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    byEmail = (data || []) as Row[];
  }

  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const r of [...byUser, ...byEmail]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push(r);
  }
  rows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const progressIds = [
    ...new Set(rows.map((r) => r.task_progress_id as string).filter(Boolean)),
  ];
  if (!progressIds.length) return [];

  const { data: progressRows } = await admin
    .from('trb_task_progress')
    .select('id, enrollment_id, task_id, status')
    .in('id', progressIds);

  const taskIds = [
    ...new Set((progressRows || []).map((p) => p.task_id as string)),
  ];
  const enrollmentIds = [
    ...new Set((progressRows || []).map((p) => p.enrollment_id as string)),
  ];

  const { data: tasks } = taskIds.length
    ? await admin
        .from('trb_tasks')
        .select('id, task_code, title, official_title, section_id')
        .in('id', taskIds)
    : { data: [] as never[] };

  const { data: enrollments } = enrollmentIds.length
    ? await admin
        .from('trb_enrollments')
        .select(
          'id, user_id, program_version_id, trb_program_versions ( version, trb_programs ( name, code ) )',
        )
        .in('id', enrollmentIds)
    : { data: [] as never[] };

  const progressById = new Map((progressRows || []).map((p) => [p.id, p]));
  const taskById = new Map((tasks || []).map((t) => [t.id, t]));
  const enrollmentById = new Map((enrollments || []).map((e) => [e.id, e]));

  return rows.slice(0, limit).map((r) => {
    const progress = progressById.get(r.task_progress_id);
    const task = progress ? taskById.get(progress.task_id) : null;
    const enrollment = progress
      ? enrollmentById.get(progress.enrollment_id)
      : null;
    const version = enrollment?.trb_program_versions as {
      version?: string;
      trb_programs?: { name?: string; code?: string } | null;
    } | null;
    return {
      id: r.id as string,
      status: r.status as string,
      signerEmail: r.signer_email as string,
      signerName: (r.signer_name as string | null) ?? null,
      signerUserId: (r.signer_user_id as string | null) ?? null,
      expiresAt: r.expires_at as string,
      usedAt: (r.used_at as string | null) ?? null,
      createdAt: r.created_at as string,
      taskProgressId: r.task_progress_id as string,
      vesselId: (r.vessel_id as string | null) ?? null,
      vesselNameSnapshot: (r.vessel_name_snapshot as string | null) ?? null,
      requiredSignerRole: (r.required_signer_role as string | null) ?? null,
      viewedAt: (r.viewed_at as string | null) ?? null,
      resourceType: 'training_task' as const,
      taskStatus: progress?.status ?? null,
      taskCode: task?.task_code ?? null,
      taskTitle: task?.official_title || task?.title || null,
      programmeName: version?.trb_programs?.name ?? null,
      programmeCode: version?.trb_programs?.code ?? null,
      programmeVersion: version?.version ?? null,
      enrollmentId: progress?.enrollment_id ?? null,
      isBatchShadow: false,
      batchRequestId: null as string | null,
    };
  });
}

/** @deprecated Prefer listSignoffsForSigner with userId. */
export async function listSignoffsForSignerEmail(
  admin: SupabaseClient,
  email: string,
  filters?: {
    status?: string;
    limit?: number;
  },
) {
  return listSignoffsForSigner(admin, {
    email,
    status: filters?.status,
    limit: filters?.limit,
  });
}

/**
 * Permanently delete an enrolment owned by `userId`.
 * Removes evidence files, all sign-offs, progress, requests, batches, and audit
 * for that enrolment. Irreversible.
 *
 * Sign-offs must be deleted first — their FKs to progress/requests are RESTRICT.
 */
export async function deleteEnrollment(
  admin: SupabaseClient,
  userId: string,
  enrollmentId: string,
  ctx: AuditCtx,
): Promise<{
  enrollmentId: string;
  progressDeleted: number;
  signoffsDeleted: number;
  evidenceFilesRemoved: number;
}> {
  const { data: enrollment, error: enErr } = await admin
    .from('trb_enrollments')
    .select('id, user_id, status, program_version_id')
    .eq('id', enrollmentId)
    .maybeSingle();
  if (enErr) throw enErr;
  if (!enrollment) {
    const err = new Error('Enrolment not found');
    (err as Error & { code?: string }).code = 'not_found';
    throw err;
  }
  if (enrollment.user_id !== userId) {
    const err = new Error('Forbidden');
    (err as Error & { code?: string }).code = 'forbidden';
    throw err;
  }

  const { data: progressRows, error: pErr } = await admin
    .from('trb_task_progress')
    .select('id')
    .eq('enrollment_id', enrollmentId);
  if (pErr) throw pErr;
  const progressIds = (progressRows || []).map((r) => r.id as string);

  let evidenceFilesRemoved = 0;
  let signoffsDeleted = 0;

  if (progressIds.length > 0) {
    const { data: evidenceRows, error: eErr } = await admin
      .from('trb_task_evidence')
      .select('id, storage_path')
      .in('task_progress_id', progressIds);
    if (eErr) throw eErr;

    const paths = (evidenceRows || [])
      .map((r) => r.storage_path as string | null)
      .filter((p): p is string => Boolean(p));

    if (paths.length > 0) {
      // Storage remove is best-effort; DB rows cascade with progress.
      const chunkSize = 100;
      for (let i = 0; i < paths.length; i += chunkSize) {
        const chunk = paths.slice(i, i + chunkSize);
        const { error: storageErr } = await admin.storage
          .from(TRB_EVIDENCE_BUCKET)
          .remove(chunk);
        if (storageErr) {
          console.warn(
            '[TRB deleteEnrollment] storage remove partial failure',
            storageErr.message,
          );
        } else {
          evidenceFilesRemoved += chunk.length;
        }
      }
    }

    // RESTRICT FKs: must remove sign-offs before progress / enrollment cascade.
    const { data: deletedSignoffs, error: sErr } = await admin
      .from('trb_signoffs')
      .delete()
      .in('task_progress_id', progressIds)
      .select('id');
    if (sErr) throw sErr;
    signoffsDeleted = (deletedSignoffs || []).length;
  }

  await writeAudit(admin, {
    enrollmentId,
    eventType: 'enrollment_delete_requested',
    eventData: {
      progressCount: progressIds.length,
      signoffsDeleted,
      evidenceFilesRemoved,
      programVersionId: enrollment.program_version_id,
      enrollmentStatus: enrollment.status,
      note: 'Audit row will cascade-delete with enrolment',
    },
    ...ctx,
    actorUserId: userId,
  });

  const { error: delErr } = await admin
    .from('trb_enrollments')
    .delete()
    .eq('id', enrollmentId)
    .eq('user_id', userId);
  if (delErr) throw delErr;

  return {
    enrollmentId,
    progressDeleted: progressIds.length,
    signoffsDeleted,
    evidenceFilesRemoved,
  };
}

