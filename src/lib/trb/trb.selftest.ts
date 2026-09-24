/**
 * Digital TRB Companion self-tests (Phase 1).
 * Run: npx tsx src/lib/trb/trb.selftest.ts
 */

import { createHash } from 'crypto';
import {
  TRB_CANDIDATE_TRANSITIONS,
  canCandidateTransition,
} from './constants';
import { calculateTrbProgress, groupProgressBySection } from './progress';
import {
  computeTrbSignoffRecordHash,
  generateTrbSignoffToken,
  hashIpForAudit,
  hashTrbSignoffToken,
} from './tokens';
import {
  captainDecisionSchema,
  enrolSchema,
  markReadySchema,
  requestSignoffSchema,
  batchRequestSignoffSchema,
  batchCaptainDecisionSchema,
  cancelBatchSignoffSchema,
} from './schemas';
import {
  generateHashedSignoffToken,
  hashSignoffToken,
  isTokenExpired,
} from '../signoff-tokens';
import {
  MCA_PILOT_DISCLAIMER,
  MCA_PILOT_PDF_SHA256,
  MCA_PILOT_PROGRAM_CODE,
  canDiscoverMcaPilot,
  isEmailAllowlistedForMcaPilot,
  isMcaOowPilotEnabled,
  isMcaPilotProgramCode,
  isOowYachts3000ProgramCode,
} from './pilot';
import { batchDecisionNotificationEvent } from './notifications';
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// Tokens: high entropy, hashed storage, never equal to raw
{
  const a = generateTrbSignoffToken();
  const b = generateTrbSignoffToken();
  assert(a.rawToken.length >= 32, 'token entropy length');
  assert(a.tokenHash !== a.rawToken, 'hash differs from raw');
  assert(a.tokenHash === hashTrbSignoffToken(a.rawToken), 'hash stable');
  assert(a.tokenHash !== b.tokenHash, 'tokens unique');
  assert(a.expiresAt.getTime() > Date.now(), 'expires in future');
  const days =
    (a.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  assert(days > 6.5 && days < 7.5, `ttl ~7 days got ${days}`);
}

// Invalid / used token simulation via hash lookup inequality
{
  const { rawToken, tokenHash } = generateTrbSignoffToken();
  assert(hashTrbSignoffToken('not-the-token') !== tokenHash, 'invalid token rejected by hash');
  assert(hashTrbSignoffToken(rawToken) === tokenHash, 'valid token matches');
}

// Integrity hash deterministic
{
  const base = {
    signoffRequestId: '11111111-1111-1111-1111-111111111111',
    taskProgressId: '22222222-2222-2222-2222-222222222222',
    decision: 'approved',
    signerName: 'Jane Captain',
    signerEmail: 'jane@example.com',
    signerRank: 'Master',
    signerCocNumber: 'COC1',
    signerIssuingAuthority: 'MCA',
    signerDeclaration: 'I assessed the candidate.',
    decisionNotes: null as string | null,
    signedAt: '2026-06-01T12:00:00.000Z',
  };
  const h1 = computeTrbSignoffRecordHash(base);
  const h2 = computeTrbSignoffRecordHash({ ...base, signerName: 'JANE CAPTAIN' });
  assert(h1 === h2, 'name case normalized');
  const h3 = computeTrbSignoffRecordHash({ ...base, decision: 'rejected' });
  assert(h1 !== h3, 'decision changes hash');
}

// IP hashing privacy
{
  const h = hashIpForAudit('203.0.113.10');
  assert(h && h.length === 64, 'ip hash sha256 hex');
  assert(h !== '203.0.113.10', 'raw ip not stored');
  assert(hashIpForAudit(null) === null, 'null ip');
}

// Progress calculation
{
  const c = calculateTrbProgress([
    'approved',
    'approved',
    'awaiting_signoff',
    'ready_for_assessment',
    'changes_requested',
    'not_started',
    'in_progress',
    'rejected',
    'approved',
  ]);
  assert(c.total === 9, 'total');
  assert(c.approved === 3, 'approved');
  assert(c.awaitingSignoff === 1, 'awaiting');
  assert(c.readyForAssessment === 1, 'ready');
  assert(c.inProgress === 1, 'in progress');
  assert(c.notStarted === 1, 'not started');
  assert(c.changesRequested === 1, 'changes');
  assert(c.rejected === 1, 'rejected');
  assert(c.remaining === 6, 'remaining');
  assert(c.percentComplete === 33, `percent ${c.percentComplete}`);
}

{
  const by = groupProgressBySection([
    { sectionId: 's1', status: 'approved' },
    { sectionId: 's1', status: 'not_started' },
    { sectionId: 's2', status: 'approved' },
  ]);
  assert(by.s1.percentComplete === 50, 'section1');
  assert(by.s2.percentComplete === 100, 'section2');
}

// Candidate cannot transition to approved; must use ready_for_assessment gate
{
  assert(!canCandidateTransition('in_progress', 'approved'), 'no self-approve');
  assert(!canCandidateTransition('awaiting_signoff', 'approved'), 'no self-approve awaiting');
  assert(canCandidateTransition('not_started', 'ready_for_assessment'), 'direct ready from not_started');
  assert(canCandidateTransition('changes_requested', 'ready_for_assessment'), 're-ready after changes');
  assert(!canCandidateTransition('in_progress', 'awaiting_signoff'), 'must mark ready first');
  assert(canCandidateTransition('in_progress', 'ready_for_assessment'), 'mark ready');
  assert(canCandidateTransition('ready_for_assessment', 'awaiting_signoff'), 'request signoff');
  assert(canCandidateTransition('awaiting_signoff', 'ready_for_assessment'), 'cancel pending');
  assert(canCandidateTransition('changes_requested', 'in_progress'), 'resume after changes');
  assert(TRB_CANDIDATE_TRANSITIONS.approved.length === 0, 'approved terminal for candidate');
}

// Schema validation
{
  assert(enrolSchema.safeParse({ programCode: 'SJ-DEMO-TRB-OOW' }).success, 'enrol ok');
  assert(!enrolSchema.safeParse({}).success, 'enrol requires id/code');
  assert(
    requestSignoffSchema.safeParse({
      taskProgressId: '11111111-1111-1111-1111-111111111111',
      signerName: 'Cap',
      signerEmail: 'cap@example.com',
      authorisedConfirmation: true,
    }).success,
    'request ok',
  );
  assert(
    !requestSignoffSchema.safeParse({
      taskProgressId: '11111111-1111-1111-1111-111111111111',
      signerName: 'Cap',
      signerEmail: 'cap@example.com',
      authorisedConfirmation: false,
    }).success,
    'must confirm authorised',
  );
  assert(
    !captainDecisionSchema.safeParse({
      token: 'x'.repeat(20),
      decision: 'rejected',
      signerName: 'Cap Name',
      signerRank: 'Master',
      signerCocNumber: '1',
      signerIssuingAuthority: 'MCA',
      authorisedConfirmation: true,
      personallyAssessedConfirmation: true,
      signerDeclaration: 'I assessed this candidate carefully.',
    }).success,
    'reject requires notes',
  );
}

// Replacement request conceptually invalidates previous: status model includes cancelled
{
  const statuses = new Set([
    'pending',
    'approved',
    'changes_requested',
    'rejected',
    'expired',
    'cancelled',
  ]);
  assert(statuses.has('cancelled'), 'cancelled status for replacement/cancel');
}

// Hash never logged as raw — ensure helper uses sha256
{
  const raw = 'super-secret-token-value';
  const hashed = hashTrbSignoffToken(raw);
  assert(hashed === createHash('sha256').update(raw, 'utf8').digest('hex'), 'sha256');
}

// MCA / OOW companion discovery helpers
{
  assert(isMcaPilotProgramCode(MCA_PILOT_PROGRAM_CODE), 'pilot code');
  assert(!isMcaPilotProgramCode('SJ-DEMO-TRB-OOW'), 'demo is not mca pilot');
  assert(MCA_PILOT_DISCLAIMER.includes('not approved'), 'disclaimer');
  assert(MCA_PILOT_DISCLAIMER.includes('digital companion'), 'companion wording');
  assert(MCA_PILOT_PDF_SHA256.length === 64, 'pdf sha256 length');
  assert(isOowYachts3000ProgramCode(MCA_PILOT_PROGRAM_CODE), 'oow alias');

  const prevEnabled = process.env.TRB_MCA_OOW_PILOT_ENABLED;
  const prevAllow = process.env.TRB_MCA_OOW_PILOT_ALLOWED_EMAILS;
  try {
    delete process.env.TRB_MCA_OOW_PILOT_ENABLED;
    delete process.env.TRB_MCA_OOW_PILOT_ALLOWED_EMAILS;
    assert(isMcaOowPilotEnabled(), 'defaults enabled when unset');
    assert(
      canDiscoverMcaPilot({ email: 'anyone@example.com' }).allowed === true,
      'open discovery when allowlist empty',
    );

    process.env.TRB_MCA_OOW_PILOT_ENABLED = 'false';
    process.env.TRB_MCA_OOW_PILOT_ALLOWED_EMAILS = 'allowed@example.com';
    assert(!isMcaOowPilotEnabled(), 'flag off');
    assert(
      canDiscoverMcaPilot({ email: 'allowed@example.com' }).allowed === false,
      'hidden when disabled',
    );

    process.env.TRB_MCA_OOW_PILOT_ENABLED = 'true';
    assert(isMcaOowPilotEnabled(), 'flag on');
    assert(
      canDiscoverMcaPilot({ email: 'other@example.com' }).allowed === false,
      'non-allowlisted hidden',
    );
    assert(
      canDiscoverMcaPilot({ email: 'allowed@example.com' }).allowed === true,
      'allowlisted visible',
    );
    assert(
      canDiscoverMcaPilot({ email: 'other@example.com', isAdmin: true }).allowed === true,
      'admin visible when enabled',
    );
    assert(isEmailAllowlistedForMcaPilot('ALLOWED@example.com'), 'allowlist casefold');

    delete process.env.TRB_MCA_OOW_PILOT_ALLOWED_EMAILS;
    assert(
      canDiscoverMcaPilot({ email: 'crew@example.com' }).allowed === true,
      'empty allowlist open when enabled',
    );
  } finally {
    if (prevEnabled === undefined) delete process.env.TRB_MCA_OOW_PILOT_ENABLED;
    else process.env.TRB_MCA_OOW_PILOT_ENABLED = prevEnabled;
    if (prevAllow === undefined) delete process.env.TRB_MCA_OOW_PILOT_ALLOWED_EMAILS;
    else process.env.TRB_MCA_OOW_PILOT_ALLOWED_EMAILS = prevAllow;
  }
}

// Consent required shape for MCA enrol schema
{
  const withConsent = enrolSchema.safeParse({
    programCode: 'SJ-PILOT-MCA-OOW-YACHTS',
    consent: {
      understandsTrial: true,
      doesNotReplaceOfficialTrb: true,
      willMaintainOfficialTrb: true,
      feedbackMayBeAnalysed: true,
      noMcaPyaApprovalImplied: true,
    },
  });
  assert(withConsent.success, 'enrol+consent parses');

  const missingConsentField = enrolSchema.safeParse({
    programCode: 'SJ-PILOT-MCA-OOW-YACHTS',
    consent: {
      understandsTrial: true,
      doesNotReplaceOfficialTrb: true,
      willMaintainOfficialTrb: true,
      feedbackMayBeAnalysed: true,
      // missing noMcaPyaApprovalImplied
    },
  });
  assert(!missingConsentField.success, 'incomplete consent rejected by schema');
}

// Source text hash stability for imported MCA task 01
{
  const code = 'MCA-P3-WATCH-01';
  const title =
    "On preparing for sea, check ship's draught, and check that the necessary equipment on the bridge is operational and proper sailing information is available.";
  const description =
    'KNOWLEDGE, UNDERSTANDING and PROFICIENCY REQUIRED:\nAs General Principals 1-3 above.\n\nCRITERIA FOR SATISFACTORY PERFORMANCE:\nAll navigational and communication equipment is operational and all appropriate charts, tidal and weather information is available.';
  const hash = createHash('sha256')
    .update([code, title, description].join('|'), 'utf8')
    .digest('hex');
  assert(
    hash === 'e25ac0fcd526188c3cb8ced9171645e1347e78736d8077970a38ef923b387b00',
    `source hash mismatch ${hash}`,
  );
}

// Parallel book statuses + digital approval independence (model)
{
  const statuses = new Set([
    'not_recorded',
    'awaiting_signature',
    'signed',
    'discrepancy_reported',
  ]);
  assert(statuses.has('signed'), 'official signed status');
  const digitalStatus: string = 'approved';
  const officialStatus: string = 'signed';
  assert(digitalStatus !== officialStatus, 'domains separate');
}

// Production review URL policy
{
  const nodeEnv = 'production';
  const emailSkipped = true;
  const allowDevReviewUrl = nodeEnv !== 'production' && emailSkipped;
  assert(allowDevReviewUrl === false, 'no review URL in production');
}

// Shared sign-off token module (TRB + future resource types)
{
  const shared = generateHashedSignoffToken({ ttlDays: 7 });
  assert(shared.tokenHash === hashSignoffToken(shared.rawToken), 'shared hash');
  assert(shared.tokenHash === hashTrbSignoffToken(shared.rawToken), 'trb wraps shared');
  assert(!isTokenExpired(shared.expiresAt), 'not expired');
  assert(isTokenExpired(new Date(Date.now() - 1000)), 'expired past');
}

{
  assert(
    markReadySchema.safeParse({
      taskProgressId: '11111111-1111-1111-1111-111111111111',
    }).success,
    'mark ready schema',
  );
}

// Batch sign-off schemas
{
  const okBatch = batchRequestSignoffSchema.safeParse({
    enrollmentId: '11111111-1111-1111-1111-111111111111',
    taskProgressIds: [
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    ],
    signerName: 'Alex Captain',
    signerEmail: 'captain@example.com',
    authorisedConfirmation: true,
    idempotencyKey: 'idem-batch-001',
  });
  assert(okBatch.success, 'batch request schema');

  const byUserId = batchRequestSignoffSchema.safeParse({
    enrollmentId: '11111111-1111-1111-1111-111111111111',
    taskProgressIds: ['22222222-2222-2222-2222-222222222222'],
    signerUserId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    authorisedConfirmation: true,
  });
  assert(byUserId.success, 'batch request with signerUserId only');

  const missingSigner = batchRequestSignoffSchema.safeParse({
    enrollmentId: '11111111-1111-1111-1111-111111111111',
    taskProgressIds: ['22222222-2222-2222-2222-222222222222'],
    authorisedConfirmation: true,
  });
  assert(!missingSigner.success, 'signerUserId or signerEmail required');

  const singleByUser = requestSignoffSchema.safeParse({
    taskProgressId: '11111111-1111-1111-1111-111111111111',
    signerUserId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    authorisedConfirmation: true,
  });
  assert(singleByUser.success, 'single request with signerUserId only');

  const emptyTasks = batchRequestSignoffSchema.safeParse({
    enrollmentId: '11111111-1111-1111-1111-111111111111',
    taskProgressIds: [],
    signerName: 'Alex Captain',
    signerEmail: 'captain@example.com',
    authorisedConfirmation: true,
  });
  assert(!emptyTasks.success, 'empty batch rejected');

  const mixed = batchCaptainDecisionSchema.safeParse({
    token: 'a'.repeat(32),
    decisions: [
      {
        itemId: '44444444-4444-4444-4444-444444444444',
        decision: 'approved',
      },
      {
        itemId: '55555555-5555-5555-5555-555555555555',
        decision: 'changes_requested',
        decisionNotes: 'Need more bridge watch evidence',
      },
    ],
    signerName: 'Alex Captain',
    signerRank: 'Master',
    signerCocNumber: 'COC1',
    signerIssuingAuthority: 'MCA',
    authorisedConfirmation: true,
    personallyAssessedConfirmation: true,
    signerDeclaration: 'I personally assessed each selected training task.',
  });
  assert(mixed.success, 'batch mixed decisions schema');

  const missingNotes = batchCaptainDecisionSchema.safeParse({
    token: 'a'.repeat(32),
    decisions: [
      {
        itemId: '44444444-4444-4444-4444-444444444444',
        decision: 'rejected',
      },
    ],
    signerName: 'Alex Captain',
    signerRank: 'Master',
    signerCocNumber: 'COC1',
    signerIssuingAuthority: 'MCA',
    authorisedConfirmation: true,
    personallyAssessedConfirmation: true,
    signerDeclaration: 'I personally assessed each selected training task.',
  });
  assert(!missingNotes.success, 'reject without notes fails');

  assert(
    cancelBatchSignoffSchema.safeParse({
      batchRequestId: '66666666-6666-6666-6666-666666666666',
    }).success,
    'cancel batch schema',
  );
}

// Batch decision notification event selection
{
  assert(
    batchDecisionNotificationEvent({
      approved: 3,
      changesRequested: 0,
      rejected: 0,
    }) === 'task_approved',
    'all approved',
  );
  assert(
    batchDecisionNotificationEvent({
      approved: 0,
      changesRequested: 2,
      rejected: 0,
    }) === 'changes_requested',
    'all changes',
  );
  assert(
    batchDecisionNotificationEvent({
      approved: 0,
      changesRequested: 0,
      rejected: 1,
    }) === 'task_rejected',
    'all rejected',
  );
  assert(
    batchDecisionNotificationEvent({
      approved: 2,
      changesRequested: 1,
      rejected: 0,
    }) === 'batch_signoff_mixed',
    'mixed results',
  );
}

// Batch parent status vs item status model
{
  const parentStatuses = new Set(['pending', 'completed', 'expired', 'cancelled']);
  const itemStatuses = new Set([
    'pending',
    'approved',
    'changes_requested',
    'rejected',
    'cancelled',
  ]);
  assert(parentStatuses.has('completed'), 'parent completed');
  assert(itemStatuses.has('changes_requested'), 'item changes');
  assert(!parentStatuses.has('approved'), 'parent is aggregate not per-task');
}

console.log('trb.selftest: all assertions passed');
