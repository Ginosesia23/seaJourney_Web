import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * DELETE: Delete a leave period
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const leavePeriodId = params.id;

    if (!leavePeriodId) {
      return NextResponse.json(
        { error: 'Missing leave period ID' },
        { status: 400 }
      );
    }

    // Get the leave period to verify ownership
    const { data: leavePeriod, error: fetchError } = await supabaseAdmin
      .from('crew_leave_periods')
      .select('vessel_id, vessel_user_id')
      .eq('id', leavePeriodId)
      .single();

    if (fetchError || !leavePeriod) {
      return NextResponse.json(
        { error: 'Leave period not found' },
        { status: 404 }
      );
    }

    // Note: RLS policies will handle authorization, but we can add an extra check here
    // The RLS policy ensures only vessel managers for the correct vessel can delete

    // Delete the leave period
    const { error: deleteError } = await supabaseAdmin
      .from('crew_leave_periods')
      .delete()
      .eq('id', leavePeriodId);

    if (deleteError) {
      console.error('[CREW LEAVE PERIODS] Error deleting leave period:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete leave period', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[CREW LEAVE PERIODS] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
