import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselId } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: 'Missing required field: vesselId' },
        { status: 400 }
      );
    }

    // Check if vessel exists
    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, name')
      .eq('id', vesselId)
      .single();

    if (vesselError || !vessel) {
      return NextResponse.json(
        { error: 'Vessel not found' },
        { status: 404 }
      );
    }

    // Check if vessel already has a manager (user with role='vessel' and active_vessel_id matching this vessel)
    const { data: existingManager, error: managerError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, active_vessel_id')
      .eq('role', 'vessel')
      .eq('active_vessel_id', vesselId)
      .limit(1)
      .maybeSingle();

    if (managerError) {
      console.error('[CHECK VESSEL MANAGER API] Error:', managerError);
      return NextResponse.json(
        {
          error: 'Failed to check vessel manager',
          message: managerError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      hasManager: !!existingManager,
      vessel: {
        id: vessel.id,
        name: vessel.name,
      },
      existingManager: existingManager ? {
        id: existingManager.id,
        email: existingManager.email,
      } : null,
    });
  } catch (error: any) {
    console.error('[CHECK VESSEL MANAGER API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

