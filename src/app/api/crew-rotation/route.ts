import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function transformRotation(row: any) {
  return {
    id: row.id,
    vesselId: row.vessel_id,
    crewUserId: row.crew_user_id ?? null,
    onUnit: row.on_unit,
    onValue: row.on_value,
    offUnit: row.off_unit,
    offValue: row.off_value,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/crew-rotation?vesselId=<uuid>
 * Returns all rotation rows (vessel default + per-crew overrides) for the vessel.
 */
export async function GET(req: NextRequest) {
  try {
    const vesselId = req.nextUrl.searchParams.get('vesselId');
    if (!vesselId) {
      return NextResponse.json({ error: 'Missing required query param: vesselId' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('crew_rotations')
      .select('*')
      .eq('vessel_id', vesselId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CREW ROTATION] GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch rotations', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ rotations: (data ?? []).map(transformRotation) });
  } catch (err: any) {
    console.error('[CREW ROTATION] GET exception:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

/**
 * POST /api/crew-rotation
 * Body: { vesselId, crewUserId?, onUnit, onValue, offUnit, offValue, startDate, notes? }
 * crewUserId omitted or null → vessel-wide default.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselId, crewUserId, onUnit, onValue, offUnit, offValue, startDate, endDate, notes } = body;

    if (!vesselId || !onUnit || !onValue || !offUnit || !offValue || !startDate) {
      return NextResponse.json(
        { error: 'Missing required fields: vesselId, onUnit, onValue, offUnit, offValue, startDate' },
        { status: 400 },
      );
    }

    if (onValue <= 0 || offValue <= 0) {
      return NextResponse.json({ error: 'onValue and offValue must be positive integers' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('crew_rotations')
      .insert({
        vessel_id: vesselId,
        crew_user_id: crewUserId ?? null,
        on_unit: onUnit,
        on_value: onValue,
        off_unit: offUnit,
        off_value: offValue,
        start_date: startDate,
        end_date: endDate ?? null,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A rotation already exists for this vessel/crew. Use PATCH to update it.' },
          { status: 409 },
        );
      }
      console.error('[CREW ROTATION] POST error:', error);
      return NextResponse.json({ error: 'Failed to create rotation', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ rotation: transformRotation(data) }, { status: 201 });
  } catch (err: any) {
    console.error('[CREW ROTATION] POST exception:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
