import { z } from 'zod';
import {
  MCA_PILOT_CONSENT_VERSION,
  MCA_PILOT_DISCLAIMER_VERSION,
} from '@/lib/trb/pilot';

export const enrolSchema = z
  .object({
    programVersionId: z.string().uuid().optional(),
    programCode: z.string().min(1).max(80).optional(),
    consent: z
      .object({
        understandsTrial: z.literal(true),
        doesNotReplaceOfficialTrb: z.literal(true),
        willMaintainOfficialTrb: z.literal(true),
        feedbackMayBeAnalysed: z.literal(true),
        noMcaPyaApprovalImplied: z.literal(true),
        consentVersion: z.string().min(1).default(MCA_PILOT_CONSENT_VERSION),
        disclaimerVersion: z.string().min(1).default(MCA_PILOT_DISCLAIMER_VERSION),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.programVersionId || v.programCode), {
    message: 'programVersionId or programCode required',
  });

export const updateNotesSchema = z.object({
  taskProgressId: z.string().uuid(),
  candidateNotes: z.string().max(8000),
  markInProgress: z.boolean().optional(),
});

export const markReadySchema = z.object({
  taskProgressId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

export const requestSignoffSchema = z
  .object({
    taskProgressId: z.string().uuid(),
    /** Preferred stable signer identity (SeaJourney user id). */
    signerUserId: z.string().uuid().optional(),
    /** Legacy / display; verified against selected user when provided with signerUserId. */
    signerName: z.string().min(2).max(120).optional(),
    signerEmail: z.string().email().max(200).optional(),
    authorisedConfirmation: z.literal(true),
    optionalMessage: z.string().max(2000).optional(),
    /** Deprecated for TRB — external invites no longer grant eligibility. */
    allowExternalInvite: z.boolean().optional(),
    idempotencyKey: z.string().min(8).max(120).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.signerUserId && !val.signerEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signerUserId or signerEmail is required',
        path: ['signerUserId'],
      });
    }
    if (!val.signerUserId && !val.signerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signerName is required when using signerEmail',
        path: ['signerName'],
      });
    }
  });

export const batchRequestSignoffSchema = z
  .object({
    enrollmentId: z.string().uuid(),
    taskProgressIds: z.array(z.string().uuid()).min(1).max(50),
    signerUserId: z.string().uuid().optional(),
    signerName: z.string().min(2).max(120).optional(),
    signerEmail: z.string().email().max(200).optional(),
    authorisedConfirmation: z.literal(true),
    optionalMessage: z.string().max(2000).optional(),
    allowExternalInvite: z.boolean().optional(),
    idempotencyKey: z.string().min(8).max(120).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.signerUserId && !val.signerEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signerUserId or signerEmail is required',
        path: ['signerUserId'],
      });
    }
    if (!val.signerUserId && !val.signerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signerName is required when using signerEmail',
        path: ['signerName'],
      });
    }
  });

export const cancelBatchSignoffSchema = z.object({
  batchRequestId: z.string().uuid(),
});

export const cancelSignoffSchema = z.object({
  taskProgressId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
});

export const batchCaptainDecisionSchema = z
  .object({
    token: z.string().min(16).max(200),
    decisions: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          decision: z.enum(['approved', 'changes_requested', 'rejected']),
          decisionNotes: z.string().max(4000).optional().nullable(),
        }),
      )
      .min(1)
      .max(50),
    signerName: z.string().min(2).max(120),
    signerRank: z.string().min(1).max(80),
    signerCocNumber: z.string().min(1).max(80),
    signerIssuingAuthority: z.string().min(1).max(120),
    authorisedConfirmation: z.literal(true),
    personallyAssessedConfirmation: z.literal(true),
    signerDeclaration: z.string().min(10).max(2000),
    overallFeedback: z.string().max(4000).optional().nullable(),
    idempotencyKey: z.string().min(8).max(120).optional(),
  })
  .superRefine((val, ctx) => {
    for (let i = 0; i < val.decisions.length; i += 1) {
      const d = val.decisions[i];
      if (
        (d.decision === 'changes_requested' || d.decision === 'rejected') &&
        !d.decisionNotes?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Decision notes are required when requesting changes or rejecting',
          path: ['decisions', i, 'decisionNotes'],
        });
      }
    }
  });

export const deleteEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
});

export const officialBookStatusSchema = z.enum([
  'not_recorded',
  'awaiting_signature',
  'signed',
  'discrepancy_reported',
]);

export const parallelBookSchema = z.object({
  taskProgressId: z.string().uuid(),
  officialBookStatus: officialBookStatusSchema,
  officialBookSignedAt: z.string().datetime().optional().nullable(),
  officialBookSignerName: z.string().max(120).optional().nullable(),
  officialBookSignerRank: z.string().max(80).optional().nullable(),
  candidateDeclaration: z.string().min(10).max(2000),
  notes: z.string().max(2000).optional().nullable(),
});

const captainDecisionFields = {
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  signerName: z.string().min(2).max(120),
  signerRank: z.string().min(1).max(80),
  signerCocNumber: z.string().min(1).max(80),
  signerIssuingAuthority: z.string().min(1).max(120),
  authorisedConfirmation: z.literal(true),
  personallyAssessedConfirmation: z.literal(true),
  signerDeclaration: z.string().min(10).max(2000),
  decisionNotes: z.string().max(4000).optional(),
  /** Optional captain-reported official-book status — never overwrites candidate row */
  officialBookStatus: officialBookStatusSchema.optional(),
  officialBookNotes: z.string().max(2000).optional(),
} as const;

function refineCaptainDecisionNotes(
  val: { decision: string; decisionNotes?: string | null },
  ctx: z.RefinementCtx,
) {
  if (
    (val.decision === 'changes_requested' || val.decision === 'rejected') &&
    !val.decisionNotes?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Decision notes are required when requesting changes or rejecting',
      path: ['decisionNotes'],
    });
  }
}

export const captainDecisionSchema = z
  .object({
    token: z.string().min(16).max(200),
    ...captainDecisionFields,
  })
  .superRefine(refineCaptainDecisionNotes);

/** Dashboard/inbox decide — same fields as email token decide, without raw token. */
export const authenticatedCaptainDecisionSchema = z
  .object(captainDecisionFields)
  .superRefine(refineCaptainDecisionNotes);

export const pilotFeedbackSchema = z.object({
  enrollmentId: z.string().uuid(),
  taskProgressId: z.string().uuid().optional().nullable(),
  easeOfUseRating: z.number().int().min(1).max(5),
  clarityRating: z.number().int().min(1).max(5),
  confidenceRating: z.number().int().min(1).max(5),
  timeToCompleteMinutes: z.number().int().min(0).max(24 * 60).optional().nullable(),
  whatWorked: z.string().max(4000).optional().nullable(),
  whatWasUnclear: z.string().max(4000).optional().nullable(),
  whatWouldYouChange: z.string().max(4000).optional().nullable(),
  encounteredConnectivityIssue: z.boolean().optional().nullable(),
  wouldUseAgain: z.boolean().optional().nullable(),
});

export const captainFeedbackSchema = pilotFeedbackSchema
  .omit({ enrollmentId: true })
  .extend({
    token: z.string().min(16).max(200),
  });
