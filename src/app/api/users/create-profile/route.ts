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

    // Try RPC first if it exists
    try {
      const { error: rpcError } = await supabaseAdmin.rpc('create_user_and_profile', {
        p_user_id: userId,
        p_email: email,
        p_username: username ?? null,
        p_first_name: firstName ?? null,
        p_last_name: lastName ?? null,
        p_position: position ?? null,
        p_role: role ?? 'crew',
      });

      if (!rpcError) {
        // If RPC succeeded and we have activeVesselId, update it
        if (activeVesselId) {
          const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ active_vessel_id: activeVesselId })
            .eq('id', userId);

          if (updateError) {
            console.error('[CREATE PROFILE API] Error updating active_vessel_id:', updateError);
          }
        }
        
        return NextResponse.json({ success: true, activeVesselId });
      }
      
      // If RPC failed, fall through to direct insert
      console.warn('[CREATE PROFILE API] RPC failed, falling back to direct insert:', rpcError.message);
    } catch (rpcError) {
      console.warn('[CREATE PROFILE API] RPC not available, using direct insert');
    }

    // Fallback: Direct insert/update
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
