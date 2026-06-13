import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTestimonialDecisionEmail } from '@/lib/notification-emails';

/**
 * Send a "your testimonial was approved/rejected" email to the crew member.
 * Used by the in-app inbox flow where the captain (or vessel manager acting
 * as captain) approves/rejects a testimonial via a direct Supabase update,
 * since that path doesn't go through the captain/signoff API route.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body.testimonialId !== 'string' ||
      (body.decision !== 'approved' && body.decision !== 'rejected')
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid body: testimonialId and decision (approved|rejected) required' },
        { status: 400 }
      );
    }
    const { testimonialId, decision, rejectionReason } = body as {
      testimonialId: string;
      decision: 'approved' | 'rejected';
      rejectionReason?: string | null;
    };

    const { data: testimonial, error: testimonialError } = await supabaseAdmin
      .from('testimonials')
      .select(
        'id, user_id, vessel_id, captain_user_id, captain_name, start_date, end_date, status, testimonial_code, generated_by_user_id'
      )
      .eq('id', testimonialId)
      .maybeSingle();

    if (testimonialError || !testimonial) {
      return NextResponse.json({ error: 'Testimonial not found' }, { status: 404 });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role, active_vessel_id')
      .eq('id', user.id)
      .maybeSingle();

    const isCaptain = testimonial.captain_user_id === user.id;
    const isVesselManagerForVessel =
      callerProfile?.role === 'vessel' &&
      callerProfile?.active_vessel_id === testimonial.vessel_id;
    const isAdmin = callerProfile?.role === 'admin';
    if (!isCaptain && !isVesselManagerForVessel && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [{ data: crewProfile }, { data: vessel }] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('email, first_name')
        .eq('id', testimonial.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from('vessels')
        .select('name')
        .eq('id', testimonial.vessel_id)
        .maybeSingle(),
    ]);

    const crewEmail = (crewProfile as any)?.email;
    if (!crewEmail) {
      return NextResponse.json({ success: true, skipped: 'crew_has_no_email' });
    }

    const result = await sendTestimonialDecisionEmail({
      to: crewEmail,
      recipientFirstName: (crewProfile as any)?.first_name ?? null,
      decision,
      vesselName: vessel?.name || 'your vessel',
      startDate: testimonial.start_date,
      endDate: testimonial.end_date,
      captainName: testimonial.captain_name ?? null,
      testimonialCode: testimonial.testimonial_code ?? null,
      rejectionReason: rejectionReason ?? null,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to send decision email' },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[NOTIFY TESTIMONIAL DECISION] Unexpected error:', e);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
