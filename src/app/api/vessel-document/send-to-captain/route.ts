import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { Resend } from 'resend';
import { EMAIL_PRIMARY_BLUE } from '@/lib/email-colors';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL || 'https://www.seajourney.co.uk';
const FROM_EMAIL = process.env.BILLING_FROM_EMAIL || 'SeaJourney <team@seajourney.co.uk>';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const accessToken = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { documentId, captainEmail } = body;

    if (!documentId || !captainEmail || typeof captainEmail !== 'string') {
      return NextResponse.json(
        { error: 'Missing required fields: documentId, captainEmail' },
        { status: 400 }
      );
    }

    const email = captainEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid captain email address' },
        { status: 400 }
      );
    }

    // Load document and ensure current user is the vessel manager who created it
    const { data: doc, error: docError } = await supabaseAdmin
      .from('vessel_generated_testimonials')
      .select('id, vessel_user_id, start_date, end_date, generated_by_name, pdf_format')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (doc.vessel_user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only send documents you generated' },
        { status: 403 }
      );
    }

    // One-time link token (distinct from auth accessToken above)
    const shareToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const { error: updateError } = await supabaseAdmin
      .from('vessel_generated_testimonials')
      .update({
        share_token: shareToken,
        share_token_expires_at: expiresAt.toISOString(),
        share_sent_to_email: email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('[SEND-TO-CAPTAIN] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to create share link' },
        { status: 500 }
      );
    }

    const viewLink = `${APP_URL}/documents/view?token=${encodeURIComponent(shareToken)}`;

    if (resend) {
      const { error: emailError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Sea service document from ${doc.generated_by_name || 'Vessel Manager'}`,
        html: `
          <p>You have been sent a sea service document (${doc.start_date} – ${doc.end_date}) to view or download.</p>
          <p><strong>This link can only be used once</strong> and expires in 7 days.</p>
          <p><a href="${viewLink}" style="display:inline-block;padding:12px 24px;background:${EMAIL_PRIMARY_BLUE};color:#fff;text-decoration:none;border-radius:8px;">View / Download document</a></p>
          <p>If you did not expect this email, you can ignore it.</p>
          <p>— SeaJourney</p>
        `,
      });

      if (emailError) {
        console.error('[SEND-TO-CAPTAIN] Resend error:', emailError);
        return NextResponse.json(
          { error: 'Failed to send email', link: viewLink },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: resend ? 'Email sent to captain.' : 'Share link created. Send it to the captain manually.',
      link: viewLink,
    });
  } catch (e) {
    console.error('[SEND-TO-CAPTAIN] Error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
