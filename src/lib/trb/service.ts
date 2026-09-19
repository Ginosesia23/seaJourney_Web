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
      'id, code, name, description, programme_type, issuing_body, is_official, is_active, recognition_status, source_authority, source_title, source_url, source_published_at, source_license, source_license_url',
    )
    .eq('is_active', true)
    .order('name');
  if (error) throw error;

  const { data: versions, error: vErr } = await admin
    .from('trb_program_versions')
    .select(
      'id, program_id, version, status, disclaimer, pilot_disclaimer, attribution_html, effective_from, published_at, source_version_reference',
    )
    .in('status', ['pilot', 'active']);
  if (vErr) throw vErr;

  const mcaAccess = viewer
    ? canDiscoverMcaPilot({ email: viewer.email, isAdmin: viewer.isAdmin })
    : { allowed: false, reason: 'no_viewer' };

  return (programs || [])
    .filter((p) => {
      if (!isMcaPilotProgramCode(p.code)) return true;
      return mcaAccess.allowed;
    })
    .map((p) => ({
      ...p,
      isMcaPilot: isMcaPilotProgramCode(p.code),
      versions: (versions || []).filter((v) => v.program_id === p.id),
    }));
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
          ? 'MCA OOW pilot is not enabled'
          : 'You are not authorised to enrol in this private pilot',
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
      throw new Error('All pilot consent confirmations are required');
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
        source_version_reference, source_checked_at,
        trb_programs (
          id, code, name, description, programme_type, issuing_body, is_official,
          recognition_status, source_authority, source_title, source_url,
          source_published_at, source_license, source_license_url
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
  const { data: parallelRows } = progressIds.length
    ? await admin
        .from('trb_parallel_book_confirmations')
        .select(
          'id, task_progress_id, reporter_role, official_book_status, official_book_signed_at, official_book_signer_name, official_book_signer_rank, notes, updated_at',
        )
        .in('task_progress_id', progressIds)
    : { data: [] as never[] };

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
    Array<{
      id: string;
      task_progress_id: string;
      reporter_role: string;
      official_book_status: string;
      official_book_signed_at: string | null;
      official_book_signer_name: string | null;
      official_book_signer_rank: string | null;
      notes: string | null;
      updated_at: string;
    }>
  >();
  for (const row of parallelRows || []) {
    const key = row.task_progress_id as string;
    if (!parallelByProgress.has(key)) parallelByProgress.set(key, []);
    parallelByProgress.get(key)!.push(row as {
      id: string;
      task_progress_id: string;
      reporter_role: string;
      official_book_status: string;
      official_book_signed_at: string | null;
      official_book_signer_name: string | null;
      official_book_signer_rank: string | null;
      notes: string | null;
      updated_at: string;
    });
  }

  const taskRows = (tasks || []).map((t) => {
    const p = progressByTask.get(t.id);
    const parallels = p ? parallelByProgress.get(p.id) || [] : [];
    const candidateBook = parallels.find((x) => x.reporter_role === 'candidate');
    const captainBook = parallels.find((x) => x.reporter_role === 'captain');
    const discrepancy =
      Boolean(candidateBook && captainBook) &&
      candidateBook!.official_book_status !== captainBook!.official_book_status;
    return {
      ...t,
      progressId: p?.id ?? null,
      status: (p?.status ?? 'not_started') as TrbTaskStatus,
      claimedCompletedAt: p?.claimed_completed_at ?? null,
      approvedAt: p?.approved_at ?? null,
      updatedAt: p?.updated_at ?? null,
      officialBookCandidate: candidateBook || null,
      officialBookCaptain: captainBook || null,
      officialBookDiscrepancy: discrepancy,
    };
  });

  const overall = calculateTrbProgress(taskRows.map((t) => t.status));
  const bySection = groupProgressBySection(
    taskRows.map((t) => ({ sectionId: t.section_id, status: t.status })),
  );

  const officialSigned = taskRows.filter(
    (t) => t.officialBookCandidate?.official_book_status === 'signed',
  ).length;
  const officialDiscrepancies = taskRows.filter((t) => t.officialBookDiscrepancy).length;

  const version = enrollment.trb_program_versions as {
    disclaimer?: string;
    pilot_disclaimer?: string;
    attribution_html?: string;
  } | null;

  return {
    enrollment,
    isMcaPilot,
    disclaimer: isMcaPilot
      ? version?.pilot_disclaimer || version?.disclaimer || MCA_PILOT_DISCLAIMER
      : version?.disclaimer || TRB_DISCLAIMER,
    attribution: isMcaPilot
      ? version?.attribution_html || MCA_PILOT_ATTRIBUTION
      : null,
    sourceUrl: isMcaPilot ? MCA_PILOT_SOURCE_URL : null,
    oglUrl: isMcaPilot ? MCA_PILOT_OGL_URL : null,
    sections: sections || [],
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
    recentActivity: audit || [],
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

  const section = detail.sections.find((s) => s.id === task.section_id);

  const { data: evidence } = await admin
    .from('trb_task_evidence')
    .select(
      'id, original_filename, mime_type, file_size, evidence_type, description, created_at, uploaded_by',
    )
    .eq('task_progress_id', taskProgressId)
    .order('created_at', { ascending: false });

  const { data: requests } = await admin
    .from('trb_signoff_requests')
    .select(
      'id, signer_email, signer_name, status, expires_at, used_at, created_at, updated_at',
    )
    .eq('task_progress_id', taskProgressId)
    .order('created_at', { ascending: false });

  const { data: signoffs } = await admin
    .from('trb_signoffs')
    .select(
      'id, decision, signer_name, signer_email, signer_rank, signer_coc_number, signer_issuing_authority, signer_verification_status, signer_declaration, decision_notes, signed_at, record_hash, created_at, signoff_request_id',
    )
    .eq('task_progress_id', taskProgressId)
    .order('signed_at', { ascending: false });

  const pending = (requests || []).find((r) => r.status === 'pending');

  return {
    enrollment: detail.enrollment,
    isMcaPilot: detail.isMcaPilot,
    disclaimer: detail.disclaimer,
    attribution: detail.attribution,
    sourceUrl: detail.sourceUrl,
    oglUrl: detail.oglUrl,
    section,
    task,
    progress,
    evidence: evidence || [],
    requests: requests || [],
    signoffs: signoffs || [],
    pendingRequest: pending || null,
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
  if (
    ['approved', 'awaiting_signoff', 'ready_for_assessment', 'superseded'].includes(
      status,
    )
  ) {
    throw new Error('Cannot add evidence in current status');
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
    ['approved', 'awaiting_signoff', 'ready_for_assessment', 'superseded'].includes(
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
    throw new Error('Task must be in progress before marking ready for assessment');
  }
  if (!(progress.candidate_notes || '').trim()) {
    throw new Error('Add candidate notes before marking ready for assessment');
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
      'External captains may be invited by email; their credentials remain self-declared until SeaJourney verifies them.',
  };
}

export async function createSignoffRequest(
  admin: SupabaseClient,
  userId: string,
  args: {
    taskProgressId: string;
    signerName: string;
    signerEmail: string;
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
  if (status !== 'ready_for_assessment') {
    throw new Error(
      'Task must be marked ready for assessment before requesting sign-off',
    );
  }
  if (!(progress.candidate_notes || '').trim()) {
    throw new Error('Candidate notes are required before requesting sign-off');
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
  const email = args.signerEmail.trim().toLowerCase();

  const { data: candidateUser } = await admin
    .from('users')
    .select('first_name, last_name, email, active_vessel_id')
    .eq('id', userId)
    .maybeSingle();

  if (
    candidateUser?.email &&
    candidateUser.email.trim().toLowerCase() === email
  ) {
    throw new Error('Candidates cannot request sign-off from themselves');
  }

  const eligibility = await evaluateSignerEligibility(admin, {
    candidateUserId: userId,
    signerEmail: email,
    requiredSignerRole: requiredRole,
    allowExternalInvite: Boolean(args.allowExternalInvite),
  });
  if (!eligibility.eligible || !eligibility.signer) {
    throw new Error(
      eligibility.reason || 'Proposed signer is not eligible for this task',
    );
  }

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
      signer_name: args.signerName.trim() || eligibility.signer.fullName,
      required_signer_role: requiredRole,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      vessel_id: eligibility.vesselId,
      vessel_name_snapshot: eligibility.vesselName,
      candidate_assignment_id: eligibility.candidateAssignmentId,
      signer_user_id: eligibility.signer.userId,
      signer_assignment_id: eligibility.signer.assignmentId,
      eligibility_snapshot: {
        source: eligibility.signer.source,
        selfDeclared: eligibility.signer.selfDeclared,
        credentialVerificationStatus:
          eligibility.signer.credentialVerificationStatus,
        reason: eligibility.reason ?? null,
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
      signer_email: email,
      expires_at: request.expires_at,
      eligibility_source: eligibility.signer.source,
      self_declared: eligibility.signer.selfDeclared,
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
    signerName: args.signerName.trim() || eligibility.signer.fullName,
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
    body: `Sign-off requested from ${args.signerName.trim() || email} for ${taskTitle}.`,
    metadata: {
      taskProgressId: args.taskProgressId,
      requestId: request.id,
      enrollmentId: progress.enrollment_id,
    },
  });

  if (eligibility.signer.userId && eligibility.signer.userId !== userId) {
    await notifyTrbEvent({
      userId: eligibility.signer.userId,
      event: 'signoff_requested',
      body: `${crewName} requested training sign-off for ${taskTitle}. Check your email for the secure review link.`,
      metadata: {
        taskProgressId: args.taskProgressId,
        requestId: request.id,
        enrollmentId: progress.enrollment_id,
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
      source: eligibility.signer.source,
      selfDeclared: eligibility.signer.selfDeclared,
      vesselId: eligibility.vesselId,
      vesselName: eligibility.vesselName,
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

export async function resolveSignoffToken(
  admin: SupabaseClient,
  rawToken: string,
  ctx: AuditCtx & { recordView?: boolean },
) {
  const tokenHash = hashTrbSignoffToken(rawToken);
  const { data: request, error } = await admin
    .from('trb_signoff_requests')
    .select(
      'id, task_progress_id, signer_email, signer_name, status, expires_at, used_at, created_at, required_signer_role',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!request) return { ok: false as const, reason: 'invalid_token' as const };

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
    return { ok: false as const, reason: 'expired' as const };
  }

  if (request.status !== 'pending' || request.used_at) {
    return {
      ok: false as const,
      reason: 'used' as const,
      status: request.status as string,
    };
  }

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
      'id, decision, decision_notes, signed_at, signer_name, signer_verification_status',
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
    section,
    task,
    progress: {
      id: progress.id,
      status: progress.status,
      candidateNotes: progress.candidate_notes,
      claimedCompletedAt: progress.claimed_completed_at,
      enrollmentId: enrollment.id,
    },
    evidence: evidence || [],
    priorChangesRequested: priorSignoffs || [],
    officialBookCandidate:
      (parallelRows || []).find((r) => r.reporter_role === 'candidate') || null,
    officialBookCaptain:
      (parallelRows || []).find((r) => r.reporter_role === 'captain') || null,
  };
}

export async function submitCaptainDecision(
  admin: SupabaseClient,
  args: {
    rawToken: string;
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
  const tokenHash = hashTrbSignoffToken(args.rawToken);
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
  } else {
    const resolved = await resolveSignoffToken(admin, opts.rawToken, { recordView: false });
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
    evidence: evidence || [],
    signoffs: signoffs || [],
    auditEvents: audit || [],
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

export async function listSignoffsForSignerEmail(
  admin: SupabaseClient,
  email: string,
  filters?: {
    status?: string;
    limit?: number;
  },
) {
  const normalized = email.trim().toLowerCase();
  let q = admin
    .from('trb_signoff_requests')
    .select(
      'id, status, signer_email, signer_name, expires_at, used_at, created_at, task_progress_id, vessel_id, vessel_name_snapshot, required_signer_role, viewed_at',
    )
    .eq('signer_email', normalized)
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);
  if (filters?.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw error;

  const rows = data || [];
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

  return rows.map((r) => {
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
      ...r,
      resourceType: 'training_task' as const,
      taskStatus: progress?.status ?? null,
      taskCode: task?.task_code ?? null,
      taskTitle: task?.official_title || task?.title || null,
      programmeName: version?.trb_programs?.name ?? null,
      programmeCode: version?.trb_programs?.code ?? null,
      programmeVersion: version?.version ?? null,
      enrollmentId: progress?.enrollment_id ?? null,
    };
  });
}
