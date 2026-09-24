/**
 * Multi-task (batch) TRB sign-off requests.
 * Parent holds the public hashed token; shadow single-task requests preserve
 * trb_signoffs FK compatibility with the existing single-task flow.
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TRB_DISCLAIMER, type TrbTaskStatus } from '@/lib/trb/constants';
import {
  evaluateSignerEligibility,
  listEligibleSignersForVessel,
  getCandidateActiveVessel,
} from '@/lib/trb/eligibility';
import { sendTrbBatchSignoffRequestEmail, trbAppBaseUrl } from '@/lib/trb/email';
import {
  batchDecisionNotificationEvent,
  notifyTrbEvent,
} from '@/lib/trb/notifications';
import {
  mapEvidenceRow,
  mapSectionRow,
  mapTaskCatalogRow,
} from '@/lib/trb/api-shape';
import {
  MCA_PILOT_ATTRIBUTION,
  MCA_PILOT_DISCLAIMER,
  MCA_PILOT_OGL_URL,
  MCA_PILOT_SOURCE_URL,
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

function shadowTokenHash(batchId: string, itemId: string): string {
  // Never emailed — unique per shadow row for trb_signoff_requests.token_hash UNIQUE
  return createHash('sha256')
    .update(`batch-shadow|${batchId}|${itemId}|${randomBytes(16).toString('hex')}`, 'utf8')
    .digest('hex');
}

async function writeAudit(
  admin: SupabaseClient,
  params: {
    enrollmentId: string;
    taskProgressId?: string | null;
    batchRequestId?: string | null;
    eventType: string;
    eventData?: Record<string, unknown>;
  } & AuditCtx,
) {
  const { error } = await admin.from('trb_audit_events').insert({
    enrollment_id: params.enrollmentId,
    task_progress_id: params.taskProgressId ?? null,
    batch_request_id: params.batchRequestId ?? null,
    actor_user_id: params.actorUserId ?? null,
    actor_email: params.actorEmail ?? null,
    event_type: params.eventType,
    event_data: params.eventData ?? {},
    ip_hash: hashIpForAudit(params.ip),
    user_agent: params.userAgent ? params.userAgent.slice(0, 500) : null,
  });
  if (error) console.error('[TRB batch audit]', error.message);
}

function mostRestrictiveRole(roles: string[]): string {
  if (roles.some((r) => (r || 'captain') === 'captain')) return 'captain';
  if (roles.includes('captain_or_chief_officer')) return 'captain_or_chief_officer';
  if (roles.includes('deck_officer')) return 'deck_officer';
  if (roles.includes('training_officer')) return 'training_officer';
  return 'captain';
}

export async function listEligibleTasksForBatch(
  admin: SupabaseClient,
  userId: string,
  enrollmentId: string,
) {
  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id')
    .eq('id', enrollmentId)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  const { data: progress } = await admin
    .from('trb_task_progress')
    .select('id, task_id, status, candidate_notes')
    .eq('enrollment_id', enrollmentId)
    .eq('status', 'ready_for_assessment');

  const progressIds = (progress || []).map((p) => p.id);
  if (!progressIds.length) {
    return { enrollmentId, tasks: [], serverTime: new Date().toISOString() };
  }

  // Exclude tasks already in a pending batch or pending single request
  const { data: pendingBatchItems } = await admin
    .from('trb_batch_signoff_items')
    .select('task_progress_id')
    .in('task_progress_id', progressIds)
    .eq('status', 'pending');
  const blocked = new Set(
    (pendingBatchItems || []).map((r) => r.task_progress_id as string),
  );

  const { data: pendingSingles } = await admin
    .from('trb_signoff_requests')
    .select('task_progress_id')
    .in('task_progress_id', progressIds)
    .eq('status', 'pending')
    .eq('is_batch_shadow', false);
  for (const r of pendingSingles || []) {
    blocked.add(r.task_progress_id as string);
  }

  const eligibleProgress = (progress || []).filter((p) => !blocked.has(p.id));
  const taskIds = eligibleProgress.map((p) => p.task_id);

  const { data: tasks } = taskIds.length
    ? await admin
        .from('trb_tasks')
        .select(
          'id, section_id, task_code, title, official_title, required_signer_role, sort_order',
        )
        .in('id', taskIds)
    : { data: [] as never[] };

  const sectionIds = [...new Set((tasks || []).map((t) => t.section_id))];
  const { data: sections } = sectionIds.length
    ? await admin
        .from('trb_sections')
        .select('id, title, sort_order')
        .in('id', sectionIds)
    : { data: [] as never[] };

  const taskById = new Map((tasks || []).map((t) => [t.id, t]));
  const sectionById = new Map((sections || []).map((s) => [s.id, s]));

  return {
    enrollmentId,
    tasks: eligibleProgress.map((p) => {
      const task = taskById.get(p.task_id);
      const section = task ? sectionById.get(task.section_id) : null;
      return {
        taskProgressId: p.id,
        taskId: p.task_id,
        status: p.status,
        taskCode: task?.task_code ?? null,
        title: task?.official_title || task?.title || null,
        sectionId: task?.section_id ?? null,
        sectionTitle: section?.title ?? null,
        requiredSignerRole: task?.required_signer_role || 'captain',
        selectable: true,
      };
    }),
    serverTime: new Date().toISOString(),
  };
}

export async function listEligibleSignersForBatch(
  admin: SupabaseClient,
  userId: string,
  enrollmentId: string,
  taskProgressIds: string[],
) {
  const listed = await listEligibleTasksForBatch(admin, userId, enrollmentId);
  const selectable = new Set(listed.tasks.map((t) => t.taskProgressId));
  for (const id of taskProgressIds) {
    if (!selectable.has(id)) {
      throw Object.assign(new Error('One or more tasks are not eligible for batch sign-off'), {
        code: 'task_not_eligible',
      });
    }
  }
  const roles = listed.tasks
    .filter((t) => taskProgressIds.includes(t.taskProgressId))
    .map((t) => t.requiredSignerRole);
  const required = mostRestrictiveRole(roles);
  const vessel = await getCandidateActiveVessel(admin, userId);
  if (!vessel.vesselId) {
    return {
      vesselId: null,
      vesselName: null,
      requiredSignerRole: required,
      signers: [],
      taskCount: taskProgressIds.length,
    };
  }
  const signers = await listEligibleSignersForVessel(admin, vessel.vesselId, required);
  return {
    vesselId: vessel.vesselId,
    vesselName: vessel.vesselName,
    requiredSignerRole: required,
    signers,
    taskCount: taskProgressIds.length,
  };
}

export async function createBatchSignoffRequest(
  admin: SupabaseClient,
  userId: string,
  args: {
    enrollmentId: string;
    taskProgressIds: string[];
    signerUserId?: string | null;
    signerName?: string | null;
    signerEmail?: string | null;
    optionalMessage?: string;
    allowExternalInvite?: boolean;
    idempotencyKey?: string;
  },
  ctx: AuditCtx,
) {
  const uniqueIds = [...new Set(args.taskProgressIds)];
  if (uniqueIds.length < 1) {
    throw Object.assign(new Error('Select at least one task'), {
      code: 'empty_selection',
    });
  }

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id, program_version_id')
    .eq('id', args.enrollmentId)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  const idemKey = args.idempotencyKey?.trim() || null;
  if (idemKey) {
    const { data: prior } = await admin
      .from('trb_batch_signoff_requests')
      .select('id, expires_at, status')
      .eq('enrollment_id', args.enrollmentId)
      .eq('idempotency_key', idemKey)
      .maybeSingle();
    if (prior) {
      return {
        batchRequestId: prior.id as string,
        expiresAt: prior.expires_at as string,
        taskCount: uniqueIds.length,
        emailSent: false,
        emailSkipped: true,
        idempotent: true,
        reviewUrl: undefined as string | undefined,
      };
    }
  }

  const eligible = await listEligibleTasksForBatch(admin, userId, args.enrollmentId);
  const byId = new Map(eligible.tasks.map((t) => [t.taskProgressId, t]));
  for (const id of uniqueIds) {
    if (!byId.has(id)) {
      throw Object.assign(
        new Error('One or more tasks are not ready or already have a pending request'),
        { code: 'task_not_eligible' },
      );
    }
  }

  const roles = uniqueIds.map((id) => byId.get(id)!.requiredSignerRole);
  const requiredRole = mostRestrictiveRole(roles);

  if (args.signerUserId && args.signerUserId === userId) {
    throw Object.assign(new Error('Candidates cannot request sign-off from themselves'), {
      code: 'CANNOT_SIGN_OWN_TASK',
    });
  }

  const { data: candidateUser } = await admin
    .from('users')
    .select('first_name, last_name, email')
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
      new Error(eligibility.reason || 'Proposed signer is not eligible'),
      { code: eligibility.code || 'SIGNER_ELIGIBILITY_CHANGED' },
    );
  }

  const signer = eligibility.signer;
  if (
    args.signerEmail &&
    args.signerEmail.trim().toLowerCase() !== signer.email
  ) {
    throw Object.assign(
      new Error('signerEmail does not match selected signerUserId'),
      { code: 'SIGNER_ELIGIBILITY_CHANGED' },
    );
  }

  const email = signer.email;
  const signerName = signer.fullName || args.signerName?.trim() || email;

  if (
    candidateUser?.email &&
    candidateUser.email.trim().toLowerCase() === email
  ) {
    throw Object.assign(new Error('Candidates cannot request sign-off from themselves'), {
      code: 'CANNOT_SIGN_OWN_TASK',
    });
  }

  const eligibilitySnapshot = {
    source: signer.source,
    selfDeclared: signer.selfDeclared,
    reason: eligibility.reason ?? null,
    authorityId: signer.authorityId,
    authorityType: signer.authorityType,
    vesselRole: signer.vesselRole,
    isVesselManager: signer.isVesselManager,
    qualificationSummary: signer.qualificationSummary,
    authorityExpiresAt: signer.authorityExpiresAt,
    eligibilityLabel: signer.eligibilityLabel,
  };

  const { rawToken, tokenHash, expiresAt } = generateTrbSignoffToken();
  const expiresIso = expiresAt.toISOString();

  const { data: batch, error: batchErr } = await admin
    .from('trb_batch_signoff_requests')
    .insert({
      enrollment_id: args.enrollmentId,
      requested_by: userId,
      signer_email: email,
      signer_name: signerName,
      signer_user_id: signer.userId,
      signer_assignment_id: signer.assignmentId,
      required_signer_role: requiredRole,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresIso,
      optional_message: args.optionalMessage?.trim() || null,
      vessel_id: eligibility.vesselId,
      vessel_name_snapshot: eligibility.vesselName,
      candidate_assignment_id: eligibility.candidateAssignmentId,
      eligibility_snapshot: eligibilitySnapshot,
      idempotency_key: idemKey,
    })
    .select('id, expires_at, created_at')
    .single();
  if (batchErr) throw batchErr;

  const sorted = [...uniqueIds].sort((a, b) => {
    const ta = byId.get(a)!;
    const tb = byId.get(b)!;
    return (ta.taskCode || '').localeCompare(tb.taskCode || '');
  });

  const itemRows: {
    id: string;
    batch_request_id: string;
    task_progress_id: string;
    sort_order: number;
  }[] = sorted.map((taskProgressId, i) => ({
    id: randomUUID(),
    batch_request_id: batch.id,
    task_progress_id: taskProgressId,
    sort_order: i,
  }));

  const { error: itemsErr } = await admin.from('trb_batch_signoff_items').insert(itemRows);
  if (itemsErr) {
    await admin.from('trb_batch_signoff_requests').delete().eq('id', batch.id);
    throw itemsErr;
  }

  // Shadow single-task requests (token never emailed) + mark tasks awaiting
  for (const item of itemRows) {
    const { data: shadow, error: shadowErr } = await admin
      .from('trb_signoff_requests')
      .insert({
        task_progress_id: item.task_progress_id,
        requested_by: userId,
        signer_email: email,
        signer_name: signerName,
        required_signer_role: requiredRole,
        token_hash: shadowTokenHash(batch.id, item.id),
        status: 'pending',
        expires_at: expiresIso,
        batch_request_id: batch.id,
        batch_item_id: item.id,
        is_batch_shadow: true,
        vessel_id: eligibility.vesselId,
        vessel_name_snapshot: eligibility.vesselName,
        candidate_assignment_id: eligibility.candidateAssignmentId,
        signer_user_id: signer.userId,
        signer_assignment_id: signer.assignmentId,
        eligibility_snapshot: eligibilitySnapshot,
      })
      .select('id')
      .single();
    if (shadowErr) {
      // best-effort rollback
      await admin.from('trb_batch_signoff_requests').delete().eq('id', batch.id);
      throw shadowErr;
    }
    await admin
      .from('trb_batch_signoff_items')
      .update({ signoff_request_id: shadow.id })
      .eq('id', item.id);

    await admin
      .from('trb_task_progress')
      .update({
        status: 'awaiting_signoff',
        claimed_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.task_progress_id);
  }

  await writeAudit(admin, {
    enrollmentId: args.enrollmentId,
    batchRequestId: batch.id,
    eventType: 'batch_signoff_requested',
    eventData: {
      batch_request_id: batch.id,
      task_count: uniqueIds.length,
      task_progress_ids: uniqueIds,
      signer_user_id: signer.userId,
      signer_email: email,
      authority_id: signer.authorityId,
      eligibility_source: signer.source,
    },
    ...ctx,
    actorUserId: userId,
  });

  const { data: version } = await admin
    .from('trb_program_versions')
    .select('pilot_disclaimer, disclaimer, trb_programs ( name, code )')
    .eq('id', enrollment.program_version_id)
    .maybeSingle();

  const programmeName =
    (version?.trb_programs as { name?: string } | null)?.name ||
    'Digital TRB Companion';
  const progCode = (version?.trb_programs as { code?: string } | null)?.code;
  const emailDisclaimer = isMcaPilotProgramCode(progCode)
    ? version?.pilot_disclaimer || version?.disclaimer || MCA_PILOT_DISCLAIMER
    : version?.disclaimer || TRB_DISCLAIMER;

  const crewName =
    [candidateUser?.first_name, candidateUser?.last_name].filter(Boolean).join(' ') ||
    candidateUser?.email ||
    'Crew member';

  const taskSummaries = sorted.map((id) => {
    const t = byId.get(id)!;
    return {
      code: t.taskCode || '',
      title: t.title || 'Training task',
    };
  });

  const reviewUrl = `${trbAppBaseUrl()}/training-records/signoff/${encodeURIComponent(rawToken)}?batch=1`;

  const emailResult = await sendTrbBatchSignoffRequestEmail({
    to: email,
    signerName,
    crewName,
    vesselName: eligibility.vesselName,
    programmeName,
    taskCount: uniqueIds.length,
    tasks: taskSummaries,
    requestedAt: batch.created_at,
    expiresAt: batch.expires_at,
    reviewUrl,
    optionalMessage: args.optionalMessage,
    disclaimer: emailDisclaimer,
  });

  await writeAudit(admin, {
    enrollmentId: args.enrollmentId,
    batchRequestId: batch.id,
    eventType: emailResult.success ? 'request_email_sent' : 'request_email_failed',
    eventData: { batch_request_id: batch.id, skipped: Boolean(emailResult.skipped) },
    ...ctx,
    actorUserId: userId,
  });

  await notifyTrbEvent({
    userId,
    event: 'signoff_requested',
    body: `Sign-off requested for ${uniqueIds.length} training task${uniqueIds.length === 1 ? '' : 's'} from ${signerName} (${signer.eligibilityLabel}).`,
    metadata: {
      domain: 'trb',
      batchRequestId: batch.id,
      enrollmentId: args.enrollmentId,
      taskCount: uniqueIds.length,
      signerUserId: signer.userId,
      deepLink: `/dashboard/training-records/${args.enrollmentId}/requests/${batch.id}`,
    },
  });

  if (signer.userId && signer.userId !== userId) {
    await notifyTrbEvent({
      userId: signer.userId,
      event: 'signoff_requested',
      body: `${crewName} requested review of ${uniqueIds.length} training task${uniqueIds.length === 1 ? '' : 's'} (${signer.eligibilityLabel}). Review in your Inbox or the email link.`,
      metadata: {
        domain: 'trb',
        batchRequestId: batch.id,
        enrollmentId: args.enrollmentId,
        taskCount: uniqueIds.length,
        deepLink: `/dashboard/inbox`,
      },
    });
  }

  const allowDevReviewUrl =
    process.env.NODE_ENV !== 'production' && Boolean(emailResult.skipped);

  return {
    batchRequestId: batch.id as string,
    expiresAt: batch.expires_at as string,
    taskCount: uniqueIds.length,
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

function cryptoRandomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Node
  const { randomUUID } = require('crypto') as typeof import('crypto');
  return randomUUID();
}

export async function cancelBatchSignoffRequest(
  admin: SupabaseClient,
  userId: string,
  batchRequestId: string,
  ctx: AuditCtx,
) {
  const { data: batch } = await admin
    .from('trb_batch_signoff_requests')
    .select('id, enrollment_id, requested_by, status')
    .eq('id', batchRequestId)
    .maybeSingle();
  if (!batch) throw new Error('Batch request not found');
  if (batch.requested_by !== userId) throw new Error('Forbidden');
  if (batch.status !== 'pending') {
    throw Object.assign(new Error('Only pending batch requests can be cancelled'), {
      code: 'not_pending',
    });
  }

  const { data: items } = await admin
    .from('trb_batch_signoff_items')
    .select('id, task_progress_id, signoff_request_id, status')
    .eq('batch_request_id', batchRequestId);

  await admin
    .from('trb_batch_signoff_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', batchRequestId)
    .eq('status', 'pending');

  for (const item of items || []) {
    if (item.status !== 'pending') continue;
    if (item.signoff_request_id) {
      await admin
        .from('trb_signoff_requests')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', item.signoff_request_id)
        .eq('status', 'pending');
    }
    await admin
      .from('trb_batch_signoff_items')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('status', 'pending');
    await admin
      .from('trb_task_progress')
      .update({
        status: 'ready_for_assessment' satisfies TrbTaskStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.task_progress_id)
      .eq('status', 'awaiting_signoff');
  }

  await writeAudit(admin, {
    enrollmentId: batch.enrollment_id,
    batchRequestId,
    eventType: 'batch_signoff_cancelled',
    eventData: { batch_request_id: batchRequestId },
    ...ctx,
    actorUserId: userId,
  });

  await notifyTrbEvent({
    userId,
    event: 'request_cancelled',
    body: 'A multi-task training sign-off request was cancelled.',
    metadata: { batchRequestId, enrollmentId: batch.enrollment_id },
  });

  return { ok: true };
}

export async function getBatchRequestDetail(
  admin: SupabaseClient,
  opts: { userId: string; batchRequestId: string },
) {
  const { data: batch } = await admin
    .from('trb_batch_signoff_requests')
    .select('*')
    .eq('id', opts.batchRequestId)
    .maybeSingle();
  if (!batch) return null;

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id, program_version_id')
    .eq('id', batch.enrollment_id)
    .maybeSingle();
  if (!enrollment) return null;

  const { data: viewer } = await admin
    .from('users')
    .select('email, role')
    .eq('id', opts.userId)
    .maybeSingle();
  const isOwner = enrollment.user_id === opts.userId;
  const isSignerByUser =
    Boolean(batch.signer_user_id) && batch.signer_user_id === opts.userId;
  const isSignerByEmail =
    Boolean(viewer?.email) &&
    viewer!.email!.trim().toLowerCase() ===
      String(batch.signer_email).trim().toLowerCase();
  const isSigner = isSignerByUser || isSignerByEmail;
  if (!isOwner && !isSigner && viewer?.role !== 'admin') return null;

  return buildBatchDetailPayload(admin, batch, enrollment);
}

async function buildBatchDetailPayload(
  admin: SupabaseClient,
  batch: Record<string, unknown>,
  enrollment: { id: string; user_id: string; program_version_id: string },
) {
  const { data: items } = await admin
    .from('trb_batch_signoff_items')
    .select('*')
    .eq('batch_request_id', batch.id as string)
    .order('sort_order');

  const progressIds = (items || []).map((i) => i.task_progress_id as string);
  const { data: progressRows } = progressIds.length
    ? await admin.from('trb_task_progress').select('*').in('id', progressIds)
    : { data: [] };
  const { data: evidence } = progressIds.length
    ? await admin
        .from('trb_task_evidence')
        .select(
          'id, task_progress_id, original_filename, mime_type, file_size, evidence_type, description, created_at',
        )
        .in('task_progress_id', progressIds)
    : { data: [] };

  const taskIds = [...new Set((progressRows || []).map((p) => p.task_id as string))];
  const { data: tasks } = taskIds.length
    ? await admin
        .from('trb_tasks')
        .select(
          'id, section_id, task_code, title, description, official_title, official_description, seajourney_summary, seajourney_guidance, seajourney_completion_guidance, evidence_guidance, required_signer_role, source_task_reference, source_page_reference',
        )
        .in('id', taskIds)
    : { data: [] };

  const sectionIds = [...new Set((tasks || []).map((t) => t.section_id))];
  const { data: sections } = sectionIds.length
    ? await admin.from('trb_sections').select('id, title, sort_order').in('id', sectionIds)
    : { data: [] };

  const { data: candidate } = await admin
    .from('users')
    .select('first_name, last_name, email')
    .eq('id', enrollment.user_id)
    .maybeSingle();

  const { data: version } = await admin
    .from('trb_program_versions')
    .select(
      'id, version, disclaimer, pilot_disclaimer, attribution_html, trb_programs ( name, code )',
    )
    .eq('id', enrollment.program_version_id)
    .maybeSingle();

  const progCode = (version?.trb_programs as { code?: string } | null)?.code;
  const isMcaPilot = isMcaPilotProgramCode(progCode);
  const progressById = new Map((progressRows || []).map((p) => [p.id, p]));
  const taskById = new Map((tasks || []).map((t) => [t.id, t]));
  const sectionById = new Map((sections || []).map((s) => [s.id, s]));
  const evidenceList = evidence || [];
  const evidenceByProgress = new Map<string, typeof evidenceList>();
  for (const ev of evidenceList) {
    const key = ev.task_progress_id as string;
    const list = evidenceByProgress.get(key) || [];
    list.push(ev);
    evidenceByProgress.set(key, list);
  }

  const crewName =
    [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ') ||
    candidate?.email ||
    'Candidate';

  const itemPayloads = (items || []).map((item) => {
    const progress = progressById.get(item.task_progress_id);
    const taskRaw = progress ? taskById.get(progress.task_id) : null;
    const sectionRaw = taskRaw ? sectionById.get(taskRaw.section_id) : null;
    const evidenceRaw = evidenceByProgress.get(item.task_progress_id as string) || [];
    return {
      id: item.id,
      status: item.status,
      decisionNotes: item.decision_notes,
      decidedAt: item.decided_at,
      sortOrder: item.sort_order,
      taskProgressId: item.task_progress_id,
      progress: progress
        ? {
            id: progress.id,
            status: progress.status,
            candidateNotes: progress.candidate_notes,
          }
        : null,
      section: sectionRaw ? mapSectionRow(sectionRaw) : null,
      task: taskRaw ? mapTaskCatalogRow(taskRaw) : null,
      evidence: evidenceRaw.map((e) => mapEvidenceRow(e)),
    };
  });

  const counts = {
    total: itemPayloads.length,
    pending: itemPayloads.filter((i) => i.status === 'pending').length,
    approved: itemPayloads.filter((i) => i.status === 'approved').length,
    changesRequested: itemPayloads.filter((i) => i.status === 'changes_requested')
      .length,
    rejected: itemPayloads.filter((i) => i.status === 'rejected').length,
    cancelled: itemPayloads.filter((i) => i.status === 'cancelled').length,
  };

  return {
    ok: true as const,
    kind: 'batch' as const,
    isMcaPilot,
    batch: {
      id: batch.id,
      status: batch.status,
      expiresAt: batch.expires_at,
      usedAt: batch.used_at,
      viewedAt: batch.viewed_at,
      createdAt: batch.created_at,
      optionalMessage: batch.optional_message,
      overallFeedback: batch.overall_feedback,
      signerEmail: batch.signer_email,
      signerName: batch.signer_name,
      requiredSignerRole: batch.required_signer_role,
      vesselName: batch.vessel_name_snapshot,
      vesselId: batch.vessel_id,
    },
    candidate: { name: crewName, userId: enrollment.user_id },
    programme: {
      name:
        (version?.trb_programs as { name?: string } | null)?.name ||
        'Digital TRB Companion',
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
    enrollmentId: enrollment.id,
    counts,
    items: itemPayloads,
    serverTime: new Date().toISOString(),
  };
}

export async function resolveBatchSignoffToken(
  admin: SupabaseClient,
  rawToken: string,
  ctx: AuditCtx & { recordView?: boolean },
) {
  const tokenHash = hashTrbSignoffToken(rawToken);
  const { data: batch } = await admin
    .from('trb_batch_signoff_requests')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!batch) return null;

  if (batch.status === 'pending' && new Date(batch.expires_at) <= new Date()) {
    await admin
      .from('trb_batch_signoff_requests')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', batch.id)
      .eq('status', 'pending');
    return { ok: false as const, reason: 'expired' as const, kind: 'batch' as const };
  }

  if (batch.status !== 'pending' || batch.used_at) {
    return {
      ok: false as const,
      reason: 'used' as const,
      kind: 'batch' as const,
      status: batch.status as string,
    };
  }

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id, program_version_id')
    .eq('id', batch.enrollment_id)
    .maybeSingle();
  if (!enrollment) {
    return { ok: false as const, reason: 'invalid_token' as const, kind: 'batch' as const };
  }

  if (ctx.recordView) {
    await admin
      .from('trb_batch_signoff_requests')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', batch.id)
      .is('viewed_at', null);
    await writeAudit(admin, {
      enrollmentId: enrollment.id,
      batchRequestId: batch.id,
      eventType: 'request_viewed',
      eventData: { batch_request_id: batch.id },
      ...ctx,
      actorEmail: batch.signer_email,
    });
    await notifyTrbEvent({
      userId: enrollment.user_id,
      event: 'request_viewed',
      body: 'Your multi-task training sign-off request was opened by the reviewer.',
      metadata: { batchRequestId: batch.id },
    });
  }

  return buildBatchDetailPayload(admin, batch, enrollment);
}

export async function submitBatchCaptainDecision(
  admin: SupabaseClient,
  args: {
    rawToken?: string;
    /** When reviewing as the authenticated assigned signer (no email token). */
    tokenHash?: string;
    decisions: Array<{
      itemId: string;
      decision: 'approved' | 'changes_requested' | 'rejected';
      decisionNotes?: string | null;
    }>;
    signerName: string;
    signerRank: string;
    signerCocNumber: string;
    signerIssuingAuthority: string;
    signerDeclaration: string;
    overallFeedback?: string | null;
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

  const { data: batch } = await admin
    .from('trb_batch_signoff_requests')
    .select('id, signer_email, status, expires_at, used_at, enrollment_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!batch) {
    throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
  }
  if (batch.status !== 'pending' || batch.used_at) {
    throw Object.assign(new Error('token_not_pending'), { code: 'token_not_pending' });
  }
  if (new Date(batch.expires_at) <= new Date()) {
    throw Object.assign(new Error('token_expired'), { code: 'token_expired' });
  }

  const { data: items } = await admin
    .from('trb_batch_signoff_items')
    .select('id, task_progress_id, signoff_request_id, status')
    .eq('batch_request_id', batch.id)
    .eq('status', 'pending');

  const itemById = new Map((items || []).map((i) => [i.id as string, i]));
  if ((items || []).length !== args.decisions.length) {
    throw Object.assign(new Error('Provide a decision for every pending task'), {
      code: 'decision_count_mismatch',
    });
  }

  const decisionPayload = args.decisions.map((d) => {
    const item = itemById.get(d.itemId);
    if (!item || !item.signoff_request_id) {
      throw Object.assign(new Error('Unknown batch item'), { code: 'item_not_found' });
    }
    if (
      (d.decision === 'changes_requested' || d.decision === 'rejected') &&
      !d.decisionNotes?.trim()
    ) {
      throw Object.assign(new Error('Decision notes are required'), {
        code: 'decision_notes_required',
      });
    }
    const recordHash = computeTrbSignoffRecordHash({
      signoffRequestId: item.signoff_request_id as string,
      taskProgressId: item.task_progress_id as string,
      decision: d.decision,
      signerName: args.signerName,
      signerEmail: batch.signer_email as string,
      signerRank: args.signerRank,
      signerCocNumber: args.signerCocNumber,
      signerIssuingAuthority: args.signerIssuingAuthority,
      signerDeclaration: args.signerDeclaration,
      decisionNotes: d.decisionNotes?.trim() || null,
      signedAt,
    });
    return {
      item_id: d.itemId,
      decision: d.decision,
      decision_notes: d.decisionNotes?.trim() || null,
      record_hash: recordHash,
    };
  });

  await admin.from('officer_credentials').insert({
    user_id: ctx.actorUserId ?? null,
    email: batch.signer_email,
    full_name: args.signerName.trim(),
    rank: args.signerRank.trim(),
    coc_number: args.signerCocNumber.trim(),
    issuing_authority: args.signerIssuingAuthority.trim(),
    verification_status: 'self_declared',
  });

  const { data, error } = await admin.rpc('trb_submit_batch_signoff_decision', {
    p_token_hash: tokenHash,
    p_decisions: decisionPayload,
    p_signer_name: args.signerName.trim(),
    p_signer_rank: args.signerRank.trim(),
    p_signer_coc_number: args.signerCocNumber.trim(),
    p_signer_issuing_authority: args.signerIssuingAuthority.trim(),
    p_signer_verification_status: 'self_declared',
    p_signer_declaration: args.signerDeclaration.trim(),
    p_overall_feedback: args.overallFeedback?.trim() || null,
    p_signed_at: signedAt,
    p_actor_email: batch.signer_email,
    p_ip_hash: hashIpForAudit(ctx.ip),
    p_user_agent: ctx.userAgent ? ctx.userAgent.slice(0, 500) : null,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('invalid_token')) {
      throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
    }
    if (msg.includes('token_expired')) {
      throw Object.assign(new Error('token_expired'), { code: 'token_expired' });
    }
    if (msg.includes('token_not_pending') || msg.includes('token_already_used')) {
      throw Object.assign(new Error('token_not_pending'), { code: 'token_not_pending' });
    }
    if (msg.includes('decision_count_mismatch')) {
      throw Object.assign(new Error('decision_count_mismatch'), {
        code: 'decision_count_mismatch',
      });
    }
    throw error;
  }

  const result = data as {
    batch_request_id: string;
    enrollment_id: string;
    approved: number;
    changes_requested: number;
    rejected: number;
  };

  // Enrich immutable sign-off snapshots from batch eligibility
  try {
    const { data: batchRow } = await admin
      .from('trb_batch_signoff_requests')
      .select('eligibility_snapshot, signer_user_id, signer_assignment_id')
      .eq('id', result.batch_request_id)
      .maybeSingle();
    const snap = batchRow?.eligibility_snapshot as {
      authorityId?: string;
      authorityType?: string;
      source?: string;
      vesselRole?: string;
      isVesselManager?: boolean;
    } | null;
    if (snap || batchRow?.signer_user_id) {
      const { data: shadowIds } = await admin
        .from('trb_signoff_requests')
        .select('id')
        .eq('batch_request_id', result.batch_request_id);
      const requestIds = (shadowIds || []).map((r) => r.id as string);
      if (requestIds.length) {
        await admin
          .from('trb_signoffs')
          .update({
            signer_user_id: batchRow?.signer_user_id ?? null,
            signer_assignment_id: batchRow?.signer_assignment_id ?? null,
            authority_id: snap?.authorityId ?? null,
            authority_source: snap?.authorityType || snap?.source || null,
            signer_vessel_role: snap?.vesselRole ?? null,
            is_vessel_manager_snapshot: Boolean(snap?.isVesselManager),
          })
          .in('signoff_request_id', requestIds);
      }
    }
  } catch (enrichErr) {
    console.warn(
      '[TRB] batch signoff snapshot enrich failed',
      enrichErr instanceof Error ? enrichErr.message : enrichErr,
    );
  }

  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('user_id')
    .eq('id', result.enrollment_id)
    .maybeSingle();

  if (enrollment?.user_id) {
    const event = batchDecisionNotificationEvent({
      approved: result.approved,
      changesRequested: result.changes_requested,
      rejected: result.rejected,
    });
    await notifyTrbEvent({
      userId: enrollment.user_id,
      event,
      body: `Training sign-off reviewed: ${result.approved} approved, ${result.changes_requested} changes requested, ${result.rejected} rejected.`,
      metadata: {
        domain: 'trb',
        batchRequestId: result.batch_request_id,
        enrollmentId: result.enrollment_id,
        approved: result.approved,
        changesRequested: result.changes_requested,
        rejected: result.rejected,
        outcome: event,
        deepLink: `/dashboard/training-records/${result.enrollment_id}/requests/${result.batch_request_id}`,
      },
    });
  }

  return {
    batchRequestId: result.batch_request_id,
    enrollmentId: result.enrollment_id,
    status: 'completed',
    approved: result.approved,
    changesRequested: result.changes_requested,
    rejected: result.rejected,
    items: (data as { items?: unknown }).items,
    signedAt,
  };
}

