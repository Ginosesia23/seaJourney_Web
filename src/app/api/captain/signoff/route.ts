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
    .select('id, user_id, vessel_id, start_date, end_date, total_days, at_sea_days, standby_days, testimonial_code, status, signoff_token_expires_at, signoff_used_at, notes, captain_user_id, captain_name, captain_email, captain_position')
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

  // If approving, fetch and save captain details (name, email, position) from the email
  // This ensures the crew member can generate the PDF without needing permission to view the captain's profile
  if (decision === 'approve') {
    // Try to find the captain's user account by email
    const { data: captainUser, error: captainUserError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, position')
      .eq('email', email)
      .maybeSingle();

    if (!captainUserError && captainUser) {
      // Save captain details if not already set
      const captainFullName = `${captainUser.first_name || ''} ${captainUser.last_name || ''}`.trim();
      if (!data.captain_name && captainFullName) {
        updateData.captain_name = captainFullName;
      }
      if (!data.captain_email && captainUser.email) {
        updateData.captain_email = captainUser.email;
      }
      if (!data.captain_position && captainUser.position) {
        updateData.captain_position = captainUser.position;
      }
      if (!data.captain_user_id) {
        updateData.captain_user_id = captainUser.id;
      }
    }
  }

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

  // If approving, create immutable snapshot in approved_testimonials table
  if (decision === 'approve') {
    try {
      // Fetch crew member profile
      const { data: crewProfile, error: crewError } = await supabaseAdmin
        .from('users')
        .select('first_name, last_name, position')
        .eq('id', data.user_id)
        .maybeSingle();

      if (crewError) {
        console.error('Error fetching crew profile for snapshot:', crewError);
      }

      // Fetch vessel information
      const { data: vesselData, error: vesselError } = await supabaseAdmin
        .from('vessels')
        .select('name, imo')
        .eq('id', data.vessel_id)
        .maybeSingle();

      if (vesselError) {
        console.error('Error fetching vessel for snapshot:', vesselError);
      }

      // Get captain name and position
      const captainName = updateData.captain_name || data.captain_name || 'Unknown';
      const captainPosition = updateData.captain_position || data.captain_position || null;
      
      // For captain_license, we'll use the position as a fallback
      const captainLicense = captainPosition || null;

      // Prepare snapshot data
      const crewName = crewProfile 
        ? `${crewProfile.first_name || ''} ${crewProfile.last_name || ''}`.trim() || 'Unknown'
        : 'Unknown';
      const rank = crewProfile?.position || 'Unknown';
      const vesselName = vesselData?.name || 'Unknown';
      const imo = vesselData?.imo || null;

      const snapshotData = {
        testimonial_id: data.id,
        crew_name: crewName,
        rank: rank,
        vessel_name: vesselName,
        imo: imo,
        start_date: data.start_date,
        end_date: data.end_date,
        total_days: data.total_days,
        sea_days: data.at_sea_days,
        standby_days: data.standby_days,
        captain_name: captainName,
        captain_license: captainLicense,
        document_id: data.id, // The UUID used as Document ID
        testimonial_code: data.testimonial_code || null,
        approved_at: now.toISOString(),
      };

      console.log('[SNAPSHOT] Attempting to insert snapshot via email signoff:', {
        testimonial_id: snapshotData.testimonial_id,
        crew_name: snapshotData.crew_name,
        vessel_name: snapshotData.vessel_name,
        email,
      });

      // Insert snapshot into approved_testimonials
      const { data: insertedData, error: snapshotError } = await supabaseAdmin
        .from('approved_testimonials')
        .insert(snapshotData)
        .select()
        .single();

      if (snapshotError) {
        console.error('[SNAPSHOT] Error creating approved testimonial snapshot:', {
          error: snapshotError,
          message: snapshotError.message,
          code: snapshotError.code,
          details: snapshotError.details,
          hint: snapshotError.hint,
          snapshotData,
          email,
        });
        // Don't fail the request - approval succeeded, snapshot is just for record keeping
      } else {
        console.log('[SNAPSHOT] Successfully created snapshot via email signoff:', insertedData);
      }
    } catch (snapshotErr: any) {
      console.error('Error creating approved testimonial snapshot:', snapshotErr);
      // Don't fail the request - approval succeeded, snapshot is just for record keeping
    }
  }

  return NextResponse.json({ success: true });
}

