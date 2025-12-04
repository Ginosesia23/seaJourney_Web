import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  if (!token || !email) {
    return NextResponse.json(
      { success: false, error: 'Invalid sign-off link.' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('testimonials')
    .select(`
      *,
      vessels:vessel_id (
        *
      )
    `)
    .eq('signoff_token', token)
    .eq('signoff_target_email', email)
    .maybeSingle();

  if (error) {
    console.error('Error fetching testimonial:', {
      error,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      token: token?.substring(0, 8) + '...',
      email,
    });
    
    // Check if it's an RLS error
    if (error.code === 'PGRST116' || error.message?.includes('row-level security')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Access denied. Please ensure RLS policies are configured for token-based access.',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        { status: 403 },
      );
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'This sign-off link is invalid or has been revoked.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 404 },
    );
  }

  if (!data) {
    console.error('No testimonial found - possible RLS block or invalid token:', {
      tokenExists: !!token,
      emailExists: !!email,
      tokenPreview: token?.substring(0, 8) + '...',
    });
    return NextResponse.json(
      { 
        success: false, 
        error: 'This sign-off link is invalid or has been revoked. The testimonial may not exist or you may not have permission to access it.',
      },
      { status: 404 },
    );
  }

  const now = new Date();
  const expiresAt = data.signoff_token_expires_at
    ? new Date(data.signoff_token_expires_at)
    : null;

  if (expiresAt && expiresAt < now) {
    return NextResponse.json(
      { success: false, error: 'This sign-off link has expired.' },
      { status: 410 },
    );
  }

  if (data.signoff_used_at) {
    return NextResponse.json(
      { success: false, error: 'This sign-off link has already been used.' },
      { status: 409 },
    );
  }

  if (data.status !== 'pending_captain') {
    return NextResponse.json(
      { success: false, error: 'This testimonial is not awaiting captain sign-off.' },
      { status: 409 },
    );
  }

  // Send back only what the captain needs
  return NextResponse.json({
    success: true,
    testimonial: {
      id: data.id,
      vessel_id: data.vessel_id,
      start_date: data.start_date,
      end_date: data.end_date,
      total_days: data.total_days,
      at_sea_days: data.at_sea_days,
      standby_days: data.standby_days,
      yard_days: data.yard_days,
      leave_days: data.leave_days,
      captain_name: data.captain_name,
      captain_email: data.captain_email,
      vessel: data.vessels,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { token, email, decision, rejectionReason } = body as {
    token?: string;
    email?: string;
    decision?: 'approve' | 'reject';
    rejectionReason?: string;
  };

  if (!token || !email || !decision) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('testimonials')
    .select('id, status, signoff_token_expires_at, signoff_used_at, notes')
    .eq('signoff_token', token)
    .eq('signoff_target_email', email)
    .maybeSingle();

  if (error) {
    console.error('Error fetching testimonial for signoff:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'This sign-off link is invalid or has been revoked.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 404 },
    );
  }

  if (!data) {
    console.error('No testimonial found for signoff - token:', token, 'email:', email);
    return NextResponse.json(
      { success: false, error: 'This sign-off link is invalid or has been revoked.' },
      { status: 404 },
    );
  }

  const now = new Date();
  const expiresAt = data.signoff_token_expires_at
    ? new Date(data.signoff_token_expires_at)
    : null;

  if (expiresAt && expiresAt < now) {
    return NextResponse.json(
      { success: false, error: 'This sign-off link has expired.' },
      { status: 410 },
    );
  }

  if (data.signoff_used_at) {
    return NextResponse.json(
      { success: false, error: 'This sign-off link has already been used.' },
      { status: 409 },
    );
  }

  if (data.status !== 'pending_captain') {
    return NextResponse.json(
      { success: false, error: 'This testimonial is not awaiting captain sign-off.' },
      { status: 409 },
    );
  }

  // When captain approves, set status directly to 'approved' (no official approval step yet)
  const newStatus = decision === 'approve' ? 'approved' : 'rejected';

  const updateData: any = {
    status: newStatus,
    signoff_used_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  // Add rejection reason to notes if rejecting
  if (decision === 'reject' && rejectionReason) {
    updateData.notes = data.notes
      ? `${data.notes}\n\nRejection reason: ${rejectionReason}`
      : `Rejection reason: ${rejectionReason}`;
  }

  const { error: updateError } = await supabaseAdmin
    .from('testimonials')
    .update(updateData)
    .eq('id', data.id)
    .eq('signoff_token', token);

  if (updateError) {
    return NextResponse.json(
      { success: false, error: 'Failed to record decision.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

