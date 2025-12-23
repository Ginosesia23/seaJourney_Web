import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { applicationId, reviewedBy } = body;

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
        { error: 'Only admins can approve applications' },
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
      console.error('[APPROVE CAPTAIN ROLE] Error fetching application:', fetchError);
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

    // Update application status to approved
    const { error: updateAppError } = await supabaseAdmin
      .from('captain_role_applications')
      .update({
        status: 'approved',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateAppError) {
      console.error('[APPROVE CAPTAIN ROLE] Error updating application:', updateAppError);
      return NextResponse.json(
        { error: 'Failed to update application', message: updateAppError.message },
        { status: 500 }
      );
    }

    // Update user's role to 'captain'
    const { error: updateUserError } = await supabaseAdmin
      .from('users')
      .update({ role: 'captain' })
      .eq('id', application.user_id);

    if (updateUserError) {
      console.error('[APPROVE CAPTAIN ROLE] Error updating user role:', updateUserError);
      // Don't fail - log the error but application is already approved
      // Admin can manually update the role if needed
    } else {
      console.log('[APPROVE CAPTAIN ROLE] Updated user role to captain:', application.user_id);
    }

    return NextResponse.json({
      success: true,
      applicationId,
      userId: application.user_id,
    });
  } catch (error: any) {
    console.error('[APPROVE CAPTAIN ROLE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
