import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, email, action, rejectionReason } = body;

    if (!token || !email || !action) {
      return NextResponse.json(
        { error: 'Token, email, and action are required' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Action must be either "approve" or "reject"' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !rejectionReason) {
      return NextResponse.json(
        { error: 'Rejection reason is required when rejecting' },
        { status: 400 }
      );
    }

    // First, validate the token
    const { data: testimonial, error: fetchError } = await supabase
      .from('testimonials')
      .select('*')
      .eq('signoff_token', token)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching testimonial:', fetchError);
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

    // Update testimonial based on action
    const updateData: any = {
      signoff_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      updateData.status = 'approved';
    } else {
      updateData.status = 'rejected';
      // Store rejection reason in notes if provided
      if (rejectionReason) {
        updateData.notes = testimonial.notes
          ? `${testimonial.notes}\n\nRejection reason: ${rejectionReason}`
          : `Rejection reason: ${rejectionReason}`;
      }
    }

    const { data: updatedTestimonial, error: updateError } = await supabase
      .from('testimonials')
      .update(updateData)
      .eq('id', testimonial.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating testimonial:', updateError);
      return NextResponse.json(
        { error: 'Failed to update testimonial' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      testimonial: {
        id: updatedTestimonial.id,
        status: updatedTestimonial.status,
      },
    });
  } catch (error: any) {
    console.error('Error processing signoff:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

