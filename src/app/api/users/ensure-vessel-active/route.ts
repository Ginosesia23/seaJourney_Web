import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Ensures that vessel accounts have their active_vessel_id set to the vessel they manage.
 * This is called after payment completion to ensure vessel accounts are properly connected.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    // Get user profile to check role and active_vessel_id
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only process vessel accounts
    if (user.role !== 'vessel') {
      return NextResponse.json({
        success: true,
        message: 'User is not a vessel account, no action needed',
      });
    }

    // If already has active_vessel_id, no action needed
    if (user.active_vessel_id) {
      return NextResponse.json({
        success: true,
        message: 'Vessel account already has active_vessel_id',
        active_vessel_id: user.active_vessel_id,
      });
    }

    // Find the vessel where this user is the manager
    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, name')
      .eq('vessel_manager_id', userId)
      .limit(1)
      .maybeSingle();

    if (vesselError) {
      console.error('[ENSURE VESSEL ACTIVE] Error finding vessel:', vesselError);
      return NextResponse.json(
        { error: 'Failed to find vessel', details: vesselError.message },
        { status: 500 }
      );
    }

    if (!vessel) {
      return NextResponse.json({
        success: false,
        message: 'No vessel found for this vessel account',
        warning: 'Vessel account does not manage any vessel yet',
      });
    }

    // Set active_vessel_id to the vessel they manage
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ active_vessel_id: vessel.id })
      .eq('id', userId);

    if (updateError) {
      console.error('[ENSURE VESSEL ACTIVE] Error setting active_vessel_id:', updateError);
      return NextResponse.json(
        { error: 'Failed to set active_vessel_id', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('[ENSURE VESSEL ACTIVE] ✅ Set active_vessel_id to vessel:', vessel.id, vessel.name);

    return NextResponse.json({
      success: true,
      message: 'Active vessel ID set successfully',
      active_vessel_id: vessel.id,
      vessel_name: vessel.name,
    });
  } catch (error: any) {
    console.error('[ENSURE VESSEL ACTIVE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
