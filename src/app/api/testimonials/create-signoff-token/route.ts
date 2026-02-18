import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Create a signoff token for a testimonial and store it in the DB using the service role.
 * This bypasses RLS so vessel managers (who may not have UPDATE on testimonials) can
 * still send sign-off links to external captains.
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
    if (!body || typeof body.testimonialId !== 'string' || typeof body.captainEmail !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid body: testimonialId and captainEmail required' },
        { status: 400 }
      );
    }

    const { testimonialId, captainEmail } = body;
    const email = captainEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid captain email' }, { status: 400 });
    }

    const { data: testimonial, error: testimonialError } = await supabaseAdmin
      .from('testimonials')
      .select('id, vessel_id, status')
      .eq('id', testimonialId)
      .maybeSingle();

    if (testimonialError || !testimonial) {
      return NextResponse.json({ error: 'Testimonial not found' }, { status: 404 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role, active_vessel_id')
      .eq('id', user.id)
      .maybeSingle();

    const isVesselManagerForVessel =
      profile?.role === 'vessel' && profile?.active_vessel_id === testimonial.vessel_id;
    const isAdmin = profile?.role === 'admin';
    const allowed = isVesselManagerForVessel || isAdmin;
    if (!allowed) {
      return NextResponse.json(
        { error: 'You can only create sign-off links for testimonials on your vessel' },
        { status: 403 }
      );
    }

    if (testimonial.status !== 'pending_captain') {
      return NextResponse.json(
        { error: 'Testimonial is not pending captain sign-off' },
        { status: 400 }
      );
    }

    const signoffToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: updateError } = await supabaseAdmin
      .from('testimonials')
      .update({
        signoff_token: signoffToken,
        signoff_token_expires_at: expiresAt.toISOString(),
        signoff_target_email: email,
      })
      .eq('id', testimonialId);

    if (updateError) {
      console.error('[create-signoff-token] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to create sign-off link' },
        { status: 500 }
      );
    }

    return NextResponse.json({ token: signoffToken });
  } catch (e) {
    console.error('[create-signoff-token] Error:', e);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
