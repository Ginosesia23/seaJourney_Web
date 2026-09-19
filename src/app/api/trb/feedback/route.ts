import { NextRequest, NextResponse } from 'next/server';
import { clientMeta, requireBearerUser } from '@/lib/trb/auth';
import { captainFeedbackSchema, pilotFeedbackSchema } from '@/lib/trb/schemas';
import { submitPilotFeedback } from '@/lib/trb/service';
import { hashTrbSignoffToken } from '@/lib/trb/tokens';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** Candidate (Bearer) or captain (token) pilot feedback — does not alter sign-offs. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (body && typeof body.token === 'string') {
    const parsed = captainFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const tokenHash = hashTrbSignoffToken(parsed.data.token);
    const { data: reqRow } = await supabaseAdmin
      .from('trb_signoff_requests')
      .select('id, task_progress_id, signer_email')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (!reqRow) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }
    const { data: progress } = await supabaseAdmin
      .from('trb_task_progress')
      .select('enrollment_id')
      .eq('id', reqRow.task_progress_id)
      .maybeSingle();
    if (!progress) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const meta = clientMeta(req);
    try {
      const result = await submitPilotFeedback(
        supabaseAdmin,
        {
          enrollmentId: progress.enrollment_id,
          taskProgressId: reqRow.task_progress_id,
          signoffRequestId: reqRow.id,
          submitterRole: 'captain',
          submitterEmail: reqRow.signer_email,
          easeOfUseRating: parsed.data.easeOfUseRating,
          clarityRating: parsed.data.clarityRating,
          confidenceRating: parsed.data.confidenceRating,
          timeToCompleteMinutes: parsed.data.timeToCompleteMinutes,
          whatWorked: parsed.data.whatWorked,
          whatWasUnclear: parsed.data.whatWasUnclear,
          whatWouldYouChange: parsed.data.whatWouldYouChange,
          encounteredConnectivityIssue: parsed.data.encounteredConnectivityIssue,
          wouldUseAgain: parsed.data.wouldUseAgain,
        },
        {
          actorEmail: reqRow.signer_email,
          ip: meta.rawIp,
          userAgent: meta.userAgent,
        },
      );
      return NextResponse.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Feedback failed';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const parsed = pilotFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const meta = clientMeta(req);
  try {
    const result = await submitPilotFeedback(
      supabaseAdmin,
      {
        enrollmentId: parsed.data.enrollmentId,
        taskProgressId: parsed.data.taskProgressId,
        submittedByUserId: auth.userId,
        submitterRole: 'candidate',
        submitterEmail: auth.email,
        easeOfUseRating: parsed.data.easeOfUseRating,
        clarityRating: parsed.data.clarityRating,
        confidenceRating: parsed.data.confidenceRating,
        timeToCompleteMinutes: parsed.data.timeToCompleteMinutes,
        whatWorked: parsed.data.whatWorked,
        whatWasUnclear: parsed.data.whatWasUnclear,
        whatWouldYouChange: parsed.data.whatWouldYouChange,
        encounteredConnectivityIssue: parsed.data.encounteredConnectivityIssue,
        wouldUseAgain: parsed.data.wouldUseAgain,
      },
      {
        actorUserId: auth.userId,
        actorEmail: auth.email,
        ip: meta.rawIp,
        userAgent: meta.userAgent,
      },
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Feedback failed';
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
