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
 * PATCH /api/crew-rotation/:id
 * Partial update — any subset of { onUnit, onValue, offUnit, offValue, startDate, notes }.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.onUnit    !== undefined) updateData.on_unit    = body.onUnit;
    if (body.onValue   !== undefined) updateData.on_value   = body.onValue;
    if (body.offUnit   !== undefined) updateData.off_unit   = body.offUnit;
    if (body.offValue  !== undefined) updateData.off_value  = body.offValue;
    if (body.startDate !== undefined) updateData.start_date = body.startDate;
    if (body.endDate   !== undefined) updateData.end_date   = body.endDate ?? null;
    if (body.notes     !== undefined) updateData.notes      = body.notes ?? null;

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('crew_rotations')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('[CREW ROTATION] PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update rotation', details: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Rotation not found' }, { status: 404 });
    }

    return NextResponse.json({ rotation: transformRotation(data) });
  } catch (err: any) {
    console.error('[CREW ROTATION] PATCH exception:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/crew-rotation/:id
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { error } = await supabaseAdmin
      .from('crew_rotations')
      .delete()
      .eq('id', params.id);

    if (error) {
      console.error('[CREW ROTATION] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete rotation', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[CREW ROTATION] DELETE exception:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
