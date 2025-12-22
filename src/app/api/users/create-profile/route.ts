import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email, username, firstName, lastName, position, role, activeVesselId } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and email' },
        { status: 400 }
      );
    }

    // Position is required for crew role, but not for vessel role
    if (role !== 'vessel' && (!position || position.trim() === '')) {
      return NextResponse.json({ error: 'Position is required for crew members' }, { status: 400 });
    }

    // Direct insert/update into users table
    // Note: If this fails due to FK constraint (auth user not committed yet),
    // the database trigger handle_new_user() will create the profile automatically
    // Try to insert/update the user profile
    // If we get a foreign key constraint error, the auth user may not be committed yet
    // In that case, the database trigger will handle profile creation when the auth user is ready
    const { error: insertError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        email: email,
        username: username || `user_${userId.substring(0, 8)}`,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        position: position ?? null,
        role: role ?? 'crew',
        active_vessel_id: activeVesselId ?? null,
        subscription_tier: 'free',
        subscription_status: 'inactive',
      }, {
        onConflict: 'id',
      });

    if (insertError) {
      // If it's a foreign key constraint error (23503), the auth user transaction may not be committed yet
      // This is normal and expected - the database trigger will create the profile automatically
      // when the auth.users record is committed. The user metadata is already stored in auth.users
      // via the signup options.data, so the trigger will have all the information it needs.
      if (insertError.code === '23503') {
        // This is expected behavior - not an error
        // The trigger handle_new_user() will create the profile when auth user is committed
        console.log('[CREATE PROFILE API] Auth user not yet committed (normal). Profile will be created by database trigger.');
        
        // Return success - the trigger will handle profile creation automatically
        return NextResponse.json({ 
          success: true, 
          activeVesselId,
          handledByTrigger: true
        });
      }
      
      // Other error - log it and return error
      console.error('[CREATE PROFILE API] Insert error:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to create user profile',
          message: insertError.message,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, activeVesselId });
  } catch (error: any) {
    console.error('[CREATE PROFILE API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
