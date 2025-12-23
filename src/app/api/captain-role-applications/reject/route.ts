import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { applicationId, reviewedBy, rejectionReason } = body;

    if (!applicationId) {
      return NextResponse.json(
        { error: 'Missing required field: applicationId' },
        { status: 400 }
      );
    }

    if (!reviewedBy) {
      return NextResponse.json(
        { error: 'Missing required field: reviewedBy' },
        { status: 400 }
      );
    }

    // Verify reviewer is admin
    const { data: reviewer, error: reviewerError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', reviewedBy)
      .single();

    if (reviewerError || !reviewer || reviewer.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can reject applications' },
        { status: 403 }
      );
    }

    // Fetch the application
    const { data: application, error: fetchError } = await supabaseAdmin
      .from('captain_role_applications')
      .select('id, user_id, status')
      .eq('id', applicationId)
      .single();

    if (fetchError || !application) {
      console.error('[REJECT CAPTAIN ROLE] Error fetching application:', fetchError);
      return NextResponse.json(
        { error: 'Application not found', message: fetchError?.message },
        { status: 404 }
      );
    }

    if (application.status !== 'pending') {
      return NextResponse.json(
        { error: 'Application is not pending', currentStatus: application.status },
        { status: 400 }
      );
    }

    // Update application status to rejected
    const { error: updateError } = await supabaseAdmin
      .from('captain_role_applications')
      .update({
        status: 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('[REJECT CAPTAIN ROLE] Error updating application:', updateError);
      return NextResponse.json(
        { error: 'Failed to update application', message: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      applicationId,
      userId: application.user_id,
    });
  } catch (error: any) {
    console.error('[REJECT CAPTAIN ROLE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