/** Authenticated signer reviews a batch without the emailed raw token. */
export async function submitBatchDecisionAsSigner(
  admin: SupabaseClient,
  userId: string,
  args: {
    batchRequestId: string;
    decisions: Array<{
      itemId: string;
      decision: 'approved' | 'changes_requested' | 'rejected';
      decisionNotes?: string | null;
    }>;
    signerName: string;
    signerRank: string;
    signerCocNumber: string;
    signerIssuingAuthority: string;
    signerDeclaration: string;
    overallFeedback?: string | null;
  },
  ctx: AuditCtx,
) {
  const { data: batch } = await admin
    .from('trb_batch_signoff_requests')
    .select('id, token_hash, signer_user_id, signer_email, status')
    .eq('id', args.batchRequestId)
    .maybeSingle();
  if (!batch) {
    throw Object.assign(new Error('Not found'), { code: 'not_found' });
  }

  const { data: viewer } = await admin
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .maybeSingle();

  const isSigner =
    batch.signer_user_id === userId ||
    (viewer?.email &&
      viewer.email.trim().toLowerCase() ===
        String(batch.signer_email).trim().toLowerCase());

  if (!isSigner && viewer?.role !== 'admin') {
    throw Object.assign(new Error('Forbidden'), { code: 'forbidden' });
  }

  return submitBatchCaptainDecision(
    admin,
    {
      tokenHash: batch.token_hash as string,
      decisions: args.decisions,
      signerName: args.signerName,
      signerRank: args.signerRank,
      signerCocNumber: args.signerCocNumber,
      signerIssuingAuthority: args.signerIssuingAuthority,
      signerDeclaration: args.signerDeclaration,
      overallFeedback: args.overallFeedback,
    },
    { ...ctx, actorUserId: userId },
  );
}

