import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import {
  getBatchRequestDetail,
  submitBatchDecisionAsSigner,
} from '@/lib/trb/batch';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const authenticatedBatchDecisionSchema = z
  .object({
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchRequestId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { batchRequestId } = await params;
  try {
    const detail = await getBatchRequestDetail(supabaseAdmin, {
      userId: auth.userId,
      batchRequestId,
    });
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    console.error('[TRB batch detail]', e);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchRequestId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { batchRequestId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = authenticatedBatchDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(), code: 'validation_error' },
      { status: 400 },
    );
  }
  const meta = clientMeta(req);
  try {
    const result = await submitBatchDecisionAsSigner(
      supabaseAdmin,
      auth.userId,
      {
        batchRequestId,
        decisions: parsed.data.decisions,
        signerName: parsed.data.signerName,
        signerRank: parsed.data.signerRank,
        signerCocNumber: parsed.data.signerCocNumber,
        signerIssuingAuthority: parsed.data.signerIssuingAuthority,
        signerDeclaration: parsed.data.signerDeclaration,
        overallFeedback: parsed.data.overallFeedback,
      },
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json({ result, serverTime: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Submit failed';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : undefined;
    const status =
      code === 'forbidden' || msg === 'Forbidden'
        ? 403
        : code === 'not_found'
          ? 404
          : 400;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
