import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTestimonialRequestEmail } from '@/lib/notification-emails';

/**
 * Send an email notification to a linked SeaJourney captain whose
 * inbox just received a new testimonial sign-off request.
 *
 * The external-captain (email-only) flow already sends an email via
 * the `send-signoff-request` Supabase Edge Function. This route fills
 * the gap for in-app captain accounts so they don't only see the
 * request after logging in.
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
    if (!body || typeof body.testimonialId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid body: testimonialId required' },
        { status: 400 }
      );
    }
    const { testimonialId } = body as { testimonialId: string };

    const { data: testimonial, error: testimonialError } = await supabaseAdmin
      .from('testimonials')
      .select(
        'id, user_id, vessel_id, captain_user_id, status, start_date, end_date, total_days, generated_by_user_id'
      )
      .eq('id', testimonialId)
      .maybeSingle();

    if (testimonialError || !testimonial) {
      return NextResponse.json({ error: 'Testimonial not found' }, { status: 404 });
    }

    if (!testimonial.captain_user_id) {
      // Nothing to do – this isn't routed to a linked captain account.
      return NextResponse.json({ success: true, skipped: 'no_linked_captain' });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role, active_vessel_id')
      .eq('id', user.id)
      .maybeSingle();

    const isOwner = testimonial.user_id === user.id;
    const isGenerator = testimonial.generated_by_user_id === user.id;
    const isVesselManagerForVessel =
      callerProfile?.role === 'vessel' &&
      callerProfile?.active_vessel_id === testimonial.vessel_id;
    const isAdmin = callerProfile?.role === 'admin';
    if (!isOwner && !isGenerator && !isVesselManagerForVessel && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [
      { data: captainProfile },
      { data: crewProfile },
      { data: vessel },
    ] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('email, first_name, last_name, username')
        .eq('id', testimonial.captain_user_id)
        .maybeSingle(),
      supabaseAdmin
        .from('users')
        .select('email, first_name, last_name, username')
        .eq('id', testimonial.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from('vessels')
        .select('name')
        .eq('id', testimonial.vessel_id)
        .maybeSingle(),
    ]);

    const captainEmail = captainProfile?.email;
    if (!captainEmail) {
      console.warn('[NOTIFY LINKED CAPTAIN] Captain has no email on file', {
        captainUserId: testimonial.captain_user_id,
      });
      return NextResponse.json({ success: true, skipped: 'captain_has_no_email' });
    }

    const crewName =
      [crewProfile?.first_name, crewProfile?.last_name].filter(Boolean).join(' ').trim() ||
      (crewProfile as any)?.username ||
      (crewProfile as any)?.email ||
      'A crew member';

    const result = await sendTestimonialRequestEmail({
      to: captainEmail,
      recipientFirstName: captainProfile?.first_name ?? null,
      crewName,
      vesselName: vessel?.name || 'a vessel',
      startDate: testimonial.start_date,
      endDate: testimonial.end_date,
      totalDays: testimonial.total_days ?? null,
      initiatedByVesselManager: isVesselManagerForVessel || isGenerator && !isOwner,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to send notification email' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[NOTIFY LINKED CAPTAIN] Unexpected error:', e);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