export async function listBatchRequestsForSigner(
  admin: SupabaseClient,
  opts: { email?: string | null; userId?: string | null; status?: string; limit?: number },
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
    vessel_name_snapshot: string | null;
    enrollment_id: string;
    optional_message: string | null;
    signer_user_id?: string | null;
  };

  let byUser: Row[] = [];
  let byEmail: Row[] = [];
  const selectCols =
    'id, status, signer_email, signer_name, expires_at, used_at, created_at, vessel_name_snapshot, enrollment_id, optional_message, signer_user_id';

  if (opts.userId) {
    let q = admin
      .from('trb_batch_signoff_requests')
      .select(selectCols)
      .eq('signer_user_id', opts.userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    byUser = (data || []) as Row[];
  }
  if (normalized) {
    let q = admin
      .from('trb_batch_signoff_requests')
      .select(selectCols)
      .eq('signer_email', normalized)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    byEmail = (data || []) as Row[];
  }

  const seen = new Set<string>();
  const data: Row[] = [];
  for (const r of [...byUser, ...byEmail]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    data.push(r);
  }
  data.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const enriched = [];
  for (const r of data.slice(0, limit)) {
    const { count } = await admin
      .from('trb_batch_signoff_items')
      .select('id', { count: 'exact', head: true })
      .eq('batch_request_id', r.id);
    const { data: enrollment } = await admin
      .from('trb_enrollments')
      .select(
        'program_version_id, trb_program_versions ( version, trb_programs ( name, code ) )',
      )
      .eq('id', r.enrollment_id)
      .maybeSingle();
    const version = enrollment?.trb_program_versions as {
      version?: string;
      trb_programs?: { name?: string; code?: string } | null;
    } | null;
    enriched.push({
      id: r.id,
      status: r.status,
      signerEmail: r.signer_email,
      signerName: r.signer_name,
      signerUserId: r.signer_user_id ?? null,
      expiresAt: r.expires_at,
      usedAt: r.used_at,
      createdAt: r.created_at,
      vesselNameSnapshot: r.vessel_name_snapshot,
      enrollmentId: r.enrollment_id,
      optionalMessage: r.optional_message,
      resourceType: 'training_task_batch' as const,
      taskCount: count ?? 0,
      programmeName: version?.trb_programs?.name ?? null,
      programmeCode: version?.trb_programs?.code ?? null,
      programmeVersion: version?.version ?? null,
    });
  }
  return enriched;
}

