import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return NextResponse.json(
        { error: 'Token and email are required' },
        { status: 400 }
      );
    }

    // Fetch testimonial by token
    const { data: testimonial, error } = await supabase
      .from('testimonials')
      .select(`
        *,
        vessels:vessel_id (
          id,
          name,
          type
        )
      `)
      .eq('signoff_token', token)
      .maybeSingle();

    if (error) {
      console.error('Error fetching testimonial:', error);
      return NextResponse.json(
        { error: 'Failed to fetch testimonial' },
        { status: 500 }
      );
    }

    if (!testimonial) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 404 }
      );
    }

    // Validate email matches
    if (testimonial.signoff_target_email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email does not match token' },
        { status: 403 }
      );
    }

    // Check if token has expired
    if (testimonial.signoff_token_expires_at) {
      const expiresAt = new Date(testimonial.signoff_token_expires_at);
      const now = new Date();
      
      if (now > expiresAt) {
        return NextResponse.json(
          { error: 'Token has expired' },
          { status: 403 }
        );
      }
    }

    // Check if token has already been used
    if (testimonial.signoff_used_at) {
      return NextResponse.json(
        { error: 'This token has already been used' },
        { status: 403 }
      );
    }

    // Check if testimonial is already approved/rejected
    if (testimonial.status === 'approved' || testimonial.status === 'rejected') {
      return NextResponse.json(
        { error: `This testimonial has already been ${testimonial.status}` },
        { status: 403 }
      );
    }

    // Return testimonial data (exclude sensitive fields)
    return NextResponse.json({
      testimonial: {
        id: testimonial.id,
        start_date: testimonial.start_date,
        end_date: testimonial.end_date,
        total_days: testimonial.total_days,
        at_sea_days: testimonial.at_sea_days,
        standby_days: testimonial.standby_days,
        yard_days: testimonial.yard_days,
        leave_days: testimonial.leave_days,
        status: testimonial.status,
        vessel: testimonial.vessels,
      },
      captain_email: testimonial.signoff_target_email,
    });
  } catch (error: any) {
    console.error('Error validating token:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

