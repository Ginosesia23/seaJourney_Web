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

    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, name, vessel_manager_id')
      .eq('id', vesselId)
      .single();

    if (vesselError || !vessel) {
      return NextResponse.json(
        { error: 'Vessel not found' },
        { status: 404 }
      );
    }

    const { data: existingManager, error: managerError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, active_vessel_id, first_name, last_name')
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
        { status: 500 },
      );
    }

    let linkedManager: {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
    } | null = null;

    if (vessel.vessel_manager_id) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name')
        .eq('id', vessel.vessel_manager_id)
        .maybeSingle();
      linkedManager = data;
    }

    const manager = existingManager || linkedManager;
    const hasManager = Boolean(vessel.vessel_manager_id || existingManager);

    return NextResponse.json({
      success: true,
      hasManager,
      vessel: {
        id: vessel.id,
        name: vessel.name,
      },
      existingManager: manager
        ? {
            id: manager.id,
            email: manager.email,
            label:
              [manager.first_name, manager.last_name].filter(Boolean).join(' ').trim() ||
              manager.email ||
              null,
          }
        : null,
    });
  } catch (error: any) {
    console.error('[CHECK VESSEL MANAGER API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