/** @deprecated Prefer listBatchRequestsForSigner with userId. */
export async function listBatchRequestsForSignerEmail(
  admin: SupabaseClient,
  email: string,
  filters?: { status?: string; limit?: number },
) {
  return listBatchRequestsForSigner(admin, {
    email,
    status: filters?.status,
    limit: filters?.limit,
  });
}

export async function listBatchRequestsForCrew(
  admin: SupabaseClient,
  userId: string,
  enrollmentId: string,
) {
  const { data: enrollment } = await admin
    .from('trb_enrollments')
    .select('id, user_id')
    .eq('id', enrollmentId)
    .maybeSingle();
  if (!enrollment || enrollment.user_id !== userId) throw new Error('Forbidden');

  const { data, error } = await admin
    .from('trb_batch_signoff_requests')
    .select(
      'id, status, signer_email, signer_name, expires_at, created_at, used_at, optional_message',
    )
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  const out = [];
  for (const r of data || []) {
    const { data: items } = await admin
      .from('trb_batch_signoff_items')
      .select('status')
      .eq('batch_request_id', r.id);
    out.push({
      id: r.id as string,
      status: r.status as string,
      signerEmail: r.signer_email as string,
      signerName: (r.signer_name as string | null) ?? null,
      expiresAt: r.expires_at as string,
      createdAt: r.created_at as string,
      usedAt: (r.used_at as string | null) ?? null,
      optionalMessage: (r.optional_message as string | null) ?? null,
      taskCount: (items || []).length,
      counts: {
        approved: (items || []).filter((i) => i.status === 'approved').length,
        changesRequested: (items || []).filter((i) => i.status === 'changes_requested')
          .length,
        rejected: (items || []).filter((i) => i.status === 'rejected').length,
        pending: (items || []).filter((i) => i.status === 'pending').length,
        cancelled: (items || []).filter((i) => i.status === 'cancelled').length,
      },
    });
  }
  return out;
}
